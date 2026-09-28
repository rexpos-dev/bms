import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { splitSqlStatements } from './sqlite-migrator';
import { SERVER_ONLY_MODELS, toSqliteSchema } from './sqlite-schema';
import { buildSqliteSyncSql } from './sqlite-sync-sql';
import { SYNC_TABLES } from './sync-tables';

const root = join(__dirname, '..');
const read = (...p: string[]) =>
  readFileSync(join(root, ...p), 'utf8').replace(/\r\n/g, '\n');

describe('desktop SQLite schema', () => {
  const mysql = read('prisma', 'schema.prisma');

  it('committed schema.sqlite.prisma is up to date (run `npm run gen:sqlite`)', () => {
    expect(read('prisma', 'schema.sqlite.prisma')).toBe(toSqliteSchema(mysql));
  });

  it('has no MySQL native types and no server-only models', () => {
    const sqlite = toSqliteSchema(mysql);
    expect(sqlite).not.toMatch(/@db\./);
    for (const m of SERVER_ONLY_MODELS)
      expect(sqlite).not.toMatch(new RegExp(`^model ${m} `, 'm'));
    expect(sqlite).toContain('provider = "sqlite"');
  });

  it('baseline DDL creates a table for every non-server-only model', () => {
    const ddl = read('prisma', 'sqlite', '0001_baseline.sql');
    const expected = Prisma.dmmf.datamodel.models
      .filter((m) => !SERVER_ONLY_MODELS.includes(m.name))
      .map((m) => m.dbName ?? m.name);
    for (const table of expected)
      expect(ddl).toContain(`CREATE TABLE "${table}"`);
    expect(ddl).not.toMatch(/sync_(devices|changes|pushed_ops|conflicts)/);
  });
});

describe('splitSqlStatements', () => {
  it('drops comment lines and splits on statement terminators', () => {
    const sql =
      '-- CreateTable\nCREATE TABLE "a" (\n  "id" TEXT\n);\n\n-- CreateIndex\nCREATE INDEX "i" ON "a"("id");\n';
    expect(splitSqlStatements(sql)).toEqual([
      'CREATE TABLE "a" (\n  "id" TEXT\n)',
      'CREATE INDEX "i" ON "a"("id")',
    ]);
  });
});

describe('local sync SQL', () => {
  it('committed 0002_sync_local.sql is up to date (run `npm run gen:sqlite`)', () => {
    expect(read('prisma', 'sqlite', '0002_sync_local.sql')).toBe(
      buildSqliteSyncSql().replace(/\r\n/g, '\n'),
    );
  });

  it('captures changes on every two-way table and never on pull-only ones', () => {
    const sql = buildSqliteSyncSql();
    for (const t of SYNC_TABLES) {
      const has = sql.includes(`CREATE TRIGGER "trg_sync_${t.table}_i"`);
      expect(has).toBe(t.mode === 'both');
    }
  });

  it('queues the parent alongside a child row', () => {
    const sql = buildSqliteSyncSql();
    const trigger = sql.slice(
      sql.indexOf('CREATE TRIGGER "trg_sync_job_order_items_u"'),
    );
    expect(trigger.slice(0, trigger.indexOf('END;'))).toContain(
      `VALUES ('job_orders', NEW."job_order_id"`,
    );
  });

  it('is split into whole statements, keeping trigger bodies intact', () => {
    const statements = splitSqlStatements(buildSqliteSyncSql());
    const triggers = statements.filter((s) => s.startsWith('CREATE TRIGGER'));
    expect(triggers).toHaveLength(
      SYNC_TABLES.filter((t) => t.mode === 'both').length * 3,
    );
    for (const t of triggers) {
      expect(t).toMatch(/\nBEGIN\n[\s\S]+\nEND$/);
    }
  });
});
