# 10 — Earnings & Withdrawals

Routes: `/earnings` and `/withdrawals` — visible to **all seven roles**.

## Part A — Earnings

An **Earning** is a money credit to a staff member.

| Type | Created by |
|------|-----------|
| `INSTALLATION` | Automatically when a CCTV/Signage job order reaches `FINALIZED`/`ON_GOING`/`COMPLETED` — see [08](08-job-orders-and-payments.md#labor-earning-rules-cctv--signage-only) |
| `BONUS` | Automatically mirrored from a monthly KPI incentive — see [11](11-kpi-and-incentives.md) |
| `ACTIVATION` | Manual allocation |
| `COMMISSION` | Manual allocation |

### Status flow — strictly forward

```
PENDING ──approve──▶ APPROVED ──mark paid──▶ PAID
```

Any other transition returns
`400 Cannot mark a {current} earning as {target}.`

**Expected:** `PENDING → PAID` (skipping approval) is rejected; `APPROVED → PENDING`
is rejected; `PAID` is terminal.

### Scoping

`GET /api/earnings` returns:

- **All** earnings for `SUPER_ADMIN` / `ADMIN_STAFF`
- **Only your own** earnings for everyone else

### The page

| Element | Admin view | Own view |
|---------|-----------|----------|
| Columns | Team, Recipient, Client, Type, Amount, Status, Recorded, actions | Client, Type, Amount, Status, Recorded |
| Search placeholder | *"Search team member, client, type…"* | *"Search client, type…"* |
| Actions | **Approve**, **Mark paid** | none |
| Status hints | | *"Awaiting admin approval"*, *"Released to your account"* |

A **Cumulative Earnings** figure is shown. Empty: **"No earnings recorded yet."** /
**"No matches."**; failure: **"Failed to load earnings."**

### Permissions

| Operation | Endpoint | Roles |
|-----------|----------|-------|
| Allocate (create) | `POST /api/earnings` | `SUPER_ADMIN` |
| List | `GET /api/earnings` | any authenticated user (scoped) |
| Approve | `PATCH /api/earnings/:id/approve` | `SUPER_ADMIN`, `ADMIN_STAFF` |
| Mark paid | `PATCH /api/earnings/:id/paid` | `SUPER_ADMIN`, `ADMIN_STAFF` |

**Self-action ban:** approving or paying **your own** earning returns
`403 You cannot approve or pay out your own earning.`

---

## Part B — Withdrawals

A **Withdrawal** is a staff request to cash out.

### The balance formula

```
availableBalance = Σ earnings where status ∈ {APPROVED, PAID}
                 − Σ withdrawals where status ∈ {PENDING, APPROVED, RELEASED}
                 (floored at 0)
```

Reasoning behind it:

- `PENDING` earnings are **not** yet spendable.
- `PAID` earnings stay in the earned pool — the `PAID` flag is bookkeeping, it does
  not remove money.
- `PENDING` and `APPROVED` withdrawals are **reservations** against future payout.
- `RELEASED` withdrawals are permanent deductions.
- `REJECTED` withdrawals return the money to the pool.

Endpoint: `GET /api/withdrawals/balance`.

**Expected:** the balance never goes negative — it is clamped at 0.

### Requesting a withdrawal

`POST /api/withdrawals` — roles `INSTALLER`, `DEVELOPER`, `DESIGNER`, `LIAISON`,
`SALES_STAFF`, `ADMIN_STAFF`. (`SUPER_ADMIN` is **not** in the list.)

| Field | Required | Rules |
|-------|:--------:|-------|
| Amount | ✓ | Must not exceed the available balance |
| Method | ✓ | `GCASH` · `MAYA` · `BANK_TRANSFER` |
| Account name | ✓ | |
| Account number | ✓ | |

Exceeding the balance →
`400 Insufficient balance. Available: ₱{x}, requested: ₱{y}.`

### Status flow

```
PENDING ──approve──▶ APPROVED ──release──▶ RELEASED   (final)
   │                     │
   └──────reject─────────┴──▶ REJECTED
```

Allowed source states per target:

| Target | Allowed from |
|--------|--------------|
| `APPROVED` | `PENDING` |
| `REJECTED` | `PENDING`, `APPROVED` |
| `RELEASED` | `APPROVED` |

Anything else → `400 Cannot mark a {current} withdrawal as {target}.`

`REJECTED` is reachable from `APPROVED` on purpose, so a mistaken approval can be
undone before the money is released. `RELEASED` is terminal.

### Releasing

`PATCH /api/withdrawals/:id/release` accepts an optional **proof URL** (a photo of
the transfer receipt), stored on the withdrawal. The UI shows it in the **Proof**
column, or **"No proof attached"**.

### Notifications

Every status change notifies the requester:

| Status | Notification body |
|--------|-------------------|
| `APPROVED` | *Your ₱x withdrawal has been approved.* |
| `REJECTED` | *Your ₱x withdrawal was rejected.* |
| `RELEASED` | *Your ₱x withdrawal has been released.* |

Title is `Withdrawal {status lowercased}`; deep link `/withdrawals`.

### Scoping and the page

`GET /api/withdrawals` returns all requests for `SUPER_ADMIN`/`ADMIN_STAFF`, and
only your own for everyone else.

Columns (admin): **Requested by · Amount · Via · Account · Status · Proof ·
actions**. Non-admins lose the *Requested by* and action columns.
Empty: **"No withdrawal requests yet."** / **"No matches."**;
failure: **"Failed to load withdrawal requests."**

### Permissions

| Operation | Endpoint | Roles |
|-----------|----------|-------|
| Balance | `GET /api/withdrawals/balance` | all except `SUPER_ADMIN` |
| Request | `POST /api/withdrawals` | all except `SUPER_ADMIN` |
| List | `GET /api/withdrawals` | any authenticated user (scoped) |
| Approve | `PATCH /api/withdrawals/:id/approve` | `SUPER_ADMIN`, `ADMIN_STAFF` |
| Reject | `PATCH /api/withdrawals/:id/reject` | `SUPER_ADMIN`, `ADMIN_STAFF` |
| Release | `PATCH /api/withdrawals/:id/release` | `SUPER_ADMIN`, `ADMIN_STAFF` |

**Self-action ban:** processing **your own** withdrawal returns
`403 You cannot process your own withdrawal request.` This applies to an
`ADMIN_STAFF` user who requested a withdrawal themselves — a second approver is
required.

---

## Worked example (use this as a test scenario)

1. Admin allocates a `COMMISSION` earning of ₱5,000 to Installer A → status `PENDING`.
   **Balance = ₱0.**
2. Admin approves it → `APPROVED`. **Balance = ₱5,000.**
3. Installer A requests ₱3,000 via GCASH → withdrawal `PENDING`.
   **Balance = ₱2,000.**
4. Installer A tries to request ₱2,500 → `400 Insufficient balance. Available: ₱2,000, requested: ₱2,500.`
5. Admin approves the withdrawal → `APPROVED`. **Balance still ₱2,000.**
6. Admin rejects it instead of releasing → `REJECTED`. **Balance back to ₱5,000.**
7. New request of ₱3,000, approved, then released with a proof photo → `RELEASED`.
   **Balance = ₱2,000**, and the installer receives a *"has been released"* notification.
8. Admin marks the original earning `PAID`. **Balance stays ₱2,000** — `PAID`
   earnings still count as earned.

---

## Expected behaviour summary

| # | Assertion |
|---|-----------|
| 10.1 | `PENDING` earnings do not raise the available balance |
| 10.2 | Marking an earning `PAID` does not change the balance |
| 10.3 | A `PENDING` withdrawal immediately reserves its amount |
| 10.4 | Rejecting a withdrawal returns the amount to the balance |
| 10.5 | Balance is clamped at 0, never negative |
| 10.6 | Illegal status transitions return the documented 400 messages |
| 10.7 | Self-approval of earnings and self-processing of withdrawals both return 403 |
| 10.8 | Every withdrawal status change produces a notification with the peso amount |
| 10.9 | Non-admin users see only their own earnings and withdrawals from the API |
</content>
