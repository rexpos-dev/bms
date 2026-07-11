# Backup Upload & Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Super Admin upload a downloaded `.sql` backup and restore from it, either the full database or selected transactional modules.

**Architecture:** A new `RestoreService` (backend) runs restores in-process via `mysql2` (no `mysql` client binary — Railway lacks one). Full restore executes the whole dump against the live DB; per-module restore loads the whole dump into a throwaway scratch database, then copies only the selected modules' tables into the live DB and drops the scratch DB. Upload is a multipart endpoint that drops the file into the existing `BACKUP_DIR` so it appears in the current Backups list. Frontend adds an "Upload backup" button and a per-row "Restore" dialog.

**Tech Stack:** NestJS 11, `mysql2/promise`, `multer` (bundled with `@nestjs/platform-express`), Prisma, React 19 + TanStack Query + Axios, existing `Dialog` component.

## Global Constraints

- Endpoints are `SUPER_ADMIN` only — reuse the existing `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.SUPER_ADMIN)` on `BackupsController`.
- Never shell out to `mysql`/`mysqldump` for restore — use `mysql2` in-process (Railway has no client binary).
- `mysql2` is pinned to `^3.11.5` (a direct dependency here; already pinned via `overrides` for `mysqldump`). Do not downgrade.
- Password gate: verify the caller's own login password with `bcrypt.compare` against `user.passwordHash` (same as `ResetService.reset`). Wrong password → `UnauthorizedException` (HTTP 401).
- Module ids and their table sets must match the Reset modules exactly (`MODULE_TABLES` is the single source of truth).
- Surface real errors: throw `InternalServerErrorException` / `BadRequestException` with the actual reason (no generic 500); the frontend shows the server `message`.

---

### Task 1: mysql2 dependency + MODULE_TABLES + module resolver

**Files:**
- Modify: `package.json` (add `mysql2` to `dependencies`)
- Create: `src/restore.service.ts` (constants + pure resolver only in this task)
- Test: `src/restore.service.spec.ts`

**Interfaces:**
- Produces: `MODULE_TABLES: Record<string, string[]>`, `resolveModuleTables(moduleIds: string[]): string[]`, `interface RestoreResult { scope: 'full' | 'modules'; tables: string[] }`.

- [ ] **Step 1: Add mysql2 dependency**

Edit `package.json` — add to the `"dependencies"` object (keep alphabetical near `jsonwebtoken`/`mysqldump`):

```json
    "mysql2": "^3.11.5",
```

Then run:

```bash
npm install
```
Expected: installs without adding new critical audit findings (the `overrides` already pin `mysql2`).

- [ ] **Step 2: Write the failing test**

Create `src/restore.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { MODULE_TABLES, resolveModuleTables } from './restore.service';

describe('MODULE_TABLES', () => {
  it('covers exactly the Reset module ids', () => {
    expect(Object.keys(MODULE_TABLES).sort()).toEqual(
      [
        'audit-logs',
        'dev-projects',
        'earnings',
        'job-orders',
        'jobs',
        'kpi',
        'licenses',
        'nenpos-clients',
        'notifications',
        'withdrawals',
      ].sort(),
    );
  });

  it('maps jobs to its two tables', () => {
    expect(MODULE_TABLES['jobs']).toEqual(['jobs', 'installation_proofs']);
  });
});

describe('resolveModuleTables', () => {
  it('dedupes and flattens selected modules', () => {
    expect(resolveModuleTables(['jobs', 'earnings']).sort()).toEqual(
      ['earnings', 'installation_proofs', 'jobs'].sort(),
    );
  });

  it('rejects an unknown module id', () => {
    expect(() => resolveModuleTables(['bogus'])).toThrow(BadRequestException);
  });

  it('rejects an empty selection', () => {
    expect(() => resolveModuleTables([])).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest restore.service.spec --silent`
Expected: FAIL — cannot find module `./restore.service` / exports undefined.

- [ ] **Step 4: Write minimal implementation**

Create `src/restore.service.ts`:

