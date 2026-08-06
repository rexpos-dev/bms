import { Module } from '@nestjs/common';
import { AgreementTemplateService } from './agreement-template.service';
import { AgreementTemplateController } from './agreement-template.controller';
import { PrismaModule } from './prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AgreementTemplateService],
  controllers: [AgreementTemplateController],
  exports: [AgreementTemplateService],
})
export class AgreementTemplateModule {}
