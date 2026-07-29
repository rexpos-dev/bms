# 02 — Roles & Permissions

## The seven roles

| Enum value | Sidebar label | Purpose |
|-----------|---------------|---------|
| `SUPER_ADMIN` | Admin | Full access. The only role that can manage users, settings, backups, analytics. |
| `ADMIN_STAFF` | Staff | Operations back-office: clients, job orders, dev projects, products, installations, finance, leads. |
| `SALES_STAFF` | Sales | Client-facing sales: clients, job orders, installations, financial reports, own payroll. |
| `LIAISON` | Liaison | Field coordination: clients, project job orders, installations, own payroll. |
| `INSTALLER` | Installer | Field installation: own jobs, proof submission, own earnings/withdrawals. |
| `DEVELOPER` | Developer | Dev projects, license activation, own payroll. |
| `DESIGNER` | Designer | Own payroll + KPI only (KPI points sourced from TMS Pro). Can view job orders. |

## Primary role vs additional roles

A user has:

- **`role`** — the *primary* role. It decides **which dashboard** they see and
  **which navigation set** is used as the base.
- **`additionalRoles`** — zero or more extra roles stored in
  `user_role_assignments`.
- **`roles`** — the merged array (`[primary, ...additional]`) returned in the
  login response and in `GET /api/users/me`. This is what the backend
  `RolesGuard` checks.

Rules enforced by the API:

- Creating or editing a user filters the primary role out of `additionalRoles`
  automatically — the same role can never appear twice.
- Changing the primary role via `PATCH /api/users/:id/primary-role` deletes that
  role from `additionalRoles` first.
- Sending `additionalRoles` on `PATCH /api/users/:id` **replaces** the whole set
  (it deletes all, then creates the supplied list).

**Expected:** a user with primary `SALES_STAFF` + additional `INSTALLER` sees the
Sales dashboard, but passes any `@Roles(INSTALLER)` endpoint check.

### Merged navigation

The sidebar starts from the primary role's nav list, then appends — under a
section header named after each extra role — any links that role adds and the
primary role doesn't already have. Duplicate paths are never repeated.

**Expected:** primary `DESIGNER` + additional `INSTALLER` shows the Designer nav,
then an **Installer** section header containing *My Jobs* only (Dashboard,
Earnings and Withdrawals are already present).

## Navigation matrix (admin web)

`✓` = link appears in the sidebar for that primary role.

| Route | Label | SUPER_ADMIN | ADMIN_STAFF | SALES_STAFF | LIAISON | INSTALLER | DEVELOPER | DESIGNER |
|-------|-------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `/` | Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/clients` | Clients | ✓ | ✓ | ✓ | ✓ | | | |
| `/job-orders/software` | Project Job Orders / Project JO | ✓ | ✓ | ✓ | ✓ | | | |
| `/dev-projects` | Dev Projects | ✓ | ✓ | | | | ✓ | |
| `/products` | Software Products | ✓ | ✓ | | | | | |
| `/licenses` | Licenses | ✓ | | | | | ✓ | |
| `/jobs` | Installations / My Jobs | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| `/earnings` | Earnings / My Earnings | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/withdrawals` | Withdrawals | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/financial-reports` | Financial Reports | ✓ | ✓ | ✓ | | | | |
| `/download-leads` | Download Leads | ✓ | ✓ | | | | | |
| `/audit-logs` | Audit Logs | | ✓ | | | | | |
| `/analytics` | Analytics | ✓ | | | | | | |
| `/settings` | Settings | ✓ | | | | | | |
| `/profile` | Profile Settings | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Note: Super Admin has no *Audit Logs* sidebar link because audit logs are a tab
inside **Settings → Audit Logs**.

## Route guards (admin web)

Routes are additionally guarded by `RequireAuth roles={[...]}`. A user who is
signed in but lacks the role is redirected rather than shown the page.

| Route | Allowed roles |
|-------|---------------|
| `/`, `/earnings`, `/withdrawals`, `/profile` | all 7 |
| `/dev-projects` | `DEVELOPER`, `ADMIN_STAFF`, `SUPER_ADMIN` |
| `/jobs` | `SUPER_ADMIN`, `INSTALLER`, `ADMIN_STAFF`, `LIAISON`, `SALES_STAFF` |
| `/job-orders/software` | `SUPER_ADMIN`, `ADMIN_STAFF`, `LIAISON`, `SALES_STAFF` |
| `/job-orders/:jobId`, `/job-orders/order/:joId` | above **+ `DESIGNER`** |
| `/financial-reports` | `SUPER_ADMIN`, `ADMIN_STAFF`, `SALES_STAFF` |
| `/licenses` | `SUPER_ADMIN`, `DEVELOPER`, `ADMIN_STAFF` |
| `/clients` | `SUPER_ADMIN`, `ADMIN_STAFF`, `SALES_STAFF`, `LIAISON` |
| `/products` | `SUPER_ADMIN`, `ADMIN_STAFF` |
| `/download-leads`, `/audit-logs` | `SUPER_ADMIN`, `ADMIN_STAFF` |
| `/users`, `/analytics`, `/settings` | `SUPER_ADMIN` |
| `/login`, `/developers` | public (no auth) |

> ⚠️ Two of these front-end guards are **wider** than the matching API guard.
> See [20 — Known Gaps](20-known-gaps-and-troubleshooting.md#permission-mismatches).

## In-page capability gates

Beyond routing, several pages hide actions by role:

| Page | Capability | Roles |
|------|-----------|-------|
| Earnings | Approve / Mark paid | `SUPER_ADMIN`, `ADMIN_STAFF` |
| Earnings | Allocate (create) an earning | `SUPER_ADMIN` only |
| Withdrawals | Approve / Reject / Release | `SUPER_ADMIN`, `ADMIN_STAFF` |
| Job Order → Payments | Void a payment | `SUPER_ADMIN`, `ADMIN_STAFF` |
| Installations | Installer view (my jobs only) | has `INSTALLER` **and** primary role is not an admin-type role |

## Self-action bans

These are enforced server-side and must be verified by QA:

- You **cannot approve or pay your own earning** →
  `403 You cannot approve or pay out your own earning.`
- You **cannot process your own withdrawal** (approve/reject/release) →
  `403 You cannot process your own withdrawal request.`

**Expected:** a Super Admin who is also the recipient gets 403 on both; a
*different* admin succeeds.

## Account state

- `isActive = false` blocks login (`401 Invalid credentials`) **and** invalidates
  existing access tokens — `JwtStrategy.validate` re-reads the user on every
  request and throws `401 Account is inactive or no longer exists`.

**Expected:** deactivating a signed-in user kicks them out on their next API call,
not only at next login.
</content>
