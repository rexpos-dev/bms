import { BadRequestException, ConflictException } from '@nestjs/common';
import { LicensesService, daysBetween } from './licenses.service';

function buildService() {
  const prisma = {
    client: { findUnique: jest.fn().mockResolvedValue({ id: 'client-1' }) },
    softwareProduct: { findUnique: jest.fn().mockResolvedValue({ id: 'product-1' }) },
    license: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'lic-1', ...data }),
      ),
      update: jest.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ id: where.id, ...data }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const crypto = { signLicenseToken: jest.fn().mockReturnValue('signed-token') };
  const service = new LicensesService(prisma as never, crypto as never);
  return { service, prisma, crypto };
}

describe('LicensesService.generate (trial)', () => {
  function futureDate(days: number): Date {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  it('auto-generates a unique TRIAL- key and stores the picked expirationDate', async () => {
    const { service } = buildService();
    const expiry = futureDate(30);
    const result = await service.generate({
      clientId: 'client-1',
      productId: 'product-1',
      isTrial: true,
      expirationDate: expiry,
    } as never);
    expect(result.licenseKey).toMatch(/^TRIAL-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(result.isTrial).toBe(true);
    expect(result.status).toBe('PENDING');
    expect(result.expirationDate).toBe(expiry);
    expect(result.trialDays).toBe(30);
  });

  it('derives trialDays from a shorter expirationDate', async () => {
    const { service } = buildService();
    const result = await service.generate({
      clientId: 'client-1',
      productId: 'product-1',
      isTrial: true,
      expirationDate: futureDate(14),
    } as never);
    expect(result.trialDays).toBe(14);
  });

  it('rejects trial creation with no expirationDate', async () => {
    const { service } = buildService();
    await expect(
      service.generate({ clientId: 'client-1', productId: 'product-1', isTrial: true } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects trial creation with a past expirationDate', async () => {
    const { service } = buildService();
    await expect(
      service.generate({
        clientId: 'client-1',
        productId: 'product-1',
        isTrial: true,
        expirationDate: new Date(Date.now() - 1000),
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a non-trial license with no key', async () => {
    const { service } = buildService();
    await expect(
      service.generate({ clientId: 'client-1', productId: 'product-1' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('daysBetween', () => {
  it('rounds up to the next full day', () => {
    const start = new Date('2026-09-01T00:00:00.000Z');
    const end = new Date('2026-09-15T12:00:00.000Z');
    expect(daysBetween(start, end)).toBe(15);
  });
});

describe('LicensesService.activate (trial)', () => {
  it('sets expirationDate = activation + trialDays and signs with that expiry', async () => {
    const { service, prisma, crypto } = buildService();
    prisma.license.findUnique.mockResolvedValue({
      id: 'lic-1',
      status: 'PENDING',
      isTrial: true,
      trialDays: 30,
      licenseKey: 'TRIAL-AAAA-BBBB',
      clientId: 'client-1',
      productId: 'product-1',
      expirationDate: null,
      client: {},
      product: {},
      activatedBy: null,
    });

    const before = Date.now();
    const result = await service.activate('lic-1', 'dev-1', {
      fingerprint: { cpu: 'c', disk: 'd', mac: 'm' },
    } as never);

    const expiry = new Date(result.expirationDate as Date).getTime();
    // ~30 days out (allow a small margin below 30 for execution time).
    expect(expiry).toBeGreaterThan(before + 29.9 * 24 * 60 * 60 * 1000);
    expect(crypto.signLicenseToken).toHaveBeenCalledTimes(1);
    const passedExpiry = (crypto.signLicenseToken.mock.calls[0][1] as Date).getTime();
    expect(passedExpiry).toBe(expiry);
  });

  it('signs a new-style trial with the stored expirationDate unchanged', async () => {
    const { service, prisma, crypto } = buildService();
    const fixedExpiry = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    prisma.license.findUnique.mockResolvedValue({
      id: 'lic-1',
      status: 'PENDING',
      isTrial: true,
      trialDays: 999, // must be ignored — expirationDate already set
      licenseKey: 'TRIAL-AAAA-BBBB',
      clientId: 'client-1',
      productId: 'product-1',
      expirationDate: fixedExpiry,
      client: {},
      product: {},
      activatedBy: null,
    });

    const result = await service.activate('lic-1', 'dev-1', {
      fingerprint: { cpu: 'c', disk: 'd', mac: 'm' },
    } as never);

    expect(result.expirationDate).toBe(fixedExpiry);
    const passedExpiry = crypto.signLicenseToken.mock.calls[0][1] as Date;
    expect(passedExpiry).toBe(fixedExpiry);
  });

  it('rejects activating a PENDING trial past its expiration date', async () => {
    const { service, prisma } = buildService();
    prisma.license.findUnique.mockResolvedValue({
      id: 'lic-1',
      status: 'PENDING',
      isTrial: true,
      trialDays: 30,
      licenseKey: 'TRIAL-AAAA-BBBB',
      clientId: 'client-1',
      productId: 'product-1',
      expirationDate: new Date(Date.now() - 1000),
      client: {},
      product: {},
      activatedBy: null,
    });

    await expect(
      service.activate('lic-1', 'dev-1', { fingerprint: { cpu: 'c', disk: 'd', mac: 'm' } } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects activating a license that is already EXPIRED', async () => {
    const { service, prisma } = buildService();
    prisma.license.findUnique.mockResolvedValue({
      id: 'lic-1',
      status: 'EXPIRED',
      isTrial: true,
      trialDays: 30,
      licenseKey: 'TRIAL-AAAA-BBBB',
      clientId: 'client-1',
      productId: 'product-1',
      expirationDate: new Date(Date.now() - 100_000),
      client: {},
      product: {},
      activatedBy: null,
    });

    await expect(
      service.activate('lic-1', 'dev-1', { fingerprint: { cpu: 'c', disk: 'd', mac: 'm' } } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('LicensesService.update', () => {
  function pendingTrial() {
    return {
      id: 'lic-1',
      status: 'PENDING',
      isTrial: true,
      trialDays: 30,
      licenseKey: 'TRIAL-AAAA-BBBB',
      clientId: 'client-1',
      productId: 'product-1',
      expirationDate: null,
      client: {},
      product: {},
      activatedBy: null,
    };
  }

  it('updates the license key', async () => {
    const { service, prisma } = buildService();
    prisma.license.findUnique.mockImplementation(({ where }: { where: { id?: string; licenseKey?: string } }) =>
      Promise.resolve(where.id ? pendingTrial() : null),
    );

    const result = await service.update('lic-1', { licenseKey: 'REAL-KEY-123' });

    expect(prisma.license.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lic-1' },
        data: expect.objectContaining({ licenseKey: 'REAL-KEY-123' }),
      }),
    );
    expect(result.licenseKey).toBe('REAL-KEY-123');
  });

  it('rejects a key already used by another license', async () => {
    const { service, prisma } = buildService();
    prisma.license.findUnique.mockImplementation(({ where }: { where: { id?: string; licenseKey?: string } }) =>
      Promise.resolve(where.id ? pendingTrial() : { id: 'other-lic' }),
    );

    await expect(service.update('lic-1', { licenseKey: 'DUP' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('converting trial -> full clears trialDays and expirationDate', async () => {
    const { service, prisma } = buildService();
    prisma.license.findUnique.mockImplementation(({ where }: { where: { id?: string; licenseKey?: string } }) =>
      Promise.resolve(where.id ? { ...pendingTrial(), expirationDate: new Date() } : null),
    );

    const result = await service.update('lic-1', { isTrial: false, licenseKey: 'REAL-1' });

    expect(result.isTrial).toBe(false);
    expect(result.trialDays).toBeNull();
    expect(result.expirationDate).toBeNull();
  });

  it('blocks setting isTrial=true on a non-PENDING license', async () => {
    const { service, prisma } = buildService();
    prisma.license.findUnique.mockImplementation(({ where }: { where: { id?: string; licenseKey?: string } }) =>
      Promise.resolve(where.id ? { ...pendingTrial(), status: 'ACTIVATED', isTrial: false } : null),
    );

    await expect(service.update('lic-1', { isTrial: true })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows setting isTrial=true on a PENDING license', async () => {
    const { service, prisma } = buildService();
    prisma.license.findUnique.mockImplementation(({ where }: { where: { id?: string; licenseKey?: string } }) =>
      Promise.resolve(where.id ? { ...pendingTrial(), isTrial: false, trialDays: null } : null),
    );

    const result = await service.update('lic-1', { isTrial: true, trialDays: 14 });

    expect(result.isTrial).toBe(true);
    expect(result.trialDays).toBe(14);
  });
});

describe('LicensesService.expireOverdueLicenses', () => {
  it('flips activated, past-expiry licenses to EXPIRED', async () => {
    const { service, prisma } = buildService();
    prisma.license.updateMany.mockResolvedValue({ count: 2 });

    await service.expireOverdueLicenses();

    expect(prisma.license.updateMany).toHaveBeenCalledTimes(1);
    const arg = prisma.license.updateMany.mock.calls[0][0];
    expect(arg.where.status).toBe('ACTIVATED');
    expect(arg.where.expirationDate.lt).toBeInstanceOf(Date);
    expect(arg.data).toEqual({ status: 'EXPIRED' });
  });
});
