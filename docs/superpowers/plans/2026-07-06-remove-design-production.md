# Remove Design + Production Side Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the local Design Projects, Design Job Orders, Machine Operator role, and printer-machine/ink-tracking subsystems; score designers only from the TMS Pro KPI export.

**Architecture:** Delete the self-contained `design-jobs` and `machines` NestJS modules and their admin-web pages, strip design/operator/machine references out of the shared code (job-orders, kpis, reset, seed, layout, dashboard), then drop the corresponding Prisma models/enums via one migration. The designer dashboard keeps reading manual `KpiResult`s populated by the existing `syncDesignerKpis` TMS pull.

**Tech Stack:** NestJS + Prisma (MySQL) backend; React + Vite + TanStack Query admin-web; React Native mobile (types only).

## Global Constraints

- Designer role is **kept**; only its local auto-KPI is removed. Designer values come from manual `KpiResult`s (TMS sync / admin entry).
- Dev Projects (`DevProject`) subsystem is **kept** — never touch it.
- `JobOrderType` enum and the `job_orders.type` column are removed entirely (only software job orders remain).
- DB is freshly created locally (no design/operator/machine rows), but the migration must still reassign any `MACHINE_OPERATOR` users to `ADMIN_STAFF` before dropping the enum value, so a populated prod DB cannot fail.
- This is a deletion refactor: the "test" for each task is that the relevant build/typecheck passes and no dangling references remain. Run the exact verification command shown.
- Work happens on branch `remove-design-production` (already created). Commit after each task.

---

### Task 1: Remove the Design Jobs backend module

**Files:**
- Delete: `src/design-jobs.controller.ts`, `src/design-jobs.service.ts`, `src/design-jobs.module.ts`, `src/create-design-job.dto.ts`, `src/assign-design-job.dto.ts`, `src/add-design-job-update.dto.ts`
- Modify: `src/app.module.ts:14` (remove `DesignJobsModule` import), `src/app.module.ts:56` (remove from `imports`)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (module is self-contained; job-orders references to `designJob` are handled in Task 3, Prisma model dropped in Task 7).

- [ ] **Step 1: Delete the six files**

```bash
git rm src/design-jobs.controller.ts src/design-jobs.service.ts src/design-jobs.module.ts \
       src/create-design-job.dto.ts src/assign-design-job.dto.ts src/add-design-job-update.dto.ts
```

- [ ] **Step 2: Remove the import and registration in `src/app.module.ts`**

Delete line `import { DesignJobsModule } from './design-jobs.module';` and the `DesignJobsModule,` entry inside the `imports: [...]` array.

- [ ] **Step 3: Verify no remaining references to the deleted module**

Run: `grep -rn "DesignJobsModule\|DesignJobsService\|design-job" src --include=*.ts`
Expected: no matches (job-orders still references `designJob` the Prisma relation — that is removed in Task 3, so if that grep pattern catches `design-jobs.service` imports there should be none here).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor: remove design-jobs backend module"
```

---

### Task 2: Remove the Machines / ink-tracking backend module

**Files:**
- Delete: `src/machines.controller.ts`, `src/machines.service.ts`, `src/machines.module.ts`, `src/create-machine.dto.ts`, `src/ink-tracking.dto.ts`
- Modify: `src/app.module.ts:22` (remove `MachinesModule` import), `src/app.module.ts:55` (remove from `imports`), `src/audit-log.interceptor.ts:29` (remove the `machines: 'Machine',` mapping entry)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (Prisma models dropped in Task 7).

- [ ] **Step 1: Delete the five files**

```bash
git rm src/machines.controller.ts src/machines.service.ts src/machines.module.ts \
       src/create-machine.dto.ts src/ink-tracking.dto.ts
```

- [ ] **Step 2: Remove import + registration in `src/app.module.ts`**

Delete `import { MachinesModule } from './machines.module';` and the `MachinesModule,` entry in `imports`.

- [ ] **Step 3: Remove the audit-log entry**

In `src/audit-log.interceptor.ts`, delete the line `machines: 'Machine',` from the resource-label map.

- [ ] **Step 4: Verify no remaining references**

Run: `grep -rn "MachinesModule\|MachinesService\|machines.service\|ink-tracking" src --include=*.ts`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: remove machines/ink-tracking backend module"
```

---

### Task 3: Strip design + type out of Job Orders backend

**Files:**
- Modify: `src/job-orders.controller.ts`, `src/job-orders.service.ts`, `src/upsert-job-order.dto.ts`