```ts
import { BadRequestException } from '@nestjs/common';

/** Module id → the real MySQL tables it owns. Mirrors ResetService's modules. */
export const MODULE_TABLES: Record<string, string[]> = {
  jobs: ['jobs', 'installation_proofs'],
  'job-orders': ['job_orders', 'job_order_items'],
  'dev-projects': [
    'dev_projects',
    'dev_project_sessions',
    'dev_project_reports',
    'dev_project_report_feedback',
  ],
  licenses: ['licenses'],
  earnings: ['earnings'],
  withdrawals: ['withdrawals'],
  kpi: ['kpi_results', 'incentives'],
  notifications: ['notifications'],
  'nenpos-clients': ['nenpos_clients'],
  'audit-logs': ['audit_logs'],
};

/** Resolve module ids to a deduped list of table names. Throws on unknown/empty input. */
export function resolveModuleTables(moduleIds: string[]): string[] {
  if (moduleIds.length === 0) {
    throw new BadRequestException('Select at least one module to restore.');
  }
  const tables = new Set<string>();
  for (const id of moduleIds) {
    const t = MODULE_TABLES[id];
    if (!t) throw new BadRequestException(`Unknown module: ${id}`);
    for (const name of t) tables.add(name);
  }
  return [...tables];
}

export interface RestoreResult {
  scope: 'full' | 'modules';
  tables: string[];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest restore.service.spec --silent`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/restore.service.ts src/restore.service.spec.ts
git commit -m "feat(restore): add mysql2 dep, MODULE_TABLES, and module resolver"
```

---

### Task 2: RestoreService — full & per-module execution via mysql2

**Files:**
- Modify: `src/restore.service.ts` (add the `RestoreService` class)
- Modify: `src/backups.service.ts` (export `BACKUP_DIR`; add `sanitizeUploadedBackupName`)
- Verify: temp e2e script against local MySQL (not committed)

**Interfaces:**
- Consumes: `PrismaService` (`src/prisma.service.ts`), `BackupsService.getFilePath(filename)` and `BackupsService.get(filename)` (`src/backups.service.ts`), `resolveModuleTables`, `RestoreResult` (Task 1).
- Produces: `RestoreService.restore(filename: string, userId: string, password: string, opts: { full: boolean; modules?: string[] }): Promise<RestoreResult>`; exported `BACKUP_DIR: string`; `sanitizeUploadedBackupName(originalname: string): string`.

- [ ] **Step 1: Export BACKUP_DIR and add the upload-name sanitizer**

In `src/backups.service.ts`, change the `BACKUP_DIR` declaration to be exported:

```ts
export const BACKUP_DIR = join(process.cwd(), 'backups');
```

And add this exported helper just below the `FILENAME_RE` constant:

```ts
/** Build a safe, collision-free backup filename from an uploaded file's name. */
export function sanitizeUploadedBackupName(originalname: string): string {
  const base =
    originalname
      .replace(/\.sql$/i, '')
      .replace(/[^\w.-]/g, '_')
      .slice(0, 80) || 'backup';
  return `restored-${Date.now()}-${base}.sql`;
}
```

- [ ] **Step 2: Add the RestoreService class**

Append to `src/restore.service.ts` (and extend the top import line):

```ts
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { readFileSync } from 'node:fs';
import { createConnection, type Connection } from 'mysql2/promise';
import { PrismaService } from './prisma.service';
import { BackupsService } from './backups.service';
```

(Replace the existing `import { BadRequestException } from '@nestjs/common';` line with the block above — do not duplicate it.)

Then add the class at the end of the file:

```ts
@Injectable()
export class RestoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backups: BackupsService,
  ) {}

  async restore(
    filename: string,
    userId: string,
    password: string,
    opts: { full: boolean; modules?: string[] },
  ): Promise<RestoreResult> {
    await this.verifyPassword(userId, password);
    const sql = readFileSync(this.backups.getFilePath(filename), 'utf8');

    if (opts.full) {
      await this.runFull(sql);
      return { scope: 'full', tables: [] };
    }
    const tables = resolveModuleTables(opts.modules ?? []);
    const restored = await this.runModules(sql, tables);
    return { scope: 'modules', tables: restored };
  }

  private async verifyPassword(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Incorrect password');
    }
  }

  /** mysql2 connection config from DATABASE_URL, optionally overriding the default schema. */
  private dbConfig(database?: string) {
    const url = new URL(process.env.DATABASE_URL!);
    return {
      host: url.hostname,
      port: Number(url.port || '3306'),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: database ?? url.pathname.replace(/^\//, ''),
      multipleStatements: true,
    };
  }

  private async runFull(sql: string): Promise<void> {
    let conn: Connection | undefined;
    try {
      conn = await createConnection(this.dbConfig());
      await conn.query(sql);
    } catch (err) {
      throw new InternalServerErrorException(`Restore failed: ${(err as Error).message}`);
    } finally {
      await conn?.end();
    }
  }

  private async runModules(sql: string, tables: string[]): Promise<string[]> {
    const liveDb = this.dbConfig().database;
    const scratch = `sdlmp_restore_${Date.now()}`;
    try {
      // Create scratch DB and load the whole dump into it (layout-independent).
      const live = await createConnection(this.dbConfig());
      try {
        await live.query(`CREATE DATABASE \`${scratch}\``);
      } finally {
        await live.end();
      }
      const scratchConn = await createConnection(this.dbConfig(scratch));
      try {
        await scratchConn.query(sql);
      } finally {
        await scratchConn.end();
      }

      // Copy selected tables scratch -> live.
      const copy = await createConnection(this.dbConfig());
      const restored: string[] = [];
      try {
        const [rows] = await copy.query(
          'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?',
          [scratch],
        );
        const present = new Set((rows as { t: string }[]).map((r) => r.t));
        await copy.query('SET FOREIGN_KEY_CHECKS=0');
        for (const t of tables) {
          if (!present.has(t)) continue;
          await copy.query(`DROP TABLE IF EXISTS \`${liveDb}\`.\`${t}\``);
          await copy.query(`CREATE TABLE \`${liveDb}\`.\`${t}\` LIKE \`${scratch}\`.\`${t}\``);
          await copy.query(`INSERT INTO \`${liveDb}\`.\`${t}\` SELECT * FROM \`${scratch}\`.\`${t}\``);
          restored.push(t);
        }
        await copy.query('SET FOREIGN_KEY_CHECKS=1');
      } finally {
        await copy.end();
      }

      if (restored.length === 0) {
        throw new BadRequestException('None of the selected modules had tables in this backup.');
      }
      return restored;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new InternalServerErrorException(`Restore failed: ${(err as Error).message}`);
    } finally {
      // Always drop the scratch DB, best-effort.
      try {
        const c = await createConnection(this.dbConfig());
        await c.query(`DROP DATABASE IF EXISTS \`${scratch}\``);
        await c.end();
      } catch {
        // ignore cleanup failures
      }
    }
  }
}
```

- [ ] **Step 3: Build to verify it compiles**

Run: `npx nest build`
Expected: no output (success).

- [ ] **Step 4: Write the e2e verification script**

Create `_tmp_restore_e2e.mjs` in the repo root:

```js
process.env.DATABASE_URL = 'mysql://root:123700@localhost:3306/sdlmp';
process.env.MYSQLDUMP_PATH = 'Z:\\missing\\mysqldump.exe'; // force JS dumper for the backup

