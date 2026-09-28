/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { randomUUID } from 'node:crypto';
import type { PrismaService as PrismaServiceType } from './prisma.service';
import { SyncService, type PushOp } from './sync.service';

/**
 * Runs the real SyncService against real MySQL triggers.
 *
 *   SYNC_TEST_DATABASE_URL=mysql://root:…@localhost:3306/sdlmp_sync_test  npx jest src/sync.mysql.spec.ts
 *
 * The database MUST be a scratch database (name ends in `_test`) built with
 * `prisma migrate deploy`; the suite refuses to run against anything else.
 */
const url = process.env.SYNC_TEST_DATABASE_URL;
const safe = !!url && /\/[^/?]+_test(\?|$)/.test(url);
const suite = safe ? describe : describe.skip;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

suite('sync engine on real MySQL (triggers)', () => {
  let prisma: PrismaServiceType;
  let svc: SyncService;
  let deviceId: string;

  const seq = async () => (await svc.status()).currentSeq;
  const op = (o: Omit<PushOp, 'opId'>): PushOp => ({
    opId: randomUUID(),
    ...o,
  });
  const newClient = async (over: Record<string, unknown> = {}) =>
    prisma.client.create({
      data: {
        clientCode: `C-${randomUUID().slice(0, 8)}`,
        businessName: 'Acme',
        ownerName: 'Juan',
        contactNo: '0917',
        ...over,
      },
    });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const { PrismaService } = require('./prisma.service');
    prisma = new PrismaService();
    await prisma.$connect();
    svc = new SyncService(prisma);
    deviceId = (await svc.createDevice('Test PC', 'tester')).device.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('triggers log insert/update/delete and pull collapses them to the latest state', async () => {
    const since = await seq();
    const c = await newClient();
    await prisma.client.update({
      where: { id: c.id },
      data: { businessName: 'Renamed' },
    });

    const page = await svc.pull(deviceId, since);
    const mine = page.changes.filter(
      (e) => e.table === 'clients' && e.id === c.id,
    );
    expect(mine).toHaveLength(1); // I + U collapsed
    expect(mine[0]).toMatchObject({
      op: 'U',
      row: { id: c.id, businessName: 'Renamed' },
    });

    const before = await seq();
    await prisma.client.delete({ where: { id: c.id } });
    const after = await svc.pull(deviceId, before);
    expect(after.changes.find((e) => e.id === c.id)).toMatchObject({
      table: 'clients',
      op: 'D',
      row: null,
    });
  });

  it('never sends user secrets to a device', async () => {
    const since = await seq();
    const u = await prisma.user.create({
      data: {
        email: `${randomUUID()}@t.io`,
        passwordHash: 'REAL-HASH',
        fullName: 'U',
        role: 'ADMIN_STAFF',
        mfaSecret: 'MFA',
        refreshToken: 'RT',
      },
    });
    const entry = (await svc.pull(deviceId, since)).changes.find(
      (e) => e.table === 'users' && e.id === u.id,
    );
    expect(entry?.row).toMatchObject({
      passwordHash: '!',
      mfaSecret: null,
      refreshToken: null,
    });
  });

  it('bumps the job order version when a child row changes, and logs the child delete', async () => {
    const c = await newClient();
    const jo = await prisma.jobOrder.create({
      data: { clientId: c.id, salePrice: 100 },
    });
    const item = await prisma.jobOrderItem.create({
      data: { jobOrderId: jo.id, name: 'Cable', unitPrice: 10 },
    });
    const t0 = (
      await prisma.jobOrder.findUniqueOrThrow({ where: { id: jo.id } })
    ).updatedAt;
    await sleep(25);
    const since = await seq();

    await prisma.jobOrderItem.delete({ where: { id: item.id } });

    const t1 = (
      await prisma.jobOrder.findUniqueOrThrow({ where: { id: jo.id } })
    ).updatedAt;
    expect(t1.getTime()).toBeGreaterThan(t0.getTime());
    const changes = (await svc.pull(deviceId, since)).changes;
    expect(
      changes.find((e) => e.table === 'job_orders' && e.id === jo.id)?.op,
    ).toBe('U');
    expect(
      changes.find((e) => e.table === 'job_order_items' && e.id === item.id)
        ?.op,
    ).toBe('D');
  });

  it('applies a device-created row, returns the real server version, then detects staleness', async () => {
    const id = randomUUID();
    const row = {
      id,
      clientCode: `C-${id.slice(0, 8)}`,
      businessName: 'Offline Co',
      ownerName: 'O',
      contactNo: '1',
      createdAt: '2026-09-01T00:00:00.000Z',
    };
    const [created] = await svc.push(deviceId, [
      op({ table: 'clients', id, op: 'I', row }),
    ]);
    expect(created.status).toBe('APPLIED');
    const db = await prisma.client.findUniqueOrThrow({ where: { id } });
    expect(created.version).toBe(db.updatedAt.toISOString());
    expect(db.createdAt.toISOString()).toBe('2026-09-01T00:00:00.000Z'); // device's original timestamp kept

    // edit with the returned version → ok
    const [ok] = await svc.push(deviceId, [
      op({
        table: 'clients',
        id,
        op: 'U',
        row: { businessName: 'Edit 1' },
        baseUpdatedAt: created.version,
      }),
    ]);
    expect(ok.status).toBe('APPLIED');

    // someone else edits on the server; a device edit based on the old version must lose
    await sleep(25);
    await prisma.client.update({
      where: { id },
      data: { businessName: 'Server wins' },
    });
    const [stale] = await svc.push(deviceId, [
      op({
        table: 'clients',
        id,
        op: 'U',
        row: { businessName: 'Stale device edit' },
        baseUpdatedAt: ok.version,
      }),
    ]);
    expect(stale).toMatchObject({ status: 'CONFLICT', reason: 'STALE' });
    expect(
      (await prisma.client.findUniqueOrThrow({ where: { id } })).businessName,
    ).toBe('Server wins');
    const conflict = await prisma.syncConflict.findFirstOrThrow({
      where: { recordId: id },
    });
    expect(conflict).toMatchObject({
      reason: 'STALE',
      tableName: 'clients',
      deviceId,
    });
    expect((conflict.serverRow as { businessName: string }).businessName).toBe(
      'Server wins',
    );
  });

  it('maps real MySQL constraint errors: duplicate business key and missing parent', async () => {
    const existing = await newClient();
    const id = randomUUID();
    const [dup] = await svc.push(deviceId, [
      op({
        table: 'clients',
        id,
        op: 'I',
        row: {
          id,
          clientCode: existing.clientCode,
          businessName: 'Dup',
          ownerName: 'D',
          contactNo: '1',
        },
      }),
    ]);
    expect(dup).toMatchObject({ status: 'CONFLICT', reason: 'DUPLICATE_KEY' });
    expect(await prisma.client.findUnique({ where: { id } })).toBeNull();

    const orphan = randomUUID();
    const [fk] = await svc.push(deviceId, [
      op({
        table: 'job_orders',
        id: orphan,
        op: 'I',
        row: { id: orphan, clientId: randomUUID(), salePrice: '10.00' },
      }),
    ]);
    expect(fk).toMatchObject({ status: 'CONFLICT', reason: 'INVALID' });
  });

  it('pushes a job order aggregate (parent + child) with decimals, and the device sees its own change echoed', async () => {
    const c = await newClient();
    const since = await seq();
    const joId = randomUUID();
    const itemId = randomUUID();
    const results = await svc.push(deviceId, [
      op({
        table: 'job_order_items',
        id: itemId,
        op: 'I',
        row: {
          id: itemId,
          jobOrderId: joId,
          name: 'Router',
          quantity: 2,
          unitPrice: '1250.75',
        },
      }),
      op({
        table: 'job_orders',
        id: joId,
        op: 'I',
        row: {
          id: joId,
          clientId: c.id,
          salePrice: '2501.50',
          status: 'DRAFT',
          type: 'SOFTWARE',
          docType: 'JOB_ORDER',
        },
      }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['APPLIED', 'APPLIED']);

    const stored = await prisma.jobOrderItem.findUniqueOrThrow({
      where: { id: itemId },
    });
    expect(stored.unitPrice.toString()).toBe('1250.75');
    const echoed = (await svc.pull(deviceId, since)).changes.map(
      (e) => `${e.table}:${e.id}`,
    );
    expect(echoed).toEqual(
      expect.arrayContaining([
        `job_orders:${joId}`,
        `job_order_items:${itemId}`,
      ]),
    );
  });

  it('applies stock movements as deltas against the live server quantity', async () => {
    const item = await prisma.inventoryItem.create({
      data: { name: 'Mouse', stockQty: 10 },
    });
    // another PC/the server already sold 4 → server qty 6
    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { stockQty: 6 },
    });

    const mid = randomUUID();
    const [r] = await svc.push(deviceId, [
      op({
        table: 'stock_movements',
        id: mid,
        op: 'I',
        row: {
          id: mid,
          inventoryItemId: item.id,
          delta: -3,
          balance: 7,
          reason: 'JOB_ORDER_DEDUCTION',
        },
      }),
    ]);
    expect(r.status).toBe('APPLIED');
    expect(
      (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
        .stockQty,
    ).toBe(3);
    expect(
      (await prisma.stockMovement.findUniqueOrThrow({ where: { id: mid } }))
        .balance,
    ).toBe(3); // server balance, not the device's 7

    // a device can't set stockQty directly
    const base = (
      await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })
    ).updatedAt.toISOString();
    await svc.push(deviceId, [
      op({
        table: 'inventory_items',
        id: item.id,
        op: 'U',
        row: { name: 'Mouse X', stockQty: 999 },
        baseUpdatedAt: base,
      }),
    ]);
    expect(
      await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }),
    ).toMatchObject({ name: 'Mouse X', stockQty: 3 });
  });

  it('snapshot pages through a table', async () => {
    await newClient();
    await newClient();
    const first = await svc.snapshot('clients', undefined, 1);
    expect(first.rows).toHaveLength(1);
    expect(first.nextAfter).toBe(first.rows[0].id);
    const second = await svc.snapshot('clients', first.nextAfter!, 1);
    expect(second.rows[0].id).not.toBe(first.rows[0].id);
  });
});
