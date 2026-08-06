import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ItemCategoriesService } from './item-categories.service';

function buildPrisma() {
  const prisma = {
    itemCategory: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 'cat-1', name: 'CCTV' }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'cat-new', ...data })),
      update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      delete: jest.fn().mockResolvedValue({ id: 'cat-1' }),
    },
    inventoryItem: {
      count: jest.fn().mockResolvedValue(0),
    },
  };
  return { prisma, service: new ItemCategoriesService(prisma as never) };
}

describe('ItemCategoriesService.findAll', () => {
  it('returns only active categories ordered by sortOrder then name', async () => {
    const { prisma, service } = buildPrisma();

    await service.findAll();

    expect(prisma.itemCategory.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { items: true } } },
    });
  });

  it('includes inactive categories when asked', async () => {
    const { prisma, service } = buildPrisma();

    await service.findAll(true);

    expect(prisma.itemCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });
});

describe('ItemCategoriesService.create', () => {
  it('creates with the given name and trims surrounding whitespace', async () => {
    const { prisma, service } = buildPrisma();

    await service.create({ name: '  CCTV  ' } as never);

    expect(prisma.itemCategory.create).toHaveBeenCalledWith({
      data: { name: 'CCTV', jobOrderType: null, sortOrder: 0, active: true },
    });
  });

  it('applies the defaults when the dto omits jobOrderType, sortOrder, and active', async () => {
    const { prisma, service } = buildPrisma();

    await service.create({ name: 'Cabling' } as never);

    expect(prisma.itemCategory.create).toHaveBeenCalledWith({
      data: { name: 'Cabling', jobOrderType: null, sortOrder: 0, active: true },
    });
  });

  it('passes an explicit jobOrderType through unchanged', async () => {
    const { prisma, service } = buildPrisma();

    await service.create({ name: 'CCTV', jobOrderType: 'CCTV' } as never);

    expect(prisma.itemCategory.create).toHaveBeenCalledWith({
      data: { name: 'CCTV', jobOrderType: 'CCTV', sortOrder: 0, active: true },
    });
  });

  it('maps a Prisma P2002 unique-constraint error to a ConflictException', async () => {
    const { prisma, service } = buildPrisma();
    prisma.itemCategory.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`name`)', {
        code: 'P2002',
        clientVersion: '5.0.0',
      }),
    );

    await expect(service.create({ name: 'CCTV' } as never)).rejects.toThrow(ConflictException);
  });
});

describe('ItemCategoriesService.remove', () => {
  it('refuses to delete a category that still holds items', async () => {
    const { prisma, service } = buildPrisma();
    prisma.inventoryItem.count.mockResolvedValue(3);

    await expect(service.remove('cat-1')).rejects.toThrow(ConflictException);
    expect(prisma.itemCategory.delete).not.toHaveBeenCalled();
  });

  it('names the item count in the conflict message', async () => {
    const { prisma, service } = buildPrisma();
    prisma.inventoryItem.count.mockResolvedValue(3);

    await expect(service.remove('cat-1')).rejects.toThrow(/3/);
  });

  it('deletes an empty category', async () => {
    const { prisma, service } = buildPrisma();

    await service.remove('cat-1');

    expect(prisma.itemCategory.delete).toHaveBeenCalledWith({ where: { id: 'cat-1' } });
  });

  it('throws 404 for a category that does not exist', async () => {
    const { prisma, service } = buildPrisma();
    prisma.itemCategory.findUnique.mockResolvedValue(null);

    await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
  });
});

describe('ItemCategoriesService.update', () => {
  it('accepts an explicit null jobOrderType for the all-types case', async () => {
    const { prisma, service } = buildPrisma();

    await service.update('cat-1', { jobOrderType: null });

    expect(prisma.itemCategory.update).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: { jobOrderType: null },
    });
  });

  it('leaves jobOrderType untouched when the dto omits it', async () => {
    const { prisma, service } = buildPrisma();

    await service.update('cat-1', { name: 'Renamed' });

    expect(prisma.itemCategory.update).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: { name: 'Renamed' },
    });
  });
});
