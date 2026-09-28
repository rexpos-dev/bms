import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { SYNC_TABLES } from './sync-tables';
import { buildSyncTriggerSql } from './sync-triggers';

const MIGRATION = join(
  __dirname,
  '..',
  'prisma',
  'migrations',
  '20260928000000_sync_foundation',
  'migration.sql',
);

describe('sync registry vs schema vs migration', () => {
  const models = Prisma.dmmf.datamodel.models;

  it('committed migration contains exactly the generated trigger SQL', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/\r\n/g, '\n');
    expect(sql).toContain(buildSyncTriggerSql());
  });

  it.each(SYNC_TABLES.map((t) => [t.table, t] as const))(
    '%s matches its Prisma model',
    (_name, def) => {
      const model = models.find((m) => m.name === def.model);
      expect(model).toBeDefined();
      expect(model!.dbName).toBe(def.table);

      // triggers and the pull/push engine assume a single string `id` primary key
      const id = model!.fields.find((f) => f.name === 'id');
      expect(id?.isId).toBe(true);
      expect(id?.type).toBe('String');

      // `versioned` must reflect a real updatedAt column (optimistic locking depends on it)
      const hasUpdatedAt = model!.fields.some(
        (f) => f.name === 'updatedAt' && f.type === 'DateTime',
      );
      expect(hasUpdatedAt).toBe(def.versioned);

      for (const f of [...(def.serverOwned ?? []), ...(def.secret ?? [])]) {
        expect(model!.fields.some((x) => x.name === f)).toBe(true);
      }
    },
  );

  it.each(
    SYNC_TABLES.filter((t) => t.parent).map((t) => [t.table, t] as const),
  )(
    '%s parent link points at a real column of a versioned parent',
    (_name, def) => {
      const p = def.parent!;
      const parentDef = SYNC_TABLES.find((t) => t.table === p.table);
      expect(parentDef?.versioned).toBe(true);
      expect(parentDef?.delegate).toBe(p.delegate);
      // parent must come first in apply order
      expect(SYNC_TABLES.indexOf(parentDef!)).toBeLessThan(
        SYNC_TABLES.indexOf(def),
      );

      const model = models.find((m) => m.name === def.model)!;
      const fk = model.fields.find((f) => f.name === p.fkField);
      expect(fk?.dbName ?? fk?.name).toBe(p.fkColumn);
    },
  );
});
