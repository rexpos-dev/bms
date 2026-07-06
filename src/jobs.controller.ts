import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from './authenticated-user.type';
import { CurrentUser } from './current-user.decorator';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { AssignInstallerDto } from './assign-installer.dto';
import { CreateJobDto } from './create-job.dto';
import { SubmitProofDto } from './submit-proof.dto';
import { UpdateJobStatusDto } from './update-job-status.dto';
import { JobsService } from './jobs.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Roles(UserRole.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateJobDto) {
    return this.jobsService.create(dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.INSTALLER, UserRole.ADMIN_STAFF, UserRole.LIAISON, UserRole.SALES_STAFF)
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('mine') mine?: string) {
    const userRoles: UserRole[] = user.roles ?? [user.role];
    const isInstallerRole = userRoles.includes(UserRole.INSTALLER);
    const userId = isInstallerRole || mine === 'true' ? user.id : undefined;
    return this.jobsService.findAll(userId, user.role);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.INSTALLER, UserRole.ADMIN_STAFF, UserRole.LIAISON, UserRole.SALES_STAFF)
  @Get('calendar/month')
  getCalendarMonth(@Query('month') month: string, @Query('year') year: string) {
    return this.jobsService.findByMonth(Number(month), Number(year));
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.INSTALLER, UserRole.ADMIN_STAFF, UserRole.LIAISON, UserRole.SALES_STAFF)
  @Get('calendar/day')
  getCalendarDay(@Query('date') date: string) {
    return this.jobsService.findByDate(date);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.INSTALLER, UserRole.ADMIN_STAFF, UserRole.LIAISON, UserRole.SALES_STAFF)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jobsService.findOne(id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Patch(':id/assign')
  assignInstaller(@Param('id') id: string, @Body() dto: AssignInstallerDto) {
    return this.jobsService.assignInstaller(id, dto);
  }

  @Roles(UserRole.INSTALLER)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateJobStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobsService.updateStatus(id, user.id, user.role, dto);
  }

  @Roles(UserRole.INSTALLER)
  @Post(':id/proof')
  submitProof(
    @Param('id') id: string,
    @Body() dto: SubmitProofDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobsService.submitProof(id, user.id, dto);
  }
}
