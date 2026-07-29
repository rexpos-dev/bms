# 09 — Inventory

Location: **Settings → Inventory Management** (`/settings`, Super Admin) — the
same component is also reachable as a standalone page.

Inventory holds the materials/hardware catalogue used as job-order line items,
with a full stock ledger.

## Item fields

| Field | Required | Rules |
|-------|:--------:|-------|
| Name | ✓ | |
| Description | | Trimmed; empty → `NULL` |
| Barcode | | **Unique** when set. Trimmed; empty → `NULL`. Duplicate → `400 That barcode is already used by another item` |
| Unit Price | | `Decimal(12,2)`, default 0 |
| Initial Stock / Stock | | Integer, default 0 |
| Low-stock alert | | Integer threshold, default 0 |
| Sort order | | Integer, default 0 |
| Active | | Default `true` |

Listing order: `sortOrder` ascending, then `name` ascending.

By default the list returns **active items only**; pass the include-inactive flag
to see deactivated ones.

## Barcode lookup

`GET /api/inventory/barcode/:code` returns the matching **active** item.
No match → `404 No active inventory item with that barcode`.

**Expected:** an inactive item is never returned by barcode lookup, even with an
exact match.

## Manual stock adjustment

`POST /api/inventory/:id/adjust` (roles `SUPER_ADMIN`, `ADMIN_STAFF`).

- Positive `delta` adds stock, negative removes it.
- Adjusting below zero is **rejected**: `400 Stock cannot go below zero`.
- Records a `MANUAL_ADJUST` movement with the note *"Manual restock/adjust"* and
  the acting user.

## The stock ledger

Every stock change writes a `stock_movements` row:

| Column | Meaning |
|--------|---------|
| `delta` | Signed change (+ adds, − removes) |
| `balance` | Resulting `stockQty` **after** this movement |
| `reason` | `MANUAL_ADJUST` · `JOB_ORDER_DEDUCTION` · `JOB_ORDER_RESTORE` |
| `jobOrderId` | Set for job-order-driven movements |
| `userId` | Who caused it |
| `note` | Free text |

`GET /api/inventory/:id/movements` returns the newest **50** by default.
UI columns: **When · Change · Balance · Reason**. Empty:
**"No stock movements yet."**

## Automatic deduction from job orders

Consumption counts **only while the job order is `COMPLETED`**. One reconciliation
formula covers every case:

```
consumedOld = items on the saved order, if it WAS completed
consumedNew = items on the incoming order, if it IS completed
stockDelta  = −(consumedNew − consumedOld)   per inventory item
```

| Transition | Result |
|-----------|--------|
| Not completed → `COMPLETED` | Stock **deducted** (`JOB_ORDER_DEDUCTION`) |
| `COMPLETED` → any other status | Stock **restored** (`JOB_ORDER_RESTORE`) |
| Editing quantities on an already-completed order | Only the **net difference** moves |
| Line item with no `inventoryItemId` | Ignored entirely |

Two deliberate design choices QA must not report as bugs:

1. **Stock is allowed to go negative** through job-order completion — completing a
   job never blocks on insufficient stock; the shortfall simply shows as a
   negative/red balance. (Only *manual* adjustment refuses to go below zero.)
2. If an inventory item was deleted, the adjustment is silently skipped rather
   than erroring.

**Expected:** completing an order for 5 units of an item with 2 in stock succeeds
and leaves a balance of −3 with a `JOB_ORDER_DEDUCTION` movement.

## Low-stock indicator

Items whose `stockQty` is at or below `lowStockAlert` are flagged **Low stock**
in the list.

## Permissions

| Operation | Endpoint | Roles |
|-----------|----------|-------|
| List | `GET /api/inventory` | any authenticated user |
| Barcode lookup | `GET /api/inventory/barcode/:code` | any authenticated user |
| Movements | `GET /api/inventory/:id/movements` | any authenticated user |
| Create | `POST /api/inventory` | `SUPER_ADMIN`, `ADMIN_STAFF` |
| Update | `PATCH /api/inventory/:id` | `SUPER_ADMIN`, `ADMIN_STAFF` |
| Adjust stock | `POST /api/inventory/:id/adjust` | `SUPER_ADMIN`, `ADMIN_STAFF` |
| Delete | `DELETE /api/inventory/:id` | `SUPER_ADMIN`, `ADMIN_STAFF` |

Deleting an item sets `inventoryItemId` to `NULL` on any job-order line that
referenced it (`onDelete: SetNull`) and cascades its stock movements away.

**Expected:** deleting an item does **not** delete the job-order lines that used it —
those lines keep their name, quantity and price and simply lose the stock link.

## Expected behaviour summary

| # | Assertion |
|---|-----------|
| 9.1 | Duplicate barcode is rejected with the documented message |
| 9.2 | Manual adjustment below zero is rejected; job-order deduction below zero is allowed |
| 9.3 | Every stock change writes exactly one ledger row with the correct running `balance` |
| 9.4 | Completing → un-completing a job order nets to zero stock change |
| 9.5 | Editing quantities on a completed order moves only the difference |
| 9.6 | Barcode lookup ignores inactive items |
| 9.7 | Deleting an item nulls the link on existing job-order lines without deleting them |
</content>
