import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SyncAgentService } from './sync-agent.service';

/** Desktop mode: what the app shows in its sync badge / "changes overwritten" notice. */
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncLocalController {
  constructor(private readonly agent: SyncAgentService) {}

  @Get('status')
  status() {
    return this.agent.status();
  }

  /** "Sync now" button. Runs a full cycle and returns the resulting status. */
  @Post('now')
  @HttpCode(200)
  now() {
    return this.agent.syncNow();
  }

  /** Local edits the server refused (server wins) — for the notice/list in the UI. */
  @Get('rejected')
  rejected() {
    return this.agent.listRejected();
  }

  @Post('rejected/seen')
  @HttpCode(200)
  async seen() {
    await this.agent.markRejectedSeen();
    return { ok: true };
  }
}
