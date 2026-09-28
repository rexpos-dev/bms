import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The slice of a Prisma client the migrator needs (works with the generated SQLite client). */
export interface RawSqlClient {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $transaction(queries: Promise<unknown>[]): Promise<unknown>;
}

/**
 * Split a SQL script into statements, dropping `--` comment lines. A statement ends
 * at a line ending in `;` — except `CREATE TRIGGER`, whose body contains `;`, and which
 * therefore ends only at a line that is exactly `END;`.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current: string[] = [];
  let inTrigger = false;

  for (const raw of sql.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (current.length === 0) {
      if (line.trim() === '' || line.trim().startsWith('--')) continue;
      inTrigger = /^CREATE\s+TRIGGER\b/i.test(line.trim());
    } else if (line.trim().startsWith('--')) {
      continue;
    }
    current.push(line);
    const done = inTrigger ? line.trim() === 'END;' : line.endsWith(';');
    if (done) {
      statements.push(current.join('\n').replace(/;\s*$/, '').trim());
      current = [];
      inTrigger = false;
    }
  }
  const rest = current.join('\n').trim();
  if (rest) statements.push(rest);
  return statements;
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
