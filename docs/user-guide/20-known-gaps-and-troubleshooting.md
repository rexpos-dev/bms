# 20 — Known Gaps & Troubleshooting

Read this **before filing a bug**. Everything below is present in the shipped code
and was found while writing this manual. Each entry states what the code actually
does, so QA can decide whether it is a defect or intended behaviour and file it
with evidence rather than re-discovering it.

---

## Permission mismatches

Front-end route guards are wider than the matching API guard, so the page loads
and then fails with 403.

### G1 — `/audit-logs` admits `ADMIN_STAFF`, the API does not

- Admin-web route allows `SUPER_ADMIN` and `ADMIN_STAFF`, and the `ADMIN_STAFF`
  sidebar has an **Audit Logs** link.
- `AuditLogsController` is decorated `@Roles(SUPER_ADMIN)` at class level.
- **Result:** an `ADMIN_STAFF` user clicks *Audit Logs*, the page renders, and
  `GET /api/audit-logs` returns 403 → **"Failed to load audit logs."**
- Fix is one line either way: widen the controller, or remove the role from the
  route and the nav.

### G2 — `/licenses` admits `ADMIN_STAFF`, the API does not

- Admin-web route allows `SUPER_ADMIN`, `DEVELOPER` and `ADMIN_STAFF`.
- `GET /api/licenses` allows `SUPER_ADMIN` and `DEVELOPER` only.
- **Result:** an `ADMIN_STAFF` who navigates directly to `/licenses` sees
  **"Failed to load licenses."** on the Licenses tab, while the **NENPOS Clients**
  tab on the same page works (that API *does* allow `ADMIN_STAFF`).
- Note there is no `ADMIN_STAFF` sidebar link to `/licenses`, so this is only
  reachable by direct URL.

### G3 — Mobile: `/admin/*` admits `SALES_STAFF`, the Menu tab does not

- `mobile/app/admin/_layout.tsx` allows `SUPER_ADMIN`, `ADMIN_STAFF` and
  `SALES_STAFF`.
- The **Menu** tab only renders for `SUPER_ADMIN` and `ADMIN_STAFF`.
- **Result:** a sales user has no UI path into the admin screens even though the
  routes would accept them (deep links work).

---

## Scoping gaps

### G4 — Job calendar endpoints are not installer-scoped

`GET /api/jobs/calendar/month` and `/calendar/day` return **all** jobs for the
period regardless of who asks, while `GET /api/jobs` scopes installers to their
own jobs. An installer's dashboard calendar therefore shows other installers'
appointments.

### G5 — `GET /api/jobs?mine=true` is a no-op for non-installers

The controller sets the user id when the caller **has** the `INSTALLER` role or
passes `mine=true`, but `JobsService.findAll` only applies the filter when the
caller's **primary** role is `INSTALLER`. Any other role passing `?mine=true`
still receives the full list. (`/earnings?mine=true` and `/withdrawals?mine=true`
work correctly — they filter on the user id directly.)

---

## Business-rule questions to confirm with the product owner

These are not obviously bugs, but they will surprise users.

### G6 — Revenue counts only `FINALIZED` job orders

`getFinancialSummary` and `getRevenueTrend` filter on
`status = FINALIZED`. An order that has moved on to `ON_GOING` or `COMPLETED` is
**excluded** from Total Revenue, Monthly Growth and the 6-month trend on the
Dashboard and Analytics pages. Revenue therefore *drops* as work progresses.

They also sum `salePrice` only — materials and discounts are ignored, so the
Analytics revenue does not match the invoice grand totals used by Financial
Reports.

### G7 — Overpayment is not blocked

`PaymentsService.recordPayment` performs no check that
`amount ≤ balance`. Recording ₱10,000 against a ₱5,000 order produces a
**−₱5,000** balance, which then flows into the outstanding report (as a negative,
though rows with `balance <= 0.005` are filtered out, so it simply disappears
from that list).

### G8 — KPI weights are not validated to 100

Nothing checks that a role's KPI weights sum to 100. The KPI Settings screen shows
a **Total weight** readout but does not enforce it. A role whose weights sum to
120 can reach a total score above 100 and will always land in the top incentive
tier.

