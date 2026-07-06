import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole, WithdrawalStatus } from '@prisma/client';
import type { AuthenticatedUser } from './authenticated-user.type';
import { CurrentUser } from './current-user.decorator';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { CreateWithdrawalDto } from './create-withdrawal.dto';
import { ReleaseWithdrawalDto } from './release-withdrawal.dto';
import { WithdrawalsService } from './withdrawals.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('withdrawals')
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Roles(UserRole.INSTALLER, UserRole.DEVELOPER, UserRole.DESIGNER, UserRole.LIAISON, UserRole.SALES_STAFF, UserRole.ADMIN_STAFF)
  @Get('balance')
  async getBalance(@CurrentUser() user: AuthenticatedUser) {
    const availableBalance = await this.withdrawalsService.computeAvailableBalance(user.id);
    return { availableBalance };
  }

  @Roles(UserRole.INSTALLER, UserRole.DEVELOPER, UserRole.DESIGNER, UserRole.LIAISON, UserRole.SALES_STAFF, UserRole.ADMIN_STAFF)
  @Post()
  create(@Body() dto: CreateWithdrawalDto, @CurrentUser() user: AuthenticatedUser) {
    return this.withdrawalsService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('mine') mine?: string) {
    const isAdminLike = user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN_STAFF;
    const userId = isAdminLike && mine !== 'true' ? undefined : user.id;
    return this.withdrawalsService.findAll(userId);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.withdrawalsService.setStatus(id, WithdrawalStatus.APPROVED);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Patch(':id/reject')
  reject(@Param('id') id: string) {
    return this.withdrawalsService.setStatus(id, WithdrawalStatus.REJECTED);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Patch(':id/release')
  release(@Param('id') id: string, @Body() dto: ReleaseWithdrawalDto) {
    return this.withdrawalsService.release(id, dto.proofUrl);
  }
}
