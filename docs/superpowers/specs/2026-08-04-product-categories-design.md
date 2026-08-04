# Products Page with User-Managed Category Tabs — Design

**Date:** 2026-08-04
**Status:** Draft, pending user review

## Problem

The Software Products page manages only `software_products` — licensable systems. Hardware
lives in `inventory_items`, surfaced only as a tab buried inside Settings, and it carries no
notion of what kind of work it belongs to. There is nowhere to keep a CCTV hardware catalog,
and the Job Order materials picker shows every inventory item regardless of whether the order
is a Software, CCTV, or Signage job.

## Goal

Rename the page to **Products** and give it tabs: a pinned Software tab backed by
`software_products`, plus one tab per user-defined item category backed by `inventory_items`.
Categories are created and ordered by the user from Settings, and each category declares which
job order type it belongs to, which drives the materials picker filter.

## Scope

- **In scope:** `admin-web` and the NestJS backend.
- **Out of scope:** mobile. `mobile/app/admin/products.tsx` continues to read
  `/software-products` and is not changed by this work.
- **Out of scope:** merging `software_products` into the category system; stock/valuation
  reporting per category.

## Decisions

1. **CCTV data lives in `inventory_items`, not a new table.** A second hardware catalog would
   not appear in the Job Order materials picker without duplicate wiring, and the same physical
   item would need entering twice.
2. **Categories are rows, not an enum.** The user adds, renames, reorders, and deactivates them
   from Settings; the Products tabs follow. An enum would require a deploy per category.
3. **The Software tab is pinned and separate.** `software_products` carries `licenseType` and
   `maintenanceFee` and is referenced by `License`; `inventory_items` carries `barcode` and
   `stockQty`. They are different things and are not merged.
4. **The materials picker filters by job order type.** Each category declares a
   `jobOrderType`; `null` means the category shows in every job order type.

## Data model

```prisma
/** A user-managed grouping of inventory items. Each becomes a tab on the Products page. */
model ItemCategory {
  id           String        @id @default(uuid())
  name         String        @unique
  jobOrderType JobOrderType? @map("job_order_type")
  sortOrder    Int           @default(0) @map("sort_order")
  active       Boolean       @default(true)

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  items InventoryItem[]

  @@map("item_categories")
}

model InventoryItem {
  // ...existing fields
  categoryId String?       @map("category_id")
  category   ItemCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
}
```

### Rationale

**`jobOrderType` is nullable, and null means "all types".** This replaces what would otherwise
be a hardcoded `GENERAL` value. Items usable across job types (UPS, network switch, cable)
live in a category with no job order type, and appear in every picker.

**`categoryId` is nullable with `onDelete: SetNull`.** Deleting or clearing a category must
never delete stock records. An uncategorised item is treated as belonging to no job order type
in particular and therefore shows in every picker — the same behaviour as today, which is the
safe direction to fail.

**Deletion is blocked while a category holds items.** `SetNull` protects the data, but silently
orphaning a dozen items on a misclick is still bad. The API rejects the delete with the item
count; the user deactivates instead, or reassigns the items first. Deactivating hides the tab
and removes the category from pickers without touching its items.

**`name` is unique** so tab labels are unambiguous.

## Seed and backfill

The ten existing `inventory_items` rows are all POS hardware. The migration creates three
categories and assigns them:

| Category | `jobOrderType` | `sortOrder` | Items |
|---|---|---|---|
| POS Hardware | `SOFTWARE` | 0 | Complete Set, Computer / PC, Cash Drawer, Thermal Printer 80mm, Thermal Printer 58mm, Barcode Scanner, Keyboard & Mouse, Monitor |
| CCTV | `CCTV` | 1 | (empty) |
| General | `null` | 2 | UPS / AVR, Network Switch |

No Signage category is seeded. `JobOrderType.SIGNAGE` remains selectable when creating one, and
adding it from Settings takes seconds — an empty tab shipped by default is clutter.

Backfill matches on the exact `name` values above. Any row not matched keeps `categoryId` null
and continues to appear in every picker, so an unexpected row cannot silently vanish.

## Backend

| File | Change |
|---|---|
| `prisma/schema.prisma` | `ItemCategory` model, `InventoryItem.categoryId` |
| `prisma/migrations/<ts>_item_categories/migration.sql` | table, column, FK, seed, backfill |
| `src/item-categories.controller.ts` | new — `GET`, `POST`, `PATCH /:id`, `DELETE /:id` |
| `src/item-categories.service.ts` | new — CRUD plus the in-use delete guard |
| `src/item-category.dto.ts` | new — `CreateItemCategoryDto`, `UpdateItemCategoryDto` |
| `src/item-categories.module.ts` | new — wired into `app.module.ts` |
| `src/create-inventory-item.dto.ts` | `categoryId?: string` |
| `src/update-inventory-item.dto.ts` | `categoryId?: string` |
| `src/inventory.service.ts` | include `category` in reads; pass `categoryId` through writes |

