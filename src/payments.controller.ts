import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from './authenticated-user.type';
import { CurrentUser } from './current-user.decorator';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { RecordPaymentDto } from './record-payment.dto';
import { VoidPaymentDto } from './void-payment.dto';
import { PaymentsService } from './payments.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.SALES_STAFF)
  @Post('job-orders/:id/payments')
  record(@Param('id') id: string, @Body() dto: RecordPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.recordPayment(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.SALES_STAFF)
  @Get('job-orders/:id/payments')
  list(@Param('id') id: string) {
    return this.paymentsService.listForJobOrder(id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Post('payments/:id/void')
  voidPayment(@Param('id') id: string, @Body() dto: VoidPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.voidPayment(id, dto.reason, user);
  }
}
