import { InventoryService } from './inventory.service';

function buildService() {
  const prisma = {
    inventoryItem: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 'item-1', stockQty: 0 }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'item-new', ...data })),
      update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
    },
  };
  return { prisma, service: new InventoryService(prisma as never) };
}

describe('InventoryService.list', () => {
  it('includes the category relation so the picker can filter on it', async () => {
    const { prisma, service } = buildService();

    await service.list();

    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { category: true } }),
    );
  });
});

describe('InventoryService.create', () => {
  it('persists categoryId when given', async () => {
    const { prisma, service } = buildService();

    await service.create({ name: 'Dahua 2MP Bullet', categoryId: 'cat-cctv' });

    expect(prisma.inventoryItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ categoryId: 'cat-cctv' }) }),
    );
  });

  it('leaves categoryId null when omitted', async () => {
    const { prisma, service } = buildService();

    await service.create({ name: 'Loose Cable' });

    expect(prisma.inventoryItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ categoryId: null }) }),
    );
  });
});

describe('InventoryService.update', () => {
  it('reassigns the category when given', async () => {
    const { prisma, service } = buildService();

    await service.update('item-1', { categoryId: 'cat-general' });

    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { categoryId: 'cat-general' },
    });
  });

  it('clears the category when given null', async () => {
    const { prisma, service } = buildService();

    await service.update('item-1', { categoryId: null });

    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { categoryId: null },
    });
  });

  it('leaves the category untouched when the dto omits it', async () => {
    const { prisma, service } = buildService();

    await service.update('item-1', { name: 'Renamed' });

    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { name: 'Renamed' },
    });
  });
});
