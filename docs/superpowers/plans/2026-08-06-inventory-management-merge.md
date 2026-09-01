# Merge Products into Inventory Management + Category CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the standalone "Products" admin page with a single "Inventory Management" page (Software tab + category tabs + Uncategorised tab, unchanged mechanics, new home), and add a "Manage categories" dialog so categories can be created/edited/activated/deactivated/deleted from the UI instead of only via direct API calls.

**Architecture:** Frontend-only change on top of an already-complete backend (`ItemCategoriesController`/`ItemCategoriesService`/DTOs support full CRUD today). Rename and relocate the existing `ProductsPage.tsx` component, delete the duplicate "Inventory Management" tab from Settings, and add one new dialog component that talks to the existing `/item-categories` endpoints. A separate, uncommitted-to-running migration renames the seeded "General" category to "Others".

**Tech Stack:** React 19, TanStack Query v5, react-router-dom v7, axios (via `../lib/api`), TypeScript, Vite. No new dependencies.

## Global Constraints

- No backend code changes — `ItemCategoriesController`, `ItemCategoriesService`, `CreateItemCategoryDto`, `UpdateItemCategoryDto` already implement everything this plan needs.
- `/inventory` keeps the exact role gate `/products` had: `SUPER_ADMIN`, `ADMIN_STAFF`.
- The "General" → "Others" rename migration must be **created** but **not applied** without the user's explicit go-ahead — dev (port 3002) and the pm2 production instance (port 3001) currently share one MySQL database.
- Follow existing conventions exactly: `.btn`/`.btn-primary`/`.btn-secondary` classes, `.field` wrapper for labeled inputs, the shared `Dialog` component (`isOpen`/`onClose`/`title`/`maxWidth` props), TanStack Query `useQuery`/`useMutation` + `invalidateQueries`, and the `apiErrorMessage` helper pattern already used in `admin-web/src/pages/InventoryPage.tsx`.
- No new automated tests are added — this codebase's `vitest` config (`admin-web/vitest.config.ts`) only runs `src/**/*.spec.ts` (pure-logic unit tests, `node` environment); there is no React component/page test harness. Verification is `npx tsc --noEmit` per task plus a manual browser-driven walkthrough in the final task, matching how UI work has been verified elsewhere in this codebase.

---

### Task 1: Move Products page to `/inventory` as "Inventory Management"

**Files:**
- Rename: `admin-web/src/pages/ProductsPage.tsx` → `admin-web/src/pages/InventoryManagementPage.tsx`
- Modify: `admin-web/src/App.tsx:20` (import), `admin-web/src/App.tsx:117-124` (route)
- Modify: `admin-web/src/layouts/AdminLayout.tsx:46` (`NAV_ICONS`), `admin-web/src/layouts/AdminLayout.tsx:66` (SUPER_ADMIN nav), `admin-web/src/layouts/AdminLayout.tsx:115` (ADMIN_STAFF nav)
- Modify: `admin-web/src/lib/notification-store.ts:37`

**Interfaces:**
- Produces: `InventoryManagementPage` (default-less named export) at `admin-web/src/pages/InventoryManagementPage.tsx`, mounted at route `/inventory`.

- [ ] **Step 1: Rename the file**

```bash
git mv admin-web/src/pages/ProductsPage.tsx admin-web/src/pages/InventoryManagementPage.tsx
```

- [ ] **Step 2: Rename the component and update its heading copy**

In `admin-web/src/pages/InventoryManagementPage.tsx`, change:

```tsx
export function ProductsPage() {
```

to:

```tsx
export function InventoryManagementPage() {
```

And change:

```tsx
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ marginBottom: '0.25rem' }}>Products</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          Licensable software systems and the hardware catalog, grouped by category.
        </p>
      </div>
```

to:

```tsx
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ marginBottom: '0.25rem' }}>Inventory Management</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          Licensable software systems and the hardware catalog, grouped by category.
        </p>
      </div>
```

- [ ] **Step 3: Update the route in `admin-web/src/App.tsx`**

Change the import (currently line 20):

```tsx
import { ProductsPage } from './pages/ProductsPage';
```

to:

```tsx
import { InventoryManagementPage } from './pages/InventoryManagementPage';
```

