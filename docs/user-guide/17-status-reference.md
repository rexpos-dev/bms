# 17 — Status & Enum Reference

Every enum in the system, its values, and where transitions are enforced.

---

## UserRole

`SUPER_ADMIN` · `INSTALLER` · `DEVELOPER` · `DESIGNER` · `LIAISON` ·
`ADMIN_STAFF` · `SALES_STAFF`

No transitions — a user's primary role is set directly. See
[02 — Roles & Permissions](02-roles-and-permissions.md).

---

## ClientStatus

`ACTIVE` (default) · `EXPIRED` · `SUSPENDED` · `CANCELLED`

**Free-form** — any value can be set at any time. Not automatically driven by
license expiry.

## ClientType

`SOFTWARE` (default) · `ADVERTISING`

---

## LicenseType (product)

`SUBSCRIPTION_MONTHLY` · `SUBSCRIPTION_ANNUAL` · `LIFETIME`

## LicenseStatus

`PENDING` (default) · `ACTIVATED` · `EXPIRED` · `SUSPENDED`

```
PENDING ──activate (DEVELOPER)──▶ ACTIVATED ──nightly 02:00 sweep──▶ EXPIRED
   │                                   │
   └────── suspend (SUPER_ADMIN) ──────┴──▶ SUSPENDED
```

Enforced:

- Activating an already-`ACTIVATED` license → `409 License is already activated`
- The expiry sweep only touches `ACTIVATED` licenses with a **past, non-null**
  `expirationDate`
- `SUSPENDED` and `EXPIRED` are not automatically reversible through the UI

---

## JobStatus

`ASSIGNED` (default) · `ON_GOING` · `WAITING_ACTIVATION` · `COMPLETED` · `CANCELLED`

```
ASSIGNED ──▶ ON_GOING ──submit proof──▶ WAITING_ACTIVATION ──▶ COMPLETED
                                                    (CANCELLED at any point)
```

Enforced:

- Only `INSTALLER` may change status, and only on their own job
- Submitting proof **always** forces `WAITING_ACTIVATION`
- Assigning an installer **always** forces `ASSIGNED`
- `COMPLETED` requires the job's license — or **any** license of the job's client —
  to be `ACTIVATED`

Not enforced: the linear order itself. `ASSIGNED → COMPLETED` is accepted as long
as the license condition holds.

---

## JobOrderStatus

`DRAFT` (default) · `FINALIZED` · `ON_GOING` · `COMPLETED` · `CANCELLED`

**No transition guard** — any status can be set on save. Side effects:

| Status | Labor earning (CCTV/Signage) | Inventory | Counted as revenue (Analytics) | In outstanding report |
|--------|:---------------------------:|:---------:|:------------------------------:|:---------------------:|
| `DRAFT` | — | — | — | ✓ |
| `FINALIZED` | ✓ created | — | ✓ | ✓ |
| `ON_GOING` | ✓ ensured | — | — | ✓ |
| `COMPLETED` | ✓ ensured | **deducted** | — | ✓ |
| `CANCELLED` | — | restored if it had been completed | — | — |

## JobOrderType

`SOFTWARE` (default) · `CCTV` · `SIGNAGE`

Determines the labor incentive formula and which extra fields appear.

## DocType

`JOB_ORDER` (default) · `QUOTATION` · `INVOICE` · `RECEIPT`

Purely presentational + list-tab placement. Freely switchable via **Move to…**.
Converting a quotation to a job order forces `JOB_ORDER`.

## DiscountType

`FIXED` (default) · `PERCENTAGE`

`PERCENTAGE` applies to the **subtotal** (sale price + materials).

---

## PaymentMethod

`CASH` · `BANK_TRANSFER` · `GCASH` · `CHECK`

Payments have no status enum — a payment is either live or **voided**
(`voidedAt` set). Voiding is one-way: a voided payment cannot be un-voided
(`400 Payment is already voided`).

---

## EarningType

`INSTALLATION` · `ACTIVATION` · `BONUS` · `COMMISSION`

## EarningStatus

`PENDING` (default) · `APPROVED` · `PAID`

```
PENDING ──▶ APPROVED ──▶ PAID
```

Strictly forward. Any other transition →
`400 Cannot mark a {current} earning as {target}.`
Plus: `403 You cannot approve or pay out your own earning.`

---

## WithdrawalMethod

`GCASH` · `MAYA` · `BANK_TRANSFER`

## WithdrawalStatus

`PENDING` (default) · `APPROVED` · `REJECTED` · `RELEASED`

```
PENDING ──approve──▶ APPROVED ──release──▶ RELEASED   (final)
   │                    │
   └──────reject────────┴──▶ REJECTED
```

| Target | Allowed from |
|--------|--------------|
| `APPROVED` | `PENDING` |
| `REJECTED` | `PENDING`, `APPROVED` |
| `RELEASED` | `APPROVED` |

Violations → `400 Cannot mark a {current} withdrawal as {target}.`
Plus: `403 You cannot process your own withdrawal request.`

Balance impact: `PENDING`, `APPROVED` and `RELEASED` all deduct from the
available balance; `REJECTED` does not.

---

## IncentiveStatus

`PENDING` (default) · `APPROVED` · `PAID`

Maps 1:1 onto the mirrored `BONUS` earning's status. No transition guard on the
incentive itself — approve/pay set the value directly.

---

## StockMovementReason

`MANUAL_ADJUST` · `JOB_ORDER_DEDUCTION` · `JOB_ORDER_RESTORE`

---

## DevProjectStatus

`NOT_STARTED` (default) · `IN_PROGRESS` · `PENDING` · `COMPLETED`

```
NOT_STARTED ──start──▶ IN_PROGRESS ──stop──▶ PENDING ──start──▶ IN_PROGRESS
                            │
                    progress ≥ 100 ──▶ COMPLETED ──progress < 100──▶ PENDING
```

`IN_PROGRESS` has two sub-states distinguished by `startedAt`:
**running** (timestamp) vs **paused** (null).

Guards: see [12 — Dev Projects](12-dev-projects.md#transition-rules).

## DevReportStatus

`PENDING` (default) · `REVIEWED`

Set to `REVIEWED` automatically when the tagged admin (or a Super Admin) posts
feedback. There is no way back to `PENDING`.

---

## Other value sets (not database enums)

| Set | Values |
|-----|--------|
| Download lead platform | `ANDROID_APK` · `DESKTOP_PWA` |
| Finara lead status | `NEW` · `CONTACTED` · `CLOSED` |
| NENPOS client status | Free text, defaults to `ACTIVE` |
| Device token platform | `android` · `ios` · `web` |
| Mobile API env | `local` · `prod` |
</content>
