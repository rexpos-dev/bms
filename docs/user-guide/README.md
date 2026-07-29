# METRIQA — User Guide & QA Reference Manual

Complete functional manual for the **METRIQA** platform (internally still named
SDLMP — Software Deployment & License Management Platform).

This manual is written to serve two audiences at once:

- **End users** — step-by-step instructions for every screen and workflow.
- **QA** — the authoritative statement of *expected behaviour*. Every rule in
  here is derived from the shipped code, so a mismatch between this manual and
  the running app is a defect in one of the two.

## How to use this manual for testing

1. Start with [02 — Roles & Permissions](02-roles-and-permissions.md) and create
   one test account per role. Almost every defect in this system is role-scoped.
2. Work a module chapter (04–16) top to bottom. Each chapter ends with an
   **Expected behaviour** table — those are the assertions to verify.
3. Use [17 — Status Reference](17-status-reference.md) for the exact state
   machines. Illegal transitions must be rejected with the documented message.
4. Use [18 — API & Permission Matrix](18-api-permission-matrix.md) when testing
   authorization directly against the API (bypassing the UI).
5. Run [19 — QA Test Checklists](19-qa-test-checklists.md) as the regression pass.
6. Read [20 — Known Gaps & Troubleshooting](20-known-gaps-and-troubleshooting.md)
   **before** filing bugs — several UI/API permission mismatches are already
   documented there.

## Contents

| # | Chapter | Covers |
|---|---------|--------|
| 01 | [System Overview](01-system-overview.md) | Architecture, components, environments, glossary |
| 02 | [Roles & Permissions](02-roles-and-permissions.md) | 7 roles, primary vs additional roles, navigation matrix |
| 03 | [Getting Started](03-getting-started.md) | Login, sessions, profile, notifications, theme |
| 04 | [Dashboard & Navigation](04-dashboard-and-navigation.md) | Per-role dashboards, sidebar, live updates |
| 05 | [Clients](05-clients.md) | Client records, codes, statuses, types |
| 06 | [Products & Licenses](06-products-and-licenses.md) | Software products, license generation, trials, activation, NENPOS import |
| 07 | [Installations (Jobs)](07-installations.md) | Scheduling, assignment, proof of installation, calendar |
| 08 | [Job Orders & Payments](08-job-orders-and-payments.md) | 3-step wizard, doc types, pricing, payments, printing |
| 09 | [Inventory](09-inventory.md) | Items, barcodes, stock ledger, auto-deduction |
| 10 | [Earnings & Withdrawals](10-earnings-and-withdrawals.md) | Earning types, balance formula, payout workflow |
| 11 | [KPI & Incentives](11-kpi-and-incentives.md) | KPI definitions, scoring, incentive tiers, TMS sync |
| 12 | [Dev Projects](12-dev-projects.md) | Project timer, progress, reports, review feedback |
| 13 | [Financial Reports & Analytics](13-financial-reports-and-analytics.md) | Collections, outstanding, client history, revenue |
| 14 | [Leads & Landing Page](14-leads-and-landing-page.md) | Public download form, email OTP, Finara leads |
| 15 | [Settings & Administration](15-settings-and-administration.md) | Company profile, users, backups, restore, reset, audit logs |
| 16 | [Mobile App](16-mobile-app.md) | Beulah Field — tabs, admin menu, proof capture, push |
| 17 | [Status Reference](17-status-reference.md) | Every enum and state machine |
| 18 | [API & Permission Matrix](18-api-permission-matrix.md) | Endpoint-by-endpoint role requirements |
| 19 | [QA Test Checklists](19-qa-test-checklists.md) | Regression pass, per module |
| 20 | [Known Gaps & Troubleshooting](20-known-gaps-and-troubleshooting.md) | Documented mismatches, error catalogue |

## Conventions used

- `SUPER_ADMIN`, `ASSIGNED`, `FINALIZED` — literal enum values as stored and
  as returned by the API.
- "Admin" in UI copy means the `SUPER_ADMIN` role; the sidebar shows the label
  **Admin** for it.
- Currency is Philippine Peso (`₱`) throughout; amounts are `Decimal(12,2)` in
  the database and serialized as **strings** in API responses.
- Paths like `/job-orders/order/:joId` are admin-web routes; paths like
  `POST /api/licenses` are backend endpoints.
- **Expected:** marks an assertion QA should verify.
</content>
</invoke>
