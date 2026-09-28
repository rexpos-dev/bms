import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { splitSqlStatements } from './sqlite-migrator';
import { SERVER_ONLY_MODELS, toSqliteSchema } from './sqlite-schema';

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
