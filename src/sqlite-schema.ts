/**
 * Derives the desktop (SQLite) Prisma schema from the server (MySQL) schema so the
 * two never drift: MySQL-only native types are stripped and server-only models dropped.
 *
 * Run `npm run gen:sqlite` after any change to prisma/schema.prisma; sqlite-schema.spec.ts
 * fails when the committed prisma/schema.sqlite.prisma is stale.
 */

/** Models that only exist on the central server. */
export const SERVER_ONLY_MODELS = [
  'SyncDevice',
  'SyncChange',
  'SyncPushedOp',
  'SyncConflict',
];

const HEADER = `// GENERATED FILE — do not edit. Source: prisma/schema.prisma (run \`npm run gen:sqlite\`).
// Schema of the desktop app's local SQLite database (same models as the server, minus server-only ones).

`;

export function toSqliteSchema(mysqlSchema: string): string {
  let s = mysqlSchema.replace(/\r\n/g, '\n');

  s = s.replace(
    /generator client \{[^}]*\}/,
    `generator client {\n  provider = "prisma-client-js"\n  output   = "../generated/sqlite-client"\n}`,
  );
  s = s.replace(
    /datasource db \{[^}]*\}/,
    `datasource db {\n  provider = "sqlite"\n  url      = env("DESKTOP_DATABASE_URL")\n}`,
  );

  for (const model of SERVER_ONLY_MODELS) {
    s = s.replace(new RegExp(`^model ${model} \\{[\\s\\S]*?^\\}\\n`, 'm'), '');
  }

  // @db.VarChar(64), @db.Text, @db.Decimal(12, 2), … are MySQL native types.
  s = s.replace(/[ \t]+@db\.\w+(\([^)]*\))?/g, '');

  return HEADER + s;
}
