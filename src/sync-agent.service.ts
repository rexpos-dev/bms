import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { EventsService } from './events.service';
import { PrismaService } from './prisma.service';
import {
  fromPullRow,
  jsonFieldNames,
  serializeRow,
  type SyncRow,
} from './sync-serialize';
import { SYNC_TABLES, getSyncTable, type SyncTableDef } from './sync-tables';
import {
  SyncHttpError,
  SyncNetworkError,
  apiRoot,
  requestJson,
} from './sync-http';
import type { PullEntry, PushOp, PushResult } from './sync.service';

interface OutboxRow {
  table_name: string;
  record_id: string;
  parent_id: string | null;
  op_id: string | null;
}

interface Delegate {
  findUnique(args: unknown): Promise<SyncRow | null>;
  findMany(args: unknown): Promise<SyncRow[]>;
  create(args: unknown): Promise<SyncRow>;
  update(args: unknown): Promise<SyncRow>;
  deleteMany(args: unknown): Promise<unknown>;
}

interface RawDb {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}
type Tx = RawDb & Record<string, unknown>;

export interface SyncAgentStatus {
  configured: boolean;
  online: boolean | null;
  syncing: boolean;
  initialDone: boolean;
  pending: number;
  sinceSeq: number;
  lastSyncAt: string | null;
  lastError: string | null;
  rejectedUnseen: number;
}

/** Reasons after which the local copy is dropped: the server will never accept this row. */
const DROP_LOCAL = new Set(['DUPLICATE_KEY', 'INVALID', 'DELETED']);
const PUSH_CHUNK = 500;
const SNAPSHOT_PAGE = 500;
const PULL_PAGE = 500;

