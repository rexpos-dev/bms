import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The slice of a Prisma client the migrator needs (works with the generated SQLite client). */
export interface RawSqlClient {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $transaction(queries: Promise<unknown>[]): Promise<unknown>;
}

/** Split a DDL script into statements, dropping `--` comment lines. */
export function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Applies `*.sql` files from `dir` in filename order, once each, tracked in
 * `_desktop_migrations`. Each file runs in a single transaction, so a failed
 * migration leaves the local database untouched.
 */
export async function runSqliteMigrations(
  db: RawSqlClient,
  dir: string,
): Promise<string[]> {
  await db.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS "_desktop_migrations" ("name" TEXT NOT NULL PRIMARY KEY, "applied_at" TEXT NOT NULL)',
  );
  const done = new Set(
    (
      await db.$queryRawUnsafe<{ name: string }[]>(
        'SELECT "name" FROM "_desktop_migrations"',
      )
    ).map((r) => r.name),
  );

  const applied: string[] = [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const statements = splitSqlStatements(
      readFileSync(join(dir, file), 'utf8'),
    );
    await db.$transaction([
      ...statements.map((s) => db.$executeRawUnsafe(s)),
      db.$executeRawUnsafe(
        'INSERT INTO "_desktop_migrations" ("name", "applied_at") VALUES (?, ?)',
        file,
        new Date().toISOString(),
      ),
    ]);
    applied.push(file);
  }
  return applied;
}