`GET /item-categories` returns active categories ordered by `sortOrder` then `name`, each with
an `itemCount`. `DELETE /:id` returns 409 with the item count when the category is non-empty.

Category writes carry `@Roles('SUPER_ADMIN', 'ADMIN_STAFF')`, matching the write endpoints on
`src/inventory.controller.ts` — categories govern the same catalog, so the same roles manage
them. Reads are left open to any authenticated user, as `GET /inventory` already is.

## Frontend

### Filtering happens client-side

The inventory list is ten rows and both consumers already fetch it whole. No `?category=`
query parameter is added; the Products tab and the materials picker filter the array they
already hold. This is revisited only if the catalog grows past a few hundred rows.

### Products page

`admin-web/src/pages/ProductsPage.tsx` gains a tab strip:

- **Software** — pinned first, the existing `software_products` table, unchanged.
- **One tab per active category** — renders `<InventoryPage categoryId={...} />`.
- **Uncategorised** — appears only when at least one item has `categoryId === null`, so
  unassigned rows are reachable rather than invisible.

The `<h1>` becomes `Products`. The route stays `/products`. Sidebar labels change from
"Software Products" to "Products" at `AdminLayout.tsx:66` and `:115`.

### InventoryPage gains a categoryId prop

`InventoryPage` (406 lines) already has the full item editor, stock adjustment, and movement
history. It takes a new optional prop rather than being duplicated:

| Caller | Behaviour |
|---|---|
| `<InventoryPage />` (Settings → Inventory Management) | all items, plus a Category column and a category select in the item form |
| `<InventoryPage categoryId="…" />` (Products tab) | filtered to that category; new items default to it |
| `<InventoryPage uncategorised />` (Products tab) | items with `categoryId === null` |

### Settings → Product Categories tab

A new tab beside Company Profile, Users & Roles, KPI Settings, and Inventory Management.
Each row edits name, job order type (Software / CCTV / Signage / *All types*), and sort order,
with an active toggle and a delete button. Delete surfaces the API's 409 message naming the
item count rather than failing silently.

### Job order materials picker

`JobOrderPage.tsx:949` filters the quick-add buttons:

```ts
const pickerItems = inventoryQuery.data?.filter(
  (item) => item.category?.jobOrderType == null || item.category.jobOrderType === joType,
);
```

Uncategorised items (`item.category` null) match the first clause and show everywhere.

The empty-state copy at `JobOrderPage.tsx:943-945` currently reads "No inventory items yet."
It must distinguish an empty catalog from a catalog with nothing matching this job order type,
otherwise the filter looks like a bug.

**Barcode scanning is deliberately not filtered.** `/inventory/barcode/:code` adds whatever was
scanned regardless of category. Scanning is an explicit act on a physical item; refusing it
because of a category mismatch would be a worse failure than allowing it.

## Error handling

- Deleting an in-use category returns 409; the Settings tab shows the message with the count.
- A deactivated category's tab disappears, but its items keep their `categoryId` and remain
  visible under Settings → Inventory Management.
- If every category is deactivated, the Products page still shows the pinned Software tab.
- `categoryId` pointing at a missing category cannot occur — the FK plus `SetNull` guarantees
  it resolves or is null.

## Testing

**Unit — `src/item-categories.service.spec.ts`:**
- `findAll` returns only active categories, ordered by `sortOrder` then `name`
- `findAll` reports `itemCount` per category
- `remove` throws `ConflictException` when the category has items
- `remove` deletes when the category is empty
- `update` accepts a null `jobOrderType` (the all-types case)

**Unit — `src/inventory.service.spec.ts`:**
- `create` persists `categoryId`
- `create` leaves `categoryId` null when omitted
- reads include the `category` relation

**Manual:**
- Settings → Product Categories: add "Signage" with type Signage, reorder it, deactivate it,
  confirm its Products tab appears and disappears
- Delete "CCTV" while empty (succeeds); add an item, delete again (409 with count)
- Products page: Software tab unchanged; a category tab lists only its items; a new item
  created from the CCTV tab lands in CCTV
- Job order, type Software: picker shows POS Hardware + General, not CCTV
- Job order, type CCTV: picker shows CCTV + General
- Job order, type Signage with no Signage category: picker shows General only, with copy that
  explains the filter rather than claiming the catalog is empty
- Scan a CCTV item's barcode into a Software job order — it is added

## Migration risk

The backfill matches on exact item names. Confirm the ten names in `inventory_items` still
match this document before applying; a renamed row simply stays uncategorised, which is
recoverable from Settings.
