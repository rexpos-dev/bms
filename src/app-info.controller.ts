import { Controller, Get } from '@nestjs/common';
import { isDesktopMode } from './app-mode';

/**
 * Public on purpose (the SPA asks before anyone is signed in): tells the admin UI
 * which backend it is talking to, so desktop-only sync controls (status badge, "Sync now")
 * and server-only ones (paired PCs, sync conflicts) are shown on the right side.
 */
@Controller('app-info')
export class AppInfoController {
  @Get()
  info() {
    return { mode: isDesktopMode() ? 'desktop' : 'server' };
  }
}
