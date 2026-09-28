import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { isPrismaError } from './prisma-errors';
import { PrismaService } from './prisma.service';
import { fromDeviceRow, toPullRow, type SyncRow } from './sync-serialize';
import {
  SYNC_TABLES,
  getSyncTable,
  syncOrder,
  type SyncTableDef,
} from './sync-tables';

export type PushOpKind = 'I' | 'U' | 'D';
export type ConflictReason = 'STALE' | 'DELETED' | 'DUPLICATE_KEY' | 'INVALID';

export interface PushOp {
  /** Client-generated uuid; re-sending the same opId is a no-op (idempotency). */
  opId: string;
  table: string;
  id: string;
  op: PushOpKind;
  row?: SyncRow;
  /**
   * Server `updatedAt` (ISO) of the row — or of the parent row for aggregate
   * children — as of the device's last sync. Absent for rows created offline.
   */
  baseUpdatedAt?: string | null;
}

export interface PushResult {
  opId: string;
  status: 'APPLIED' | 'CONFLICT';
  reason?: ConflictReason | 'DUPLICATE_OP';
  /** New server version of the row (or its parent) after an applied op; the device stores it as its next base. */
  version?: string | null;
}

export interface PullEntry {
  seq: number;
  table: string;
  id: string;
  /** U = upsert this row, D = row no longer exists on the server. */
  op: 'U' | 'D';
  row: SyncRow | null;
}

interface Delegate {
  findUnique(args: unknown): Promise<SyncRow | null>;
  findMany(args: unknown): Promise<SyncRow[]>;
  create(args: unknown): Promise<SyncRow>;
  update(args: unknown): Promise<SyncRow>;
  delete(args: unknown): Promise<SyncRow>;
}

type Db = PrismaClient | Prisma.TransactionClient;

type Verdict =
  | { ok: true; version: string | null }
  | { ok: false; reason: ConflictReason; serverRow: SyncRow | null };

/** Thrown inside the apply transaction to roll it back with a conflict reason. */
class SyncReject extends Error {
  constructor(readonly reason: ConflictReason) {
    super(reason);
  }
}

export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const PULL_PAGE = 500;
const SNAPSHOT_PAGE = 500;

