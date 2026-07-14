# Job Order Payments & Financial Reports — Design

**Date:** 2026-07-14
**Status:** Approved (pending spec review)
**Area:** `src/` (NestJS backend), `admin-web/`, `mobile/`

## Problem

Job Orders (`JobOrder`) currently have a `salePrice` and a flat `discount`/`discountType`
but **no payment tracking of any kind** — no downpayments, no partial/installment
payments, no balance, no receipts. There is also no financial reporting anywhere in the
system. The owner wants to record payments against a Job Order (multiple
payments/installments, not just one downpayment), and a new "Financial Reports" menu to
see collections, outstanding balances, and per-client payment history.

## Scope

- New `Payment` model, one-to-many off `JobOrder`: amount, method, optional reference
  number, optional proof photo, who recorded it, void (not edit) after the fact.
- Balance is **computed on demand**, not stored: `grandTotal (salePrice adjusted for
  discount, plus line items) − SUM(active payments)`. Voided payments are excluded from
  the sum but kept in history for audit.
- Admin-web: a "Payments" panel on the Job Order detail page (record + void + history),
  and a new **Financial Reports** page (Collections summary, Outstanding balances,
  Per-client history), each with CSV export.
- Mobile: `SALES_STAFF` gets access to the existing admin section (currently
  SUPER_ADMIN/ADMIN_STAFF only) so they can record payments in the field; a new Job Order
  detail screen (list-only today) with a "Record Payment" form.
- Roles: SUPER_ADMIN, ADMIN_STAFF, SALES_STAFF can all record payments and view reports.
  Only SUPER_ADMIN/ADMIN_STAFF can void a payment.

Out of scope: no automatic gating of `JobOrder.status` progression on payment state (JO
workflow stays independent of payment status); no per-payment discounts (the existing
JO-level `discount`/`discountType` is the only discount mechanism); no edit-in-place for
payments (void + re-record only); no changes to the existing print/invoice document
templates in `JobOrderPage.tsx`.

## Current state (verified)

- `prisma/schema.prisma:373-411` — `JobOrder` has `salePrice: Decimal`,
  `discount: Decimal @default(0)`, `discountType: DiscountType (FIXED|PERCENTAGE)`,
  `status: JobOrderStatus (DRAFT|FINALIZED|ON_GOING|COMPLETED|CANCELLED)`. No
  `amountPaid`/`balance`/payment relation exists.
- No payment/invoice/downpayment backend logic anywhere in `src/`. The only related hits
  are cosmetic: a print-template dropdown option (`INVOICE`) and static receipt wording in
  `admin-web/src/pages/JobOrderPage.tsx` (~L1096, L1259, L1273) — not tied to real data.
- Discount math (`salePrice` adjusted by `discount`/`discountType`) currently exists
  **nowhere in the backend** — `src/job-orders.service.ts:31-32` only stores the raw
  fields. It *does* exist client-side: `admin-web/src/pages/JobOrderPage.tsx:198-204`,
  `computeTotals()`, used for the printed invoice:
  `materialsTotal = Σ(item.quantity × item.unitPrice)`,
  `discountAmt = discountType === 'PERCENTAGE' ? salePrice × discount / 100 : discount`,
  `softwareTotal = max(0, salePrice − discountAmt)`,
  `grandTotal = softwareTotal + materialsTotal`. The backend balance calc below mirrors
  this formula exactly (including line items) so a client's balance always matches the
  total on their printed invoice.
- Admin-web nav: `admin-web/src/layouts/AdminLayout.tsx` — `NAV_ICONS` (route → icon) and
  `NAV_ITEMS_BY_ROLE` (`Record<UserRole, NavItem[]>`, `{ to, label, end? }` +
  `{ section: true, label }` separators). `AnalyticsPage.tsx` is the closest existing
  pattern for a data/reports page.
- Mobile: `mobile/app/admin/_layout.tsx` gates the whole admin section (Clients,
  Products, Licenses, **Job Orders**, Jobs, Withdrawals, Users, Audit Logs) to
  `user.role === 'SUPER_ADMIN' || 'ADMIN_STAFF'` only — `SALES_STAFF` currently has zero
  access. `mobile/app/admin/job-orders.tsx` is a read-only list (`AdminList` generic
  component) with no detail screen / tap-through today.
- Proof-photo upload pattern already exists for installer job proof photos (multer to
  `uploads/`, ephemeral on Railway per existing production notes) — reused as-is for
  payment proof photos, same ephemerality caveat applies.

## 1. Data model

```prisma
enum PaymentMethod {
  CASH
  BANK_TRANSFER
  GCASH
  CHECK
}

model Payment {
  id            String        @id @default(cuid())
  jobOrderId    String
  jobOrder      JobOrder      @relation(fields: [jobOrderId], references: [id])
  amount        Decimal
  method        PaymentMethod
  referenceNo   String?
  proofPhotoUrl String?
  paidAt        DateTime
  recordedById  String
  recordedBy    User          @relation("PaymentRecordedBy", fields: [recordedById], references: [id])
  voidedAt      DateTime?
  voidReason    String?
  voidedById    String?
  voidedBy      User?         @relation("PaymentVoidedBy", fields: [voidedById], references: [id])
  createdAt     DateTime      @default(now())
}
```

- `voidedAt` null = active. Voiding never deletes the row — it's the audit trail.
- No `edit` endpoint. Mistakes are corrected by voiding (with a required reason) and
  recording a new payment.