Change the route (currently lines 117-124):

```tsx
        <Route
          path="/products"
          element={
            <RequireAuth roles={['SUPER_ADMIN', 'ADMIN_STAFF']}>
              <ProductsPage />
            </RequireAuth>
          }
        />
```

to:

```tsx
        <Route
          path="/inventory"
          element={
            <RequireAuth roles={['SUPER_ADMIN', 'ADMIN_STAFF']}>
              <InventoryManagementPage />
            </RequireAuth>
          }
        />
```

- [ ] **Step 4: Update the nav in `admin-web/src/layouts/AdminLayout.tsx`**

Change (currently line 46):

```tsx
  '/products': Package,
```

to:

```tsx
  '/inventory': Package,
```

Change the SUPER_ADMIN entry (currently line 66):

```tsx
    { to: '/products', label: 'Products', indent: true },
```

to:

```tsx
    { to: '/inventory', label: 'Inventory Management', indent: true },
```

Change the ADMIN_STAFF entry (currently line 115) the same way:

```tsx
    { to: '/inventory', label: 'Inventory Management', indent: true },
```

- [ ] **Step 5: Update the notification route matcher in `admin-web/src/lib/notification-store.ts`**

Change (currently line 37):

```tsx
  { keywords: ['product'], routes: ['/products'], label: 'Product updated' },
```

to:

```tsx
  { keywords: ['product'], routes: ['/inventory'], label: 'Product updated' },
```

- [ ] **Step 6: Type-check and confirm no stale references**

```bash
cd admin-web && npx tsc --noEmit -p .
```

Expected: no errors.

```bash
grep -rn "ProductsPage\|'/products'\|\"/products\"" admin-web/src
```

Expected: no matches.

- [ ] **Step 7: Commit**

```bash
git add admin-web/src/pages/InventoryManagementPage.tsx admin-web/src/pages/ProductsPage.tsx admin-web/src/App.tsx admin-web/src/layouts/AdminLayout.tsx admin-web/src/lib/notification-store.ts
git commit -m "refactor(admin-web): move Products page to /inventory as Inventory Management"
```

---

### Task 2: Remove the duplicate "Inventory Management" tab from Settings