export function chunkGroups<T>(groups: T[][], max: number): T[][] {
  const chunks: T[][] = [];
  let cur: T[] = [];
  for (const g of groups) {
    if (cur.length > 0 && cur.length + g.length > max) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(...g);
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

/**
 * Desktop-side sync engine: keeps this PC's SQLite database in step with the central
 * server. Local writes are captured by SQLite triggers into `_sync_outbox`; the agent
 * pushes them (server wins on conflict), then pulls everything that changed on the
 * server since its last cursor. It works offline: nothing here is required for the app to
 * run, and the next successful cycle simply catches up.
 */
@Injectable()
export class SyncAgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncAgentService.name);
  private readonly serverUrl?: string;
  private readonly token?: string;
  private readonly intervalMs: number;
  private readonly autostart: boolean;

  private running = false;
  private rerun = false;
  private online: boolean | null = null;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;
  private timer?: NodeJS.Timeout;
  private debounce?: NodeJS.Timeout;
  private abort?: AbortController;
  private unsubscribe?: () => void;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    private readonly events: EventsService,
  ) {
    this.serverUrl = config.get<string>('SYNC_SERVER_URL')?.trim() || undefined;
    this.token = config.get<string>('SYNC_DEVICE_TOKEN')?.trim() || undefined;
    this.intervalMs = Number(config.get('SYNC_INTERVAL_MS') ?? 60_000);
    this.autostart = config.get('SYNC_AUTOSTART') !== 'false';
  }

  get configured(): boolean {
    return !!this.serverUrl && !!this.token;
  }

  // ── lifecycle ───────────────────────────────────────────────────────────────

  onModuleInit() {
    if (!this.configured) {
      this.logger.warn(
        'Sync disabled: SYNC_SERVER_URL / SYNC_DEVICE_TOKEN not set — running standalone.',
      );
      return;
    }
    if (!this.autostart) return;

    this.abort = new AbortController();
    this.timer = setInterval(() => this.requestSync(0), this.intervalMs);
    this.timer.unref();

    // Local edits → push soon after (the interceptor emits a change event per mutation).
    const sub = this.events.stream().subscribe((msg) => {
      const data = (msg as { data?: { type?: string; resource?: string } })
        .data;
      if (data?.type === 'change' && data.resource !== 'sync')
        this.requestSync(2_000);
    });
    this.unsubscribe = () => sub.unsubscribe();

    void this.listen(this.abort.signal);
    this.requestSync(500);
  }

  onModuleDestroy() {
    this.abort?.abort();
    this.unsubscribe?.();
    if (this.timer) clearInterval(this.timer);
    if (this.debounce) clearTimeout(this.debounce);
  }

  /** Coalesces bursts of triggers (local edits, server hints, the timer) into one cycle. */
  requestSync(delayMs = 0) {
    if (!this.configured) return;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.syncNow(), delayMs);
    this.debounce.unref();
  }

  // ── status ──────────────────────────────────────────────────────────────────

  async status(): Promise<SyncAgentStatus> {
    return {
      configured: this.configured,
      online: this.online,
      syncing: this.running,
      initialDone: (await this.getState('initial_done')) === '1',
      pending: await this.count('SELECT COUNT(*) AS c FROM "_sync_outbox"'),
      sinceSeq: Number((await this.getState('since_seq')) ?? 0),
      lastSyncAt: this.lastSyncAt ?? (await this.getState('last_sync_at')),
      lastError: this.lastError,
      rejectedUnseen: await this.count(
        'SELECT COUNT(*) AS c FROM "_sync_rejected" WHERE "seen_at" IS NULL',
      ),
    };
  }

  listRejected() {
    return this.prisma.$queryRawUnsafe<
      {
        id: string;
        table_name: string;
        record_id: string;
        op: string;
        reason: string;
        local_row: string | null;
        created_at: string;
        seen_at: string | null;
      }[]
    >('SELECT * FROM "_sync_rejected" ORDER BY "created_at" DESC LIMIT 200');
  }

  async markRejectedSeen() {
    await this.prisma.$executeRawUnsafe(
      'UPDATE "_sync_rejected" SET "seen_at" = ? WHERE "seen_at" IS NULL',
      new Date().toISOString(),
    );
  }

  // ── the sync cycle ──────────────────────────────────────────────────────────

  /** One full cycle: (first run) snapshot → push local changes → pull server changes. Never throws. */
  async syncNow(): Promise<SyncAgentStatus> {
    if (!this.configured) return this.status();
    if (this.running) {
      this.rerun = true;
      return this.status();
    }
    this.running = true;
    try {
      do {
        this.rerun = false;
        await this.ensureInitialSnapshot();
        await this.pushAll();
        await this.pullAll();
      } while (this.rerun);
      this.online = true;
      this.lastError = null;
      this.lastSyncAt = new Date().toISOString();
      await this.setState('last_sync_at', this.lastSyncAt);
    } catch (err) {
      if (err instanceof SyncNetworkError) {
        this.online = false;
        this.lastError = 'Server unreachable — working offline';
      } else {
        this.online = err instanceof SyncHttpError ? true : this.online;
        this.lastError = err instanceof Error ? err.message : String(err);
        this.logger.error(`Sync failed: ${this.lastError}`);
      }
    } finally {
      this.running = false;
    }
    return this.status();
  }

  private call<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    return requestJson<T>(this.serverUrl!, path, {
      method,
      body,
      headers: { 'x-device-token': this.token! },
    });
  }

  // ── initial snapshot ────────────────────────────────────────────────────────

  private async ensureInitialSnapshot() {
    if ((await this.getState('initial_done')) === '1') return;

    const status = await this.call<{ currentSeq: number }>(
      'GET',
      '/sync/status',
    );
    for (const def of SYNC_TABLES) {
      let after: string | null = null;
      do {
        const q = new URLSearchParams({
          table: def.table,
          limit: String(SNAPSHOT_PAGE),
        });
        if (after) q.set('after', after);
        const page = await this.call<{
          rows: SyncRow[];
          nextAfter: string | null;
        }>('GET', `/sync/snapshot?${q.toString()}`);
        await this.applyEntries(
          page.rows.map((row) => ({
            seq: 0,
            table: def.table,
            id: String(row.id),
            op: 'U' as const,
            row,
          })),
        );
        after = page.nextAfter;
      } while (after);
    }
    // Changes made while the snapshot was running are re-applied by the first pull (idempotent).
    await this.setState('since_seq', String(status.currentSeq));
    await this.setState('initial_done', '1');
  }

  // ── push ────────────────────────────────────────────────────────────────────

  private delegate(client: unknown, def: SyncTableDef): Delegate {
    return (client as Record<string, Delegate>)[def.delegate];
  }

  private async pushAll() {
    for (let round = 0; round < 100; round++) {
      const entries = await this.claimOutbox();
      if (entries.length === 0) return;

      const { ops, dropped } = await this.buildOps(entries);
      for (const e of dropped) await this.clearOutbox(e);

      for (const chunk of chunkGroups(this.groupOps(ops), PUSH_CHUNK)) {
        const res = await this.call<{ results: PushResult[] }>(
          'POST',
          '/sync/push',
          {
            ops: chunk.map((c) => c.op),
          },
        );
        await this.handleResults(chunk, res.results);
      }
    }
  }

  /** Outbox rows with a stable op id each (assigned once per content version). */
  private async claimOutbox(): Promise<OutboxRow[]> {
    const select =
      'SELECT "table_name", "record_id", "parent_id", "op_id" FROM "_sync_outbox" ORDER BY "queued_at", "table_name", "record_id" LIMIT 2000';
    let rows = await this.prisma.$queryRawUnsafe<OutboxRow[]>(select);
    const missing = rows.filter((r) => !r.op_id);
    for (const r of missing) {
      await this.prisma.$executeRawUnsafe(
        'UPDATE "_sync_outbox" SET "op_id" = ? WHERE "table_name" = ? AND "record_id" = ? AND "op_id" IS NULL',
        randomUUID(),
        r.table_name,
        r.record_id,
      );
    }
    if (missing.length > 0)
      rows = await this.prisma.$queryRawUnsafe<OutboxRow[]>(select);
    return rows.filter((r) => !!r.op_id);
  }

  private async buildOps(entries: OutboxRow[]) {
    const ops: { op: PushOp; entry: OutboxRow; def: SyncTableDef }[] = [];
    const dropped: OutboxRow[] = [];

    for (const entry of entries) {
      const def = getSyncTable(entry.table_name);
      if (!def || def.mode !== 'both') {
        dropped.push(entry);
        continue;
      }
      const row = await this.delegate(this.prisma, def).findUnique({
        where: { id: entry.record_id },
      });
      const meta = await this.getMeta(def.table, entry.record_id);
      const base = def.parent
        ? entry.parent_id
          ? ((await this.getMeta(def.parent.table, entry.parent_id))?.version ??
            null)
          : null
        : (meta?.version ?? null);

      let op: PushOp;
      if (row) {
        // Versioned rows are updates once the server has seen them; everything else is
        // sent as an insert, which the server treats as an update when the row exists.
        const kind = def.versioned && meta ? 'U' : 'I';
        op = {
          opId: entry.op_id!,
          table: def.table,
          id: entry.record_id,
          op: kind,
          row: serializeRow(def.model, row),
          baseUpdatedAt: base,
        };
      } else if (def.appendOnly || (!def.parent && !meta)) {
        dropped.push(entry); // never reached the server (or can't be deleted there)
        continue;
      } else {
        op = {
          opId: entry.op_id!,
          table: def.table,
          id: entry.record_id,
          op: 'D',
          baseUpdatedAt: base,
        };
      }
      ops.push({ op, entry, def });
    }
    return { ops, dropped };
  }

  /** Keep an aggregate (parent + children) in the same request so the server judges it as one. */
  private groupOps<T extends { entry: OutboxRow; def: SyncTableDef }>(
    ops: T[],
  ): T[][] {
    const groups = new Map<string, T[]>();
    for (const o of ops) {
      const key = o.def.parent
        ? `${o.def.parent.table}:${o.entry.parent_id}`
        : `${o.def.table}:${o.entry.record_id}`;
      groups.set(key, [...(groups.get(key) ?? []), o]);
    }
    return [...groups.values()];
  }

  private async handleResults(
    chunk: { op: PushOp; entry: OutboxRow; def: SyncTableDef }[],
    results: PushResult[],
  ) {
    const byId = new Map(results.map((r) => [r.opId, r]));
    for (const { op, entry, def } of chunk) {
      const result = byId.get(op.opId);
      if (!result) continue; // left in the outbox; retried next cycle

      if (result.status === 'APPLIED') {
        if (op.op === 'D') {
          await this.deleteMeta(def.table, op.id);
        } else if (result.version) {
          if (def.versioned)
            await this.setMeta(def.table, op.id, result.version);
          if (def.parent && entry.parent_id) {
            await this.setMetaIfNewer(
              def.parent.table,
              entry.parent_id,
              result.version,
            );
          }
        }
        await this.clearOutbox(entry);
        continue;
      }

      // Server wins: keep a record of what we lost so the user can be told, then converge.
      const reason = result.reason ?? 'STALE';
      await this.prisma.$executeRawUnsafe(
        'INSERT INTO "_sync_rejected" ("id", "table_name", "record_id", "op", "reason", "local_row", "created_at") VALUES (?, ?, ?, ?, ?, ?, ?)',
        randomUUID(),
        op.table,
        op.id,
        op.op,
        reason,
        op.row ? JSON.stringify(op.row) : null,
        new Date().toISOString(),
      );
      await this.clearOutbox(entry);
      if (DROP_LOCAL.has(reason)) await this.dropLocal(def, op.id);
    }
  }

  /** Remove a local row the server will never accept — without queueing a delete. */
  private async dropLocal(def: SyncTableDef, id: string) {
    await this.applying(async (tx) => {
      await this.delegate(tx, def).deleteMany({ where: { id } });
      await tx.$executeRawUnsafe(
        'DELETE FROM "_sync_row_meta" WHERE "table_name" = ? AND "record_id" = ?',
        def.table,
        id,
      );
    });
  }

  // ── pull ────────────────────────────────────────────────────────────────────

  private async pullAll() {
    for (let page = 0; page < 10_000; page++) {
      const since = Number((await this.getState('since_seq')) ?? 0);
      const res = await this.call<{
        changes: PullEntry[];
        nextSeq: number;
        hasMore: boolean;
      }>('GET', `/sync/pull?since=${since}&limit=${PULL_PAGE}`);
      await this.applyEntries(res.changes);
      if (res.nextSeq > since)
        await this.setState('since_seq', String(res.nextSeq));
      if (!res.hasMore) return;
    }
  }

  /**
   * Write server state into the local database in one transaction with change capture
   * switched off. Rows with a pending local edit are skipped — the next push settles them
   * (server wins) and the following pull brings the authoritative version.
   */
  private async applyEntries(entries: PullEntry[]) {
    if (entries.length === 0) return;
    const pending = new Set(
      (
        await this.prisma.$queryRawUnsafe<
          { table_name: string; record_id: string }[]
        >('SELECT "table_name", "record_id" FROM "_sync_outbox"')
      ).map((r) => `${r.table_name}:${r.record_id}`),
    );

    await this.applying(async (tx) => {
      await tx.$executeRawUnsafe('PRAGMA defer_foreign_keys = ON');
      for (const e of entries) {
        const def = getSyncTable(e.table);
        if (!def) continue; // table unknown to this app version
        if (pending.has(`${e.table}:${e.id}`)) continue;

        if (e.op === 'D') {
          await this.delegate(tx, def).deleteMany({ where: { id: e.id } });
          await tx.$executeRawUnsafe(
            'DELETE FROM "_sync_row_meta" WHERE "table_name" = ? AND "record_id" = ?',
            e.table,
            e.id,
          );
          continue;
        }
        if (!e.row) continue;
        if (
          def.parent &&
          pending.has(
            `${def.parent.table}:${String(e.row[def.parent.fkField])}`,
          )
        ) {
          continue;
        }

        const data = fromPullRow(def, e.row);
        const d = this.delegate(tx, def);
        const existing = await d.findUnique({
          where: { id: e.id },
          select: { id: true },
        });

        if (def.delegate === 'inventoryItem') {
          // Server stock + movements we've recorded but not pushed yet, so the screen doesn't jump back.
          data.stockQty =
            Number(data.stockQty ?? 0) +
            (await this.pendingStockDelta(tx, e.id));
        }

        // A cleared Json column is `null` on the wire but needs Prisma.DbNull to be written.
        for (const f of jsonFieldNames(def.model)) {
          if (data[f] === null) {
            if (existing) data[f] = Prisma.DbNull;
            else delete data[f];
          }
        }

        if (existing) {
          const update = { ...data };
          delete update.id;
          // Keep the password hash cached from this PC's last online login (the server sends a placeholder).
          for (const f of def.secret ?? []) delete update[f];
          await d.update({ where: { id: e.id }, data: update });
        } else {
          await d.create({ data: { ...data, id: e.id } });
        }

        if (def.versioned && typeof e.row.updatedAt === 'string') {
          await tx.$executeRawUnsafe(
            'INSERT OR REPLACE INTO "_sync_row_meta" ("table_name", "record_id", "version") VALUES (?, ?, ?)',
            e.table,
            e.id,
            e.row.updatedAt,
          );
        }
      }
    });
  }

  private async pendingStockDelta(
    tx: Tx,
    inventoryItemId: string,
  ): Promise<number> {
    const rows = await tx.$queryRawUnsafe<{ d: number | bigint | null }[]>(
      `SELECT COALESCE(SUM(m."delta"), 0) AS d
         FROM "stock_movements" m
         JOIN "_sync_outbox" o ON o."table_name" = 'stock_movements' AND o."record_id" = m."id"
        WHERE m."inventory_item_id" = ?`,
      inventoryItemId,
    );
    return Number(rows[0]?.d ?? 0);
  }

  /** Run `fn` in a transaction with the local change-capture triggers switched off. */
  private async applying(fn: (tx: Tx) => Promise<void>) {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          'UPDATE "_sync_state" SET "value" = \'1\' WHERE "key" = \'applying\'',
        );
        await fn(tx);
        await tx.$executeRawUnsafe(
          'UPDATE "_sync_state" SET "value" = \'0\' WHERE "key" = \'applying\'',
        );
      },
      { timeout: 120_000, maxWait: 30_000 },
    );
  }

  // ── server-sent hints ───────────────────────────────────────────────────────

  /** Long-lived SSE connection: any server data change → pull soon; reconnect (and sync) when the server returns. */
  private async listen(signal: AbortSignal) {
    let backoff = 2_000;
    const url = `${apiRoot(this.serverUrl!)}/sync/stream?deviceToken=${encodeURIComponent(this.token!)}`;
    while (!signal.aborted) {
      try {
        const res = await fetch(url, {
          signal,
          headers: { accept: 'text/event-stream' },
        });
        if (!res.ok || !res.body)
          throw new Error(`stream responded ${res.status}`);
        backoff = 2_000;
        this.requestSync(0); // (re)connected: catch up right away
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const data = frame.split('\n').find((l) => l.startsWith('data:'));
            if (data) this.onServerEvent(data.slice(5).trim());
          }
        }
      } catch {
        if (signal.aborted) return;
      }
      await new Promise((r) => setTimeout(r, backoff).unref());
      backoff = Math.min(backoff * 2, 60_000);
    }
  }

  private onServerEvent(json: string) {
    try {
      const evt = JSON.parse(json) as { type?: string };
      if (evt.type && evt.type !== 'heartbeat') this.requestSync(500);
    } catch {
      /* ignore malformed frames */
    }
  }

  // ── small state helpers ─────────────────────────────────────────────────────

  private async getState(key: string): Promise<string | null> {
    const rows = await this.prisma.$queryRawUnsafe<{ value: string }[]>(
      'SELECT "value" FROM "_sync_state" WHERE "key" = ?',
      key,
    );
    return rows[0]?.value ?? null;
  }

  private setState(key: string, value: string) {
    return this.prisma.$executeRawUnsafe(
      'INSERT INTO "_sync_state" ("key", "value") VALUES (?, ?) ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value"',
      key,
      value,
    );
  }

  private async count(sql: string): Promise<number> {
    const rows =
      await this.prisma.$queryRawUnsafe<{ c: number | bigint }[]>(sql);
    return Number(rows[0]?.c ?? 0);
  }

  private async getMeta(
    table: string,
    id: string,
  ): Promise<{ version: string } | null> {
    const rows = await this.prisma.$queryRawUnsafe<{ version: string }[]>(
      'SELECT "version" FROM "_sync_row_meta" WHERE "table_name" = ? AND "record_id" = ?',
      table,
      id,
    );
    return rows[0] ?? null;
  }

  private setMeta(table: string, id: string, version: string) {
    return this.prisma.$executeRawUnsafe(
      'INSERT OR REPLACE INTO "_sync_row_meta" ("table_name", "record_id", "version") VALUES (?, ?, ?)',
      table,
      id,
      version,
    );
  }

  private async setMetaIfNewer(table: string, id: string, version: string) {
    const cur = await this.getMeta(table, id);
    if (!cur || cur.version < version) await this.setMeta(table, id, version);
  }

  private deleteMeta(table: string, id: string) {
    return this.prisma.$executeRawUnsafe(
      'DELETE FROM "_sync_row_meta" WHERE "table_name" = ? AND "record_id" = ?',
      table,
      id,
    );
  }

  /** Clear an outbox entry only if it hasn't changed since we read it (op_id is reset by the trigger on edit). */
  private clearOutbox(entry: OutboxRow) {
    return this.prisma.$executeRawUnsafe(
      'DELETE FROM "_sync_outbox" WHERE "table_name" = ? AND "record_id" = ? AND "op_id" = ?',
      entry.table_name,
      entry.record_id,
      entry.op_id,
    );
  }
}
