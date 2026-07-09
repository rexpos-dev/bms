import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { PrismaService } from './prisma.service';
import { CreateDownloadLeadDto } from './create-download-lead.dto';
import { SendLeadCodeDto } from './send-lead-code.dto';
import { DownloadLeadsService } from './download-leads.service';

/** Public endpoints: the landing page collects company details before a download. */
@Controller('download-leads')
export class DownloadLeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: DownloadLeadsService,
  ) {}

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('send-code')
  async sendCode(@Body() dto: SendLeadCodeDto) {
    return { sent: await this.leads.sendCode(dto.email) };
  }

  /** Admin view of collected leads, newest first. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Get()
  findAll() {
    return this.prisma.downloadLead.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post()
  async create(@Body() dto: CreateDownloadLeadDto) {
    let emailVerified = false;
    if (dto.code) {
      this.leads.verifyAndConsume(dto.email, dto.code);
      emailVerified = true;
    }
    const lead = await this.prisma.downloadLead.create({
      data: {
        companyName: dto.companyName,
        contactPerson: dto.contactPerson,
        contactNo: dto.contactNo,
        email: dto.email.trim().toLowerCase(),
        emailVerified,
        platform: dto.platform,
      },
    });
    return { id: lead.id };
  }
}
