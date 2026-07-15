# JO Document-Type Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tab the Project Job Order list by a persisted per-JO document type (Job Order / Quotation / Sales Invoice / Official Receipt), assigned via the existing dropdown on the JO detail page.

**Architecture:** New `DocType` enum + `doc_type` column on `job_orders` (default JOB_ORDER). The detail page's existing print-only `docType` state becomes persisted through the upsert DTO. The list page filters by an active `TabButton` tab.

**Tech Stack:** NestJS + Prisma (MySQL), React + TanStack Query.

**Spec:** `docs/superpowers/specs/2026-07-15-jo-doctype-tabs-design.md`

## Global Constraints

- Enum values exactly: `JOB_ORDER`, `QUOTATION`, `INVOICE`, `RECEIPT`; default `JOB_ORDER`.
- DB has pre-existing drift — do NOT run `prisma migrate dev` (it offers a destructive reset). Hand-apply via `prisma db execute` + `prisma migrate resolve --applied`.
- `prisma generate` requires stopping pm2 `beulah-backend` first (Windows DLL lock); kill any orphaned `node dist\main` process if EPERM persists.
- Tab labels exactly: "Job Order", "Quotation", "Sales Invoice", "Official Receipt". Default tab: Job Order.

---

### Task 1: Schema, migration, backend passthrough

**Files:**
- Modify: `prisma/schema.prisma` (enum next to `JobOrderType`; field in `model JobOrder` after `laborPct`)
- Create: `prisma/migrations/20260715090000_job_order_doc_type/migration.sql`
- Modify: `src/upsert-job-order.dto.ts`
- Modify: `src/job-orders.service.ts`

**Interfaces:**
- Produces: `DocType` enum in `@prisma/client`; `JobOrder.docType` persisted; DTO accepts optional `docType`. Task 2's frontend sends `docType` in the upsert payload and reads it from GET responses.

- [ ] **Step 1: Schema**

After the `JobOrderType` enum add:

```prisma
enum DocType {
  JOB_ORDER
  QUOTATION
  INVOICE
  RECEIPT
}
```

In `model JobOrder`, after the `laborPct` line add:

```prisma
  docType      DocType        @default(JOB_ORDER) @map("doc_type")
```

- [ ] **Step 2: Migration (hand-applied)**

Create `prisma/migrations/20260715090000_job_order_doc_type/migration.sql`:

```sql
-- AlterTable
ALTER TABLE `job_orders`
    ADD COLUMN `doc_type` ENUM('JOB_ORDER', 'QUOTATION', 'INVOICE', 'RECEIPT') NOT NULL DEFAULT 'JOB_ORDER';
```

Run:
1. `npx prisma db execute --file prisma/migrations/20260715090000_job_order_doc_type/migration.sql --schema prisma/schema.prisma` → "Script executed successfully."
2. `npx prisma migrate resolve --applied 20260715090000_job_order_doc_type` → "marked as applied"
3. `pm2 stop beulah-backend`, `npx prisma generate` (expect "Generated Prisma Client"), `pm2 start beulah-backend`

- [ ] **Step 3: DTO + service**

`src/upsert-job-order.dto.ts` — add `DocType` to the `@prisma/client` import and, after `laborPct`:

```ts
  @IsOptional()
  @IsEnum(DocType)
  docType?: DocType;
```

`src/job-orders.service.ts` — add `DocType` to the `@prisma/client` import and extend the `data` object (after `laborPct: dto.laborPct ?? null,`):

```ts
      docType: dto.docType ?? DocType.JOB_ORDER,
```

- [ ] **Step 4: Verify + commit**

Run: `npx tsc -p tsconfig.build.json --noEmit` then `npm test` — expect 0 errors, 41 tests pass.

```bash
git add prisma/schema.prisma prisma/migrations src/upsert-job-order.dto.ts src/job-orders.service.ts
git commit -m "feat: persist per-JO document type (docType)"
```

