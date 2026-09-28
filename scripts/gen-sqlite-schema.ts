/**
 * Regenerates prisma/schema.sqlite.prisma and the SQLite DDL for the desktop app
 * (prisma/sqlite/0001_baseline.sql from prisma/schema.prisma, 0002_sync_local.sql from
 * src/sync-tables.ts).
 *
 *   npm run gen:sqlite
 *
 * Also generates the SQLite Prisma client into generated/sqlite-client.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSqliteSyncSql } from '../src/sqlite-sync-sql';
import { toSqliteSchema } from '../src/sqlite-schema';

const root = join(__dirname, '..');
const mysqlPath = join(root, 'prisma', 'schema.prisma');
const sqlitePath = join(root, 'prisma', 'schema.sqlite.prisma');
const baselinePath = join(root, 'prisma', 'sqlite', '0001_baseline.sql');
const env = { ...process.env, DESKTOP_DATABASE_URL: 'file:./unused.db' };

writeFileSync(sqlitePath, toSqliteSchema(readFileSync(mysqlPath, 'utf8')));

const run = (args: string[]) =>
  execFileSync('npx', ['prisma', ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 32 * 1024 * 1024,
  });

const ddl = run([
  'migrate',
  'diff',
  '--from-empty',
  '--to-schema-datamodel',
  sqlitePath,
  '--script',
]);
mkdirSync(join(root, 'prisma', 'sqlite'), { recursive: true });
writeFileSync(baselinePath, ddl);
writeFileSync(
  join(root, 'prisma', 'sqlite', '0002_sync_local.sql'),
  buildSqliteSyncSql(),
);

run(['generate', '--schema', sqlitePath]);
console.log('SQLite schema, baseline DDL and client generated.');
