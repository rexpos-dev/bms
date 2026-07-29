# 15 — Settings & Administration

Route: `/settings` · Role: **`SUPER_ADMIN` only**

Six tabs:

| Tab | Content |
|-----|---------|
| Company Profile | Letterhead details used on printed documents |
| Users & Roles | Team management (also reachable at `/users`) |
| KPI Settings | Per-role KPI definitions + designer TMS sync — see [11](11-kpi-and-incentives.md) |
| Inventory Management | Item catalogue and stock ledger — see [09](09-inventory.md) |
| Database Management | Backups, restore, and per-module reset |
| Audit Logs | System activity trail |

---

## Company Profile

Singleton record. Feeds the print letterhead on every job order / quotation /
invoice / receipt.

| Field | Notes |
|-------|-------|
| Business name | |
| Address | |
| Phone | |
| Email | |
| Website | |
| TIN / Tax ID | |
| Company Logo | Uploaded image; stored as a URL |

| Operation | Endpoint | Roles |
|-----------|----------|-------|
| Read | `GET /api/company-profile` | any authenticated user |
| Update | `PATCH /api/company-profile` | `SUPER_ADMIN` |

Failure states: **"Failed to load company profile."** / **"Failed to save."**

**Expected:** changing the business name or logo is reflected on the next
job-order print preview without a restart.

---

## Users & Roles

Heading **Team**. Columns: **Name · Email · Phone · Roles · Base Bonus · Status ·
Edit**.

### Creating a user

| Field | Required | Rules |
|-------|:--------:|-------|
| Full name | ✓ | |
| Email | ✓ | Valid email, **unique** → `409 A user with this email already exists` |
| Temporary password | ✓ | **Minimum 8 characters**, hashed with bcrypt cost 12 |
| Primary role | ✓ | One of the 7 roles |
| Additional Roles | | Any subset; the primary role is filtered out automatically |
| Phone | | Optional |
| Base Bonus | | Number ≥ 0, default **₱10,000** — drives KPI incentive amounts |

### Editing a user

`PATCH /api/users/:id` (`SUPER_ADMIN`).

- Changing the email to one already in use → `409 Email already in use by another account`
- Changing the **primary role** removes that role from `additionalRoles`
- Supplying `additionalRoles` **replaces the whole set** (delete-all then create)
- Omitting `phone` clears it to `NULL`

### Role management endpoints

| Operation | Endpoint |
|-----------|----------|
| Add an additional role | `POST /api/users/:id/roles` (idempotent upsert) |
| Remove an additional role | `DELETE /api/users/:id/roles/:role` |
| Change the primary role | `PATCH /api/users/:id/primary-role` |

### Activate / deactivate

`PATCH /api/users/:id/activate` and `/deactivate` (`SUPER_ADMIN`).

**Expected:** a deactivated user cannot log in, **and** an already-signed-in
session stops working on the next API call (the JWT strategy re-checks `isActive`).

### Reading users

