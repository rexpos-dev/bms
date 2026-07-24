import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LicenseStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { ActivateLicenseDto } from './activate-license.dto';
import { GenerateLicenseDto } from './generate-license.dto';
import { LicenseCryptoService } from './license-crypto.service';
import { generateTrialKey } from './trial-key.util';

@Injectable()
export class LicensesService {
  private readonly logger = new Logger(LicensesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly licenseCrypto: LicenseCryptoService,
  ) {}

  async generate(dto: GenerateLicenseDto) {
    const [client, product] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: dto.clientId } }),
      this.prisma.softwareProduct.findUnique({ where: { id: dto.productId } }),
    ]);

    if (!client) throw new NotFoundException(`Client ${dto.clientId} not found`);
    if (!product) throw new NotFoundException(`Software product ${dto.productId} not found`);

    if (dto.isTrial) {
      const licenseKey = await this.generateUniqueTrialKey();
      return this.prisma.license.create({
        data: {
          licenseKey,
          clientId: dto.clientId,
          productId: dto.productId,
          isTrial: true,
          trialDays: dto.trialDays ?? 30,
          expirationDate: null,
          status: LicenseStatus.PENDING,
        },
      });
    }

    if (!dto.licenseKey) {
      throw new BadRequestException('License key is required for a non-trial license');
    }

    const existing = await this.prisma.license.findUnique({
      where: { licenseKey: dto.licenseKey },
    });
    if (existing) {
      throw new ConflictException('A license with this key already exists');
    }

    return this.prisma.license.create({
      data: {
        licenseKey: dto.licenseKey,
        clientId: dto.clientId,
        productId: dto.productId,
        expirationDate: dto.expirationDate,
        status: LicenseStatus.PENDING,
      },
    });
  }

  /** Generate a TRIAL- key, retrying on the rare collision against the unique index. */
  private async generateUniqueTrialKey(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const key = generateTrialKey();
      const clash = await this.prisma.license.findUnique({ where: { licenseKey: key } });
      if (!clash) return key;
    }
    throw new InternalServerErrorException('Could not generate a unique trial license key');
  }

  findAll() {
    return this.prisma.license.findMany({
      orderBy: { createdAt: 'desc' },
      include: { client: true, product: true },
    });
  }

  async findOne(id: string) {
    const license = await this.prisma.license.findUnique({
      where: { id },
      include: { client: true, product: true, activatedBy: true },
    });

    if (!license) {
      throw new NotFoundException(`License ${id} not found`);
    }

    return license;
  }

  /**
   * Developer activation step: binds the license to the requesting machine's
   * hardware fingerprint and issues an RS256 (RSA-4096) signed JWT license token.
   */
  async activate(id: string, developerId: string, dto: ActivateLicenseDto) {
    const license = await this.findOne(id);

    if (license.status === LicenseStatus.ACTIVATED) {
      throw new ConflictException('License is already activated');
    }

    const activationDate = new Date();
    const expirationDate =
      license.isTrial && license.trialDays
        ? new Date(activationDate.getTime() + license.trialDays * 24 * 60 * 60 * 1000)
        : license.expirationDate;

    const licenseToken = this.licenseCrypto.signLicenseToken(
      {
        licenseId: license.id,
        licenseKey: license.licenseKey,
        clientId: license.clientId,
        productId: license.productId,
        fingerprint: dto.fingerprint,
      },
      expirationDate ?? undefined,
    );

    return this.prisma.license.update({
      where: { id },
      data: {
        status: LicenseStatus.ACTIVATED,
        activatedById: developerId,
        activationDate,
        expirationDate,
        hardwareFingerprint: dto.fingerprint as unknown as object,
        licenseToken,
      },
    });
  }

  async suspend(id: string) {
    await this.findOne(id);
    return this.prisma.license.update({ where: { id }, data: { status: LicenseStatus.SUSPENDED } });
  }

  /**
   * Daily sweep: mark activated licenses whose expiry has passed as EXPIRED so the
   * admin dashboard reflects reality (trials and any regular license with an expiry).
   * The signed JWT already enforces expiry on the client; this keeps the DB in sync.
   */
  @Cron('0 2 * * *')
  async expireOverdueLicenses(): Promise<void> {
    const result = await this.prisma.license.updateMany({
      where: {
        status: LicenseStatus.ACTIVATED,
        expirationDate: { not: null, lt: new Date() },
      },
      data: { status: LicenseStatus.EXPIRED },
    });
    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} license(s) past their expiration date`);
    }
  }
}
