import { Prisma } from '@prisma/client';
import { fromDeviceRow, serializeRow, toPullRow } from './sync-serialize';
import { getSyncTable } from './sync-tables';

const table = (name: string) => getSyncTable(name)!;

describe('sync-serialize', () => {
  it('serializes Dates, Decimals and BigInts into JSON-safe values', () => {
    const row = serializeRow('Payment', {
      id: 'p1',
      amount: new Prisma.Decimal('1500.50'),
      paidAt: new Date('2026-09-28T01:02:03.004Z'),
      voidedAt: null,
      notAColumn: 'dropped',
    });
    expect(row).toEqual({
      id: 'p1',
      amount: '1500.5',
      paidAt: '2026-09-28T01:02:03.004Z',
      voidedAt: null,
    });
  });

  it('never sends secrets to a device and substitutes required defaults', () => {
    const row = toPullRow(table('users'), {
      id: 'u1',
      email: 'a@b.c',
      passwordHash: '$2b$hash',
      mfaSecret: 'SECRET',
      refreshToken: 'tok',
      fullName: 'A',
      role: 'SUPER_ADMIN',
    });
    expect(row.passwordHash).toBe('!');
    expect(row.mfaSecret).toBeNull();
    expect(row.refreshToken).toBeNull();
    expect(row.email).toBe('a@b.c');
  });

  it('drops unknown keys, server-owned fields and updatedAt from device rows; parses dates', () => {
    const { data, ignored } = fromDeviceRow(table('inventory_items'), {
      id: 'i1',
      name: 'Mouse',
      stockQty: 999,
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-09-01T00:00:00.000Z',
      hax: 'x',
    });
    expect(data.name).toBe('Mouse');
    expect(data.stockQty).toBeUndefined();
    expect(data.updatedAt).toBeUndefined();
    expect(data.createdAt).toEqual(new Date('2026-09-01T00:00:00.000Z'));
    expect(ignored.sort()).toEqual(['hax', 'stockQty', 'updatedAt']);
  });

  it('refuses device-supplied license tokens', () => {
    const { data } = fromDeviceRow(table('licenses'), {
      id: 'l1',
      licenseKey: 'K',
      licenseToken: 'forged',
      hardwareFingerprint: { mac: 'x' },
    });
    expect(data.licenseToken).toBeUndefined();
    expect(data.hardwareFingerprint).toBeUndefined();
    expect(data.licenseKey).toBe('K');
  });

  it('rejects invalid dates', () => {
    expect(() =>
      fromDeviceRow(table('payments'), { paidAt: 'not-a-date' }),
    ).toThrow(/Invalid date/);
  });
});