| Endpoint | Roles | Returns |
|----------|-------|---------|
| `GET /api/users/me` | any authenticated user | Your own record |
| `PATCH /api/users/me` | any authenticated user | Self-service profile update — see [03](03-getting-started.md#your-profile-profile) |
| `GET /api/users?role=` | `SUPER_ADMIN`, `ADMIN_STAFF` | All users; the `role` filter matches **primary or additional** role |
| `POST /api/users` | `SUPER_ADMIN` | Create |

Password hashes are **never** returned — every response uses a safe select
(`id, email, fullName, role, phone, isActive, mfaEnabled, baseBonus, createdAt,
additionalRoles`).

Empty: **"No team members yet."** / **"No matches."**;
failure: **"Failed to load the team."**

> The **MFA** column reflects the `mfaEnabled` flag, but no OTP challenge exists
> in the login flow. See [20 — Known Gaps](20-known-gaps-and-troubleshooting.md).

---

## Database Management

All endpoints below are **`SUPER_ADMIN` only** (guard applied at the controller).

### Backups

Stored in `<cwd>/backups`, filename pattern `sdlmp-<ISO timestamp>.sql`
(colons and dots replaced with `-`). The list shows **File · Size · Created**,
newest first. Only files matching `^[\w.-]+\.sql$` are listed or served.

| Action | Endpoint | Notes |
|--------|----------|-------|
| List | `GET /api/backups` | |
| Create now | `POST /api/backups` | Native `mysqldump` when available, otherwise a pure-JS fallback dumper |
| Download | `GET /api/backups/:filename/download` | Forced download |
| Delete | `DELETE /api/backups/:filename` | |
| Upload | `POST /api/backups/upload` | |

**Automatic:** a full backup runs nightly at **03:00** and prunes everything past
the newest 14.

**Dump strategy:** the service resolves `mysqldump` from `MYSQLDUMP_PATH`, then
(on Windows) from `C:\Program Files\MySQL\*\bin\mysqldump.exe`, then from `PATH`.
If the binary is missing entirely (`ENOENT` — e.g. a Railway container), it falls
back to a JavaScript dumper that needs no MySQL client. Any *other* failure
deletes the partial file and returns `500 Backup failed: {real reason from stderr}`.

**Expected:** a backup failure never leaves a zero-byte `.sql` file behind, and
the error message carries the actual `mysqldump` stderr rather than a generic
"Internal server error".

**Upload rules:**

| Rule | Value |
|------|-------|
| Field name | `file` |
| Max size | **200 MB** |
| Extension | Must end in `.sql` → otherwise `400 Only .sql backup files can be uploaded.` |
| No file at all | `400 No file uploaded.` |
| Stored name | `restored-{timestamp}-{sanitised base}.sql` — non-`[\w.-]` characters become `_`, base truncated to 80 chars, empty base becomes `backup` |

**Expected:** uploading `my report (final).sql` produces a filename like
`restored-1753000000000-my_report__final_.sql`, and path-traversal attempts in
the original name cannot escape the backups directory.

### Restore

`POST /api/backups/:filename/restore`

The dialog asks **What to restore** and requires **Confirm with your login password**.

| Field | Rules |
|-------|-------|
| `password` | The requesting Super Admin's **own** login password. Wrong → `401 Incorrect password` |
| `full` | `true` = whole database; `false` = selected modules |
| `modules` | Module ids, required when `full` is false |

**Full restore** executes the dump directly against the live database.

**Module restore** is safer and layout-independent:

1. Creates a scratch database `sdlmp_restore_{timestamp}`
2. Loads the entire dump into it
3. With `FOREIGN_KEY_CHECKS=0`, for each selected module table present in the dump:
   `DROP TABLE` in live → `CREATE TABLE … LIKE` scratch → `INSERT … SELECT`
4. Re-enables foreign key checks
5. **Always** drops the scratch database, even on failure

| Situation | Result |
|-----------|--------|
| No modules selected | `400 Select at least one module to restore.` |
| Unknown module id | `400 Unknown module: {id}` |
| None of the selected modules exist in the dump | `400 None of the selected modules had tables in this backup.` |
| SQL failure | `500 Restore failed: {reason}` |

Module → table mapping:

| Module id | Tables |
|-----------|--------|
| `jobs` | `jobs`, `installation_proofs` |
| `job-orders` | `job_orders`, `job_order_items` |
| `dev-projects` | `dev_projects`, `dev_project_sessions`, `dev_project_reports`, `dev_project_report_feedback` |
| `licenses` | `licenses` |
| `earnings` | `earnings` |
| `withdrawals` | `withdrawals` |
| `kpi` | `kpi_results`, `incentives` |
| `notifications` | `notifications` |
| `nenpos-clients` | `nenpos_clients` |
| `audit-logs` | `audit_logs` |

### Reset Data

`GET /api/backups/reset/modules` lists the resettable modules with a **live row
count**; `POST /api/backups/reset/:moduleId` performs the wipe.

Only **transactional** data is resettable. Master data — Users, Clients, Products,
Company Profile, KPI Definitions, Inventory — is deliberately **not** resettable here.

| Module | Label | Also does |
|--------|-------|-----------|
| `jobs` | Installation Jobs | Unlinks job orders and earnings from the jobs, deletes proofs |
| `job-orders` | Job Orders | Deletes line items first |
| `dev-projects` | Dev Projects | Deletes feedback → reports → sessions → projects |
| `licenses` | Licenses | Unlinks licenses from jobs first |
| `earnings` | Earnings | |
| `withdrawals` | Withdrawals | |
| `kpi` | KPI Results & Incentives | Unlinks incentives from earnings; **KPI definitions are kept** |
| `notifications` | Notifications | |
| `nenpos-clients` | Nenpos Clients | |
| `audit-logs` | Audit Logs | |

Safety sequence, in order:

1. Unknown module id → `400 Unknown module: {id}`
2. **Password check** — the Super Admin's own login password, wrong → `401 Incorrect password`
3. Row count captured for the result
4. **Automatic backup** — reuses the `backupFilename` the client already downloaded
   if it still exists, otherwise takes a fresh dump. If the backup fails:
   `400 Auto-backup failed — reset aborted for safety. {reason}` and **nothing is deleted**
5. The wipe runs inside a **single transaction**, children before parents

The response is `{ module, label, deleted, backup }`.

**Expected:** every reset is preceded by a real backup file; a reset can never
proceed if the backup step fails.

---

## Audit Logs

Route: `/audit-logs` (or Settings → Audit Logs). Columns: **When · User · Action ·
IP address · Device**. Empty: **"No activity recorded yet."** / **"No matches."**;
failure: **"Failed to load audit logs."**

### What gets logged

- Every `POST`, `PUT`, `PATCH`, `DELETE`
- `POST /api/auth/login` — **both successes and failures**
- `POST /api/auth/logout`, `POST /api/auth/refresh`

Action names:

| Request | Action recorded |
|---------|-----------------|
| Login | `User Login`, or `Failed User Login ({status})` |
| Logout | `User Logout` |
| Refresh | `Token Refresh` |
| `POST /api/clients` | `Created Client` |
| `PATCH /api/licenses/…` | `Updated License` |
| `DELETE /api/users/…` | `Deleted User` |

Friendly resource names are mapped for: Client, Product, License, NENPOS Client,
Job, Job Order, Dev Project, Earning, Withdrawal, User, KPI, Company Profile,
Backup. Unmapped resources fall back to the raw path segment.

### Metadata captured

`{ method, url, payload, error?, response? }` where `payload` is the request body
with `password`, `refreshToken`, `token`, `secret` and `mfaSecret` replaced by
`********`. Also stored: IP address and user-agent string.

**Expected:** searching the audit log for a plaintext password returns nothing —
credentials must never appear, including on failed logins.

> ⚠️ `GET /api/audit-logs` is guarded as **`SUPER_ADMIN` only**, while the
> admin-web route `/audit-logs` also admits `ADMIN_STAFF`. See
> [20 — Known Gaps](20-known-gaps-and-troubleshooting.md#permission-mismatches).

---

## Expected behaviour summary

| # | Assertion |
|---|-----------|
| 15.1 | Every `/settings` tab is unreachable for all roles except `SUPER_ADMIN` |
| 15.2 | Passwords must be ≥ 8 characters at creation |
| 15.3 | Duplicate emails are rejected on both create and edit |
| 15.4 | Password hashes never appear in any users API response |
| 15.5 | Deactivation takes effect on the next API call, not just the next login |
| 15.6 | Reset and restore both require the acting Super Admin's own password |
| 15.7 | A reset always produces (or reuses) a backup first, and aborts if the backup fails |
| 15.8 | Reset never touches Users, Clients, Products, Company Profile, Inventory or KPI definitions |
| 15.9 | Module restore drops its scratch database even when the restore fails |
| 15.10 | Backup upload rejects non-`.sql` files and files over 200 MB |
| 15.11 | Audit log payloads have all sensitive keys masked |
| 15.12 | Failed logins appear in the audit log with the `Failed User Login` action |
</content>