/** Stable order for a push batch: upserts parents-first, then deletes children-first. */
export function orderOps(ops: PushOp[]): PushOp[] {
  const upserts = ops
    .filter((o) => o.op !== 'D')
    .sort((a, b) => syncOrder(a.table) - syncOrder(b.table));
  const deletes = ops
    .filter((o) => o.op === 'D')
    .sort((a, b) => syncOrder(b.table) - syncOrder(a.table));
  return [...upserts, ...deletes];
}

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  private db(client: Db, delegate: string): Delegate {
    return (client as unknown as Record<string, Delegate>)[delegate];
  }

  // ── Devices (admin) ─────────────────────────────────────────────────────────

  /** Creates a device and returns its token — the only time the plain token is ever visible. */
  async createDevice(name: string, createdById: string) {
    const token = `mtq_${randomBytes(32).toString('base64url')}`;
    const device = await this.prisma.syncDevice.create({
      data: {
        name: name.trim(),
        tokenHash: hashDeviceToken(token),
        createdById,
      },
    });
    return { device: this.publicDevice(device), token };
  }

  async listDevices() {
    const devices = await this.prisma.syncDevice.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return devices.map((d) => this.publicDevice(d));
  }

  async revokeDevice(id: string) {
    const device = await this.prisma.syncDevice.findUnique({ where: { id } });
    if (!device) throw new NotFoundException(`Sync device ${id} not found`);
    const updated = await this.prisma.syncDevice.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return this.publicDevice(updated);
  }

  private publicDevice(d: {
    id: string;
    name: string;
    lastSeenAt: Date | null;
    lastSeq: bigint;
    revokedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: d.id,
      name: d.name,
      lastSeenAt: d.lastSeenAt,
      lastSeq: Number(d.lastSeq),
      revokedAt: d.revokedAt,
      createdAt: d.createdAt,
    };
  }

  // ── Conflicts (admin) ───────────────────────────────────────────────────────

  listConflicts(resolved = false) {
    return this.prisma.syncConflict.findMany({
      where: { resolvedAt: resolved ? { not: null } : null },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { device: { select: { id: true, name: true } } },
    });
  }

  async resolveConflict(id: string, userId: string) {
    const conflict = await this.prisma.syncConflict.findUnique({
      where: { id },
    });
    if (!conflict) throw new NotFoundException(`Sync conflict ${id} not found`);
    return this.prisma.syncConflict.update({
      where: { id },
      data: { resolvedAt: new Date(), resolvedById: userId },
    });
  }

  // ── Device API ──────────────────────────────────────────────────────────────

  async status() {
    const last = await this.prisma.syncChange.aggregate({
      _max: { seq: true },
    });
    return {
      serverTime: new Date().toISOString(),
      currentSeq: Number(last._max.seq ?? 0),
      tables: SYNC_TABLES.map((t) => ({ table: t.table, mode: t.mode })),
    };
  }

  /** Initial-load page for one table, ordered by id. `nextAfter` is null on the last page. */
  async snapshot(tableName: string, after?: string, limit = SNAPSHOT_PAGE) {
    const def = this.requireTable(tableName);
    const take = Math.min(Math.max(limit, 1), 1000);
    const rows = await this.db(this.prisma, def.delegate).findMany({
      where: after ? { id: { gt: after } } : undefined,
      orderBy: { id: 'asc' },
      take,
    });
    return {
      table: def.table,
      rows: rows.map((r) => toPullRow(def, r)),
      nextAfter: rows.length === take ? String(rows[rows.length - 1].id) : null,
    };
  }

  /**
   * Changes after `since`, collapsed to the latest state per row. Upserts come
   * parents-first, deletes children-first, so a device can apply them in order.
   */
  async pull(deviceId: string, since: number, limit = PULL_PAGE) {
    const take = Math.min(Math.max(limit, 1), 2000);
    const changes = await this.prisma.syncChange.findMany({
      where: { seq: { gt: BigInt(since) } },
      orderBy: { seq: 'asc' },
      take,
    });

    const latest = new Map<
      string,
      { seq: number; table: string; id: string }
    >();
    for (const c of changes) {
      if (!getSyncTable(c.tableName)) continue;
      latest.set(`${c.tableName}:${c.recordId}`, {
        seq: Number(c.seq),
        table: c.tableName,
        id: c.recordId,
      });
    }

    const idsByTable = new Map<string, string[]>();
    for (const e of latest.values())
      idsByTable.set(e.table, [...(idsByTable.get(e.table) ?? []), e.id]);

    const rowsByKey = new Map<string, SyncRow>();
    for (const [table, ids] of idsByTable) {
      const def = getSyncTable(table)!;
      const rows = await this.db(this.prisma, def.delegate).findMany({
        where: { id: { in: ids } },
      });
      for (const r of rows) rowsByKey.set(`${table}:${String(r.id)}`, r);
    }

    const entries: PullEntry[] = [...latest.values()].map((e) => {
      const row = rowsByKey.get(`${e.table}:${e.id}`);
      return row
        ? {
            seq: e.seq,
            table: e.table,
            id: e.id,
            op: 'U' as const,
            row: toPullRow(getSyncTable(e.table)!, row),
          }
        : { seq: e.seq, table: e.table, id: e.id, op: 'D' as const, row: null };
    });
    const upserts = entries
      .filter((e) => e.op === 'U')
      .sort((a, b) => syncOrder(a.table) - syncOrder(b.table));
    const deletes = entries
      .filter((e) => e.op === 'D')
      .sort((a, b) => syncOrder(b.table) - syncOrder(a.table));

    const lastSeq =
      changes.length > 0 ? Number(changes[changes.length - 1].seq) : since;
    await this.prisma.syncDevice.update({
      where: { id: deviceId },
      data: { lastSeq: BigInt(since), lastSeenAt: new Date() },
    });

    return {
      changes: [...upserts, ...deletes],
      nextSeq: lastSeq,
      hasMore: changes.length === take,
    };
  }

  async push(deviceId: string, ops: PushOp[]): Promise<PushResult[]> {
    await this.prisma.syncDevice.update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date() },
    });

    // parent "table:id" → whether the parent op in this batch was accepted (children follow it).
    const parentVerdict = new Map<string, boolean>();
    const results = new Map<string, PushResult>();
    for (const op of orderOps(ops)) {
      results.set(op.opId, await this.pushOne(deviceId, op, parentVerdict));
    }
    return ops.map((o) => results.get(o.opId)!);
  }

  // ── Push internals ──────────────────────────────────────────────────────────

  private requireTable(name: string): SyncTableDef {
    const def = getSyncTable(name);
    if (!def) throw new BadRequestException(`Unknown sync table: ${name}`);
    return def;
  }

  private async pushOne(
    deviceId: string,
    op: PushOp,
    parentVerdict: Map<string, boolean>,
  ): Promise<PushResult> {
    const prior = await this.prisma.syncPushedOp.findUnique({
      where: { opId: op.opId },
    });
    if (prior) {
      return {
        opId: op.opId,
        status: prior.status === 'APPLIED' ? 'APPLIED' : 'CONFLICT',
        reason: 'DUPLICATE_OP',
      };
    }

    const def = getSyncTable(op.table);
    let verdict: Verdict;
    if (!def || def.mode === 'pull') {
      verdict = { ok: false, reason: 'INVALID', serverRow: null };
    } else {
      try {
        verdict = await this.prisma.$transaction(async (tx) => {
          const v = await this.applyOp(tx, def, op, parentVerdict);
          if (v.ok)
            await tx.syncPushedOp.create({
              data: { opId: op.opId, deviceId, status: 'APPLIED' },
            });
          return v;
        });
      } catch (err) {
        verdict = { ok: false, reason: this.reasonFor(err), serverRow: null };
      }
    }

    if (def) parentVerdict.set(`${def.table}:${op.id}`, verdict.ok);
    if (verdict.ok)
      return { opId: op.opId, status: 'APPLIED', version: verdict.version };

    await this.prisma.$transaction([
      this.prisma.syncConflict.create({
        data: {
          deviceId,
          tableName: op.table,
          recordId: op.id,
          op: op.op,
          reason: verdict.reason,
          localRow: (op.row ?? undefined) as Prisma.InputJsonValue | undefined,
          serverRow: (verdict.serverRow ?? undefined) as
            Prisma.InputJsonValue | undefined,
        },
      }),
      this.prisma.syncPushedOp.create({
        data: { opId: op.opId, deviceId, status: 'CONFLICT' },
      }),
    ]);
    return { opId: op.opId, status: 'CONFLICT', reason: verdict.reason };
  }

  private reasonFor(err: unknown): ConflictReason {
    if (err instanceof SyncReject) return err.reason;
    if (isPrismaError(err)) {
      if (err.code === 'P2002') return 'DUPLICATE_KEY';
      if (err.code === 'P2003' || err.code === 'P2025') return 'INVALID';
    }
    if (err instanceof Error && err.message.startsWith('Invalid date'))
      return 'INVALID';
    throw err; // unexpected → 500, the device retries the batch later
  }

  private async applyOp(
    tx: Db,
    def: SyncTableDef,
    op: PushOp,
    parentVerdict: Map<string, boolean>,
  ): Promise<Verdict> {
    const db = this.db(tx, def.delegate);
    const existing = await db.findUnique({ where: { id: op.id } });
    const base = op.baseUpdatedAt ? new Date(op.baseUpdatedAt) : null;

    if (op.op === 'D') {
      if (!existing) return { ok: true, version: null };
      // Append-only / standalone rows are never hard-deleted by a device (payments are voided instead).
      if (def.appendOnly || (!def.versioned && !def.parent))
        return {
          ok: false,
          reason: 'INVALID',
          serverRow: this.out(def, existing),
        };
      if (await this.isStale(tx, def, existing, base, parentVerdict)) {
        return {
          ok: false,
          reason: 'STALE',
          serverRow: this.out(def, existing),
        };
      }
      await db.delete({ where: { id: op.id } });
      return { ok: true, version: null };
    }

    if (!op.row) throw new SyncReject('INVALID');
    const { data } = fromDeviceRow(def, op.row);
    delete data.id;

    if (!existing) {
      if (op.op === 'U')
        return { ok: false, reason: 'DELETED', serverRow: null };
      if (
        def.parent &&
        (await this.parentBlocks(tx, def, data, base, parentVerdict))
      ) {
        return { ok: false, reason: 'STALE', serverRow: null };
      }
      await this.createRow(tx, def, op.id, data);
      return { ok: true, version: await this.versionOf(tx, def, op.id, data) };
    }

    if (def.appendOnly) return { ok: true, version: null }; // already there
    if (await this.isStale(tx, def, existing, base, parentVerdict)) {
      return { ok: false, reason: 'STALE', serverRow: this.out(def, existing) };
    }
    await db.update({ where: { id: op.id }, data });
    return { ok: true, version: await this.versionOf(tx, def, op.id, data) };
  }

  private out(def: SyncTableDef, row: SyncRow): SyncRow {
    return toPullRow(def, row);
  }

  /** Server-wins check: has the row (or its aggregate parent) moved past the device's base version? */
  private async isStale(
    tx: Db,
    def: SyncTableDef,
    existing: SyncRow,
    base: Date | null,
    parentVerdict: Map<string, boolean>,
  ): Promise<boolean> {
    if (def.versioned)
      return !base || (existing.updatedAt as Date).getTime() > base.getTime();

    if (def.parent) {
      const parentId = String(existing[def.parent.fkField]);
      const known = parentVerdict.get(`${def.parent.table}:${parentId}`);
      if (known !== undefined) return !known;
      const parent = await this.db(tx, def.parent.delegate).findUnique({
        where: { id: parentId },
      });
      if (!parent) return true;
      return !base || (parent.updatedAt as Date).getTime() > base.getTime();
    }

    // Standalone, unversioned (payments): editable only until someone has voided it.
    return existing.voidedAt != null;
  }

  /** For a new child row: is its aggregate parent rejected in this batch, or newer than the device's base? */
  private async parentBlocks(
    tx: Db,
    def: SyncTableDef,
    data: SyncRow,
    base: Date | null,
    parentVerdict: Map<string, boolean>,
  ): Promise<boolean> {
    const parentId = String(data[def.parent!.fkField]);
    const known = parentVerdict.get(`${def.parent!.table}:${parentId}`);
    if (known !== undefined) return !known;
    const parent = await this.db(tx, def.parent!.delegate).findUnique({
      where: { id: parentId },
    });
    if (!parent) return false; // the FK violation will surface as INVALID on insert
    return base ? (parent.updatedAt as Date).getTime() > base.getTime() : false;
  }

  private async createRow(
    tx: Db,
    def: SyncTableDef,
    id: string,
    data: SyncRow,
  ): Promise<void> {
    if (def.delegate === 'stockMovement') {
      // Stock is a counter: apply the movement's delta to the server's own quantity and stamp the resulting balance.
      const item = await tx.inventoryItem.update({
        where: { id: String(data.inventoryItemId) },
        data: { stockQty: { increment: Number(data.delta) } },
        select: { stockQty: true },
      });
      data.balance = item.stockQty;
    }
    await this.db(tx, def.delegate).create({ data: { ...data, id } });
  }

  /** The row's new server version — its own updatedAt, or the parent's for aggregate children. */
  private async versionOf(
    tx: Db,
    def: SyncTableDef,
    id: string,
    data: SyncRow,
  ): Promise<string | null> {
    if (def.versioned) {
      const row = await this.db(tx, def.delegate).findUnique({
        where: { id },
        select: { updatedAt: true },
      });
      return row ? (row.updatedAt as Date).toISOString() : null;
    }
    if (def.parent) {
      const parentId =
        data[def.parent.fkField] ??
        (await this.db(tx, def.delegate).findUnique({ where: { id } }))?.[
          def.parent.fkField
        ];
      const parent = await this.db(tx, def.parent.delegate).findUnique({
        where: { id: String(parentId) },
        select: { updatedAt: true },
      });
      return parent ? (parent.updatedAt as Date).toISOString() : null;
    }
    return null;
  }
}