**Interfaces:**
- Consumes: `UpsertJobOrderDto` (edited here).
- Produces: `JobOrdersService.findAll()` — takes **no** parameters now (the `type` param and the per-role design filter are removed); `findByDesignJob` is **removed**.

- [ ] **Step 1: Rewrite `src/upsert-job-order.dto.ts`**

Remove the `JobOrderType` import, the `type` field, and the `designJobId` field. The `@prisma/client` import becomes:

```typescript
import { DiscountType, JobOrderStatus } from '@prisma/client';
```

Delete this block entirely:

```typescript
  @IsEnum(JobOrderType)
  @IsOptional()
  type?: JobOrderType;

  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsString()
  designJobId?: string;
```

Replace it with just the `jobId` field (job orders are now always tied to a software job):

```typescript
  @IsOptional()
  @IsString()
  jobId?: string;
```

- [ ] **Step 2: Rewrite `src/job-orders.service.ts`**

Change the import line to (drop `UserRole` — no longer used once the per-role filter is gone):

```typescript
import { JobOrderStatus, Prisma } from '@prisma/client';
```

In `INCLUDE_FULL`, delete the line `designJob: { include: { designer: true, operator: true } },`.

In `upsert`, replace the `where`/`data`/`create` design handling so it keys only on `jobId` and drops `type`/`designJobId`:

```typescript
  async upsert(dto: UpsertJobOrderDto, user: AuthenticatedUser) {
    const existing = dto.jobId
      ? await this.prisma.jobOrder.findUnique({ where: { jobId: dto.jobId } })
      : null;

    const data = {
      clientId: dto.clientId,
      productId: dto.productId ?? null,
      salePrice: dto.salePrice,
      discount: dto.discount ?? 0,
      discountType: dto.discountType ?? 'FIXED',
      remarks: dto.remarks ?? null,
      status: dto.status ?? JobOrderStatus.DRAFT,
    };
```

In the `else` create branch, remove `designJobId: dto.designJobId,` (keep `jobId: dto.jobId`).

Delete the entire `findByDesignJob` method.

Rewrite `findAll` to take no parameters and drop the designer/operator design filters (the controller no longer grants DESIGNER/MACHINE_OPERATOR access, so the per-role branch is dead). If `AuthenticatedUser` is now unused in the file, remove its import too:

```typescript
  findAll() {
    return this.prisma.jobOrder.findMany({
      orderBy: { createdAt: 'desc' },
      include: INCLUDE_FULL,
    });
  }
```

- [ ] **Step 3: Rewrite `src/job-orders.controller.ts`**

Change the `@prisma/client` import to `import { UserRole } from '@prisma/client';` (drop `JobOrderType`). Remove `UserRole.MACHINE_OPERATOR` from every `@Roles(...)` list. Delete the entire `by-design-job/:designJobId` route/method. Update `findAll` to drop the `@Query('type')`:

```typescript
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.LIAISON, UserRole.SALES_STAFF)
  @Get()
  findAll() {
    return this.jobOrdersService.findAll();
  }
```

(`@CurrentUser`/`AuthenticatedUser` remain imported — `upsert` still uses them.)

- [ ] **Step 4: Verify the backend still typechecks against the (unchanged) client**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS (Prisma client still has `designJob`/`type`, so removing usage compiles; models are dropped in Task 7).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: remove design + type from job orders backend"
```

---

### Task 4: Remove designer/operator auto-KPI and MACHINE_OPERATOR from KPI code

**Files:**
- Modify: `src/kpis.service.ts`, `src/kpis.controller.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `KPI_ROLES` no longer contains `MACHINE_OPERATOR`; `getDashboard` no longer computes auto values for `DESIGNER`/`MACHINE_OPERATOR`.

- [ ] **Step 1: Edit `src/kpis.service.ts` — role list + defaults**

Remove `UserRole.MACHINE_OPERATOR` from the `KPI_ROLES` array. Delete the entire `[UserRole.MACHINE_OPERATOR]: [ ... ]` block from `DEFAULT_KPI_DEFS`.

- [ ] **Step 2: Edit `src/kpis.service.ts` — remove auto-KPI methods**

Delete the `designerAutoKpis(...)` method and the `operatorAutoKpis(...)` method in full.

In `getDashboard`, delete these two lines from the auto-value branch:

```typescript
    else if (role === UserRole.DESIGNER) autoValues = await this.designerAutoKpis(userId, start, end);
    else if (role === UserRole.MACHINE_OPERATOR) autoValues = await this.operatorAutoKpis(userId, start, end);
```

(Keep INSTALLER and DEVELOPER branches. Designer values now come only from stored manual `KpiResult`s.)

