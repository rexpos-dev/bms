import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from './authenticated-user.type';
import { CurrentUser } from './current-user.decorator';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { AddReportFeedbackDto } from './add-report-feedback.dto';
import { CreateDevProjectDto } from './create-dev-project.dto';
import { CreateDevReportDto } from './create-dev-report.dto';
import { UpdateChecklistItemDto } from './update-checklist-item.dto';
import { UpdateDevProjectDto } from './update-dev-project.dto';
import { UpdateProgressDto } from './update-progress.dto';
import { DevProjectsService } from './dev-projects.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dev-projects')
export class DevProjectsController {
  constructor(private readonly devProjectsService: DevProjectsService) {}

  @Roles(UserRole.DEVELOPER, UserRole.SUPER_ADMIN)
  @Post()
  create(
    @Body() dto: CreateDevProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devProjectsService.create(dto, user);
  }

  @Roles(UserRole.DEVELOPER, UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.devProjectsService.findAll(user);
  }

  @Roles(UserRole.DEVELOPER, UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Get('developers')
  listDevelopers() {
    return this.devProjectsService.listDevelopers();
  }

  @Roles(UserRole.DEVELOPER, UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Get('reviewers')
  listReviewers() {
    return this.devProjectsService.listReviewers();
  }

  @Roles(UserRole.DEVELOPER, UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Get('active')
  findActive(@CurrentUser() user: AuthenticatedUser) {
    return this.devProjectsService.findActive(user);
  }

  @Roles(UserRole.DEVELOPER, UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.devProjectsService.findOne(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDevProjectDto) {
    return this.devProjectsService.update(id, dto);
  }

  @Roles(UserRole.DEVELOPER, UserRole.SUPER_ADMIN)
  @Post(':id/start')
  start(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.devProjectsService.start(id, user);
  }

  @Roles(UserRole.DEVELOPER, UserRole.SUPER_ADMIN)
  @Post(':id/pause')
  pause(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.devProjectsService.pause(id, user);
  }

  @Roles(UserRole.DEVELOPER, UserRole.SUPER_ADMIN)
  @Post(':id/resume')
  resume(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.devProjectsService.resume(id, user);
  }

  @Roles(UserRole.DEVELOPER, UserRole.SUPER_ADMIN)
  @Post(':id/stop')
  stop(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.devProjectsService.stop(id, user);
  }

  @Roles(UserRole.DEVELOPER, UserRole.SUPER_ADMIN)
  @Patch(':id/progress')
  updateProgress(
    @Param('id') id: string,
    @Body() dto: UpdateProgressDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devProjectsService.updateProgress(id, dto, user);
  }

  @Roles(UserRole.DEVELOPER, UserRole.SUPER_ADMIN)
  @Post(':id/reports')
  addReport(
    @Param('id') id: string,
    @Body() dto: CreateDevReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devProjectsService.addReport(id, dto, user);
  }

  @Roles(UserRole.DEVELOPER, UserRole.SUPER_ADMIN)
  @Patch('reports/:reportId/checklist')
  updateChecklistItem(
    @Param('reportId') reportId: string,
    @Body() dto: UpdateChecklistItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devProjectsService.updateChecklistItem(reportId, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Post('reports/:reportId/feedback')
  addFeedback(
    @Param('reportId') reportId: string,
    @Body() dto: AddReportFeedbackDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devProjectsService.addFeedback(reportId, dto, user);
  }
}
