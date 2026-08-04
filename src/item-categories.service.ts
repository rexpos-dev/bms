import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { CreateItemCategoryDto, UpdateItemCategoryDto } from './item-category.dto';

@Injectable()
export class ItemCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(includeInactive = false) {
    return this.prisma.itemCategory.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { items: true } } },
    });
  }

  async create(dto: CreateItemCategoryDto) {
    try {
      return await this.prisma.itemCategory.create({
        data: {
          name: dto.name.trim(),
          jobOrderType: dto.jobOrderType ?? null,
          sortOrder: dto.sortOrder ?? 0,
          active: dto.active ?? true,
        },
      });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async update(id: string, dto: UpdateItemCategoryDto) {
    await this.getOrThrow(id);
    const data: Prisma.ItemCategoryUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.jobOrderType !== undefined) data.jobOrderType = dto.jobOrderType;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.active !== undefined) data.active = dto.active;
    try {
      return await this.prisma.itemCategory.update({ where: { id }, data });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async remove(id: string) {
    await this.getOrThrow(id);
    // SetNull protects the rows, but silently orphaning a dozen items on a
    // misclick is still bad — make the caller reassign or deactivate instead.
    const itemCount = await this.prisma.inventoryItem.count({ where: { categoryId: id } });
    if (itemCount > 0) {
      throw new ConflictException(
        `This category still holds ${itemCount} item(s). Move them to another category, or deactivate this one instead of deleting it.`,
      );
    }
    await this.prisma.itemCategory.delete({ where: { id } });
    return { id };
  }

  private async getOrThrow(id: string) {
    const category = await this.prisma.itemCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Item category not found');
    return category;
  }

  private mapError(e: unknown): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException('A category with that name already exists');
    }
    return e as Error;
  }
}