---

### Task 2: Frontend — persist from detail page, tabs on list page

**Files:**
- Modify: `admin-web/src/lib/types.ts`
- Modify: `admin-web/src/pages/JobOrderPage.tsx`
- Modify: `admin-web/src/pages/JobOrdersPage.tsx`

**Interfaces:**
- Consumes: `docType` on GET/POST `/job-orders` (Task 1).
- Produces: nothing further.

- [ ] **Step 1: types.ts**

Next to `JobOrderType` add:

```ts
export type DocumentType = 'JOB_ORDER' | 'QUOTATION' | 'INVOICE' | 'RECEIPT';
```

and in `JobOrder`, after `laborPct: string | null;`:

```ts
  docType: DocumentType;
```

- [ ] **Step 2: JobOrderPage — persist the dropdown**

- In the populate-from-saved `useEffect`, after `setLaborPct(...)` add: `setDocType(jo.docType ?? 'JOB_ORDER');`
- In the upsert payload, after `laborPct: ...` add: `docType,`
- The `docType` state is declared *below* its use in the mutation closure — it already is in scope at call time (function component body), no move needed. Verify `const [docType, setDocType] = useState<DocType>('JOB_ORDER');` (~line 490) stays as-is; the local `DocType` union is structurally identical to `DocumentType`.

- [ ] **Step 3: JobOrdersPage — tabs**

Add imports/state:

```ts
import type { Job, JobOrder, JobOrderType, DocumentType } from '../lib/types';

const DOC_TABS: { value: DocumentType; label: string }[] = [
  { value: 'JOB_ORDER', label: 'Job Order' },
  { value: 'QUOTATION', label: 'Quotation' },
  { value: 'INVOICE', label: 'Sales Invoice' },
  { value: 'RECEIPT', label: 'Official Receipt' },
];
```

Copy the `TabButton` component from `DownloadLeadsPage.tsx` (same file-local pattern used across pages). In `JobOrdersPage`:

```ts
  const [activeDocTab, setActiveDocTab] = useState<DocumentType>('JOB_ORDER');
  const allOrders = jobOrdersQuery.data ?? [];
  const filteredOrders = allOrders.filter((jo) => (jo.docType ?? 'JOB_ORDER') === activeDocTab);
  const pg = usePagination(filteredOrders);
```

(replacing `const pg = usePagination(jobOrdersQuery.data ?? []);`)

Render the tab strip between the header row and the `card` div:

```tsx
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {DOC_TABS.map((t) => (
          <TabButton
            key={t.value}
            label={t.label}
            active={activeDocTab === t.value}
            count={allOrders.filter((jo) => (jo.docType ?? 'JOB_ORDER') === t.value).length}
            onClick={() => setActiveDocTab(t.value)}
          />
        ))}
      </div>
```

Update the empty state inside the card: `{jobOrdersQuery.data && filteredOrders.length === 0 && <p>No {DOC_TABS.find((t) => t.value === activeDocTab)?.label.toLowerCase()} records yet.</p>}` and gate the table on `filteredOrders.length > 0` instead of `jobOrdersQuery.data.length > 0`.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc -b --noEmit` in `admin-web` — expect 0 errors.

```bash
git add admin-web/src/lib/types.ts admin-web/src/pages/JobOrderPage.tsx admin-web/src/pages/JobOrdersPage.tsx
git commit -m "feat(admin-web): document-type tabs on Project JO list; persist assignment"
```

---

### Task 3: Build, restart, manual verification

- [ ] **Step 1:** `npm run build` → Vite + Nest succeed. `pm2 restart beulah-backend --update-env` → online; `curl.exe -s http://localhost:3001/api/job-orders` → 401.
- [ ] **Step 2 (manual):** list shows 4 tabs with existing JOs under Job Order; open a JO, switch dropdown to Quotation, Save Draft, back to list → JO now under Quotation tab with updated counts.
