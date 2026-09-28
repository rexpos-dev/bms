import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Observable } from 'rxjs';
import { CurrentUser } from './current-user.decorator';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import type { AuthenticatedUser } from './authenticated-user.type';
import { EventsService } from './events.service';
import { SyncDeviceGuard, type DeviceRequest } from './sync-device.guard';
import {
  CreateSyncDeviceDto,
  PullQueryDto,
  PushDto,
  SnapshotQueryDto,
} from './sync.dto';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(
    private readonly sync: SyncService,
    private readonly events: EventsService,
  ) {}

  // ── Admin (SUPER_ADMIN, JWT) ────────────────────────────────────────────────

  /** Pair a new PC. The response carries the device token — shown once, only its hash is stored. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Post('devices')
  createDevice(
    @Body() dto: CreateSyncDeviceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sync.createDevice(dto.name, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Get('devices')
  listDevices() {
    return this.sync.listDevices();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Delete('devices/:id')
  revokeDevice(@Param('id') id: string) {
    return this.sync.revokeDevice(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Get('conflicts')
  listConflicts(@Query('resolved') resolved?: string) {
    return this.sync.listConflicts(resolved === 'true');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Post('conflicts/:id/resolve')
  resolveConflict(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sync.resolveConflict(id, user.id);
  }

  // ── Device (X-Device-Token) ─────────────────────────────────────────────────

  @UseGuards(SyncDeviceGuard)
  @Get('status')
  status() {
    return this.sync.status();
  }

  @UseGuards(SyncDeviceGuard)
  @Get('snapshot')
  snapshot(@Query() q: SnapshotQueryDto) {
    return this.sync.snapshot(q.table, q.after, q.limit);
  }

  @UseGuards(SyncDeviceGuard)
  @Get('pull')
  pull(@Req() req: DeviceRequest, @Query() q: PullQueryDto) {
    return this.sync.pull(req.syncDevice.id, q.since, q.limit);
  }

  @UseGuards(SyncDeviceGuard)
  @Post('push')
  async push(@Req() req: DeviceRequest, @Body() dto: PushDto) {
    return {
      results: await this.sync.push(req.syncDevice.id, dto.ops),
    };
  }

  /** Server-sent "something changed, pull now" hints (plus heartbeats). */
  @UseGuards(SyncDeviceGuard)
  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return this.events.stream();
  }
}
