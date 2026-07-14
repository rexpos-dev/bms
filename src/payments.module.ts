import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { FinancialReportsController } from './financial-reports.controller';
import { FinancialReportsService } from './financial-reports.service';

@Module({
  controllers: [PaymentsController, FinancialReportsController],
  providers: [PaymentsService, FinancialReportsService],
})
export class PaymentsModule {}