- Extract `computeGrandTotal(salePrice, discount, discountType, items)` as a small shared
  backend helper (new — this math doesn't exist server-side today), a direct port of
  `admin-web`'s `computeTotals()` formula above (materials-inclusive). Used by both the
  `JobOrder` response (so `grandTotal` is consistent everywhere it's shown) and the
  `Payment`/balance calculations below.
- Balance for a Job Order: `grandTotal − SUM(payment.amount WHERE voidedAt IS NULL)`.
  Computed at read time in the service layer, never persisted — avoids drift between a
  stored balance and the actual payment history, which is the audit source of truth.

## 2. Backend API

New `PaymentsModule` (`payments.controller.ts` / `payments.service.ts`), following the
existing module shape (e.g. `BackupsModule`).

| Endpoint | Purpose | Roles |
|---|---|---|
| `POST /job-orders/:id/payments` | Record a payment | SUPER_ADMIN, ADMIN_STAFF, SALES_STAFF |
| `GET /job-orders/:id/payments` | History + `grandTotal`/`totalPaid`/`balance` | SUPER_ADMIN, ADMIN_STAFF, SALES_STAFF |
| `POST /payments/:id/void` | Void a payment (reason required) | SUPER_ADMIN, ADMIN_STAFF |
| `GET /reports/financial/collections?from&to` | Totals grouped by `PaymentMethod` over a date range | SUPER_ADMIN, ADMIN_STAFF, SALES_STAFF |
| `GET /reports/financial/outstanding` | Job Orders with `balance > 0` | SUPER_ADMIN, ADMIN_STAFF, SALES_STAFF |
| `GET /reports/financial/client/:clientId` | Chronological payment history for a client's Job Orders | SUPER_ADMIN, ADMIN_STAFF, SALES_STAFF |
| `GET /reports/financial/export?type=collections\|outstanding&format=csv` | CSV export of the above | SUPER_ADMIN, ADMIN_STAFF, SALES_STAFF |

Proof photo upload on `POST /job-orders/:id/payments` reuses the existing multer/uploads
wiring (same field pattern as installer proof photos); it's optional, never blocks
recording a payment when omitted.

Role checks reuse the existing role-guard pattern already applied to other modules.

## 3. Admin-web UI

- **Job Order detail (`JobOrderPage.tsx`):** new "Payments" panel — header line with Sale
  Price, Discount, Materials Total, Grand Total, Total Paid, Balance; a history table (date, method, amount,
  reference #, recorded by, void state); "Record Payment" button opens a modal (amount,
  method dropdown, reference no., date, optional photo upload); per-row void action
  (SUPER_ADMIN/ADMIN_STAFF only) that requires a reason.
- **Nav (`AdminLayout.tsx`):** add `{ section: true, label: 'Finance' }` +
  `{ to: '/financial-reports', label: 'Financial Reports' }` to the SUPER_ADMIN,
  ADMIN_STAFF, SALES_STAFF entries in `NAV_ITEMS_BY_ROLE`; add a matching icon in
  `NAV_ICONS`.
- **New `FinancialReportsPage.tsx`** (pattern follows `AnalyticsPage.tsx`), three views:
  - *Collections*: date-range picker, total collected + breakdown by `PaymentMethod`,
    Export CSV.
  - *Outstanding*: table of Job Orders with `balance > 0` (client, JO, net total, paid,
    balance, last payment date), Export CSV.
  - *Client History*: client picker → chronological payment timeline for that client's Job
    Orders.

## 4. Mobile UI

- `mobile/app/admin/_layout.tsx`: extend the `isAdmin` check to include `SALES_STAFF`,
  giving them the whole existing admin section (not just payments) — the owner's explicit
  choice over a narrower sales-only screen.
- `mobile/app/admin/job-orders.tsx` list becomes tappable, navigating to a new
  `mobile/app/admin/job-orders/[id].tsx` detail screen (doesn't exist today — the list is
  currently a dead end). Shows JO info, payment history, and a "Record Payment" form
  (amount, method picker, reference no., optional photo via `expo-image-picker`, same
  picker pattern already used for installer proof photos).
- Void action visible only to SUPER_ADMIN/ADMIN_STAFF on this screen, matching the backend
  permission — SALES_STAFF sees void history read-only (struck-through / flagged row) but
  has no void button.

## Error handling

- Recording a payment with `amount <= 0` or missing `method`/`paidAt` is rejected
  server-side with a 400; no client-side-only validation.
- Voiding requires a non-empty `voidReason`; voiding an already-voided payment is a no-op
  400.
- Balance can go negative (overpayment) — displayed as-is, not blocked; the system doesn't
  guess intent (refund vs. credit toward another JO).
- Proof photo upload failure does not block the payment record from saving (matches
  existing installer proof-photo behavior — the amount/method/date are the payment of
  record, the photo is supporting evidence).
- CSV export on an empty result set returns a header-only CSV, not an error.

## Testing

- **Backend:** unit tests for `computeGrandTotal` (FIXED and PERCENTAGE discount, zero
  discount) and balance calculation (active-only sum, voided excluded, overpayment case).
  Integration-style test for void (reason required, voided payment excluded from
  subsequent balance reads).
- **Admin-web (manual):** record a payment on a Job Order, confirm balance updates; void
  it, confirm balance reverts and history shows the void; open Financial Reports, confirm
  Collections/Outstanding/Client History reflect the same data; export CSV from each view
  and open the file.
- **Mobile (manual, Expo Go against local backend):** log in as SALES_STAFF, confirm admin
  section is now reachable; open a Job Order, record a payment with a proof photo, confirm
  it appears in admin-web; confirm the void button is absent for SALES_STAFF but present
  for ADMIN_STAFF/SUPER_ADMIN on the same screen.
- **Production build:** confirm an EAS `production-apk` rebuild is required before
  SALES_STAFF accounts see the new admin access on-device (native change to role gating,
  same rebuild caveat as prior mobile releases).
