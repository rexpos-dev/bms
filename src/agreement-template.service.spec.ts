import { NotFoundException } from '@nestjs/common';
import { AgreementTemplateService } from './agreement-template.service';

const v1 = {
  id: 'v1',
  versionNo: 1,
  sections: [
    { heading: 'I', body: 'one' },
    { heading: 'II', body: 'two' },
  ],
};

function buildPrisma(latest: typeof v1 | null) {
  const tx = {
    agreementVersion: {
      findFirst: jest.fn().mockResolvedValue(latest ? { versionNo: latest.versionNo } : null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'v-new', ...data })),
    },
  };
  const prisma = {
    agreementVersion: {
      findFirst: jest.fn().mockResolvedValue(latest),
      findUnique: jest.fn().mockResolvedValue(latest),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
  };
  return { prisma, tx };
}

describe('AgreementTemplateService.getLatest', () => {
  it('reads the highest version number with its sections in order', async () => {
    const { prisma } = buildPrisma(v1);
    const service = new AgreementTemplateService(prisma as never);

    await service.getLatest();

    expect(prisma.agreementVersion.findFirst).toHaveBeenCalledWith({
      orderBy: { versionNo: 'desc' },
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
    });
  });

  it('returns null rather than throwing when no version exists', async () => {
    const { prisma } = buildPrisma(null);
    const service = new AgreementTemplateService(prisma as never);

    await expect(service.getLatest()).resolves.toBeNull();
  });
});

describe('AgreementTemplateService.getVersion', () => {
  it('404s on an unknown id', async () => {
    const { prisma } = buildPrisma(null);
    prisma.agreementVersion.findUnique.mockResolvedValue(null);
    const service = new AgreementTemplateService(prisma as never);

    await expect(service.getVersion('nope')).rejects.toThrow(NotFoundException);
  });
});

describe('AgreementTemplateService.save', () => {
  it('creates the next version number', async () => {
    const { prisma, tx } = buildPrisma(v1);
    const service = new AgreementTemplateService(prisma as never);

    await service.save({ sections: [{ heading: 'I', body: 'changed' }] }, 'user-1');

    expect(tx.agreementVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ versionNo: 2, createdById: 'user-1', note: null }),
      }),
    );
  });

  it('starts at version 1 on an empty table', async () => {
    const { prisma, tx } = buildPrisma(null);
    const service = new AgreementTemplateService(prisma as never);

    await service.save({ sections: [{ heading: 'I', body: 'one' }] }, 'user-1');

    expect(tx.agreementVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ versionNo: 1 }) }),
    );
  });

  it('writes sortOrder from the submitted order', async () => {
    const { prisma, tx } = buildPrisma(v1);
    const service = new AgreementTemplateService(prisma as never);

    await service.save(
      { sections: [{ heading: 'II', body: 'two' }, { heading: 'I', body: 'one' }] },
      'user-1',
    );

    expect(tx.agreementVersion.create.mock.calls[0][0].data.sections.createMany.data).toEqual([
      { heading: 'II', body: 'two', sortOrder: 0 },
      { heading: 'I', body: 'one', sortOrder: 1 },
    ]);
  });

  it('returns the existing version without creating one when nothing changed', async () => {
    const { prisma, tx } = buildPrisma(v1);
    const service = new AgreementTemplateService(prisma as never);

    const result = await service.save(
      { sections: [{ heading: 'I', body: 'one' }, { heading: 'II', body: 'two' }] },
      'user-1',
    );

    expect(tx.agreementVersion.create).not.toHaveBeenCalled();
    expect(result).toBe(v1);
  });

  it('creates a version when only the order changed', async () => {
    const { prisma, tx } = buildPrisma(v1);
    const service = new AgreementTemplateService(prisma as never);

    await service.save(
      { sections: [{ heading: 'II', body: 'two' }, { heading: 'I', body: 'one' }] },
      'user-1',
    );

    expect(tx.agreementVersion.create).toHaveBeenCalled();
  });

  it('creates a version when a section was removed', async () => {
    const { prisma, tx } = buildPrisma(v1);
    const service = new AgreementTemplateService(prisma as never);

    await service.save({ sections: [{ heading: 'I', body: 'one' }] }, 'user-1');

    expect(tx.agreementVersion.create).toHaveBeenCalled();
  });

  it('stores the note when given', async () => {
    const { prisma, tx } = buildPrisma(v1);
    const service = new AgreementTemplateService(prisma as never);

    await service.save({ sections: [{ heading: 'I', body: 'x' }], note: 'warranty bump' }, 'user-1');

    expect(tx.agreementVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ note: 'warranty bump' }) }),
    );
  });
});
