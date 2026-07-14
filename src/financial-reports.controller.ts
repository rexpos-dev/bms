import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { FinancialReportsService } from './financial-reports.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.SALES_STAFF)
@Controller('reports/financial')
export class FinancialReportsController {
  constructor(private readonly reportsService: FinancialReportsService) {}

  @Get('collections')
  collections(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.collectionsSummary(from, to);
  }

  @Get('outstanding')
  outstanding() {
    return this.reportsService.outstandingBalances();
  }

  @Get('client/:clientId')
  clientHistory(@Param('clientId') clientId: string) {
    return this.reportsService.clientHistory(clientId);
  }

  @Get('export')
  async export(
    @Query('type') type: 'collections' | 'outstanding',
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    const csv =
      type === 'outstanding' ? await this.reportsService.outstandingCsv() : await this.reportsService.collectionsCsv(from, to);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}.csv"`);
    res.send(csv);
  }
}
