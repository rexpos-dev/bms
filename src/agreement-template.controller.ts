import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from './authenticated-user.type';
import { CurrentUser } from './current-user.decorator';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { AgreementTemplateService } from './agreement-template.service';
import { SaveAgreementTemplateDto } from './save-agreement-template.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('agreement-template')
export class AgreementTemplateController {
  constructor(private readonly service: AgreementTemplateService) {}

  /** The current template — read by the Job Order print page. */
  @Get()
  getLatest() {
    return this.service.getLatest();
  }

  @Get('versions')
  listVersions() {
    return this.service.listVersions();
  }

  @Get('versions/:id')
  getVersion(@Param('id') id: string) {
    return this.service.getVersion(id);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post()
  save(@Body() dto: SaveAgreementTemplateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.save(dto, user.id);
  }
}
