import { Module } from '@nestjs/common';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';
import { ResetService } from './reset.service';
import { RestoreService } from './restore.service';

@Module({
  controllers: [BackupsController],
  providers: [BackupsService, ResetService, RestoreService],
})
export class BackupsModule {}
