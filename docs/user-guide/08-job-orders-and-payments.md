# 08 — Job Orders & Payments

Routes:

| Route | Purpose |
|-------|---------|
| `/job-orders/software` | The Project Job Order **list** |
| `/job-orders/:jobId` | Editor opened from an installation job |
| `/job-orders/order/:joId` | Editor opened by job-order id (`new` for a standalone order) |

Roles: `SUPER_ADMIN`, `ADMIN_STAFF`, `LIAISON`, `SALES_STAFF` for the list;
the editor additionally admits `DESIGNER` (read-oriented access).

A **Job Order** is the commercial document behind a job: what was sold, what
materials went into it, what discount applied, and what has been paid.

---

## The list page

Heading: **Project Job Order**. Four document-type tabs, each with a live count:

| Tab | `docType` |
|-----|-----------|
| Job Order | `JOB_ORDER` |
| Quotation | `QUOTATION` |
| Sales Invoice | `INVOICE` |
| Official Receipt | `RECEIPT` |

Rows with no `docType` are treated as `JOB_ORDER`.

Columns: **JO No. · Client · Product · Type · Sale Price · Total · Status ·
Schedule · Created At**. Paginated. Empty tab shows
*"No {tab label} records match."*; load failure shows **"Failed to load job orders."**

### Creating

The primary button changes with the active tab:

| Active tab | Button | Behaviour |
|-----------|--------|-----------|
| Quotation | **Create Quotation** | Goes straight to `/job-orders/order/new?doc=QUOTATION` — no installation job needed |
| Any other | **Create Project JO** | Opens **Select Installation Job**, listing installations that don't already have a job order |

If every installation already has an order:
*"No pending installations available for new orders."*

**Expected:** a job that already owns a job order never appears in the picker
(one job ↔ at most one job order — `job_orders.job_id` is unique).

---

## The editor — a 3-step wizard

Step indicator at the top:

| # | Step | Enabled |
|---|------|---------|
| 1 | **Client & Project** | always |
| 2 | **Materials / Package** | always |
| 3 | **Payments** | only once the order has been **saved** (tooltip: *"Save the job order to record payments"*) |

If the order disappears while you are on step 3, the wizard falls back to step 2.

### Step 1 — Client & Project

- **Client** — pick an existing client, or create one inline (Business name,
  Owner name, Contact no., Email, Address, Client type, auto `CLT-` code).
  With no clients yet: **"No clients yet."**
- **Project Type** — one of:

  | Type | Extra fields | Labor incentive formula |
  |------|--------------|------------------------|
  | **System / Software** (`SOFTWARE`) | Software product (**required**) | none |
  | **CCTV Installation** (`CCTV`) | No. of Cameras, rate per camera | `cameraCount × cameraRate` |
  | **Signage Installation** (`SIGNAGE`) | Labor % (default 20) | `salePrice × laborPct / 100` |

- **Price** — the sale price of the system/service.
- **Schedule date** and **Installer (optional)** appear for standalone orders that
  will become jobs.
- **Remarks / Notes**.

Save is blocked (**Save** disabled) until a client is chosen, and — for `SOFTWARE`
type — a product is chosen.

### Step 2 — Materials / Hardware Package

A line-item table: **Item name · Description · Qty · Unit Price**, each row
optionally linked to an **inventory item** (which drives stock deduction — see
[09 — Inventory](09-inventory.md)).

Validation: `quantity` ≥ 1 (integer), `unitPrice` ≥ 0.

### Order Summary

| Line | Formula |
|------|---------|
| Materials Total | `Σ (quantity × unitPrice)` |
| Subtotal | `salePrice + materialsTotal` |
| Discount | `FIXED`: the entered amount · `PERCENTAGE`: `subtotal × discount / 100` (shown as `−₱x (n%)`) |
| **Grand Total** | `max(0, subtotal − discountAmount)` |
| Installer Labor | The labor incentive above — **internal cost, never part of the Grand Total** |

The backend recomputes the grand total with the *same* formula
(`job-order-pricing.util.ts`) so the printed invoice and the payment balance can
never disagree.

**Expected:** a discount larger than the subtotal clamps the Grand Total to ₱0,
never negative.

### Step 3 — Payments