### G9 — Job order status transitions are unguarded

Any `JobOrderStatus` can be set on any save — `COMPLETED → DRAFT` is accepted.
The side effects (inventory, labor earning) are reconciled correctly, but there is
no workflow enforcement.

### G10 — Client status is decorative

`ClientStatus` is never driven by license expiry and never blocks anything. A
`CANCELLED` client can still receive new jobs, job orders and licenses.

### G11 — `IncentiveStatus` has no transition guard

Unlike earnings and withdrawals, an incentive can be moved directly to `PAID`
without being approved. The mirrored earning is set to match, bypassing the
earning's own forward-only guard.

---

## Incomplete features

### G12 — MFA is scaffolded but not implemented

`users.mfa_enabled` and `users.mfa_secret` exist, the Users screen shows an MFA
column, and `mfaSecret` is on the audit-log scrub list — but `AuthService.login`
contains **no OTP step**. Enabling MFA on a user changes nothing about how they
sign in.

### G13 — Client deletion has no dependency check

`ClientsService.remove` calls `prisma.client.delete` directly. A client with
licenses, jobs or job orders will fail on a foreign-key constraint and surface as
a raw 500 rather than a friendly *"This client still has …"* message.

---

## Environment / infrastructure notes

### E1 — Lead OTP codes live in process memory

Verification codes are held in a `Map` inside `DownloadLeadsService`. A restart or
redeploy invalidates every pending code, and codes are not shared between
instances if the API is ever scaled horizontally. Visitors simply request a new
code. **Not a defect.**

### E2 — Backups fall back to a JavaScript dumper

If no `mysqldump` binary is found (`ENOENT`), the service logs
*"mysqldump binary not found (…); using the built-in JS dumper"* and produces the
dump in pure JavaScript. Both paths write `DROP TABLE IF EXISTS`, so either dump
restores cleanly. Set `MYSQLDUMP_PATH` to force a specific binary.

### E3 — Finara production has returned 404 for the leads export

The Finara tab surfaces this as `Finara API returned HTTP 404.` — an upstream
deployment issue with `/api/leads/export`, not a METRIQA defect.

### E4 — Migrations run at boot and never crash the app

`main.ts` calls `npx prisma migrate deploy` before bootstrapping. A failure is
logged (`prisma migrate deploy failed: …`) and the app boots anyway, so a
schema-drifted database shows up as 500s on affected endpoints rather than a
crash-loop.

### E5 — Development ports differ from production

`npm run start:dev` forces `PORT=3002`; production defaults to `3000`. The mobile
app's local default points at `:3001`. Confirm the port before reporting
"cannot reach the API".

---

## Error message catalogue

Use this to map a symptom to its source.

### Authentication & authorization

| Message | Status | Cause |
|---------|:------:|-------|
| `Invalid credentials` | 401 | Unknown email, wrong password, or deactivated account |
| `Access denied` | 401 | Refresh token missing, rotated or cleared by logout |
| `Account is inactive or no longer exists` | 401 | User deactivated or deleted mid-session |
| `Incorrect password` | 401 | Wrong confirmation password on restore/reset |
| `Current password is incorrect` | 401 | Profile password change |
| `Current password is required to set a new one` | 400 | Profile password change |
| `Forbidden resource` | 403 | `RolesGuard` rejected the role |
| `ThrottlerException: Too Many Requests` | 429 | Rate limit |

### Ownership & self-action

| Message | Status |
|---------|:------:|
| `You are not assigned to this job` | 403 |
| `You cannot approve or pay out your own earning.` | 403 |
| `You cannot process your own withdrawal request.` | 403 |
| `You do not have access to this development project` | 403 |
| `You were not tagged on this report` | 403 |
| `Not your notification` | 403 |

### State transitions

