import { SYNC_TABLES, aggregateChildren } from './sync-tables';

const OPS = [
  { suffix: 'i', event: 'INSERT', op: 'I', row: 'NEW' },
  { suffix: 'u', event: 'UPDATE', op: 'U', row: 'NEW' },
  { suffix: 'd', event: 'DELETE', op: 'D', row: 'OLD' },
] as const;

/**
 * MySQL triggers that feed `sync_changes`. Each trigger has a single statement
 * body, so no DELIMITER / BEGIN…END is needed and Prisma's migration runner can
 * execute the script as-is.
 *
 * - `trg_sync_<table>_<i|u|d>` logs every row change.
 * - `trg_sync_bump_<table>_<i|u|d>` (aggregate children only) touches the parent's
 *   `updated_at`, so the parent's own trigger logs it and optimistic-lock checks
 *   on the aggregate see the child edit.
 *
 * The output is committed in the sync_foundation migration; sync-triggers.spec.ts
 * fails if this generator and the migration ever drift apart.
 */
export function buildSyncTriggerSql(): string {
  const out: string[] = [];

  for (const t of SYNC_TABLES) {
    for (const { suffix, event, op, row } of OPS) {
      const name = `trg_sync_${t.table}_${suffix}`;
      out.push(
        `DROP TRIGGER IF EXISTS \`${name}\`;`,
        `CREATE TRIGGER \`${name}\` AFTER ${event} ON \`${t.table}\` FOR EACH ROW ` +
          `INSERT INTO \`sync_changes\` (\`table_name\`, \`record_id\`, \`op\`, \`changed_at\`) ` +
          `VALUES ('${t.table}', ${row}.\`id\`, '${op}', CURRENT_TIMESTAMP(3));`,
        '',
      );
    }
  }

  for (const t of aggregateChildren()) {
    const p = t.parent!;
    for (const { suffix, event, row } of OPS) {
      const name = `trg_sync_bump_${t.table}_${suffix}`;
      out.push(
        `DROP TRIGGER IF EXISTS \`${name}\`;`,
        `CREATE TRIGGER \`${name}\` AFTER ${event} ON \`${t.table}\` FOR EACH ROW ` +
          `UPDATE \`${p.table}\` SET \`updated_at\` = CURRENT_TIMESTAMP(3) WHERE \`id\` = ${row}.\`${p.fkColumn}\`;`,
        '',
      );
    }
  }

  return out.join('\n');
}
