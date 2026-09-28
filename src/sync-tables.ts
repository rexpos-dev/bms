/**
 * Registry of tables that take part in offline sync. It is the single source of
 * truth for: the change-log triggers (see the sync_foundation migration), which
 * direction each table syncs, and the FK-safe apply order.
 *
 * Order matters: parents come before children, so a push/pull batch can be applied
 * front to back without violating foreign keys (deletes are applied in reverse).
 */
export type SyncMode =
  /** Server → devices only. Devices never write these (reference data). */
  | 'pull'
  /** Both directions with optimistic conflict detection (server wins). */
  | 'both';

export interface SyncTableDef {
  /** Prisma client delegate name, e.g. `jobOrder`. */
  delegate: string;
  /** Prisma model name, used for DMMF field lookups, e.g. `JobOrder`. */
  model: string;
  /** SQL table name (@@map) — what the triggers write into sync_changes.table_name. */
  table: string;
  mode: SyncMode;
  /**
   * Child row of an aggregate: conflicts are judged on the parent's `updatedAt`
   * (a trigger bumps the parent whenever a child changes), so children need no
   * `updatedAt` column of their own.
   */
  parent?: {
    delegate: string;
    table: string;
    fkField: string;
    fkColumn: string;
  };
  /** Immutable after insert (only inserts, plus server-side voids) — never conflict-checked. */
  appendOnly?: boolean;
  /** Fields a device may never set; the server keeps its own value. */
  serverOwned?: string[];
  /** Fields never sent to devices (secrets); replaced by `pullDefaults` locally. */
  secret?: string[];
  /** Values substituted for `secret` fields on the device (required columns). */
  pullDefaults?: Record<string, unknown>;
  /** `updatedAt` column exists on the table (needed for optimistic locking). */
  versioned: boolean;
}

export const SYNC_TABLES: SyncTableDef[] = [
  // ── Reference data (pulled only) ────────────────────────────────────────────
  {
    delegate: 'user',
    model: 'User',
    table: 'users',
    mode: 'pull',
    versioned: true,
    // Credential/MFA/token columns never leave the server. Offline login uses a
    // hash cached on the device after an online login (Phase 3).
    secret: ['passwordHash', 'mfaSecret', 'refreshToken'],
    pullDefaults: { passwordHash: '!', mfaSecret: null, refreshToken: null },
  },
  {
    delegate: 'softwareProduct',
    model: 'SoftwareProduct',
    table: 'software_products',
    mode: 'pull',
    versioned: true,
  },
  {
    delegate: 'agreementVersion',
    model: 'AgreementVersion',
    table: 'agreement_versions',
    mode: 'pull',
    versioned: false,
  },
  {
    delegate: 'agreementSection',
    model: 'AgreementSection',
    table: 'agreement_sections',
    mode: 'pull',
    versioned: false,
  },
  {
    delegate: 'companyProfile',
    model: 'CompanyProfile',
    table: 'company_profile',
    mode: 'pull',
    versioned: true,
  },
  // Referenced by job_orders.job_id; the Jobs module itself stays online-only.
  {
    delegate: 'job',
    model: 'Job',
    table: 'jobs',
    mode: 'pull',
    versioned: true,
  },

  // ── Core, two-way ───────────────────────────────────────────────────────────
  {
    delegate: 'client',
    model: 'Client',
    table: 'clients',
    mode: 'both',
    versioned: true,
  },
  {
    delegate: 'itemCategory',
    model: 'ItemCategory',
    table: 'item_categories',
    mode: 'both',
    versioned: true,
  },
  {
    delegate: 'inventoryItem',
    model: 'InventoryItem',
    table: 'inventory_items',
    mode: 'both',
    versioned: true,
    // Stock is a counter: devices change it only through appended StockMovements.
    serverOwned: ['stockQty'],
  },
  {
    delegate: 'itemPackage',
    model: 'ItemPackage',
    table: 'item_packages',
    mode: 'both',
    versioned: true,
  },
  {
    delegate: 'itemPackageItem',
    model: 'ItemPackageItem',
    table: 'item_package_items',
    mode: 'both',
    versioned: false,
    parent: {
      delegate: 'itemPackage',
      table: 'item_packages',
      fkField: 'packageId',
      fkColumn: 'package_id',
    },
  },
  {
    delegate: 'license',
    model: 'License',
    table: 'licenses',
    mode: 'both',
    versioned: true,
    // Activation (RSA-signed token + hardware binding) only ever happens on the server.
    serverOwned: ['licenseToken', 'hardwareFingerprint', 'activatedById'],
    // The signed token stays on the server; devices see the rest of the license.
    secret: ['licenseToken'],
    pullDefaults: { licenseToken: null },
  },
  {
    delegate: 'nenposClient',
    model: 'NenposClient',
    table: 'nenpos_clients',
    mode: 'both',
    versioned: true,
  },
  {
    delegate: 'jobOrder',
    model: 'JobOrder',
    table: 'job_orders',
    mode: 'both',
    versioned: true,
  },
  {
    delegate: 'jobOrderUnit',
    model: 'JobOrderUnit',
    table: 'job_order_units',
    mode: 'both',
    versioned: false,
    parent: {
      delegate: 'jobOrder',
      table: 'job_orders',
      fkField: 'jobOrderId',
      fkColumn: 'job_order_id',
    },
  },
  {
    delegate: 'jobOrderItem',
    model: 'JobOrderItem',
    table: 'job_order_items',
    mode: 'both',
    versioned: false,
    parent: {
      delegate: 'jobOrder',
      table: 'job_orders',
      fkField: 'jobOrderId',
      fkColumn: 'job_order_id',
    },
  },
  // Payments are inserted once; a void is an update of the void* columns (server wins on conflict).
  {
    delegate: 'payment',
    model: 'Payment',
    table: 'payments',
    mode: 'both',
    versioned: false,
  },
  // Movements are append-only; the server applies `delta` to stockQty and stamps `balance`.
  {
    delegate: 'stockMovement',
    model: 'StockMovement',
    table: 'stock_movements',
    mode: 'both',
    versioned: false,
    appendOnly: true,
  },
  {
    delegate: 'auditLog',
    model: 'AuditLog',
    table: 'audit_logs',
    mode: 'both',
    versioned: false,
    appendOnly: true,
  },
];

const BY_TABLE = new Map(SYNC_TABLES.map((t) => [t.table, t]));
const ORDER = new Map(SYNC_TABLES.map((t, i) => [t.table, i]));

export function getSyncTable(table: string): SyncTableDef | undefined {
  return BY_TABLE.get(table);
}

/** Position in FK-safe order (parents first). Unknown tables sort last. */
export function syncOrder(table: string): number {
  return ORDER.get(table) ?? Number.MAX_SAFE_INTEGER;
}

/** Tables whose child rows bump a parent's updated_at (drives trigger generation). */
export function aggregateChildren(): SyncTableDef[] {
  return SYNC_TABLES.filter((t) => t.parent);
}
