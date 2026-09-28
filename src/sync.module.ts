import { Module } from '@nestjs/common';
import { EventsModule } from './events.module';
import { SyncDeviceGuard } from './sync-device.guard';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [EventsModule],
  controllers: [SyncController],
  providers: [SyncService, SyncDeviceGuard],
  exports: [SyncService],
})
export class SyncModule {}
