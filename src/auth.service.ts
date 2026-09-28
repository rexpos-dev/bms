import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from './prisma.service';
import { LoginDto } from './login.dto';
import { isDesktopMode } from './app-mode';
import { DesktopRemoteAuthService } from './desktop-remote-auth.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly remoteAuth: DesktopRemoteAuthService,
  ) {}

  /** Re-check the acting user's own login password for sensitive actions (void/transfer/reset). */
  async verifyPassword(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches)
      throw new UnauthorizedException(
        'Incorrect password — nothing was changed.',
      );
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { additionalRoles: { select: { role: true } } },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    let passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches && isDesktopMode()) {
      passwordMatches = await this.confirmOnDesktop(
        user.id,
        user.passwordHash,
        dto,
      );
    }
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokens(user.id);
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    const roles = [user.role, ...user.additionalRoles.map((r) => r.role)];
    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        roles,
        fullName: user.fullName,
      },
    };
  }

  /**
   * Desktop only. The server never sends password hashes to a PC, so a user's first sign-in
   * on this PC (placeholder hash '!') — or one after a password change elsewhere — is confirmed
   * against the server, and the hash is cached locally so later sign-ins also work offline.
   */
  private async confirmOnDesktop(
    userId: string,
    currentHash: string,
    dto: LoginDto,
  ): Promise<boolean> {
    const result = await this.remoteAuth.verify(dto.email, dto.password);
    if (result === 'ok') {
      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await bcrypt.hash(dto.password, 12) },
      });
      return true;
    }
    if (result === 'offline' && currentHash === '!') {
      throw new UnauthorizedException(
        'Connect to the server once to sign in on this PC.',
      );
    }
    return false;
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.refreshToken) {
      throw new UnauthorizedException('Access denied');
    }

    const matches = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!matches) {
      throw new UnauthorizedException('Access denied');
    }

    const tokens = await this.issueTokens(user.id);
    await this.persistRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  }

  private async issueTokens(userId: string): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: userId },
        {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
          expiresIn: this.config.get<string>(
            'JWT_ACCESS_EXPIRES_IN',
            '15m',
          ) as JwtSignOptions['expiresIn'],
        },
      ),
      this.jwt.signAsync(
        { sub: userId },
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.config.get<string>(
            'JWT_REFRESH_EXPIRES_IN',
            '7d',
          ) as JwtSignOptions['expiresIn'],
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  private async persistRefreshToken(userId: string, refreshToken: string) {
    const refreshTokenHash = await bcrypt.hash(refreshToken, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: refreshTokenHash },
    });
  }
}
