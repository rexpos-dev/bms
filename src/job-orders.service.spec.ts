import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JobOrdersService } from './job-orders.service';
import type { UpsertJobOrderDto } from './upsert-job-order.dto';

const user = { id: 'admin-1' } as never;

function buildTx() {
  return {
    jobOrderItem: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
    jobOrder: {
      findUnique: jest.fn(),
      update: jest.fn().mockImplementation(({ where, data }) =>
        Promise.resolve({ id: where.id, jobId: null, job: null, items: [], ...stripNested(data) }),
      ),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: 'jo-created', job: null, items: [], ...stripNested(data) }),
      ),
    },
    agreementVersion: { findFirst: jest.fn() },
    job: {
      create: jest.fn().mockResolvedValue({ id: 'job-created' }),
    },
    earning: { findFirst: jest.fn(), create: jest.fn() },
  };
}

function stripNested(data: Record<string, unknown>) {
  const { items: _items, ...rest } = data;
  return rest;
}

function buildService(tx: ReturnType<typeof buildTx>) {
  const prisma = {
    jobOrder: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    agreementVersion: { findFirst: jest.fn() },
    $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
  };
  const inventory = { applyJobOrderStock: jest.fn() };
  const service = new JobOrdersService(prisma as never, inventory as never);
  return { service, prisma, inventory };
}

const baseDto: UpsertJobOrderDto = {
  clientId: 'client-1',
  salePrice: 10000,
  items: [],
};

describe('JobOrdersService.upsert', () => {
  it('resolves the existing order by id when dto.id is given', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', status: 'DRAFT' });

    await service.upsert({ ...baseDto, id: 'jo-1' }, user);

    expect(prisma.jobOrder.findUnique).toHaveBeenCalledWith({ where: { id: 'jo-1' } });
    expect(tx.jobOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'jo-1' } }),
    );
    expect(tx.jobOrder.create).not.toHaveBeenCalled();
  });

  it('throws 404 when dto.id matches nothing instead of creating a duplicate', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue(null);

    await expect(service.upsert({ ...baseDto, id: 'missing' }, user)).rejects.toThrow(NotFoundException);
    expect(tx.jobOrder.create).not.toHaveBeenCalled();
  });

  it('creates a standalone order when neither id nor jobId is given', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);

    await service.upsert(baseDto, user);

    expect(prisma.jobOrder.findUnique).not.toHaveBeenCalled();
    expect(tx.jobOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ jobId: undefined }) }),
    );
  });

  it('persists includeAgreement when the dto sets it', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert({ ...baseDto, includeAgreement: true }, user);

    expect(tx.jobOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ includeAgreement: true }) }),
    );
  });

  it('defaults includeAgreement to false when the dto omits it', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert(baseDto, user);

    expect(tx.jobOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ includeAgreement: false }) }),
    );
  });

  it('persists the warranty tier on each item', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert(
      {
        ...baseDto,
        items: [
          { name: 'System Unit', quantity: 1, unitPrice: 20000, warrantyTier: 'MAIN_SET' },
          { name: 'Cash Drawer', quantity: 1, unitPrice: 3000, warrantyTier: 'ACCESSORY' },
        ],
      },
      user,
    );

    const created = tx.jobOrder.create.mock.calls[0][0].data.items.createMany.data;
    expect(created.map((i: { warrantyTier: string }) => i.warrantyTier)).toEqual(['MAIN_SET', 'ACCESSORY']);
  });

  it('defaults an item warranty tier to ACCESSORY when omitted', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert({ ...baseDto, items: [{ name: 'Cash Drawer', quantity: 1, unitPrice: 3000 }] }, user);

    const created = tx.jobOrder.create.mock.calls[0][0].data.items.createMany.data;
    expect(created[0].warrantyTier).toBe('ACCESSORY');
  });
});

describe('JobOrdersService.convert', () => {
  it('creates an installation job for the order client and links it', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);
    tx.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', jobId: null, clientId: 'client-1' });

    await service.convert('jo-1', { scheduleDate: '2026-08-01', installerId: 'inst-1' });

    expect(tx.job.create).toHaveBeenCalledWith({
      data: {
        clientId: 'client-1',
        scheduleDate: new Date('2026-08-01'),
        installerId: 'inst-1',
      },
    });
    expect(tx.jobOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'jo-1' },
        data: expect.objectContaining({ jobId: 'job-created', docType: 'JOB_ORDER' }),
      }),
    );
  });

  it('defaults installerId to null when omitted', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);
    tx.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', jobId: null, clientId: 'client-1' });

    await service.convert('jo-1', { scheduleDate: '2026-08-01' });

    expect(tx.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ installerId: null }),
    });
  });

  it('rejects an order that is already linked to a job', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);
    tx.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', jobId: 'job-9', clientId: 'client-1' });

    await expect(service.convert('jo-1', { scheduleDate: '2026-08-01' })).rejects.toThrow(BadRequestException);
    expect(tx.job.create).not.toHaveBeenCalled();
  });

  it('404s on a missing order', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);
    tx.jobOrder.findUnique.mockResolvedValue(null);

    await expect(service.convert('nope', { scheduleDate: '2026-08-01' })).rejects.toThrow(NotFoundException);
  });
});

describe('JobOrdersService.pinAgreement', () => {
  it('pins an unpinned order to the latest version', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', agreementVersionId: null });
    prisma.agreementVersion.findFirst.mockResolvedValue({ id: 'v3' });

    const result = await service.pinAgreement('jo-1');

    expect(prisma.jobOrder.update).toHaveBeenCalledWith({
      where: { id: 'jo-1' },
      data: { agreementVersionId: 'v3' },
    });
    expect(result).toEqual({ agreementVersionId: 'v3' });
  });

  it('leaves an already-pinned order alone', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', agreementVersionId: 'v1' });
    prisma.agreementVersion.findFirst.mockResolvedValue({ id: 'v3' });

    const result = await service.pinAgreement('jo-1');

    expect(prisma.jobOrder.update).not.toHaveBeenCalled();
    expect(result).toEqual({ agreementVersionId: 'v1' });
  });

  it('is a no-op when no template version exists', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', agreementVersionId: null });
    prisma.agreementVersion.findFirst.mockResolvedValue(null);

    const result = await service.pinAgreement('jo-1');

    expect(prisma.jobOrder.update).not.toHaveBeenCalled();
    expect(result).toEqual({ agreementVersionId: null });
  });

  it('404s on a missing order', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue(null);

    await expect(service.pinAgreement('nope')).rejects.toThrow(NotFoundException);
  });
});

describe('JobOrdersService.unpinAgreement', () => {
  it('clears the pin', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', agreementVersionId: 'v1' });

    const result = await service.unpinAgreement('jo-1');

    expect(prisma.jobOrder.update).toHaveBeenCalledWith({
      where: { id: 'jo-1' },
      data: { agreementVersionId: null },
    });
    expect(result).toEqual({ agreementVersionId: null });
  });

  it('404s on a missing order', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue(null);

    await expect(service.unpinAgreement('nope')).rejects.toThrow(NotFoundException);
  });
});