**Files:**
- Modify: `admin-web/src/pages/SettingsPage.tsx:9` (import), `:13` (type), `:20` (tabs array), `:744` (render)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this only removes now-redundant code (the same `InventoryPage` content moved to `/inventory` in Task 1's destination page, which already renders it per-category).

- [ ] **Step 1: Remove the `InventoryPage` import**

In `admin-web/src/pages/SettingsPage.tsx`, delete line 9:

```tsx
import { InventoryPage } from './InventoryPage';
```

- [ ] **Step 2: Drop `'inventory'` from the `SettingsTab` union**

Change (currently line 13):

```tsx
type SettingsTab = 'company' | 'agreement' | 'users' | 'kpis' | 'inventory' | 'database' | 'audit';
```

to:

```tsx
type SettingsTab = 'company' | 'agreement' | 'users' | 'kpis' | 'database' | 'audit';
```

- [ ] **Step 3: Remove the tab entry**

Delete (currently line 20):

```tsx
  { id: 'inventory', label: 'Inventory Management' },
```

from the `TABS` array (lines 15-23).

- [ ] **Step 4: Remove the render block**

Delete (currently line 744):

```tsx
      {tab === 'inventory' && <InventoryPage />}
```

- [ ] **Step 5: Type-check**

```bash
cd admin-web && npx tsc --noEmit -p .
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add admin-web/src/pages/SettingsPage.tsx
git commit -m "refactor(admin-web): remove the Inventory Management tab from Settings"
```

---

### Task 3: Add category management (dialog + wire-up)

**Files:**
- Create: `admin-web/src/components/ManageCategoriesDialog.tsx`
- Modify: `admin-web/src/pages/InventoryManagementPage.tsx` (add state, button, dialog mount)

**Interfaces:**
- Consumes: `ItemCategory`, `JobOrderType` from `admin-web/src/lib/types.ts` (already defined: `ItemCategory { id, name, jobOrderType: JobOrderType | null, sortOrder, active, _count?: { items: number } }`); `Dialog` from `admin-web/src/components/Dialog.tsx` (props `isOpen: boolean`, `onClose: () => void`, `title: string`, `maxWidth?: number`); `api` from `admin-web/src/lib/api.ts`.
- Produces: `ManageCategoriesDialog` component with props `{ isOpen: boolean; onClose: () => void }`, exported from `admin-web/src/components/ManageCategoriesDialog.tsx`.

- [ ] **Step 1: Create the dialog component**

Create `admin-web/src/components/ManageCategoriesDialog.tsx`:

```tsx
import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Dialog } from './Dialog';
import type { ItemCategory, JobOrderType } from '../lib/types';

const JOB_ORDER_TYPES: JobOrderType[] = ['SOFTWARE', 'CCTV', 'SIGNAGE'];

const JOB_ORDER_TYPE_LABEL: Record<JobOrderType, string> = {
  SOFTWARE: 'Software',
  CCTV: 'CCTV',
  SIGNAGE: 'Signage',
};

interface CategoryFormState {
  name: string;
  jobOrderType: JobOrderType | '';
}

const EMPTY_FORM: CategoryFormState = { name: '', jobOrderType: '' };

function apiErrorMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return msg ?? fallback;
}

export interface ManageCategoriesDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ManageCategoriesDialog({ isOpen, onClose }: ManageCategoriesDialogProps) {
  const qc = useQueryClient();
  const [addForm, setAddForm] = useState<CategoryFormState>(EMPTY_FORM);
  const [addError, setAddError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CategoryFormState>(EMPTY_FORM);
  const [editError, setEditError] = useState('');
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['item-categories', 'all'],
    queryFn: async () => (await api.get<ItemCategory[]>('/item-categories', { params: { all: true } })).data,
    enabled: isOpen,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['item-categories'] });

  const createMutation = useMutation({
    mutationFn: async () =>
      api.post('/item-categories', {
        name: addForm.name.trim(),
        jobOrderType: addForm.jobOrderType || null,
      }),
    onSuccess: () => {
      invalidate();
      setAddForm(EMPTY_FORM);
      setAddError('');
    },
    onError: (err) => setAddError(apiErrorMessage(err, 'Failed to create category.')),
  });

  const updateMutation = useMutation({
    mutationFn: async (vars: { id: string; data: Partial<{ name: string; jobOrderType: JobOrderType | null; active: boolean }> }) =>
      api.patch(`/item-categories/${vars.id}`, vars.data),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setEditError('');
    },
    onError: (err) => setEditError(apiErrorMessage(err, 'Failed to save category.')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/item-categories/${id}`),
    onSuccess: () => {
      invalidate();
      setDeleteError(null);
    },
    onError: (err, id) => setDeleteError({ id, message: apiErrorMessage(err, 'Failed to delete category.') }),
  });

  const submitAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim()) {
      setAddError('Name is required.');
      return;
    }
    createMutation.mutate();
  };

  const startEdit = (c: ItemCategory) => {
    setEditingId(c.id);
    setEditForm({ name: c.name, jobOrderType: c.jobOrderType ?? '' });
    setEditError('');
  };

  const submitEdit = (e: FormEvent) => {
    e.preventDefault();
    if (!editForm.name.trim()) {
      setEditError('Name is required.');
      return;
    }
    if (!editingId) return;
    updateMutation.mutate({
      id: editingId,
      data: { name: editForm.name.trim(), jobOrderType: editForm.jobOrderType || null },
    });
  };

  const toggleActive = (c: ItemCategory) => {
    setDeleteError(null);
    updateMutation.mutate({ id: c.id, data: { active: !c.active } });
  };

  const categories = categoriesQuery.data ?? [];

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Manage categories" maxWidth={640}>
      <form onSubmit={submitAdd} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
          <label htmlFor="cat-name">New category name</label>
          <input
            id="cat-name"
            value={addForm.name}
            onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Others"
          />
        </div>
        <div className="field" style={{ minWidth: 160, marginBottom: 0 }}>
          <label htmlFor="cat-type">Job order type</label>
          <select
            id="cat-type"
            value={addForm.jobOrderType}
            onChange={(e) => setAddForm((f) => ({ ...f, jobOrderType: e.target.value as JobOrderType | '' }))}
          >
            <option value="">All types</option>
            {JOB_ORDER_TYPES.map((t) => (
              <option key={t} value={t}>{JOB_ORDER_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Adding…' : '+ Add category'}
        </button>
      </form>
      {addError && <p className="error-text" style={{ marginTop: 0, marginBottom: '1rem' }}>{addError}</p>}

      {categoriesQuery.isLoading && <p>Loading categories…</p>}
      {categoriesQuery.isError && <p className="error-text">Failed to load categories.</p>}
      {!categoriesQuery.isLoading && categories.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No categories yet — add the first one above.</p>
      )}

      {categories.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Job order type</th>
                <th style={{ textAlign: 'center' }}>Items</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ width: 220 }}></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} style={{ opacity: c.active ? 1 : 0.55 }}>
                  {editingId === c.id ? (
                    <td colSpan={5} style={{ padding: '0.6rem 0' }}>
                      <form onSubmit={submitEdit} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div className="field" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
                          <label htmlFor={`edit-name-${c.id}`}>Name</label>
                          <input
                            id={`edit-name-${c.id}`}
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                            autoFocus
                          />
                        </div>
                        <div className="field" style={{ minWidth: 140, marginBottom: 0 }}>
                          <label htmlFor={`edit-type-${c.id}`}>Job order type</label>
                          <select
                            id={`edit-type-${c.id}`}
                            value={editForm.jobOrderType}
                            onChange={(e) => setEditForm((f) => ({ ...f, jobOrderType: e.target.value as JobOrderType | '' }))}
                          >
                            <option value="">All types</option>
                            {JOB_ORDER_TYPES.map((t) => (
                              <option key={t} value={t}>{JOB_ORDER_TYPE_LABEL[t]}</option>
                            ))}
                          </select>
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ fontSize: '0.8rem' }} disabled={updateMutation.isPending}>
                          Save
                        </button>
                        <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </form>
                      {editError && <p className="error-text" style={{ marginTop: '0.5rem' }}>{editError}</p>}
                    </td>
                  ) : (
                    <>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {c.jobOrderType ? JOB_ORDER_TYPE_LABEL[c.jobOrderType] : 'All types'}
                      </td>
                      <td style={{ textAlign: 'center' }}>{c._count?.items ?? 0}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${c.active ? 'badge-active' : 'badge-draft'}`} style={{ fontSize: '0.72rem' }}>
                          {c.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
                            disabled={updateMutation.isPending}
                            onClick={() => toggleActive(c)}
                          >
                            {c.active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
                            onClick={() => startEdit(c)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              setDeleteError(null);
                              if (confirm(`Delete "${c.name}"? This cannot be undone.`)) deleteMutation.mutate(c.id);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                        {deleteError?.id === c.id && (
                          <p className="error-text" style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', textAlign: 'right' }}>
                            {deleteError.message}
                          </p>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire the dialog into `InventoryManagementPage`**

In `admin-web/src/pages/InventoryManagementPage.tsx`, add the import near the top (after the other page/component imports):

```tsx
import { ManageCategoriesDialog } from '../components/ManageCategoriesDialog';
```

Inside `InventoryManagementPage`, add state next to the existing `const [tab, setTab] = useState<string>('software');`:

```tsx
  const [showCategories, setShowCategories] = useState(false);
```

Add a button at the end of the tab-bar row (the `<div style={{ display: 'flex', gap: '0.5rem', ... }}>` that renders `<TabButton>`s), right after the closing of the `{hasUncategorised && (...)}` block and before that div's closing `</div>`:

```tsx
        <button
          type="button"
          className="btn btn-secondary"
          style={{ fontSize: '0.85rem', marginLeft: 'auto' }}
          onClick={() => setShowCategories(true)}
        >
          ⚙ Manage categories
        </button>
```

Mount the dialog right after that tab-bar `</div>` closes, before `{tab === 'software' && <SoftwareTab />}`:

```tsx
      <ManageCategoriesDialog isOpen={showCategories} onClose={() => setShowCategories(false)} />
```

- [ ] **Step 3: Type-check**

```bash
cd admin-web && npx tsc --noEmit -p .
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add admin-web/src/components/ManageCategoriesDialog.tsx admin-web/src/pages/InventoryManagementPage.tsx
git commit -m "feat(admin-web): add a Manage categories dialog to Inventory Management"
```

---

### Task 4: Add the (unapplied) "General" → "Others" rename migration

**Files:**
- Create: `prisma/migrations/20260806000000_rename_general_category_to_others/migration.sql`

**Interfaces:**
- Consumes: nothing — this is a standalone data migration, no schema change (no edits to `prisma/schema.prisma`).
- Produces: nothing consumed by other tasks. Not applied by this task or any other step in this plan.

- [ ] **Step 1: Create the migration directory and file**

```bash
mkdir -p prisma/migrations/20260806000000_rename_general_category_to_others
```

Create `prisma/migrations/20260806000000_rename_general_category_to_others/migration.sql`:

```sql
-- Rename the seeded "General" category to "Others" to match current naming.
-- Items already assigned to it keep their category_id — this only changes
-- the display name.
UPDATE `item_categories` SET `name` = 'Others' WHERE `name` = 'General';
```

- [ ] **Step 2: Confirm the migration file is syntactically consistent with the existing migration style**

```bash
cat prisma/migrations/20260804010000_item_categories/migration.sql
cat prisma/migrations/20260806000000_rename_general_category_to_others/migration.sql
```

Expected: both use backtick-quoted MySQL identifiers and a trailing comment explaining intent, matching style.

- [ ] **Step 3: Commit (file only — do NOT run `prisma migrate deploy` or otherwise apply this migration)**

```bash
git add prisma/migrations/20260806000000_rename_general_category_to_others/migration.sql
git commit -m "chore(db): add migration renaming the General category to Others"
```

**Do not apply this migration in this task.** Dev (port 3002) and the pm2 production instance (port 3001) share one live MySQL database. Applying it is a separate, explicit step to take only after the user confirms — see Task 5.

---

### Task 5: Verify the full flow

**Files:** none (verification only — no commit).

**Interfaces:** none.

- [ ] **Step 1: Type-check the whole admin-web project one more time**

```bash
cd admin-web && npx tsc --noEmit -p .
```

Expected: no errors.

- [ ] **Step 2: Start (or reuse) the admin-web dev server**

Check whether a dev server is already running on port 5173 (it was during earlier work in this session):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
```

If it returns `200`, reuse it. Otherwise start one:

```bash
cd admin-web && npx vite --port 5173 &
```

- [ ] **Step 3: Drive the app with Playwright and confirm the merged page**

Using the same headless-Chromium driving approach established earlier in this session (Playwright, logging in with the seeded super admin `admin@sdlmp.local` / `ChangeMe123!` against `http://localhost:5173`), verify:

1. The left nav shows "Inventory Management" (not "Products") under the Dev section, and navigating to it loads `/inventory` with the Software tab, one tab per active category (POS Hardware, CCTV, General — not yet renamed), and Uncategorised if applicable.
2. Visiting `/products` directly redirects to `/` (the catch-all route).
3. Settings (`/settings`) no longer shows an "Inventory Management" tab in its tab row.
4. On `/inventory`, clicking "⚙ Manage categories" opens the dialog listing existing categories with their item counts.
5. Adding a new category (e.g. name "Test Category", job order type "All types") succeeds, appears in the table, and a corresponding tab appears on the page behind the dialog after closing it.
6. Editing that category's name persists and reflects immediately.
7. Clicking "Deactivate" on it removes its tab from the page behind the dialog (once closed) but keeps it listed (dimmed, "Inactive") in the dialog; "Activate" reverses this.
8. Deleting that empty test category succeeds and it disappears from both the dialog and the tab bar.
9. Attempting to delete a category that still holds items (e.g. "POS Hardware") shows the backend's inline error ("This category still holds N item(s)…") instead of failing silently.

Take screenshots at steps 1, 4, 5, and 9 for the record.

- [ ] **Step 4: Report the "General" → "Others" migration decision back to the user**

Ask whether to apply `prisma/migrations/20260806000000_rename_general_category_to_others` now (it will rename the live "General" category to "Others" in the shared dev/prod database). Only run this after explicit confirmation:

```bash
npx prisma migrate deploy
```

No commit for this task — it only verifies work already committed in Tasks 1-4.
