import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { generateKeyPairSync } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import * as jwt from 'jsonwebtoken';
import { join } from 'path';
import { isDesktopMode } from './app-mode';

export interface HardwareFingerprint {
  cpu: string;
  disk: string;
  mac: string;
}

export interface LicenseTokenPayload {
  licenseId: string;
  licenseKey: string;
  clientId: string;
  productId: string;
  fingerprint: HardwareFingerprint;
}

/**
 * Issues and verifies license activation tokens as RS256-signed JWTs (RSA-4096),
 * binding each license to the activating machine's hardware fingerprint so the
 * license cannot simply be copied to another PC.
 */
@Injectable()
export class LicenseCryptoService implements OnModuleInit {
  private readonly logger = new Logger(LicenseCryptoService.name);
  private readonly keysDir = join(process.cwd(), 'keys');
  private privateKey!: string;
  private publicKey!: string;

  onModuleInit() {
    // Activation tokens are only ever signed on the server; a PC must not mint its own key pair.
    if (isDesktopMode()) return;

    const privateKeyPath = join(this.keysDir, 'license-private.pem');
    const publicKeyPath = join(this.keysDir, 'license-public.pem');

    if (existsSync(privateKeyPath) && existsSync(publicKeyPath)) {
      this.privateKey = readFileSync(privateKeyPath, 'utf8');
      this.publicKey = readFileSync(publicKeyPath, 'utf8');
      return;
    }

    this.logger.warn('License RSA-4096 key pair not found — generating a new one for local development.');
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 4096,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    mkdirSync(this.keysDir, { recursive: true });
    writeFileSync(privateKeyPath, privateKey);
    writeFileSync(publicKeyPath, publicKey);

    this.privateKey = privateKey;
    this.publicKey = publicKey;
  }

  signLicenseToken(payload: LicenseTokenPayload, expiresAt?: Date): string {
    const options: jwt.SignOptions = { algorithm: 'RS256' };
    if (expiresAt) {
      options.expiresIn = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    }
    return jwt.sign(payload, this.privateKey, options);
  }

  verifyLicenseToken(token: string): LicenseTokenPayload & jwt.JwtPayload {
    return jwt.verify(token, this.publicKey, { algorithms: ['RS256'] }) as LicenseTokenPayload & jwt.JwtPayload;
  }

  getPublicKey(): string {
    return this.publicKey;
  }
}