import { createConnection } from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { BackupsService } from './dist/backups.service.js';
import { RestoreService } from './dist/restore.service.js';

const conn = await createConnection({ host: 'localhost', port: 3306, user: 'root', password: '123700', database: 'sdlmp' });
const count = async () => (await conn.query('SELECT COUNT(*) AS c FROM notifications'))[0][0].c;

// Password gate: stub Prisma so bcrypt.compare('pw', hash) succeeds.
const hash = await bcrypt.hash('pw', 10);
const prismaStub = { user: { findUnique: async () => ({ passwordHash: hash }) } };

const backups = new BackupsService();
const restore = new RestoreService(prismaStub, backups);

// 1) Snapshot current state.
const file = await backups.create();

// 2) Mutate: delete one notifications row.
const before = await count();
await conn.query('DELETE FROM notifications LIMIT 1');
const afterDelete = await count();

// 3) Restore just the notifications module.
const r = await restore.restore(file.filename, 'uid', 'pw', { full: false, modules: ['notifications'] });
const afterRestore = await count();

// 4) Assert no scratch DB remains.
const [scratch] = await conn.query("SHOW DATABASES LIKE 'sdlmp\\_restore\\_%'");

console.log('module restore result:', r);
console.log('notifications before/afterDelete/afterRestore:', before, afterDelete, afterRestore);
console.log('leftover scratch DBs:', scratch.length);

