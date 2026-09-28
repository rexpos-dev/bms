import { Prisma } from '@prisma/client';
import { SYNC_TABLES, type SyncTableDef } from './sync-tables';

const OPS = [
  { suffix: 'i', event: 'INSERT', row: 'NEW' },
  { suffix: 'u', event: 'UPDATE', row: 'NEW' },
  { suffix: 'd', event: 'DELETE', row: 'OLD' },
] as const;

const TABLES_SQL = `-- Local sync bookkeeping (desktop app only). Generated from src/sync-tables.ts by \`npm run gen:sqlite\`.

-- key/value: applying ('1' while a pulled batch is being written, so triggers stay quiet),
-- initial_done, since_seq (highest server change seq pulled), last_sync_at
CREATE TABLE "_sync_state" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);
INSERT INTO "_sync_state" ("key", "value") VALUES ('applying', '0'), ('initial_done', '0'), ('since_seq', '0');

-- Rows changed locally and not yet pushed. One entry per row; op_id is stable across
-- retries of the same content and reset whenever the row changes again.
CREATE TABLE "_sync_outbox" (
    "table_name" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "op_id" TEXT,
    "queued_at" TEXT NOT NULL,
    PRIMARY KEY ("table_name", "record_id")
);

-- The server version (updatedAt, ISO) of each row as of the last sync: the optimistic-lock base.
CREATE TABLE "_sync_row_meta" (
    "table_name" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    PRIMARY KEY ("table_name", "record_id")
);

-- Local edits the server refused (server wins). Shown to the user, then marked seen.
CREATE TABLE "_sync_rejected" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "table_name" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "local_row" TEXT,
    "created_at" TEXT NOT NULL,
    "seen_at" TEXT
);
`;

/**
 * Columns whose change should queue the row for push: every column except those the server
 * owns (a device's edit to them would be ignored anyway) and `updated_at`. Without this, e.g.
 * a stock adjustment — recorded as a movement — would also push the item's `stock_qty`
 * and be flagged as a conflict whenever the server's copy had moved on.
 */
function pushableColumns(t: SyncTableDef): string[] | null {
  if (!t.serverOwned?.length) return null;
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === t.model)!;
  const skip = new Set([...t.serverOwned, 'updatedAt']);
  return model.fields
    .filter(
      (f) => (f.kind === 'scalar' || f.kind === 'enum') && !skip.has(f.name),
    )
    .map((f) => f.dbName ?? f.name);
}

function queue(table: string, idExpr: string, parentExpr: string): string {
  return (
    `    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")\n` +
    `    VALUES ('${table}', ${idExpr}, ${parentExpr}, NULL, datetime('now'))\n` +
    `    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";`
  );
}

/**
 * SQLite DDL for the local sync bookkeeping tables plus change-capture triggers on
 * every two-way table (the local mirror of the MySQL triggers). Pull-only tables get
 * no triggers, so a device can never push reference data. Aggregate children also
 * queue their parent, so the parent is always pushed together with its children.
 *
 * Trigger bodies span several lines and end with a line consisting of `END;` —
 * splitSqlStatements() in sqlite-migrator.ts relies on that.
 */
export function buildSqliteSyncSql(): string {
  const out: string[] = [TABLES_SQL];
  const guard = `WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'`;

  for (const t of SYNC_TABLES.filter((x) => x.mode === 'both')) {
    for (const { suffix, event, row } of OPS) {
      const body = [
        queue(
          t.table,
          `${row}."id"`,
          t.parent ? `${row}."${t.parent.fkColumn}"` : 'NULL',
        ),
      ];
      if (t.parent)
        body.push(
          queue(t.parent.table, `${row}."${t.parent.fkColumn}"`, 'NULL'),
        );
      const cols = event === 'UPDATE' ? pushableColumns(t) : null;
      const of = cols ? ` OF ${cols.map((c) => `"${c}"`).join(', ')}` : '';
      out.push(
        `CREATE TRIGGER "trg_sync_${t.table}_${suffix}" AFTER ${event}${of} ON "${t.table}"\n${guard}\nBEGIN\n${body.join('\n')}\nEND;\n`,
      );
    }
  }
  return out.join('\n');
}
