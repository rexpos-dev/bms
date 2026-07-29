# 18 — API & Permission Matrix

Base URL: `{host}/api`

Notation: **SA** = `SUPER_ADMIN`, **AS** = `ADMIN_STAFF`, **SS** = `SALES_STAFF`,
**LI** = `LIAISON`, **IN** = `INSTALLER`, **DV** = `DEVELOPER`,
**DS** = `DESIGNER`, **any** = any authenticated user, **public** = no auth.

A request passes when **any** of the caller's roles (primary + additional) is in
the allowed set.

---

## Auth

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | `/auth/login` | public | **10 req/min per IP** |
| POST | `/auth/refresh` | refresh token | Rotates the pair |
| POST | `/auth/logout` | any | Clears the stored refresh hash |

## Users

| Method | Path | Roles |
|--------|------|-------|
| GET | `/users/me` | any |
| PATCH | `/users/me` | any |
| POST | `/users` | SA |
| GET | `/users?role=` | SA, AS |
| PATCH | `/users/:id` | SA |
| PATCH | `/users/:id/activate` | SA |
| PATCH | `/users/:id/deactivate` | SA |
| POST | `/users/:id/roles` | SA |
| DELETE | `/users/:id/roles/:role` | SA |
| PATCH | `/users/:id/primary-role` | SA |

## Clients

| Method | Path | Roles |
|--------|------|-------|
| POST | `/clients` | SA, AS |
| GET | `/clients?type=` | SA, AS, LI, SS, DS |
| GET | `/clients/:id` | SA, AS, LI, SS, DS |
| PATCH | `/clients/:id` | SA, AS |
| DELETE | `/clients/:id` | SA, AS |

## Software Products

| Method | Path | Roles |
|--------|------|-------|
| POST | `/software-products` | SA |
| GET | `/software-products` | any |
| GET | `/software-products/:id` | any |
| PATCH | `/software-products/:id` | SA |
| DELETE | `/software-products/:id` | SA |

## Licenses

| Method | Path | Roles |
|--------|------|-------|
| POST | `/licenses` | SA |
| GET | `/licenses` | SA, DV |
| GET | `/licenses/:id` | SA, DV |
| PATCH | `/licenses/:id/activate` | **DV only** |
| PATCH | `/licenses/:id/suspend` | SA |
| PATCH | `/licenses/:id` | SA |

## NENPOS Clients

| Method | Path | Roles |
|--------|------|-------|
| GET | `/nenpos-clients` | SA, AS |
| POST | `/nenpos-clients` | SA, AS |
| POST | `/nenpos-clients/upload` | SA, AS |
| PATCH | `/nenpos-clients/:id` | SA, AS |
| DELETE | `/nenpos-clients/:id` | SA, AS |
| DELETE | `/nenpos-clients` (all) | SA |

## Jobs

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | `/jobs` | SA | |
| GET | `/jobs` | SA, IN, AS, LI, SS | Scoped to own jobs only when the **primary** role is IN; `?mine=true` is a no-op for other roles |
| GET | `/jobs/calendar/month?month=&year=` | SA, IN, AS, LI, SS | **Not** installer-scoped |
| GET | `/jobs/calendar/day?date=` | SA, IN, AS, LI, SS | **Not** installer-scoped |
| GET | `/jobs/:id` | SA, IN, AS, LI, SS | |
| PATCH | `/jobs/:id/assign` | SA, AS | Forces `ASSIGNED`, notifies |
| PATCH | `/jobs/:id/status` | **IN only** | Own job only |
| POST | `/jobs/:id/proof` | **IN only** | Own job only |

## Job Orders

| Method | Path | Roles |
|--------|------|-------|
| POST | `/job-orders` (upsert) | SA, AS, LI, SS |
| GET | `/job-orders` | SA, AS, LI, SS |
| GET | `/job-orders/by-job/:jobId` | SA, AS, LI, SS, **DS** |
| GET | `/job-orders/:id` | SA, AS, LI, SS, **DS** |
| POST | `/job-orders/:id/convert` | SA, AS, LI, SS |

## Payments

| Method | Path | Roles |
|--------|------|-------|
| POST | `/job-orders/:id/payments` | SA, AS, SS |
| GET | `/job-orders/:id/payments` | SA, AS, SS |
| POST | `/payments/:id/void` | SA, AS |

## Inventory

| Method | Path | Roles |
|--------|------|-------|
| GET | `/inventory` | any |
| GET | `/inventory/barcode/:code` | any |
| GET | `/inventory/:id/movements` | any |
| POST | `/inventory` | SA, AS |
| PATCH | `/inventory/:id` | SA, AS |
| POST | `/inventory/:id/adjust` | SA, AS |
| DELETE | `/inventory/:id` | SA, AS |

## Earnings

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | `/earnings` | SA | |
| GET | `/earnings?mine=` | any | All for SA/AS, own for everyone else; `?mine=true` narrows SA/AS to their own |
| PATCH | `/earnings/:id/approve` | SA, AS | Not your own |
| PATCH | `/earnings/:id/paid` | SA, AS | Not your own |

## Withdrawals

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| GET | `/withdrawals/balance` | IN, DV, DS, LI, SS, AS | **SA excluded** |
| POST | `/withdrawals` | IN, DV, DS, LI, SS, AS | **SA excluded** |
| GET | `/withdrawals?mine=` | any | All for SA/AS, own for everyone else; `?mine=true` narrows SA/AS to their own |
| PATCH | `/withdrawals/:id/approve` | SA, AS | Not your own |
| PATCH | `/withdrawals/:id/reject` | SA, AS | Not your own |
| PATCH | `/withdrawals/:id/release` | SA, AS | Not your own; optional proof URL |

