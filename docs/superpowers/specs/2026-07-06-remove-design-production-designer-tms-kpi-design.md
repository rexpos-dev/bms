# Remove Design + Production side; Designer scored by TMS Pro KPI only

**Date:** 2026-07-06
**Status:** Approved scope, pending spec review

## Goal

Strip the local "design + production" pipeline out of the SDLMP app. Designers
are scored **only** from the TMS Pro KPI export (the existing pull integration),
not from local design-job activity. Remove Design Projects, Design Job Orders,
the Machine Operator role, and the printer-machine / ink-tracking subsystem
entirely.

## Rationale

Design and production work is tracked in TMS Pro. The KPI export already gives us
each designer's total points, so the local `DesignJob` tracking, design-type job
orders, machine-operator role, and ink tracking are redundant. Removing them
simplifies the app and makes TMS Pro the single source of truth for designer
performance.

## Scope

### Kept
- Installation Jobs, **Software** Job Orders, Licenses
- Dev Projects (developer portal) — unaffected
- Earnings, Withdrawals, Clients, Products, Inventory, Notifications
- KPI + Incentives system
- **Designer role** — but scored solely from TMS Pro points
  (`syncDesignerKpis`) + admin manual entries

### Removed (complete)
1. **Design Projects** — `DesignJob`, `DesignJobUpdate` models; `design-jobs.*`
   module (service/controller/module + `create-design-job`, `assign-design-job`,
   `add-design-job-update` DTOs); `DesignJobsPage.tsx`; nav entry.
2. **Design Job Orders** — the `JobOrderType.DESIGN` concept. The entire
   `type` field **and** the `JobOrderType` enum are removed (only software job
   orders remain, so the type distinction is meaningless). Removes
   `/job-orders/design` route/page, `designJobId` link, `findByDesignJob`.
3. **Machine Operator role** — `UserRole.MACHINE_OPERATOR`; `operatorAutoKpis`;
   `MachineOperatorPage.tsx`; its KPI definitions; nav.
4. **Printer machines + ink tracking** — `PrinterMachine`, `MachineInk`,
   `InkUsageLog`, `InkRefillLog` models; `machines.*` module; `MachineAdminPage.tsx`;
   ink usage/refill logs; machine seeding in `seed.ts`.
5. **Designer auto-KPI** — `designerAutoKpis` (read local design jobs) removed.
   `syncDesignerKpis` (TMS pull) and manual entry remain the designer's basis.

## Detailed changes

### Backend (NestJS)
- **Delete modules:** `src/design-jobs.{service,controller,module}.ts`,
  `src/create-design-job.dto.ts`, `src/assign-design-job.dto.ts`,
  `src/add-design-job-update.dto.ts`, `src/machines.{service,controller}.ts`
  (and machines module wiring). Remove their imports/registration in
  `src/app.module.ts`.
- **`src/kpis.service.ts`:**
  - Remove `designerAutoKpis()` and `operatorAutoKpis()`.
  - Remove `MACHINE_OPERATOR` from `KPI_ROLES` and `DEFAULT_KPI_DEFS`.
  - In `getDashboard`, drop the `DESIGNER`/`MACHINE_OPERATOR` auto-KPI branches.
    Designer KPI values come from stored manual `KpiResult`s (populated by
    `syncDesignerKpis` from TMS, or admin manual entry).
  - Keep `syncDesignerKpis`, `getDesignerPoints`, `fetchTmsDesignerPoints`.
  - `getFinancialSummary`: revenue no longer includes design job orders; the
    `'Design / Other'` product fallback label can be simplified to `'Other'`.
- **`src/job-orders.service.ts` / `.controller.ts` / `upsert-job-order.dto.ts`:**
  Remove the design branch — `designJobId`, `findByDesignJob`, the DESIGN
  default type, and all `type` filtering. `findAll` returns all (software) job
  orders with no `type` param.
- **`src/reset.service.ts`:** Remove the `design-jobs` and `ink-logs` reset
  modules; update the `job-orders` module description to drop "design".
- **`prisma/seed.ts`:** Remove printer-machine seeding.

### Database / migration
A single new migration that:
- Reassigns any existing `MACHINE_OPERATOR` users to `ADMIN_STAFF` (guard so
  dropping the enum value cannot fail on FK/enum constraints in a populated DB).
- Drops tables: `design_jobs`, `design_job_updates`, `printer_machines`,
  `machine_inks`, `ink_usage_logs`, `ink_refill_logs`.
- Drops `job_orders.design_job_id` column.
- Removes the `type` column from `job_orders` and drops the `JobOrderType` enum.
- Removes `MACHINE_OPERATOR` from the `UserRole` enum.

The current dev DB is freshly created (no design/operator/machine data), so this
is low-risk locally; the reassignment guard protects any production DB.

### Admin-web (React)
- **Delete pages:** `DesignJobsPage.tsx`, `MachineAdminPage.tsx`,
  `MachineOperatorPage.tsx`, and the design-JO view/handling in the job-orders
  pages.
- **`AdminLayout.tsx`:** Remove the "Design" nav section (Design JO + Design
  Projects) across all role variants, plus machine/operator nav entries. Keep
  Dev Projects.
- **`App.tsx`:** Remove the deleted routes.
- **`lib/types.ts`:** Remove `MACHINE_OPERATOR`, `JobOrderType`/design types,
  design-job and machine/ink types.
- **Update:** `UsersPage` (role dropdown), `KpiSettingsPage` (role list),
  `DashboardPage`, `JobOrdersPage` / `JobOrderPage` (drop type tabs/filters).

### Mobile
- Update `mobile/src/types.ts` only — remove `MACHINE_OPERATOR` and any
  design/machine types so it stays consistent and compiles. No operator/design
  screens exist in the mobile app, so no deeper work needed now.

## Testing / verification
- Backend: `npx prisma migrate deploy` applies cleanly; `npm run build`
  (tsc/nest build) passes with no references to removed models/roles.
- Admin-web: `npm run build` (vite/tsc) passes; no dangling imports/routes.
- Manual smoke: log in as super admin; confirm the Design nav section and
  Machines/Operator pages are gone; software job orders still list/create;
  designer KPI dashboard renders from TMS/manual results; Dev Projects still work.
- Verify `syncDesignerKpis` still pulls and applies TMS points to a designer.

## Out of scope
- Deeper mobile refactor beyond the shared types file.
- Any change to the TMS Pro KPI export contract itself.
- Historical data migration/backfill (fresh DB locally; production guarded by
  the role-reassignment step).
