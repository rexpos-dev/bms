import { Module } from '@nestjs/common';
import { EventsModule } from './events.module';
import { SyncAgentService } from './sync-agent.service';
import { SyncLocalController } from './sync-local.controller';

/** Desktop mode only (see app.module.ts): the local half of offline sync. */
@Module({
  imports: [EventsModule],
  controllers: [SyncLocalController],
  providers: [SyncAgentService],
  exports: [SyncAgentService],
})
export class SyncAgentModule {}
