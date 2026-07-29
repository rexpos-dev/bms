# 13 — Financial Reports & Analytics

Route: `/financial-reports` · Roles: `SUPER_ADMIN`, `ADMIN_STAFF`, `SALES_STAFF`

All four endpoints live under `/api/reports/financial` and share the same role
guard applied at the controller level.

Everything here is driven by **payments**, not by invoices — a job order only
appears once money is expected or received.

## Collections summary

`GET /api/reports/financial/collections?from=&to=`

| Field | Definition |
|-------|-----------|
| `totalCollected` | Σ amount of **non-voided** payments inside the date filter |
| `byMethod[]` | `{ method, total, count }` per payment method, filtered |
| `byMonth[]` | **Last 6 calendar months including the current one**, oldest first, `YYYY-MM` keys — **ignores the from/to filter** |
| `recentPayments[]` | The **10** newest non-voided payments inside the filter, with `clientName` |

Date filtering:

- `from` → `paidAt >= new Date(from)`
- `to` → `paidAt <= new Date(to + 'T23:59:59.999Z')` — i.e. the **whole** end day,
  interpreted in **UTC**

**Expected:** a payment made at 23:30 local time on the `to` date is included or
excluded consistently with the UTC boundary — verify against your timezone before
reporting an off-by-one-day bug.

**Expected:** the 6-month trend bars stay the same when you narrow the from/to
range; only the totals, method breakdown and recent list change.

## Outstanding balances

`GET /api/reports/financial/outstanding`

Walks every job order **except `CANCELLED`** and returns those with a balance:

```
grandTotal = salePrice + Σ(qty × unitPrice) − discount   (clamped at 0)
totalPaid  = Σ non-voided payments
balance    = grandTotal − totalPaid
```

Rows with `balance <= 0.005` are dropped (a floating-point tolerance, so a fully
paid order never lingers because of rounding).

Columns: **Job Order · Client · Grand Total · Paid · Balance · Last Payment**.
Empty: **"No payments recorded."**

**Expected:** `DRAFT` orders **do** appear in outstanding (only `CANCELLED` is
excluded). A fully paid order disappears from the list.

## Client payment history

`GET /api/reports/financial/client/:clientId`

Returns `{ clientId, clientName, payments[] }` — all non-voided payments across
**all** of that client's job orders, newest first, each carrying its `jobOrderId`.
An unknown client id returns `clientName: "Unknown"` with an empty list rather
than a 404.

Empty state: **"No payments for this client."**

## CSV export

`GET /api/reports/financial/export`

| Export | Columns |
|--------|---------|
| Collections | `method, total, count` |
| Outstanding | `jobOrderId, client, grandTotal, totalPaid, balance, lastPaymentAt` (empty string when never paid) |

**Expected:** the CSV row count matches the on-screen table row count for the same
filter.

## The page

Heading **Financial Reports**, with a date-range filter, the summary cards, the
method breakdown, the 6-month trend, the outstanding table, the client history
drill-down, and a **Share** action.

---

## Analytics page (Super Admin)

Route: `/analytics`. Covered in [11 — KPI & Incentives](11-kpi-and-incentives.md),
but the revenue figures deserve a separate call-out here because they are computed
differently from the financial reports:

| Screen | Revenue basis |
|--------|--------------|
| **Financial Reports** | Actual **payments received** (non-voided) |
| **Analytics / Dashboard** | Σ `salePrice` of **`FINALIZED`** job orders — *not* payments, and **excluding** `ON_GOING` and `COMPLETED` orders |

These two numbers are expected to differ. What QA should confirm with the product
owner is whether the Analytics figure should really exclude `ON_GOING`/`COMPLETED`
orders — see [20 — Known Gaps](20-known-gaps-and-troubleshooting.md).

Also note the Analytics revenue uses `salePrice` only — it **ignores materials and
discounts**, whereas the financial reports use the full grand total.

## Expected behaviour summary

| # | Assertion |
|---|-----------|
| 13.1 | Voided payments are excluded from every figure on this page |
| 13.2 | The `to` filter includes the whole end day |
| 13.3 | The 6-month trend is unaffected by the from/to filter |
| 13.4 | `recentPayments` is capped at 10 |
| 13.5 | `CANCELLED` job orders never appear in outstanding balances |
| 13.6 | An order paid to the cent (balance ≤ ₱0.005) drops off the outstanding list |
| 13.7 | CSV export matches the on-screen data for the same filter |
| 13.8 | `SALES_STAFF` can open the page; `LIAISON`, `INSTALLER`, `DEVELOPER`, `DESIGNER` get 403 from the API |
</content>
