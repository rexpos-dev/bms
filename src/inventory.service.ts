import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryItem, Prisma, StockMovementReason } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { CreateInventoryItemDto } from './create-inventory-item.dto';
import { UpdateInventoryItemDto } from './update-inventory-item.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeInactive = false) {
    return this.prisma.inventoryItem.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { category: true },
    });
  }

  async findByBarcode(code: string): Promise<InventoryItem> {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { barcode: code.trim(), active: true },
    });
    if (!item) throw new NotFoundException('No active inventory item with that barcode');
    return item;
  }

  async create(dto: CreateInventoryItemDto): Promise<InventoryItem> {
    try {
      return await this.prisma.inventoryItem.create({
        data: {
          name: dto.name,
          description: dto.description?.trim() || null,
          barcode: dto.barcode?.trim() || null,
          unitPrice: dto.unitPrice ?? 0,
          stockQty: dto.stockQty ?? 0,
          lowStockAlert: dto.lowStockAlert ?? 0,
          sortOrder: dto.sortOrder ?? 0,
          active: dto.active ?? true,
          categoryId: dto.categoryId ?? null,
        },
      });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async update(id: string, dto: UpdateInventoryItemDto): Promise<InventoryItem> {
    await this.getOrThrow(id);
    const data: Prisma.InventoryItemUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.barcode !== undefined) data.barcode = dto.barcode?.trim() || null;
    if (dto.unitPrice !== undefined) data.unitPrice = dto.unitPrice;
    if (dto.stockQty !== undefined) data.stockQty = dto.stockQty;
    if (dto.lowStockAlert !== undefined) data.lowStockAlert = dto.lowStockAlert;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    try {
      return await this.prisma.inventoryItem.update({ where: { id }, data });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async adjustStock(id: string, delta: number, userId?: string): Promise<InventoryItem> {
    const item = await this.getOrThrow(id);
    if (item.stockQty + delta < 0) throw new BadRequestException('Stock cannot go below zero');
    return this.prisma.$transaction(async (tx) => {
      await this.applyStockDelta(tx, id, delta, StockMovementReason.MANUAL_ADJUST, {
        userId,
        note: 'Manual restock/adjust',
      });
      return tx.inventoryItem.findUniqueOrThrow({ where: { id } });
    });
  }

  listMovements(id: string, limit = 50) {
    return this.prisma.stockMovement.findMany({
      where: { inventoryItemId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Apply a single stock change and record it in the ledger.
   * MUST be called inside a transaction. Allows the balance to go negative
   * (job-order completion never blocks on stock — the shortfall shows as red).
   */
  async applyStockDelta(
    tx: Prisma.TransactionClient,
    itemId: string,
    delta: number,
    reason: StockMovementReason,
    meta: { jobOrderId?: string | null; userId?: string | null; note?: string | null } = {},
  ): Promise<void> {
    if (delta === 0) return;
    const item = await tx.inventoryItem.findUnique({ where: { id: itemId }, select: { stockQty: true } });
    if (!item) return; // item was deleted — nothing to adjust
    const balance = item.stockQty + delta;
    await tx.inventoryItem.update({ where: { id: itemId }, data: { stockQty: balance } });
    await tx.stockMovement.create({
      data: {
        inventoryItemId: itemId,
        delta,
        balance,
        reason,
        jobOrderId: meta.jobOrderId ?? null,
        userId: meta.userId ?? null,
        note: meta.note ?? null,
      },
    });
  }

  /**
   * Reconcile inventory for a job order's completed-state change.
   * Consumption counts only when the order is COMPLETED, so this one formula
   * covers first completion (deduct), reverting/cancelling (restore), and
   * editing a completed order's items (net delta). Runs in the caller's transaction.
   */
  async applyJobOrderStock(
    tx: Prisma.TransactionClient,
    jobOrderId: string,
    oldItems: { inventoryItemId: string | null; quantity: number }[],
    oldCompleted: boolean,
    newItems: { inventoryItemId?: string | null; quantity: number }[],
    newCompleted: boolean,
    userId?: string | null,
  ): Promise<void> {
    const consumedOld = this.sumByItem(oldCompleted ? oldItems : []);
    const consumedNew = this.sumByItem(newCompleted ? newItems : []);

    const ids = new Set<string>([...consumedOld.keys(), ...consumedNew.keys()]);
    for (const id of ids) {
      const consumeDelta = (consumedNew.get(id) ?? 0) - (consumedOld.get(id) ?? 0);
      if (consumeDelta === 0) continue;
      const stockDelta = -consumeDelta; // consuming reduces stock; un-consuming restores it
      const reason =
        stockDelta < 0 ? StockMovementReason.JOB_ORDER_DEDUCTION : StockMovementReason.JOB_ORDER_RESTORE;
      await this.applyStockDelta(tx, id, stockDelta, reason, { jobOrderId, userId });
    }
  }

  private sumByItem(items: { inventoryItemId?: string | null; quantity: number }[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const it of items) {
      if (!it.inventoryItemId) continue;
      map.set(it.inventoryItemId, (map.get(it.inventoryItemId) ?? 0) + it.quantity);
    }
    return map;
  }

  async remove(id: string): Promise<{ id: string }> {
    await this.getOrThrow(id);
    await this.prisma.inventoryItem.delete({ where: { id } });
    return { id };
  }

  private async getOrThrow(id: string): Promise<InventoryItem> {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Inventory item not found');
    return item;
  }

  private mapError(e: unknown): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new BadRequestException('That barcode is already used by another item');
    }
    return e as Error;
  }
}
