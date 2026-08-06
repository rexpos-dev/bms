# Merge Products into Inventory Management + category CRUD — design

## Problem

The admin has two separate pages for the same underlying catalog:

- **Products** (top-level nav, `/products`) — a Software tab (licensing
  products) plus one tab per `ItemCategory`, each rendering the shared
  `InventoryPage` scoped to that category.
- **Settings → Inventory Management** — the same `InventoryPage`, unscoped,
  as one flat list with a Category column instead of tabs.

Categories (`POS Hardware`, `CCTV`, `General`) already exist with full CRUD
on the backend (`ItemCategoriesController` / `ItemCategoriesService`,
role-gated to `SUPER_ADMIN`/`ADMIN_STAFF`), but there is no admin UI to
create, edit, or delete a category — only a read-only dropdown when
assigning a category to an inventory item.

The owner wants one page instead of two, reachable from the main nav where
"Products" used to be, and a way to manage categories directly.

## Design

### 1. Navigation & routing

- Route `/products` becomes `/inventory`.
- `admin-web/src/pages/ProductsPage.tsx` is renamed to
  `admin-web/src/pages/InventoryManagementPage.tsx`; the exported component
  is renamed `ProductsPage` → `InventoryManagementPage`. Its heading changes
  from "Products" to "Inventory Management" (subtitle copy adjusted to
  match).
- `admin-web/src/App.tsx`: update the import and the `<Route path="/products" ...>` 
  to `/inventory`, same role guard (`SUPER_ADMIN`, `ADMIN_STAFF`).
- `admin-web/src/layouts/AdminLayout.tsx`: `NAV_ICONS['/products']` and both
  `NAV_ITEMS_BY_ROLE` entries (`SUPER_ADMIN`, `ADMIN_STAFF`) that point at
  `/products` with label `Products` become `/inventory` labeled
  `Inventory Management`. Same `Package` icon, same position in the nav.
- `admin-web/src/lib/notification-store.ts`: the `routes: ['/products']`
  entry becomes `['/inventory']`.
- `admin-web/src/pages/SettingsPage.tsx`: remove the `'inventory'` tab
  entirely — drop it from the `SettingsTab` union, the `TABS` array, the
  `{tab === 'inventory' && <InventoryPage />}` render block, and the now-unused
  `InventoryPage` import (it isn't used anywhere else in this file).

### 2. Page structure

Unchanged mechanics — this logic already exists in `ProductsPage.tsx` and
just moves under its new name:

- Fixed "Software" tab (CRUD for `SoftwareProduct`, untouched).
- One tab per active `ItemCategory`, rendering `InventoryPage` scoped to
  that category (existing `scope={{ categoryId }}` prop).
- "Uncategorised" tab, shown only when an item has `categoryId === null`.

### 3. Manage Categories dialog

New component `admin-web/src/components/ManageCategoriesDialog.tsx`,
opened from a "⚙ Manage categories" button placed next to the tab row on
`InventoryManagementPage`.

- Fetches `GET /item-categories?all=true` so inactive categories are visible
  and can be reactivated (the tab bar itself keeps using the default
  active-only fetch, unchanged).
- Table columns: Name, Job order type (badge: "All types" / Software / CCTV
  / Signage), Items (from `_count.items`), Active (toggle), Edit, Delete.
- "+ New category" form at the top: Name (required), Job order type (select:
  All types / Software / CCTV / Signage). New categories default to
  `active: true` and `sortOrder` appended after the current max (manual
  reordering is out of scope — the backend field exists if this is wanted
  later).
- Edit: an inline form per row with the same two fields, saved via
  `PATCH /item-categories/:id`.
- Active toggle: `PATCH /item-categories/:id` with `{ active }`.
- Delete: confirm, then `DELETE /item-categories/:id`. The backend already
  refuses (409) when the category still holds items, with the message "This
  category still holds N item(s). Move them to another category, or
  deactivate this one instead of deleting it." — the dialog surfaces that
  message inline instead of a generic failure.
- Every mutation invalidates the `['item-categories']` query so the tab bar
  on the page behind the dialog updates immediately.

### 4. Data: rename "General" to "Others"

A new Prisma migration renames the existing seeded `General` category to
`Others` (its already-assigned items keep their `categoryId`, so nothing
else changes):

```sql
UPDATE `item_categories` SET `name` = 'Others' WHERE `name` = 'General';
```

This is written as a migration to match how the original three categories
were seeded/backfilled in `20260804010000_item_categories`. Dev (port 3002)
and the pm2 production instance (port 3001) currently point at the same
MySQL database, so this migration will **not** be run automatically — it
will be applied only after explicit confirmation.

### 5. Software tab

Stays exactly as-is: hardcoded, backed by `SoftwareProduct` and the
licensing/activation system. Not part of the new category CRUD — "software"
in the original ask is already covered by this existing tab.

## Scope

Frontend only, plus one data-rename migration. No backend code changes —
`ItemCategoriesController`/`Service` and the DTOs already support everything
this needs.

- `admin-web/src/pages/ProductsPage.tsx` → renamed `InventoryManagementPage.tsx`
- `admin-web/src/components/ManageCategoriesDialog.tsx` (new)
- `admin-web/src/App.tsx`
- `admin-web/src/layouts/AdminLayout.tsx`
- `admin-web/src/lib/notification-store.ts`
- `admin-web/src/pages/SettingsPage.tsx`
- `prisma/migrations/<timestamp>_rename_general_to_others/migration.sql` (new; not auto-applied)