Requires a saved order. See [Payments](#payments) below.

---

## Saving — `POST /api/job-orders` (upsert)

One endpoint handles create and update. It resolves the target as:

1. `dto.id` if supplied (required to re-save a standalone order) — unknown id →
   `404 Job order {id} not found`
2. else the existing order for `dto.jobId`
3. else create new

On save, inside **one transaction**:

1. All existing line items are deleted and recreated from the payload.
2. Inventory stock is reconciled for the completed-state change.
3. `ensureLaborEarning` guarantees the installer's labor earning for CCTV/Signage.

### Labor earning rules (CCTV / Signage only)

Triggered when the order's status is `FINALIZED`, `ON_GOING` or `COMPLETED`:

| Condition | Result |
|-----------|--------|
| No linked job, or the job has no installer | `400 Assign an installer to the job before finalizing.` |
| CCTV with labor ≤ 0 | `400 Enter the number of cameras and rate per camera before finalizing.` |
| Signage with labor ≤ 0 | `400 Signage labor is zero — check the total price and labor % before finalizing.` |
| An `INSTALLATION` earning already exists for that job | No new earning (idempotent) |
| Otherwise | Creates a `PENDING` `INSTALLATION` earning for the installer, amount = labor incentive |

Because this runs inside the upsert transaction, a validation failure **rolls the
whole save back** — nothing is persisted.

**Expected:** finalizing a CCTV order twice produces exactly **one** installation
earning. `SOFTWARE` orders never create a labor earning.

---

## Document types & printing

The same record prints under four letterheads. The **Move to…** dialog changes
`docType` (*"Moves this record to the selected tab on the Project JO list and sets
the print letterhead."*) and immediately re-saves the order.

| Doc type | Printed subtitle | PDF filename prefix |
|----------|------------------|--------------------|
| `JOB_ORDER` | Job Order / Delivery Receipt | `JO-` |
| `QUOTATION` | Quotation / Price Estimate | `QUO-` |
| `INVOICE` | Sales Invoice | `INV-` |
| `RECEIPT` | Official Receipt | `OR-` |

Filename pattern: `{prefix}-{first 8 chars of the order id, uppercased}.pdf`
(`NEW` when unsaved).

The print template pulls the letterhead from **Company Profile** (name, logo,
address, phone, email, website, TIN). The signature block reads
**"Conforme / Client Representative"** on a Quotation and
**"Received by / Client Representative"** on every other type.

**Expected:** the print output shows the same Grand Total as the screen and as
`GET /api/job-orders/:id/payments`.

---

## Converting a quotation

`POST /api/job-orders/:id/convert` — roles `SUPER_ADMIN`, `ADMIN_STAFF`,
`LIAISON`, `SALES_STAFF`.

Body: `scheduleDate` (required, ISO date) and `installerId` (optional).

Inside a transaction it creates the installation **Job**, links it to the order
(`jobId`) and forces `docType` back to `JOB_ORDER`.

| Case | Result |
|------|--------|
| Order already has a `jobId` | `400 This order is already linked to an installation job.` |
| Unknown order | `404 Job order {id} not found` |
| UI failure fallback | *"Could not convert this order. Try again."* |

**Expected:** after conversion the record moves from the Quotation tab to the
Job Order tab, and the new job appears on `/jobs`.

---

## Payments

| Operation | Endpoint | Roles |
|-----------|----------|-------|
| Record | `POST /api/job-orders/:id/payments` | `SUPER_ADMIN`, `ADMIN_STAFF`, `SALES_STAFF` |
| List + totals | `GET /api/job-orders/:id/payments` | `SUPER_ADMIN`, `ADMIN_STAFF`, `SALES_STAFF` |
| Void | `POST /api/payments/:id/void` | `SUPER_ADMIN`, `ADMIN_STAFF` |

### Recording

| Field | Required | Rules |
|-------|:--------:|-------|
| Amount | ✓ | Number ≥ **0.01** |
| Method | ✓ | `CASH` · `BANK_TRANSFER` · `GCASH` · `CHECK` |
| Reference no. | | Optional |
| Proof photo | | Optional image URL |
| Paid at | ✓ | ISO date string |

The recorder is stamped as `recordedById`.

> ⚠️ **Overpayment is not blocked.** There is no server check that
> `amount ≤ balance`; recording more than the balance produces a **negative
> balance**. Confirm the intended behaviour before filing this as a bug — it is
> listed in [20 — Known Gaps](20-known-gaps-and-troubleshooting.md).

### Totals returned by `GET /job-orders/:id/payments`

```
grandTotal = computeGrandTotal(salePrice, discount, discountType, items)
totalPaid  = Σ amount of NON-VOIDED payments
balance    = grandTotal − totalPaid
```

### Voiding

Roles `SUPER_ADMIN` / `ADMIN_STAFF`. The **Void** button is hidden for everyone else.

| Case | Result |
|------|--------|
| Reason shorter than 3 characters | `400` (validation) |
| Payment already voided | `400 Payment is already voided` |
| Success | Stamps `voidedAt`, `voidReason`, `voidedById`; the payment stays in the list but stops counting |

**Expected:** voiding a payment increases the balance by exactly that amount and
the row remains visible, marked as voided.

---

## Job order statuses

`DRAFT` → `FINALIZED` → `ON_GOING` → `COMPLETED`, plus `CANCELLED`.

The API does **not** enforce a transition order — any status can be set on save.
What each status *does*:

| Status | Effect |
|--------|--------|
| `DRAFT` | No labor earning, no stock deduction |
| `FINALIZED` | Triggers the labor earning (CCTV/Signage); **counts as revenue** in the financial summary and revenue trend |
| `ON_GOING` | Labor earning guaranteed |
| `COMPLETED` | Labor earning guaranteed **+ inventory stock is deducted** |
| `CANCELLED` | Excluded from the outstanding-balances report; reverting from `COMPLETED` restores stock |

**Expected:** moving a `COMPLETED` order back to `ON_GOING` restores the deducted
stock (a `JOB_ORDER_RESTORE` movement appears in the ledger).

---

## Expected behaviour summary

| # | Assertion |
|---|-----------|
| 8.1 | Step 3 is disabled until the order is saved |
| 8.2 | Grand Total = `max(0, salePrice + Σ(qty×price) − discount)` and matches the API, the print output and the payments panel |
| 8.3 | Percentage discount applies to the **subtotal** (sale price + materials), not the sale price alone |
| 8.4 | Installer Labor is displayed but never included in the Grand Total |
| 8.5 | Finalizing a CCTV/Signage order without an assigned installer returns the documented 400 and saves nothing |
| 8.6 | Repeated saves never duplicate the installation earning |
| 8.7 | Saving replaces line items wholesale — removed rows disappear |
| 8.8 | Converting a quotation twice returns `400 This order is already linked to an installation job.` |
| 8.9 | Voided payments are excluded from `totalPaid` |
| 8.10 | `Move to…` re-saves the record and moves it between list tabs |
| 8.11 | Only `SUPER_ADMIN` / `ADMIN_STAFF` see the Void action |
</content>
