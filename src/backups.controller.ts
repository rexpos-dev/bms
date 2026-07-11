import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './authenticated-user.type';
import { BackupsService, BACKUP_DIR, sanitizeUploadedBackupName, type BackupFile } from './backups.service';
import { ResetService } from './reset.service';
import { RestoreService } from './restore.service';
import { ResetModuleDto } from './reset-module.dto';
import { RestoreBackupDto } from './restore-backup.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('backups')
export class BackupsController {
  constructor(
    private readonly backupsService: BackupsService,
    private readonly resetService: ResetService,
    private readonly restoreService: RestoreService,
  ) {}

  @Get()
  list() {
    return this.backupsService.list();
  }

  @Post()
  create() {
    return this.backupsService.create();
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: BACKUP_DIR,
        filename: (_req, file, cb) => cb(null, sanitizeUploadedBackupName(file.originalname)),
      }),
      limits: { fileSize: 200 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.originalname.toLowerCase().endsWith('.sql')) {
          cb(new BadRequestException('Only .sql backup files can be uploaded.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File): BackupFile {
    if (!file) throw new BadRequestException('No file uploaded.');
    return this.backupsService.get(file.filename);
  }

  @Post(':filename/restore')
  restore(
    @Param('filename') filename: string,
    @Body() dto: RestoreBackupDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.restoreService.restore(filename, user.id, dto.password, {
      full: dto.full,
      modules: dto.modules,
    });
  }

  @Get(':filename/download')
  download(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = this.backupsService.getFilePath(filename);
    res.download(filePath, filename);
  }

  @Delete(':filename')
  remove(@Param('filename') filename: string) {
    return this.backupsService.remove(filename);
  }

  @Get('reset/modules')
  resetModules() {
    return this.resetService.list();
  }

  @Post('reset/:moduleId')
  resetModule(
    @Param('moduleId') moduleId: string,
    @Body() dto: ResetModuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.resetService.reset(moduleId, user.id, dto.password, dto.backupFilename);
  }
}
