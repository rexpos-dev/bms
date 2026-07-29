# 04 — Dashboard & Navigation

Route: `/` (all roles). The heading always reads **"Welcome back, {first name}"**.

Beside the heading sit the **Quick Actions** buttons (visible on every role's
dashboard):

| Button | Action |
|--------|--------|
| **+ New Client** | Opens the *New Client* dialog with a pre-generated `CLT-XXXXXXXX` code (regenerate with ↺) |
| **+ New Quotation** | Navigates to `/job-orders/order/new?doc=QUOTATION` — a standalone quotation, no installation job required |
| **+ Create Job Order** | Navigates to `/job-orders/software` |

**Expected:** the New Client dialog resets its form and regenerates the code every
time it is opened, and again after a successful save.

## Role dashboards

The dashboard body is chosen by the user's **primary role**.

### Super Admin

Summary cards:

| Card | Value |
|------|-------|
| Total Revenue | `₱` sum of **FINALIZED** job-order sale prices (all time) |
| Monthly Growth | % change of this month's vs last month's finalized revenue, signed |
| Active Clients | `ACTIVE` clients / all clients |
| Activated Licenses | `ACTIVATED` licenses / all licenses |
| Open Installation Jobs | non-completed jobs / all jobs |
| Pending Withdrawals | `PENDING` withdrawals / all withdrawals |

Charts: **Licenses by Status** (Activated / Pending / Expired) and
**Installation Jobs** (Active = `ASSIGNED`+`ON_GOING`, Waiting =
`WAITING_ACTIVATION`, Completed).

Also present: a **calendar** of scheduled installations. Clicking a date opens a
dialog titled with the full date (e.g. *Monday, 3 August 2026*) listing that day's
jobs; an empty date shows **"No jobs scheduled on this date."**

### Installer

Cards: **Active Jobs**, **Awaiting Activation**, **Completed Jobs**,
**Pending Earnings**. Chart: *Job Status Distribution — Your job breakdown*.
Plus the same calendar, scoped to the installer's own jobs.

### Developer

Cards: **Pending Activations**, **Activated by Me**, **Pending Earnings**,
**Pending Withdrawals**. Charts: *License Status* (Pending / Activated by Me /
Other) and *Earnings & Withdrawals*.

### Designer

Cards: **Pending Earnings**, **Approved Earnings**, **Pending Withdrawals**.
Designers have no operational modules — their scorecard comes from TMS Pro.

### Liaison

Cards: **Active Clients**, **Pending Earnings**, **Approved Earnings**,
**Pending Withdrawals**.

### Admin Staff

Cards: **Active Jobs**, **Total Earnings**, **Pending Withdrawals**.

### Sales Staff

Cards: **Active Clients**, **Total Job Orders**, **Sales Pipeline**,
**Available Balance**. Charts: *Job Orders by Status* (Draft / Finalized /
On-Going / Completed / Cancelled) and *Client Portfolio* (Active / Expired /
Suspended / Cancelled). Below them, a **Recent Job Orders** list.

## KPI widget

Every KPI-eligible role sees a **Performance scorecard** card with the current
month's KPI table (Name, Actual, Target, Weight, Score) and the incentive
estimate. See [11 — KPI & Incentives](11-kpi-and-incentives.md).

## Additional-role task cards

If the signed-in user holds extra roles, the dashboard appends a task card per
extra role summarising that role's outstanding work — installer job counts,
developer pending activations and dev projects.

**Expected:** a user whose only role is primary sees no additional-role cards.

## Live data refresh

Any mutation anywhere in the system broadcasts an SSE event. The dashboard's
queries are invalidated on the relevant events, so counts update without a manual
reload.

**Expected:** with two browsers open (admin + installer), an installer submitting
proof updates the admin's *Open Installation Jobs* card without a refresh.

## Expected behaviour summary

| # | Assertion |
|---|-----------|
| 4.1 | Each of the 7 roles renders its own dashboard variant; no role sees another's cards |
| 4.2 | *Total Revenue* counts **only** `FINALIZED` job orders — a `DRAFT` or `COMPLETED` order must not move it |
| 4.3 | *Monthly Growth* shows `+100.0%` when the previous month was ₱0 and this month is positive, `0.0%` when both are ₱0 |
| 4.4 | Calendar dialog title is the localised long date (`en-PH`) |
| 4.5 | Quick Action *New Quotation* opens the JO editor pre-set to document type Quotation |
| 4.6 | Card denominators (`x / y`) always use the full unfiltered list length |
</content>
