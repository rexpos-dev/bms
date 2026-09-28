import { Prisma } from '@prisma/client';
import type { SyncTableDef } from './sync-tables';

export type SyncRow = Record<string, unknown>;

interface ScalarField {
  name: string;
  type: string;
}

const fieldCache = new Map<string, ScalarField[]>();

/** Scalar + enum columns of a Prisma model (relations excluded). */
function scalarFields(model: string): ScalarField[] {
  let fields = fieldCache.get(model);
  if (!fields) {
    const m = Prisma.dmmf.datamodel.models.find((x) => x.name === model);
    if (!m) throw new Error(`Unknown Prisma model: ${model}`);
    fields = m.fields
      .filter((f) => f.kind === 'scalar' || f.kind === 'enum')
      .map((f) => ({ name: f.name, type: f.type }));
    fieldCache.set(model, fields);
  }
  return fields;
}

/** JSON-safe copy of a DB row: Dates → ISO, Decimal → string, BigInt → string. */
export function serializeRow(model: string, row: SyncRow): SyncRow {
  const out: SyncRow = {};
  for (const { name } of scalarFields(model)) {
    const v = row[name];
    if (v === undefined) continue;
    out[name] =
      v instanceof Date
        ? v.toISOString()
        : typeof v === 'bigint'
          ? v.toString()
          : v;
  }
  // Decimal instances (and anything else with toJSON) collapse via JSON round-trip.
  return JSON.parse(JSON.stringify(out)) as SyncRow;
}

/**
 * What a device receives for a row: serialized, secrets removed and replaced by
 * the table's `pullDefaults` (so required columns like users.password_hash stay valid).
 */
export function toPullRow(def: SyncTableDef, row: SyncRow): SyncRow {
  const out = serializeRow(def.model, row);
  for (const f of def.secret ?? []) {
    out[f] =
      def.pullDefaults && f in def.pullDefaults ? def.pullDefaults[f] : null;
  }
  return out;
}

function convertRow(
  def: SyncTableDef,
  row: SyncRow,
  blocked: Set<string>,
): { data: SyncRow; ignored: string[] } {
  const data: SyncRow = {};
  const ignored: string[] = [];
  const known = new Map(scalarFields(def.model).map((f) => [f.name, f.type]));

  for (const [key, value] of Object.entries(row)) {
    const type = known.get(key);
    if (!type || blocked.has(key)) {
      ignored.push(key);
      continue;
    }
    if (value === null || value === undefined) {
      data[key] = null;
    } else if (type === 'DateTime') {
      const d = new Date(value as string | number);
      if (Number.isNaN(d.getTime()))
        throw new Error(`Invalid date for ${def.table}.${key}`);
      data[key] = d;
    } else if (type === 'BigInt') {
      data[key] = BigInt(value as string | number);
    } else {
      data[key] = value;
    }
  }
  return { data, ignored };
}

/**
 * Turn an untrusted JSON row (from a device) into Prisma input: only known scalar
 * columns survive, ISO strings become Dates, server-owned fields and `updatedAt`
 * are dropped. Returns the data plus which unknown keys were ignored.
 */
export function fromDeviceRow(
  def: SyncTableDef,
  row: SyncRow,
): { data: SyncRow; ignored: string[] } {
  return convertRow(
    def,
    row,
    new Set<string>([
      ...(def.serverOwned ?? []),
      ...(def.secret ?? []),
      'updatedAt',
    ]),
  );
}

/**
 * Turn a row received from the server into Prisma input for the device's local
 * database. Every known scalar column is kept (the server already replaced secrets
 * with their defaults); unknown keys are dropped so a newer server can't break an
 * older desktop app.
 */
export function fromPullRow(def: SyncTableDef, row: SyncRow): SyncRow {
  return convertRow(def, row, new Set()).data;
}

/** Names of the nullable Json columns of a model (they need Prisma.DbNull, not `null`, when cleared). */
export function jsonFieldNames(model: string): string[] {
  return scalarFields(model)
    .filter((f) => f.type === 'Json')
    .map((f) => f.name);
}