await backups.remove(file.filename);
await conn.end();
```

Note: `(await conn.query(...))[0]` is mysql2's rows array; `[0][0].c` reads the first row's aliased `COUNT(*)`.

- [ ] **Step 5: Run the e2e script**

Run: `node _tmp_restore_e2e.mjs`
Expected output (numbers depend on your data, but the pattern must hold):

```
module restore result: { scope: 'modules', tables: [ 'notifications' ] }
notifications before/afterDelete/afterRestore: N  N-1  N
leftover scratch DBs: 0
```

`afterRestore` must equal `before` (rows came back), and `leftover scratch DBs` must be `0`.

- [ ] **Step 6: Delete the temp script**

```bash
rm -f _tmp_restore_e2e.mjs
```

- [ ] **Step 7: Commit**

```bash
git add src/restore.service.ts src/backups.service.ts
git commit -m "feat(restore): full + per-module restore via mysql2 (scratch-db copy)"
```

---

### Task 3: Controller endpoints + DTO + module registration

**Files:**
- Create: `src/restore-backup.dto.ts`
- Modify: `src/backups.controller.ts`
- Modify: `src/backups.module.ts`

**Interfaces:**
- Consumes: `RestoreService.restore(...)` (Task 2), `BACKUP_DIR`, `sanitizeUploadedBackupName`, `BackupsService.get` (Task 2 / existing), `AuthenticatedUser` (`src/authenticated-user.type.ts`), `CurrentUser` decorator (`src/current-user.decorator.ts`).
- Produces: `POST /backups/upload`, `POST /backups/:filename/restore`.

- [ ] **Step 1: Create the DTO**

Create `src/restore-backup.dto.ts`:

```ts
import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class RestoreBackupDto {
  /** The requesting Super Admin's own login password — verified before any restore. */
  @IsString()
  @MinLength(1)
  password!: string;

  /** true = full database restore; false = restore only the given modules. */
  @IsBoolean()
  full!: boolean;

  /** Module ids to restore when `full` is false. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modules?: string[];
}
```

- [ ] **Step 2: Register RestoreService**

In `src/backups.module.ts`, import and add `RestoreService` to `providers`:

```ts
import { Module } from '@nestjs/common';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';
import { ResetService } from './reset.service';
import { RestoreService } from './restore.service';

@Module({
  controllers: [BackupsController],
  providers: [BackupsService, ResetService, RestoreService],
})
export class BackupsModule {}
```

- [ ] **Step 3: Add the endpoints to the controller**

In `src/backups.controller.ts`, update the imports and add the two endpoints. Replace the import block and constructor, and add the methods.

Add/extend imports at the top:

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './authenticated-user.type';
import { BackupsService, BACKUP_DIR, sanitizeUploadedBackupName, type BackupFile } from './backups.service';
import { ResetService } from './reset.service';
import { RestoreService } from './restore.service';
import { ResetModuleDto } from './reset-module.dto';
import { RestoreBackupDto } from './restore-backup.dto';
```

Add `RestoreService` to the constructor:

```ts
  constructor(
    private readonly backupsService: BackupsService,
    private readonly resetService: ResetService,
    private readonly restoreService: RestoreService,
  ) {}
```

Add these two methods inside the controller (e.g. after `create()`):

```ts
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: BACKUP_DIR,
        filename: (_req, file, cb) => cb(null, sanitizeUploadedBackupName(file.originalname)),
      }),
      limits: { fileSize: 200 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.originalname.toLowerCase().endsWith('.sql')) {
          cb(new BadRequestException('Only .sql backup files can be uploaded.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File): BackupFile {
    if (!file) throw new BadRequestException('No file uploaded.');
    return this.backupsService.get(file.filename);
  }

  @Post(':filename/restore')
  restore(
    @Param('filename') filename: string,
    @Body() dto: RestoreBackupDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.restoreService.restore(filename, user.id, dto.password, {
      full: dto.full,
      modules: dto.modules,
    });
  }
```

- [ ] **Step 4: Build to verify it compiles**

Run: `npx nest build`
Expected: no output (success). If `Express.Multer.File` is unresolved, confirm `@types/multer` is present in devDependencies (it is) — no code change needed.

- [ ] **Step 5: Commit**

```bash
git add src/restore-backup.dto.ts src/backups.controller.ts src/backups.module.ts
git commit -m "feat(restore): upload + restore endpoints on BackupsController"
```

---

### Task 4: Frontend — Upload backup button

**Files:**
- Modify: `admin-web/src/pages/SettingsPage.tsx` (inside `BackupsTab`)

**Interfaces:**
- Consumes: `POST /backups/upload` (Task 3), `api`, `AxiosError` (already imported), `BackupFile` type (already imported), `useRef` (already imported).

- [ ] **Step 1: Add the upload mutation and ref in BackupsTab**

In `admin-web/src/pages/SettingsPage.tsx`, inside `function BackupsTab()`, right after the `createBackup` mutation, add:

```tsx
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadBackup = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post<BackupFile>('/backups/upload', form);
    },
    onSuccess: () => {
      setError('');
      qc.invalidateQueries({ queryKey: ['backups'] });
    },
    onError: (err) => {
      const msg = (err as AxiosError<{ message?: string }>).response?.data?.message;
      setError(msg || 'Upload failed. Make sure the file is a .sql backup.');
    },
  });
```

- [ ] **Step 2: Add the Upload button + hidden input next to "Create backup"**

Find the header row containing the `Create backup` button (around the `<button … onClick={() => createBackup.mutate()}>` block) and add, immediately before that button, a sibling upload control so both sit together:

```tsx
        <input
          ref={fileInputRef}
          type="file"
          accept=".sql"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadBackup.mutate(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={uploadBackup.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploadBackup.isPending ? 'Uploading…' : 'Upload backup'}
        </button>
```

(If the two buttons need a wrapper for layout, wrap them in `<span style={{ display: 'inline-flex', gap: '0.5rem' }}>…</span>`.)

- [ ] **Step 3: Build to verify it compiles**

Run: `npm run build --prefix admin-web`
Expected: `✓ built` with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add admin-web/src/pages/SettingsPage.tsx
git commit -m "feat(restore): upload backup button in Settings"
```

---

### Task 5: Frontend — Restore dialog

**Files:**
- Modify: `admin-web/src/pages/SettingsPage.tsx` (inside `BackupsTab`)

**Interfaces:**
- Consumes: `POST /backups/:filename/restore` (Task 3), `GET /backups/reset/modules` (existing), `Dialog` (already imported), `ResetModuleInfo` type (already imported), `useQuery`/`useMutation` (already imported).

- [ ] **Step 1: Add restore state, modules query, and mutation in BackupsTab**

Inside `function BackupsTab()`, after the `uploadBackup` mutation, add:

```tsx
  const RESTORE_WORD = 'RESTORE';
  const [restoreTarget, setRestoreTarget] = useState<BackupFile | null>(null);
  const [restoreScope, setRestoreScope] = useState<'full' | 'modules'>('full');
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [restoreResult, setRestoreResult] = useState<string | null>(null);

  const restoreModulesQuery = useQuery({
    queryKey: ['reset-modules'],
    queryFn: async () => (await api.get<ResetModuleInfo[]>('/backups/reset/modules')).data,
  });

  const closeRestore = () => {
    setRestoreTarget(null);
    setRestoreScope('full');
    setSelectedModules([]);
    setRestorePassword('');
    setRestoreConfirm('');
  };

  const restoreMutation = useMutation({
    mutationFn: () =>
      api.post<{ scope: string; tables: string[] }>(
        `/backups/${encodeURIComponent(restoreTarget!.filename)}/restore`,
        { password: restorePassword, full: restoreScope === 'full', modules: selectedModules },
      ),
    onSuccess: (res) => {
      setError('');
      setRestoreResult(
        res.data.scope === 'full'
          ? 'Full database restored.'
          : `Restored: ${res.data.tables.join(', ')}`,
      );
      closeRestore();
      qc.invalidateQueries();
    },
    onError: (err) => {
      const status = (err as AxiosError)?.response?.status;
      const msg = (err as AxiosError<{ message?: string }>).response?.data?.message;
      setError(status === 401 ? 'Incorrect password — nothing was restored.' : msg || 'Restore failed.');
    },
  });

  const toggleModule = (id: string) =>
    setSelectedModules((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));

  const canRestore =
    restorePassword.length > 0 &&
    restoreConfirm === RESTORE_WORD &&
    (restoreScope === 'full' || selectedModules.length > 0) &&
    !restoreMutation.isPending;
```

- [ ] **Step 2: Show the restore success line**

Immediately after the existing `{error && <p className="error-text">{error}</p>}` line in `BackupsTab`, add:

```tsx
      {restoreResult && (
        <p style={{ color: 'var(--success)', fontSize: '0.9rem' }}>✓ {restoreResult}</p>
      )}
```

- [ ] **Step 3: Add a Restore button to each backup row**

In the row action `<span>` that holds the Download and Delete buttons, add a Restore button before Delete:

```tsx
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', color: 'var(--warning)', borderColor: 'var(--warning)' }}
                        onClick={() => {
                          setRestoreResult(null);
                          setRestoreTarget(b);
                        }}
                      >
                        Restore
                      </button>
```

- [ ] **Step 4: Add the restore dialog**

Just before the final closing `</div>` of `BackupsTab`'s returned JSX (after the backups `card` block), add:

```tsx
      <Dialog isOpen={!!restoreTarget} onClose={closeRestore} title="Restore from backup" maxWidth={480}>
        {restoreTarget && (
          <div>
            <div className="card" style={{ borderColor: 'var(--danger)', background: 'var(--warning-light)', marginBottom: '1rem' }}>
              <strong style={{ color: 'var(--danger)' }}>⚠ Destructive</strong>
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem' }}>
                Restoring overwrites live data and cannot be undone from the app. Consider creating a
                backup first. A <strong>full</strong> restore replaces the entire database including users —
                you may need to log in again. A <strong>module</strong> restore replaces those tables and can
                leave references from other modules inconsistent.
              </p>
            </div>

            <p style={{ marginTop: 0, fontSize: '0.85rem', fontFamily: 'monospace' }}>{restoreTarget.filename}</p>

            <div className="field">
              <label>What to restore</label>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
                <label style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center', fontWeight: 400 }}>
                  <input type="radio" name="restore-scope" checked={restoreScope === 'full'} onChange={() => setRestoreScope('full')} />
                  Full database
                </label>
                <label style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center', fontWeight: 400 }}>
                  <input type="radio" name="restore-scope" checked={restoreScope === 'modules'} onChange={() => setRestoreScope('modules')} />
                  Selected modules
                </label>
              </div>
            </div>

            {restoreScope === 'modules' && (
              <div className="field">
                <label>Modules</label>
                <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.25rem' }}>
                  {restoreModulesQuery.data?.map((m) => (
                    <label key={m.id} style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', fontWeight: 400, fontSize: '0.88rem' }}>
                      <input type="checkbox" checked={selectedModules.includes(m.id)} onChange={() => toggleModule(m.id)} />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="field">
              <label>Confirm with your login password</label>
              <input
                type="password"
                value={restorePassword}
                onChange={(e) => setRestorePassword(e.target.value)}
                placeholder="Your login password"
                autoComplete="current-password"
              />
            </div>

            <div className="field">
              <label>Type <strong>{RESTORE_WORD}</strong> to confirm</label>
              <input value={restoreConfirm} onChange={(e) => setRestoreConfirm(e.target.value)} placeholder={RESTORE_WORD} />
            </div>

            {error && <p className="error-text">{error}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="button" className="btn btn-danger" style={{ flex: 1 }} disabled={!canRestore} onClick={() => restoreMutation.mutate()}>
                {restoreMutation.isPending ? 'Restoring…' : 'Restore now'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={closeRestore}>Cancel</button>
            </div>
          </div>
        )}
      </Dialog>
```

- [ ] **Step 5: Build to verify it compiles**

Run: `npm run build --prefix admin-web`
Expected: `✓ built` with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add admin-web/src/pages/SettingsPage.tsx
git commit -m "feat(restore): per-backup restore dialog (full or modules)"
```

---

## Final verification (after all tasks)

- [ ] `npx jest --silent` — all specs pass (backups + restore).
- [ ] `npx nest build` — backend compiles.
- [ ] `npm run build --prefix admin-web` — frontend compiles.
- [ ] Manual: run the app locally, upload a downloaded `.sql`, confirm it appears in the list, then restore a single module and a full DB; verify data and that no `sdlmp_restore_*` database remains (`SHOW DATABASES LIKE 'sdlmp\\_restore\\_%'`).