## KPIs & Incentives

| Method | Path | Roles |
|--------|------|-------|
| GET | `/kpis/financial-summary` | SA, AS |
| GET | `/kpis/revenue-trend` | SA, AS |
| GET | `/kpis/team?month=&year=` | SA, AS |
| POST | `/kpis/manual` | SA, AS |
| GET | `/kpis/incentives?month=&year=` | SA, AS |
| POST | `/kpis/incentives/generate` | SA, AS |
| PATCH | `/kpis/incentives/:id/approve` | SA, AS |
| PATCH | `/kpis/incentives/:id/pay` | SA, AS |
| GET | `/kpis/designers/points?from=&to=` | SA, AS |
| POST | `/kpis/designers/sync` | SA, AS |
| GET | `/kpis/definitions/:role` | SA, AS |
| POST | `/kpis/definitions` | SA, AS |
| PATCH | `/kpis/definitions/:id` | SA, AS |
| DELETE | `/kpis/definitions/:id` | SA, AS |
| GET | `/kpis/dashboard` | IN, DV, DS, SA, LI, SS, AS |
| GET | `/kpis/incentives/mine` | IN, DV, DS, LI, SS, AS (**SA excluded**) |

## Dev Projects

| Method | Path | Roles |
|--------|------|-------|
| POST | `/dev-projects` | DV, SA |
| GET | `/dev-projects` | DV, SA, AS |
| GET | `/dev-projects/developers` | DV, SA, AS |
| GET | `/dev-projects/reviewers` | DV, SA, AS |
| GET | `/dev-projects/active` | DV, SA, AS |
| GET | `/dev-projects/:id` | DV, SA, AS |
| PATCH | `/dev-projects/:id` | **SA only** |
| POST | `/dev-projects/:id/start` | DV, SA |
| POST | `/dev-projects/:id/pause` | DV, SA |
| POST | `/dev-projects/:id/resume` | DV, SA |
| POST | `/dev-projects/:id/stop` | DV, SA |
| PATCH | `/dev-projects/:id/progress` | DV, SA |
| POST | `/dev-projects/:id/reports` | DV, SA |
| POST | `/dev-projects/reports/:reportId/feedback` | SA, AS |

Beyond the role check, ownership is enforced: a developer may only touch their
own projects.

## Financial Reports

All under `/reports/financial`, guarded at the controller for **SA, AS, SS**.

| Method | Path |
|--------|------|
| GET | `/reports/financial/collections?from=&to=` |
| GET | `/reports/financial/outstanding` |
| GET | `/reports/financial/client/:clientId` |
| GET | `/reports/financial/export` |

## Notifications

| Method | Path | Roles |
|--------|------|-------|
| GET | `/notifications` | any (own only) |
| GET | `/notifications/unread-count` | any |
| PATCH | `/notifications/:id/read` | any (own only) |
| PATCH | `/notifications/read-all` | any |
| POST | `/notifications/device-token` | any |
| DELETE | `/notifications/device-token/:token` | any |

## Events (SSE)

| Method | Path | Roles |
|--------|------|-------|
| GET | `/events` | any |

## Uploads

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | `/uploads/images` | any | Field `files`, ≤10 files, ≤10 MB each, images only |
| GET | `/uploads/files/:filename` | **no guard** | Serves the stored file |

## Company Profile

| Method | Path | Roles |
|--------|------|-------|
| GET | `/company-profile` | any |
| PATCH | `/company-profile` | SA |

## Audit Logs

| Method | Path | Roles |
|--------|------|-------|
| GET | `/audit-logs` | **SA only** |

## Backups / Restore / Reset

Entire controller is **SA only**.

| Method | Path |
|--------|------|
| GET | `/backups` |
| POST | `/backups` |
| POST | `/backups/upload` |
| POST | `/backups/:filename/restore` |
| GET | `/backups/:filename/download` |
| DELETE | `/backups/:filename` |
| GET | `/backups/reset/modules` |
| POST | `/backups/reset/:moduleId` |

## Download Leads

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | `/download-leads/send-code` | **public** | 5 req/min per IP |
| POST | `/download-leads` | **public** | 10 req/min per IP |
| GET | `/download-leads` | SA, AS | |
| GET | `/download-leads/finara` | SA, AS | Live proxy |

---

## Standard error shapes

| Status | When |
|--------|------|
| **400** | Validation failure, illegal state transition, unknown property in the body, external-API failure |
| **401** | Missing/expired/invalid token, wrong credentials, wrong confirmation password, deactivated account |
| **403** | Role not permitted, acting on someone else's record, self-approval |
| **404** | Record not found |
| **409** | Uniqueness conflict (email, license key), or activating an already-activated license |
| **429** | Rate limit exceeded |
| **500** | Unexpected failure (backup/restore SQL errors surface here with a reason) |

## Authorization test recipe

For each endpoint above:

1. **No token** → expect 401.
2. **Token of a role NOT in the allowed set** → expect 403.
3. **Token of each allowed role** → expect 2xx.
4. Where noted (jobs, dev projects, earnings, withdrawals, notifications) →
   test with a *different owner's* record and expect 403.

**Expected:** front-end route guards are convenience only. Every one of these
checks must hold when called directly against the API.
</content>
