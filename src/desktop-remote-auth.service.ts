import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SyncHttpError, SyncNetworkError, requestJson } from './sync-http';

export type RemoteLoginResult = 'ok' | 'invalid' | 'offline' | 'unconfigured';

/**
 * Desktop mode only: verifies a password against the central server. The server never
 * sends password hashes to a PC, so the first sign-in of each user on a PC has to be
 * confirmed online; the caller then caches a hash locally so later sign-ins work offline.
 */
@Injectable()
export class DesktopRemoteAuthService {
  private readonly serverUrl?: string;

  constructor(config: ConfigService) {
    this.serverUrl = config.get<string>('SYNC_SERVER_URL')?.trim() || undefined;
  }

  async verify(email: string, password: string): Promise<RemoteLoginResult> {
    if (!this.serverUrl) return 'unconfigured';
    try {
      await requestJson(this.serverUrl, '/auth/login', {
        method: 'POST',
        body: { email, password },
        timeoutMs: 8_000,
      });
      return 'ok';
    } catch (err) {
      if (err instanceof SyncNetworkError) return 'offline';
      if (
        err instanceof SyncHttpError &&
        (err.status === 401 || err.status === 400)
      ) {
        return 'invalid';
      }
      return 'offline'; // 5xx / throttled: treat as "can't confirm right now"
    }
  }
}