- [ ] **Step 3: Edit `src/kpis.service.ts` — financial summary label**

In `getFinancialSummary`, change the product fallback:

```typescript
      const name = o.product?.productName || 'Other';
```

- [ ] **Step 4: Edit `src/kpis.controller.ts`**

Remove `UserRole.MACHINE_OPERATOR` from every `@Roles(...)` list (lines ~133 and ~161). Leave `syncDesignerKpis` untouched.

- [ ] **Step 5: Verify**

Run: `grep -rn "MACHINE_OPERATOR\|designerAutoKpis\|operatorAutoKpis" src/kpis.service.ts src/kpis.controller.ts`
Expected: no matches. Then `npx tsc --noEmit -p tsconfig.json` → PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: drop designer/operator auto-KPI; TMS-only designer scoring"
```

---

### Task 5: Clean up reset service and seed

**Files:**
- Modify: `src/reset.service.ts`, `prisma/seed.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Edit `src/reset.service.ts`**

Delete the `design-jobs` module object (the `{ id: 'design-jobs', ... }` entry) and the `ink-logs` module object (`{ id: 'ink-logs', ... }`) from the `MODULES` array. In the `job-orders` module, change its `description` to `'All job orders and their line items.'` (drop "software and design").

- [ ] **Step 2: Edit `prisma/seed.ts`**

Remove the printer-machine seeding (the block that calls `prisma.printerMachine.create` / logs `Created machine: ...`). Keep the super-admin seeding.

- [ ] **Step 3: Verify**

