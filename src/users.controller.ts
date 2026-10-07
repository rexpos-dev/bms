import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from './authenticated-user.type';
import { CurrentUser } from './current-user.decorator';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { CreateUserDto } from './create-user.dto';
import { ResetUserPasswordDto } from './reset-user-password.dto';
import { UpdateProfileDto } from './update-profile.dto';
import { UpdateUserDto } from './update-user.dto';
import { PayrollService } from './payroll.service';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly payroll: PayrollService,
  ) {}

  // ── Self-service (must be before /:id routes to avoid route conflict) ───────

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findAll().then((all) => all.find((u) => u.id === user.id) ?? null);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  // ── Admin operations ─────────────────────────────────────────────────────────

  @Roles(UserRole.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Get('payroll-employees')
  payrollEmployees() {
    return this.payroll.listEmployees();
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post('sync-payroll')
  async syncPayroll() {
    const { linked, unmatched } = await this.payroll.autoLinkUsers();
    const { updated, skipped } = await this.payroll.syncLinkedBaseBonuses();
    return { linked, updated, skipped, unmatched };
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.ENCODER)
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('role') role?: UserRole) {
    // Encoders only need the installer list for job assignment.
    const isEncoderOnly = user.role === UserRole.ENCODER;
    return this.usersService.findAll(isEncoderOnly ? UserRole.INSTALLER : role);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body() dto: ResetUserPasswordDto) {
    return this.usersService.resetPassword(id, dto.newPassword);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.usersService.setActive(id, true);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.usersService.setActive(id, false);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post(':id/roles')
  addRole(@Param('id') id: string, @Body('role') role: UserRole) {
    return this.usersService.addRole(id, role);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Delete(':id/roles/:role')
  removeRole(@Param('id') id: string, @Param('role') role: UserRole) {
    return this.usersService.removeRole(id, role);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':id/primary-role')
  updatePrimaryRole(@Param('id') id: string, @Body('role') role: UserRole) {
    return this.usersService.updateRole(id, role);
  }
}
