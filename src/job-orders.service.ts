import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocType, JobOrderStatus, JobOrderType } from '@prisma/client';
import type { AuthenticatedUser } from './authenticated-user.type';
import { PrismaService } from './prisma.service';
import { InventoryService } from './inventory.service';
import { ConvertJobOrderDto, UpsertJobOrderDto } from './upsert-job-order.dto';
import { ensureLaborEarning } from './job-order-labor.util';

const INCLUDE_FULL = {
  client: true,
  product: true,
  job: { include: { installer: true } },
  items: { orderBy: { createdAt: 'asc' as const } },
};

// Split from INCLUDE_FULL because findAll() shares that shape for the job
// order list: embedding the full agreement text there would put several
// kilobytes of legal prose on every row of a response that never displays it.
const INCLUDE_WITH_AGREEMENT = {
  ...INCLUDE_FULL,
  agreementVersion: { include: { sections: { orderBy: { sortOrder: 'asc' as const } } } },
};

@Injectable()
export class JobOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async upsert(dto: UpsertJobOrderDto, user: AuthenticatedUser) {
    const existing = dto.id
      ? await this.prisma.jobOrder.findUnique({ where: { id: dto.id } })
      : dto.jobId
        ? await this.prisma.jobOrder.findUnique({ where: { jobId: dto.jobId } })
        : null;
    if (dto.id && !existing) {
      throw new NotFoundException(`Job order ${dto.id} not found`);
    }

    const data = {
      clientId: dto.clientId,
      productId: dto.productId ?? null,
      salePrice: dto.salePrice,
      discount: dto.discount ?? 0,
      discountType: dto.discountType ?? 'FIXED',
      remarks: dto.remarks ?? null,
      status: dto.status ?? JobOrderStatus.DRAFT,
      type: dto.type ?? JobOrderType.SOFTWARE,
      cameraCount: dto.cameraCount ?? null,
      cameraRate: dto.cameraRate ?? null,
      laborPct: dto.laborPct ?? null,
      docType: dto.docType ?? DocType.JOB_ORDER,
      includeAgreement: dto.includeAgreement ?? false,
    };
    const newCompleted = data.status === JobOrderStatus.COMPLETED;

    const itemsCreate = dto.items.map((item) => ({
      name: item.name,
      description: item.description ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      inventoryItemId: item.inventoryItemId ?? null,
      warrantyTier: item.warrantyTier ?? 'ACCESSORY',
    }));

    return this.prisma.$transaction(async (tx) => {
      let oldItems: { inventoryItemId: string | null; quantity: number }[] = [];
      let oldCompleted = false;
      let jobOrder;

      if (existing) {
        oldItems = await tx.jobOrderItem.findMany({
          where: { jobOrderId: existing.id },
          select: { inventoryItemId: true, quantity: true },
        });
        oldCompleted = existing.status === JobOrderStatus.COMPLETED;

        await tx.jobOrderItem.deleteMany({ where: { jobOrderId: existing.id } });
        jobOrder = await tx.jobOrder.update({
          where: { id: existing.id },
          data: { ...data, items: { createMany: { data: itemsCreate } } },
          include: INCLUDE_FULL,
        });
      } else {
        jobOrder = await tx.jobOrder.create({
          data: {
            jobId: dto.jobId,
            ...data,
            items: { createMany: { data: itemsCreate } },
          },
          include: INCLUDE_FULL,
        });
      }

      // Reconcile inventory stock for the completed-state change.
      await this.inventory.applyJobOrderStock(
        tx,
        jobOrder.id,
        oldItems,
        oldCompleted,
        dto.items,
        newCompleted,
        user.id,
      );

      // CCTV/Signage: guarantee the installer's labor earning once finalized.
      await ensureLaborEarning(tx, jobOrder);

      return jobOrder;
    });
  }

  async findByJob(jobId: string) {
    const jobOrder = await this.prisma.jobOrder.findUnique({
      where: { jobId },
      include: INCLUDE_WITH_AGREEMENT,
    });
    return jobOrder;
  }

  async findOne(id: string) {
    const jobOrder = await this.prisma.jobOrder.findUnique({
      where: { id },
      include: INCLUDE_WITH_AGREEMENT,
    });
    if (!jobOrder) throw new NotFoundException(`Job order ${id} not found`);
    return jobOrder;
  }

  findAll() {
    return this.prisma.jobOrder.findMany({
      orderBy: { createdAt: 'desc' },
      include: INCLUDE_FULL,
    });
  }

  /** Standalone quotation → job order: creates the installation job and links it. */
  async convert(id: string, dto: ConvertJobOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const jobOrder = await tx.jobOrder.findUnique({ where: { id } });
      if (!jobOrder) throw new NotFoundException(`Job order ${id} not found`);
      if (jobOrder.jobId) {
        throw new BadRequestException('This order is already linked to an installation job.');
      }

      const job = await tx.job.create({
        data: {
          clientId: jobOrder.clientId,
          scheduleDate: new Date(dto.scheduleDate),
          installerId: dto.installerId ?? null,
        },
      });

      return tx.jobOrder.update({
        where: { id },
        data: { jobId: job.id, docType: DocType.JOB_ORDER },
        include: INCLUDE_FULL,
      });
    });
  }

  /**
   * Locks the order to the current template so a reprint reproduces the signed
   * text. Idempotent — the print handler calls it on every print.
   */
  async pinAgreement(id: string) {
    const jobOrder = await this.prisma.jobOrder.findUnique({
      where: { id },
      select: { id: true, agreementVersionId: true },
    });
    if (!jobOrder) throw new NotFoundException(`Job order ${id} not found`);
    if (jobOrder.agreementVersionId) return { agreementVersionId: jobOrder.agreementVersionId };

    const latest = await this.prisma.agreementVersion.findFirst({
      orderBy: { versionNo: 'desc' },
      select: { id: true },
    });
    if (!latest) return { agreementVersionId: null };

    await this.prisma.jobOrder.update({
      where: { id },
      data: { agreementVersionId: latest.id },
    });
    return { agreementVersionId: latest.id };
  }

  /** Releases the lock so the order follows the latest template again. */
  async unpinAgreement(id: string) {
    const jobOrder = await this.prisma.jobOrder.findUnique({ where: { id }, select: { id: true } });
    if (!jobOrder) throw new NotFoundException(`Job order ${id} not found`);

    await this.prisma.jobOrder.update({ where: { id }, data: { agreementVersionId: null } });
    return { agreementVersionId: null };
  }
}
