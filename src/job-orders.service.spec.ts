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
    jobOrder: { findUnique: jest.fn() },
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
