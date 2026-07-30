import { Controller, Get, Query } from '@nestjs/common';
import { AppVersionService } from './app-version.service';

/**
 * Public on purpose: the mobile app checks for a newer installer on launch,
 * including before anyone has logged in. Auth in this app is applied
 * per-controller, so omitting @UseGuards leaves this open.
 */
@Controller('app-version')
export class AppVersionController {
  constructor(private readonly appVersionService: AppVersionService) {}

  @Get()
  check(@Query('installed') installed?: string) {
    return this.appVersionService.check(installed);
  }
}
