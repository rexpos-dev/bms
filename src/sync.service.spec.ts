import { Prisma } from '@prisma/client';
import { SyncService, orderOps, type PushOp } from './sync.service';

type Row = Record<string, any>;

/** Minimal in-memory stand-in for the Prisma delegates the sync service touches. */
function makeDb() {
  let clock = 1_000_000;
  const tick = () => new Date((clock += 1000));
  const tables: Record<string, Map<string, Row>> = {};
  const changes: Row[] = [];
  let seq = 0;

  const dup = () =>
    new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
  const missing = () =>
    new Prisma.PrismaClientKnownRequestError('missing', {
      code: 'P2025',
      clientVersion: 'test',
    });

  interface Opts {
    versioned?: boolean;
    unique?: string[];
    parent?: { delegate: string; fk: string };
  }
  const delegates: Record<string, any> = {};

  function bumpParent(opts: Opts, row: Row) {
    if (!opts.parent) return;
    const p = tables[opts.parent.delegate].get(row[opts.parent.fk]);
    if (p) p.updatedAt = tick();
  }

  function make(name: string, opts: Opts = {}) {
    tables[name] = new Map();
    const t = tables[name];
    delegates[name] = {
      findUnique: async ({ where }: any) => {
        const r = t.get(where.id);
        return r ? { ...r } : null;
      },
      findMany: async ({ where }: any = {}) => {
        let rows = [...t.values()];
        if (where?.id?.in)
          rows = rows.filter((r) => where.id.in.includes(r.id));
        return rows.map((r) => ({ ...r }));
      },
      create: async ({ data }: any) => {
        for (const u of opts.unique ?? []) {
          if ([...t.values()].some((r) => r[u] === data[u])) throw dup();
        }
        const row = {
          ...data,
          ...(opts.versioned ? { updatedAt: tick() } : {}),
        };
        t.set(row.id, row);
        bumpParent(opts, row);
        return { ...row };
      },
      update: async ({ where, data, select }: any) => {
        const r = t.get(where.id);
        if (!r) throw missing();
        for (const [k, v] of Object.entries(data)) {
          r[k] =
            v && typeof v === 'object' && 'increment' in (v as object)
              ? r[k] + (v as any).increment
              : v;
        }
        if (opts.versioned) r.updatedAt = tick();
        bumpParent(opts, r);
        return select
          ? Object.fromEntries(Object.keys(select).map((k) => [k, r[k]]))
          : { ...r };
      },
      delete: async ({ where }: any) => {
        const r = t.get(where.id);
        t.delete(where.id);
        if (r) bumpParent(opts, r);
        return r;
      },
    };
  }

  make('client', { versioned: true, unique: ['clientCode'] });
  make('user', { versioned: true });
  make('jobOrder', { versioned: true });
  make('jobOrderItem', { parent: { delegate: 'jobOrder', fk: 'jobOrderId' } });
  make('inventoryItem', { versioned: true });
  make('stockMovement');
  make('payment');
  make('syncPushedOp');
  make('syncConflict');
  make('syncDevice');

  delegates.syncPushedOp.findUnique = async ({ where }: any) => {
    const r = tables.syncPushedOp.get(where.opId);
    return r ? { ...r } : null;
  };
  const origPushedCreate = delegates.syncPushedOp.create;
  delegates.syncPushedOp.create = ({ data }: any) =>
    origPushedCreate({ data: { ...data, id: data.opId } });
  const origConflictCreate = delegates.syncConflict.create;
  let cid = 0;
  delegates.syncConflict.create = ({ data }: any) =>
    origConflictCreate({ data: { ...data, id: `c${++cid}` } });

  delegates.syncChange = {
    findMany: async ({ where, take }: any) =>
      changes
        .filter((c) => c.seq > Number(where.seq.gt))
        .slice(0, take)
        .map((c) => ({ ...c, seq: BigInt(c.seq) })),
  };
  delegates.syncDevice.update = async () => ({});
  const logChange = (tableName: string, recordId: string) =>
    changes.push({ seq: ++seq, tableName, recordId, op: 'U' });

  const prisma: any = {
    ...delegates,
    $transaction: async (arg: any) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  };
  return { prisma, tables, logChange };
}

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let n = 0;
const op = (
  over: Partial<PushOp> & Pick<PushOp, 'table' | 'id' | 'op'>,
): PushOp => ({ opId: uuid(++n), ...over });