| Message | Status |
|---------|:------:|
| `Cannot mark a {x} earning as {y}.` | 400 |
| `Cannot mark a {x} withdrawal as {y}.` | 400 |
| `Cannot complete this job: the license has not been activated yet. …` | 400 |
| `License is already activated` | 409 |
| `An activated license cannot be changed back to a trial` | 400 |
| `This order is already linked to an installation job.` | 400 |
| `Payment is already voided` | 400 |
| `This project is already being worked on` | 403 |
| `This project is already completed` | 403 |
| `This project is not currently running` | 403 |
| `This project is not currently paused` | 403 |

### Validation & conflicts

| Message | Status |
|---------|:------:|
| `A user with this email already exists` / `Email already in use by another account` | 409 |
| `A license with this key already exists` | 409 |
| `License key is required for a non-trial license` | 400 |
| `KPI "{name}" already exists for {ROLE}` | 409 |
| `Cannot rename a system-tracked KPI` | 400 |
| `Role {X} does not have KPI tracking` | 400 |
| `That barcode is already used by another item` | 400 |
| `Stock cannot go below zero` | 400 |
| `Client Name is required.` | 400 |
| `Insufficient balance. Available: ₱x, requested: ₱y.` | 400 |
| `Assign an installer to the job before finalizing.` | 400 |
| `Enter the number of cameras and rate per camera before finalizing.` | 400 |
| `Signage labor is zero — check the total price and labor % before finalizing.` | 400 |
| `Only image files (JPEG, PNG, GIF, WEBP) are allowed` | 400 |
| `Only .sql backup files can be uploaded.` | 400 |
| `No file uploaded.` | 400 |

### Backups, restore, reset

| Message | Status |
|---------|:------:|
| `Backup failed: {reason}` | 500 |
| `Auto-backup failed — reset aborted for safety. {reason}` | 400 |
| `Restore failed: {reason}` | 500 |
| `Select at least one module to restore.` | 400 |
| `Unknown module: {id}` | 400 |
| `None of the selected modules had tables in this backup.` | 400 |
| `Backup not found` | 404 |

### External integrations

| Message | Status |
|---------|:------:|
| `TMS_KPI_API_TOKEN is not configured on the server.` | 400 |
| `Could not reach the TMS KPI API.` | 400 |
| `TMS KPI API rejected the token (401 Unauthorized).` | 400 |
| `TMS KPI API returned HTTP {status}.` | 400 |
| `TMS KPI API did not return JSON — the token may be invalid or lack the kpi:read ability.` | 400 |
| `FINARA_API_KEY is not configured on the server.` | 400 |
| `Could not reach the Finara API.` | 400 |
| `Finara API rejected the key (401 Unauthorized).` | 400 |
| `Finara API returned HTTP {status}.` | 400 |
| `Finara API did not return JSON — the API key may be invalid.` | 400 |

### Lead verification

| Message | Status |
|---------|:------:|
| `Please wait a minute before requesting another code.` | 400 |
| `Verification code expired — request a new one.` | 400 |
| `Too many attempts — request a new code.` | 400 |
| `Incorrect verification code.` | 400 |

---

## Common UI error strings and what they mean

Every one of these means "the underlying query returned an error" — check the
network tab for the real status.

| String | Page |
|--------|------|
| Failed to load clients. | Clients |
| Failed to load products. | Products |
| Failed to load licenses. / Failed to load records. | Licenses / NENPOS tab |
| Failed to load your jobs. / Failed to load installations. | Installations |
| Failed to load job orders. | Job Orders |
| Could not load job order. / Parent job not found. | Job Order editor |
| Failed to load earnings. | Earnings |
| Failed to load withdrawal requests. | Withdrawals |
| Failed to load inventory. / Failed to load history. | Inventory |
| Failed to load development projects. / Failed to create project. / Failed to post report. | Dev Projects |
| Failed to load KPI definitions. / Failed to save. | KPI Settings |
| Failed to load leads. | Download Leads |
| Failed to load audit logs. | Audit Logs |
| Failed to load company profile. / Failed to load backups. / Failed to load modules. | Settings |
| Failed to load the team. | Users |
| Could not update the client. Try again. | Clients |
| Could not create the client. Try again. | Dashboard quick action |
| Could not convert this order. Try again. | Job Order editor |
| Failed. Try again. | Installations |
</content>