Run: `grep -rn "designJob\|printerMachine\|inkUsageLog\|inkRefillLog\|ink-logs" src/reset.service.ts prisma/seed.ts`
Expected: no matches. Then `npx tsc --noEmit -p tsconfig.json` → PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor: remove design-jobs/ink-logs reset modules and machine seeding"
```

---

### Task 6: Update the Prisma schema and migrate

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_remove_design_production/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: a Prisma client without `DesignJob`, `DesignJobUpdate`, `PrinterMachine`, `MachineInk`, `InkUsageLog`, `InkRefillLog`, `JobOrderType`, `JobOrder.type`, `JobOrder.designJob(Id)`, and without `MACHINE_OPERATOR`.

- [ ] **Step 1: Stop any running dev server**

The Prisma query-engine DLL is locked while the backend runs (causes EPERM on `prisma generate`). Stop `npm run start:dev` / the backend process before proceeding.

- [ ] **Step 2: Edit `prisma/schema.prisma`**

Remove, in full:
- `model DesignJob`, `model DesignJobUpdate`
- `model PrinterMachine`, `model MachineInk`, `model InkUsageLog`, `model InkRefillLog`
- `enum DesignJobStatus`, `enum PrinterMachineModel`, `enum InkColor`, `enum JobOrderType`
- `MACHINE_OPERATOR` from `enum UserRole`

In `model JobOrder`: remove the `type JobOrderType ...` field, the `designJobId` field, and the `designJob` relation field (and its `@@` unique on designJobId if present).

In `model User`: remove the relation fields that point at the deleted models — the `DesignJobCreator`, `DesignJobOperator`, and `DesignJobUpdate` author relations (search the User model for `DesignJob`).

In `model Job` / `model JobOrder`: leave the `job`/`jobOrder` relation intact.

- [ ] **Step 3: Generate the migration SQL (non-interactive) with the operator reassignment guard**

Create the migration folder and generate the diff, then prepend the guard:

```bash
TS=$(date +%Y%m%d%H%M%S); DIR="prisma/migrations/${TS}_remove_design_production"; mkdir -p "$DIR"
{ echo "-- Reassign any machine operators before dropping the enum value."; \
  echo "UPDATE \`users\` SET \`role\` = 'ADMIN_STAFF' WHERE \`role\` = 'MACHINE_OPERATOR';"; \
  echo ""; \
  npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script; \
} > "$DIR/migration.sql"
```

- [ ] **Step 4: Inspect the generated SQL**

Run: `cat prisma/migrations/*_remove_design_production/migration.sql`
Expected: the reassignment UPDATE first, then DROP TABLE for the six tables, ALTER TABLE `job_orders` dropping `type` and `design_job_id`, and ALTER on the `users` role enum removing MACHINE_OPERATOR. Confirm no `DROP TABLE` for `dev_projects`, `job_orders`, `jobs`, or `users`.

- [ ] **Step 5: Apply the migration and regenerate the client**

Run:
```bash
npx prisma migrate deploy
npx prisma generate
```
Expected: "All migrations have been successfully applied." and a successful client generation (no EPERM — dev server is stopped).

- [ ] **Step 6: Verify the backend now compiles against the new client**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS with zero errors (all removed-model usage was stripped in Tasks 1–5).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: drop design/machine models, JobOrderType, MACHINE_OPERATOR (migration)"
```

---

### Task 7: Remove admin-web routes, nav, and shared types

**Files:**
- Modify: `admin-web/src/App.tsx`, `admin-web/src/layouts/AdminLayout.tsx`, `admin-web/src/lib/types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: no `/design-jobs`, `/ink-tracking`, or `/job-orders/design` routes; no `MACHINE_OPERATOR` in role unions; no `DesignJob`/`JobOrderType`/machine/ink types.

- [ ] **Step 1: Edit `admin-web/src/App.tsx`**

Remove imports of `DesignJobsPage` and `MachineOperatorPage`. Delete the `/ink-tracking`, `/design-jobs`, and `/job-orders/design` `<Route>` blocks. Remove `'MACHINE_OPERATOR'` from every `RequireAuth roles={[...]}` array (top-level and per-route).

- [ ] **Step 2: Edit `admin-web/src/layouts/AdminLayout.tsx`**

Delete the `'/design-jobs'` and `'/ink-tracking'` icon-map entries. Remove the entire `MACHINE_OPERATOR: [ ... ]` nav array and its `MACHINE_OPERATOR: 'Operator'` label entry. In every other role's nav array, delete the `{ to: '/design-jobs', label: 'Design Projects', ... }` and `{ to: '/job-orders/design', label: 'Design JO', ... }` entries, and drop now-empty `{ section: true, label: 'Design' }` headers.

- [ ] **Step 3: Edit `admin-web/src/lib/types.ts`**

Remove `MACHINE_OPERATOR` from the `UserRole` union. Remove the `JobOrderType` type, the `DesignJob`/`DesignJobStatus`/`DesignJobUpdate` types, and any `PrinterMachine`/`MachineInk`/ink types. Remove `type`/`designJobId`/`designJob` fields from the `JobOrder` type.

- [ ] **Step 4: Verify (expect failures pointing to pages fixed in Task 8)**

Run: `grep -rn "MACHINE_OPERATOR\|/design-jobs\|/ink-tracking\|JobOrderType" admin-web/src/App.tsx admin-web/src/layouts/AdminLayout.tsx admin-web/src/lib/types.ts`
Expected: no matches in these three files.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: remove design/operator routes, nav, and types from admin-web"
```

---

### Task 8: Delete admin-web pages and fix consumers

**Files:**
- Delete: `admin-web/src/pages/DesignJobsPage.tsx`, `admin-web/src/pages/MachineOperatorPage.tsx`, `admin-web/src/pages/MachineAdminPage.tsx`
- Modify: `admin-web/src/pages/JobOrdersPage.tsx`, `admin-web/src/pages/JobOrderPage.tsx`, `admin-web/src/pages/DashboardPage.tsx`, `admin-web/src/pages/SettingsPage.tsx`, `admin-web/src/pages/KpiSettingsPage.tsx`, `admin-web/src/pages/UsersPage.tsx`

**Interfaces:**
- Consumes: the trimmed `types.ts` and routes from Task 7.
- Produces: an admin-web that builds with software-only job orders.

- [ ] **Step 1: Delete the three pages**

```bash
git rm admin-web/src/pages/DesignJobsPage.tsx admin-web/src/pages/MachineOperatorPage.tsx admin-web/src/pages/MachineAdminPage.tsx
```

- [ ] **Step 2: Fix `admin-web/src/pages/SettingsPage.tsx`**

Remove `import { MachineAdminPage } from './MachineAdminPage';`, the `{ tab === 'machines' && <MachineAdminPage /> }` render, and the `'machines'` tab from the tab list/definitions.

- [ ] **Step 3: Fix `admin-web/src/pages/JobOrdersPage.tsx` to software-only**

Remove the `type: JobOrderType` prop and the `DesignJob`/`JobOrderType` imports. The page now always lists software job orders: delete `designJobsQuery`, the `readOnly = user?.role === 'MACHINE_OPERATOR'` line (set `readOnly = false` or remove), the design-job selection UI, the `isSoftware` conditional columns (`{!isSoftware && <td>{jo.designJob?.title ...}</td>}`), and change navigation `navigate(\`/job-orders/${jo.jobId}\`)` (drop `designJobId`/`?type=`).

- [ ] **Step 4: Fix `admin-web/src/pages/JobOrderPage.tsx`**

Remove the `DesignJob` import. Remove the `readOnly = user?.role === 'MACHINE_OPERATOR'` operator logic. Replace the endpoint selection so it always uses the software path: `const endpoint = \`/job-orders/by-job/${jobId}\`;` and delete the `isSoftware ? ... : \`/job-orders/by-design-job/${jobId}\`` branch and any design-job-only fields.

- [ ] **Step 5: Fix `admin-web/src/pages/DashboardPage.tsx`**

Remove the `DesignJob` import. Delete the `MachineOperatorDashboard` function and its `{user?.role === 'MACHINE_OPERATOR' && <MachineOperatorDashboard />}` render. Delete the `designJs` query and the `role === 'DESIGNER'`/`'MACHINE_OPERATOR'` design-job stat blocks (the `Active design jobs` / `Assigned operations` pushes and `link = '/design-jobs'`). Remove `MACHINE_OPERATOR` from the `SUPPORTED` roles array, the `MACHINE_OPERATOR: 'Machine Operator'` label, and the `MACHINE_OPERATOR: 'Monitor your...'` description map.

- [ ] **Step 6: Fix `admin-web/src/pages/KpiSettingsPage.tsx`**

Remove `'MACHINE_OPERATOR'` from the local `KPI_ROLES` array and the `MACHINE_OPERATOR: 'Machine Operator'` label entry.

- [ ] **Step 7: Fix `admin-web/src/pages/UsersPage.tsx`**

Remove `MACHINE_OPERATOR` from the role dropdown options / role label map (search the file for `MACHINE_OPERATOR`).

- [ ] **Step 8: Verify the admin-web builds**

Run: `cd admin-web && npm run build`
Expected: build succeeds with no TypeScript errors and no unresolved imports.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "refactor: delete design/machine admin pages; software-only job orders"
```

---

### Task 9: Update mobile types

**Files:**
- Modify: `mobile/src/types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a `UserRole` union without `MACHINE_OPERATOR`.

- [ ] **Step 1: Edit `mobile/src/types.ts`**

Remove the `| 'MACHINE_OPERATOR'` member from the `UserRole` union (line ~6) and any design/machine-specific types if present.

- [ ] **Step 2: Verify**

Run: `grep -rn "MACHINE_OPERATOR" mobile/src`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "refactor: drop MACHINE_OPERATOR from mobile types"
```

---

### Task 10: Full-system verification

**Files:** none (verification only).

- [ ] **Step 1: Backend build**

Run: `npm run build`
Expected: nest build succeeds, zero errors.

- [ ] **Step 2: Repo-wide dangling-reference sweep**

Run: `grep -rn "MACHINE_OPERATOR\|DesignJob\|designJob\|PrinterMachine\|MachineInk\|InkUsageLog\|JobOrderType\|/design-jobs\|/ink-tracking" src admin-web/src mobile/src --include=*.ts --include=*.tsx`
Expected: no matches (ignore matches inside `prisma/migrations/*` historical SQL, which are intentionally frozen).

- [ ] **Step 3: Start backend + admin-web and smoke test**

Start the backend and admin-web dev servers. Log in as `admin@sdlmp.local`. Confirm:
- No "Design" nav section, no Design JO / Design Projects / Ink Tracking / Operator entries; Dev Projects still present.
- Settings has no "Machines" tab.
- Software Job Orders list and create still work.
- The Users role dropdown has no Machine Operator option.
- A DESIGNER user's KPI dashboard renders (values from manual/TMS results, no crash).

- [ ] **Step 4: Verify TMS designer sync still works**

Trigger `syncDesignerKpis` (the existing KPI sync action for a chosen month) and confirm designer points are pulled and applied without error.

- [ ] **Step 5: Final commit (if any verification fixups were needed)**

```bash
git add -A && git commit -m "chore: verification fixups for design/production removal"
```

---

## Self-Review Notes

- **Spec coverage:** Design Projects (T1), Design JO + JobOrderType (T3, T6), Machine Operator role + KPI (T2, T4, T6), printer machines + ink (T2, T6), designer auto-KPI removal / TMS-only (T4), reset+seed (T5), admin-web (T7, T8), mobile (T9), migration with operator-reassignment guard (T6). All spec sections mapped.
- **Ordering:** code references removed (T1–T5) before the schema/client change (T6) so each backend task typechecks against the still-present client; admin-web types (T7) before page fixes (T8).
- **Risk:** `prisma generate` needs the dev server stopped (EPERM). Called out in T6 Step 1.
