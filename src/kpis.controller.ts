import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from './current-user.decorator';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { CreateKpiDefinitionDto } from './create-kpi-definition.dto';
import { GenerateIncentivesDto } from './generate-incentives.dto';
import { ManualKpiDto } from './manual-kpi.dto';
import { UpdateKpiDefinitionDto } from './update-kpi-definition.dto';
import { KpisService } from './kpis.service';

interface AuthUser {
  id: string;
  role: UserRole;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('kpis')
export class KpisController {
  constructor(private readonly kpisService: KpisService) {}

  // ── Admin-only ──────────────────────────────────────────────────────────────

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Get('financial-summary')
  getFinancialSummary() {
    return this.kpisService.getFinancialSummary();
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Get('revenue-trend')
  getRevenueTrend() {
    return this.kpisService.getRevenueTrend();
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Get('team')
  getTeam(@Query('month') month: string, @Query('year') year: string) {
    const now = new Date();
    return this.kpisService.getTeam(
      month ? parseInt(month) : now.getMonth() + 1,
      year  ? parseInt(year)  : now.getFullYear(),
    );
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Post('manual')
  setManual(@Body() dto: ManualKpiDto) {
    return this.kpisService.setManual(dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Get('incentives')
  getIncentives(@Query('month') month?: string, @Query('year') year?: string) {
    return this.kpisService.getIncentives(
      month ? parseInt(month) : undefined,
      year  ? parseInt(year)  : undefined,
    );
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Post('incentives/generate')
  generateIncentives(@Body() dto: GenerateIncentivesDto) {
    return this.kpisService.generateIncentives(dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Patch('incentives/:id/approve')
  approveIncentive(@Param('id') id: string) {
    return this.kpisService.approveIncentive(id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Patch('incentives/:id/pay')
  payIncentive(@Param('id') id: string) {
    return this.kpisService.payIncentive(id);
  }

  // ── Designer KPI: external TMS Pro integration (admin) ──────────────────────

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Get('designers/points')
  getDesignerPoints(@Query('from') from?: string, @Query('to') to?: string) {
    return this.kpisService.getDesignerPoints(from, to);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Post('designers/sync')
  syncDesignerKpis(
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const now = new Date();
    return this.kpisService.syncDesignerKpis(
      month ? parseInt(month) : now.getMonth() + 1,
      year ? parseInt(year) : now.getFullYear(),
      from,
      to,
    );
  }

  // ── KPI definitions per role ────────────────────────────────────────────────

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Get('definitions/:role')
  getDefinitions(@Param('role') role: UserRole) {
    return this.kpisService.getDefinitions(role);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Post('definitions')
  createDefinition(@Body() dto: CreateKpiDefinitionDto) {
    return this.kpisService.createDefinition(dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Patch('definitions/:id')
  updateDefinition(@Param('id') id: string, @Body() dto: UpdateKpiDefinitionDto) {
    return this.kpisService.updateDefinition(id, dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Delete('definitions/:id')
  deleteDefinition(@Param('id') id: string) {
    return this.kpisService.deleteDefinition(id);
  }

  // ── Role-specific dashboard + my incentives ─────────────────────────────────

  @Roles(UserRole.INSTALLER, UserRole.DEVELOPER, UserRole.DESIGNER, UserRole.SUPER_ADMIN, UserRole.MACHINE_OPERATOR, UserRole.LIAISON, UserRole.SALES_STAFF, UserRole.ADMIN_STAFF)
  @Get('dashboard')
  getDashboard(
    @CurrentUser() user: AuthUser,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('userId') targetUserId?: string,
  ) {
    const now = new Date();
    const m = month ? parseInt(month) : now.getMonth() + 1;
    const y = year  ? parseInt(year)  : now.getFullYear();
    // Admin can query another user's dashboard
    const isAdminLike = user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN_STAFF;
    const uid = isAdminLike && targetUserId ? targetUserId : user.id;
    const role = isAdminLike && targetUserId ? undefined : user.role;

    if (uid !== user.id && !isAdminLike) {
      return { kpis: [], totalScore: 0, incentiveEstimate: 0 };
    }

    // For admin querying another user we need their role from DB — delegate to service
    if (role === undefined) {
      return this.kpisService.getDashboardForUser(uid, m, y);
    }

    return this.kpisService.getDashboard(uid, role, m, y);
  }

  @Roles(UserRole.INSTALLER, UserRole.DEVELOPER, UserRole.DESIGNER, UserRole.MACHINE_OPERATOR, UserRole.LIAISON, UserRole.SALES_STAFF, UserRole.ADMIN_STAFF)
  @Get('incentives/mine')
  getMyIncentives(@CurrentUser() user: AuthUser) {
    return this.kpisService.getMyIncentives(user.id);
  }
}
