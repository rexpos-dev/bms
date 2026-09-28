import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isPrismaError } from './prisma-errors';
import { PrismaService } from './prisma.service';
import { CreateItemPackageDto, UpdateItemPackageDto } from './create-item-package.dto';

const INCLUDE_FULL = {
  items: {
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
    include: {
      inventoryItem: { include: { category: true } },
    },
  },
};

@Injectable()
export class ItemPackagesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active packages with their component items — drives the Job Order picker. */
  list(includeInactive = false) {
    return this.prisma.itemPackage.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: INCLUDE_FULL,
    });
  }

  async findOne(id: string) {
    const pkg = await this.prisma.itemPackage.findUnique({
      where: { id },
      include: INCLUDE_FULL,
    });
    if (!pkg) throw new NotFoundException(`Item package ${id} not found`);
    return pkg;
  }

  async create(dto: CreateItemPackageDto) {
    await this.assertItemsExist(dto.items.map((i) => i.inventoryItemId));
    try {
      return await this.prisma.itemPackage.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          sortOrder: dto.sortOrder ?? 0,
          active: dto.active ?? true,
          items: {
            create: dto.items.map((item, index) => ({
              inventoryItemId: item.inventoryItemId,
              quantity: item.quantity,
              sortOrder: index,
            })),
          },
        },
        include: INCLUDE_FULL,
      });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async update(id: string, dto: UpdateItemPackageDto) {
    await this.getOrThrow(id);
    if (dto.items) {
      await this.assertItemsExist(dto.items.map((i) => i.inventoryItemId));
    }
    const data: Prisma.ItemPackageUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.active !== undefined) data.active = dto.active;
    // Components are replaced wholesale — mirrors how JobOrderItem rows are
    // re-created on each save, so quantity edits need no diffing.
    if (dto.items) {
      data.items = {
        deleteMany: {},
        create: dto.items.map((item, index) => ({
          inventoryItemId: item.inventoryItemId,
          quantity: item.quantity,
          sortOrder: index,
        })),
      };
    }
    try {
      return await this.prisma.itemPackage.update({ where: { id }, data, include: INCLUDE_FULL });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async remove(id: string) {
    await this.getOrThrow(id);
    await this.prisma.itemPackage.delete({ where: { id } });
    return { id };
  }

  private async assertItemsExist(inventoryItemIds: string[]) {
    const ids = [...new Set(inventoryItemIds)];
    const found = await this.prisma.inventoryItem.count({ where: { id: { in: ids } } });
    if (found !== ids.length) {
      throw new BadRequestException('One or more package components reference a missing inventory item');
    }
  }

  private async getOrThrow(id: string) {
    const pkg = await this.prisma.itemPackage.findUnique({ where: { id } });
    if (!pkg) throw new NotFoundException('Item package not found');
    return pkg;
  }

  private mapError(e: unknown): Error {
    if (isPrismaError(e, 'P2002')) {
      return new BadRequestException('A package with that name already exists');
    }
    return e as Error;
  }
}