describe('SyncService', () => {
  let db: ReturnType<typeof makeDb>;
  let svc: SyncService;

  const seedClient = async (id = 'c1', code = 'CLT-1') => {
    await db.prisma.client.create({
      data: { id, clientCode: code, businessName: 'Old' },
    });
    return (db.tables.client.get(id) as Row).updatedAt.toISOString() as string;
  };

  beforeEach(() => {
    db = makeDb();
    svc = new SyncService(db.prisma);
  });

  it('applies an offline-created row and returns its new server version', async () => {
    const [r] = await svc.push('dev1', [
      op({
        table: 'clients',
        id: 'c1',
        op: 'I',
        row: { id: 'c1', clientCode: 'CLT-1', businessName: 'Acme' },
      }),
    ]);
    expect(r.status).toBe('APPLIED');
    expect(r.version).toBe(
      (db.tables.client.get('c1') as Row).updatedAt.toISOString(),
    );
    expect(db.tables.client.get('c1')!.businessName).toBe('Acme');
  });

  it('applies an update whose base version matches the server', async () => {
    const base = await seedClient();
    const [r] = await svc.push('dev1', [
      op({
        table: 'clients',
        id: 'c1',
        op: 'U',
        row: { businessName: 'New' },
        baseUpdatedAt: base,
      }),
    ]);
    expect(r.status).toBe('APPLIED');
    expect(db.tables.client.get('c1')!.businessName).toBe('New');
  });

  it('server wins on a stale update and flags the conflict with both payloads', async () => {
    const base = await seedClient();
    await db.prisma.client.update({
      where: { id: 'c1' },
      data: { businessName: 'Server edit' },
    }); // someone else edited after `base`
    const [r] = await svc.push('dev1', [
      op({
        table: 'clients',
        id: 'c1',
        op: 'U',
        row: { businessName: 'Device edit' },
        baseUpdatedAt: base,
      }),
    ]);

    expect(r).toMatchObject({ status: 'CONFLICT', reason: 'STALE' });
    expect(db.tables.client.get('c1')!.businessName).toBe('Server edit');
    const [conflict] = [...db.tables.syncConflict.values()];
    expect(conflict).toMatchObject({
      deviceId: 'dev1',
      tableName: 'clients',
      recordId: 'c1',
      reason: 'STALE',
    });
    expect(conflict.localRow).toEqual({ businessName: 'Device edit' });
    expect(conflict.serverRow.businessName).toBe('Server edit');
  });

  it('treats an update without a base version as stale', async () => {
    await seedClient();
    const [r] = await svc.push('dev1', [
      op({ table: 'clients', id: 'c1', op: 'U', row: { businessName: 'x' } }),
    ]);
    expect(r).toMatchObject({ status: 'CONFLICT', reason: 'STALE' });
  });

  it('reports DELETED when the device edits a row the server removed', async () => {
    const [r] = await svc.push('dev1', [
      op({
        table: 'clients',
        id: 'gone',
        op: 'U',
        row: { businessName: 'x' },
        baseUpdatedAt: new Date().toISOString(),
      }),
    ]);
    expect(r).toMatchObject({ status: 'CONFLICT', reason: 'DELETED' });
  });

  it('reports DUPLICATE_KEY when a unique business key collides', async () => {
    await seedClient('c1', 'CLT-1');
    const [r] = await svc.push('dev1', [
      op({
        table: 'clients',
        id: 'c2',
        op: 'I',
        row: { id: 'c2', clientCode: 'CLT-1', businessName: 'Dup' },
      }),
    ]);
    expect(r).toMatchObject({ status: 'CONFLICT', reason: 'DUPLICATE_KEY' });
    expect(db.tables.client.has('c2')).toBe(false);
  });

  it('is idempotent per opId', async () => {
    const o = op({
      table: 'clients',
      id: 'c1',
      op: 'I',
      row: { id: 'c1', clientCode: 'CLT-1', businessName: 'A' },
    });
    await svc.push('dev1', [o]);
    await db.prisma.client.update({
      where: { id: 'c1' },
      data: { businessName: 'Changed later' },
    });
    const [again] = await svc.push('dev1', [o]);
    expect(again).toMatchObject({ status: 'APPLIED', reason: 'DUPLICATE_OP' });
    expect(db.tables.client.get('c1')!.businessName).toBe('Changed later');
  });

  it('rejects writes to pull-only reference tables', async () => {
    const [r] = await svc.push('dev1', [
      op({
        table: 'users',
        id: 'u1',
        op: 'I',
        row: { id: 'u1', email: 'x@y.z' },
      }),
    ]);
    expect(r).toMatchObject({ status: 'CONFLICT', reason: 'INVALID' });
    expect(db.tables.user.size).toBe(0);
  });

  it('rejects unknown tables', async () => {
    const [r] = await svc.push('dev1', [
      op({ table: 'nope', id: 'x', op: 'I', row: {} }),
    ]);
    expect(r).toMatchObject({ status: 'CONFLICT', reason: 'INVALID' });
  });

  describe('aggregates (job order + items)', () => {
    const seedOrder = async () => {
      await db.prisma.jobOrder.create({ data: { id: 'jo1', remarks: 'v1' } });
      return (
        db.tables.jobOrder.get('jo1') as Row
      ).updatedAt.toISOString() as string;
    };

    it('applies parent and child in one batch without the child seeing a false conflict', async () => {
      const base = await seedOrder();
      const results = await svc.push('dev1', [
        op({
          table: 'job_order_items',
          id: 'i1',
          op: 'I',
          row: { id: 'i1', jobOrderId: 'jo1', name: 'Cable' },
          baseUpdatedAt: base,
        }),
        op({
          table: 'job_orders',
          id: 'jo1',
          op: 'U',
          row: { remarks: 'v2' },
          baseUpdatedAt: base,
        }),
      ]);
      expect(results.map((r) => r.status)).toEqual(['APPLIED', 'APPLIED']);
      expect(db.tables.jobOrder.get('jo1')!.remarks).toBe('v2');
      expect(db.tables.jobOrderItem.has('i1')).toBe(true);
    });

    it('rejects the children too when the parent is stale', async () => {
      const base = await seedOrder();
      await db.prisma.jobOrder.update({
        where: { id: 'jo1' },
        data: { remarks: 'server' },
      });
      const results = await svc.push('dev1', [
        op({
          table: 'job_orders',
          id: 'jo1',
          op: 'U',
          row: { remarks: 'device' },
          baseUpdatedAt: base,
        }),
        op({
          table: 'job_order_items',
          id: 'i1',
          op: 'I',
          row: { id: 'i1', jobOrderId: 'jo1', name: 'Cable' },
          baseUpdatedAt: base,
        }),
      ]);
      expect(results.map((r) => r.status)).toEqual(['CONFLICT', 'CONFLICT']);
      expect(db.tables.jobOrder.get('jo1')!.remarks).toBe('server');
      expect(db.tables.jobOrderItem.size).toBe(0);
    });

    it('deletes children before parents', () => {
      const ordered = orderOps([
        op({ table: 'job_orders', id: 'jo1', op: 'D' }),
        op({ table: 'job_order_items', id: 'i1', op: 'D' }),
        op({ table: 'job_order_items', id: 'i2', op: 'I', row: {} }),
        op({ table: 'clients', id: 'c1', op: 'I', row: {} }),
      ]);
      expect(ordered.map((o) => `${o.op}:${o.table}`)).toEqual([
        'I:clients',
        'I:job_order_items',
        'D:job_order_items',
        'D:job_orders',
      ]);
    });
  });

  describe('inventory', () => {
    it('ignores a device-supplied stockQty', async () => {
      await db.prisma.inventoryItem.create({
        data: { id: 'it1', name: 'Mouse', stockQty: 5 },
      });
      const base = (
        db.tables.inventoryItem.get('it1') as Row
      ).updatedAt.toISOString();
      const [r] = await svc.push('dev1', [
        op({
          table: 'inventory_items',
          id: 'it1',
          op: 'U',
          row: { name: 'Mouse 2', stockQty: 999 },
          baseUpdatedAt: base,
        }),
      ]);
      expect(r.status).toBe('APPLIED');
      expect(db.tables.inventoryItem.get('it1')).toMatchObject({
        name: 'Mouse 2',
        stockQty: 5,
      });
    });

    it('applies movement deltas to the server quantity and stamps the resulting balance', async () => {
      await db.prisma.inventoryItem.create({
        data: { id: 'it1', name: 'Mouse', stockQty: 10 },
      });
      const results = await svc.push('dev1', [
        op({
          table: 'stock_movements',
          id: 'm1',
          op: 'I',
          row: {
            id: 'm1',
            inventoryItemId: 'it1',
            delta: -3,
            balance: 7,
            reason: 'JOB_ORDER_DEDUCTION',
          },
        }),
        op({
          table: 'stock_movements',
          id: 'm2',
          op: 'I',
          row: {
            id: 'm2',
            inventoryItemId: 'it1',
            delta: -2,
            balance: 5,
            reason: 'JOB_ORDER_DEDUCTION',
          },
        }),
      ]);
      expect(results.map((r) => r.status)).toEqual(['APPLIED', 'APPLIED']);
      expect(db.tables.inventoryItem.get('it1')!.stockQty).toBe(5);
      // another PC sold 4 in the meantime (server qty 5 -> 1): its balance reflects the server, not the device
      const [r] = await svc.push('dev2', [
        op({
          table: 'stock_movements',
          id: 'm3',
          op: 'I',
          row: {
            id: 'm3',
            inventoryItemId: 'it1',
            delta: -4,
            balance: 0,
            reason: 'JOB_ORDER_DEDUCTION',
          },
        }),
      ]);
      expect(r.status).toBe('APPLIED');
      expect(db.tables.stockMovement.get('m3')!.balance).toBe(1);
    });

    it('rejects a movement for an unknown item', async () => {
      const [r] = await svc.push('dev1', [
        op({
          table: 'stock_movements',
          id: 'm1',
          op: 'I',
          row: {
            id: 'm1',
            inventoryItemId: 'nope',
            delta: 1,
            balance: 1,
            reason: 'MANUAL_ADJUST',
          },
        }),
      ]);
      expect(r).toMatchObject({ status: 'CONFLICT', reason: 'INVALID' });
    });
  });

  describe('payments', () => {
    const payment = {
      id: 'p1',
      jobOrderId: 'jo1',
      amount: '100',
      method: 'CASH',
      paidAt: '2026-09-28T00:00:00.000Z',
      recordedById: 'u1',
    };

    it('never hard-deletes a payment for a device', async () => {
      await svc.push('dev1', [
        op({ table: 'payments', id: 'p1', op: 'I', row: payment }),
      ]);
      const [r] = await svc.push('dev1', [
        op({ table: 'payments', id: 'p1', op: 'D' }),
      ]);
      expect(r).toMatchObject({ status: 'CONFLICT', reason: 'INVALID' });
      expect(db.tables.payment.has('p1')).toBe(true);
    });

    it('accepts a void, but not a second edit once the server row is voided', async () => {
      await svc.push('dev1', [
        op({ table: 'payments', id: 'p1', op: 'I', row: payment }),
      ]);
      const [v] = await svc.push('dev1', [
        op({
          table: 'payments',
          id: 'p1',
          op: 'U',
          row: { voidedAt: '2026-09-28T02:00:00.000Z', voidReason: 'typo' },
        }),
      ]);
      expect(v.status).toBe('APPLIED');
      const [again] = await svc.push('dev2', [
        op({
          table: 'payments',
          id: 'p1',
          op: 'U',
          row: { voidedAt: '2026-09-28T03:00:00.000Z', voidReason: 'other' },
        }),
      ]);
      expect(again).toMatchObject({ status: 'CONFLICT', reason: 'STALE' });
      expect(db.tables.payment.get('p1')!.voidReason).toBe('typo');
    });
  });

  describe('pull', () => {
    it('collapses to the latest state per row, upserts parents-first, and reports removed rows as deletes', async () => {
      await db.prisma.client.create({
        data: { id: 'c1', clientCode: 'A', businessName: 'A' },
      });
      await db.prisma.jobOrder.create({ data: { id: 'jo1', clientId: 'c1' } });
      db.logChange('job_orders', 'jo1');
      db.logChange('clients', 'c1');
      db.logChange('clients', 'c1'); // duplicate entry collapses
      db.logChange('clients', 'removed'); // no longer in the table

      const page = await svc.pull('dev1', 0);
      expect(page.changes.map((c) => `${c.op}:${c.table}:${c.id}`)).toEqual([
        'U:clients:c1',
        'U:job_orders:jo1',
        'D:clients:removed',
      ]);
      expect(page.nextSeq).toBe(4);
      expect(page.hasMore).toBe(false);
      expect((await svc.pull('dev1', 4)).changes).toEqual([]);
    });
  });
});
