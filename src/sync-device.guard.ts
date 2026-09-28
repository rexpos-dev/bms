import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { SyncDevice } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from './prisma.service';
import { hashDeviceToken } from './sync.service';

export type DeviceRequest = Request & { syncDevice: SyncDevice };

/**
 * Authenticates a paired desktop PC by its device token (`X-Device-Token` header,
 * or `deviceToken` query param for the SSE stream where headers can't be set).
 */
@Injectable()
export class SyncDeviceGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<DeviceRequest>();
    const header = req.headers['x-device-token'];
    const token =
      (Array.isArray(header) ? header[0] : header) ??
      (req.query?.deviceToken as string | undefined);
    if (typeof token !== 'string' || !token)
      throw new UnauthorizedException('Missing device token');

    const device = await this.prisma.syncDevice.findUnique({
      where: { tokenHash: hashDeviceToken(token) },
    });
    if (!device || device.revokedAt)
      throw new UnauthorizedException('Device unknown or revoked');

    req.syncDevice = device;
    return true;
  }
}
