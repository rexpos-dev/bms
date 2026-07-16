# Financial Reports — Detail Upgrade

**Date:** 2026-07-16
**Status:** Approved (full upgrade)

## Problem

The Financial Reports page is sparse: the Collections tab shows only a total
and one bar chart; Outstanding and Client History are bare tables with no
summaries.

## Design

### Backend — `FinancialReportsService.collectionsSummary`

Extend `CollectionsSummary` with:

- `byMonth: { month: string; total: number }[]` — collections per calendar
  month for the last 6 months **including the current month**, zero-filled,
  oldest first, `month` formatted `YYYY-MM`. Computed from a separate query
  (non-voided payments with `paidAt >=` start of month−5) so the trend is
  stable regardless of the from/to filter.
- `recentPayments: { id, paidAt, amount, method, clientName, jobOrderId }[]`
  — the 10 latest non-voided payments **within the from/to filter**, newest
  first (join through jobOrder → client for the name).

No endpoint/controller changes; CSV exports unchanged. New service spec file
covers byMonth zero-filling/windowing and recentPayments shape via a mocked
PrismaService (matching existing service-spec patterns).

### Frontend — `FinancialReportsPage.tsx` (+ `lib/types.ts`)

Reuse the EarningsPage stat-card pattern (`.card` + uppercase muted label +
big value + caption) as a local `StatCard` component.

**Collections tab**
1. Stat row: Total Collected (green), Payments count, Average Payment,
   Outstanding Receivables (red, from the existing outstanding endpoint —
   its query is enabled on this tab too).
2. Two-column area: by-method `SimpleBarChart` + breakdown table
   (Method / Count / Total / % share).
3. "Monthly Collections" trend — `SimpleBarChart` over `byMonth` with short
   month labels (e.g. `Feb`, `Mar`).
4. "Recent Payments" table: Date / Client / Method / JO # / Amount.

**Outstanding tab**
- Stat cards: Total Outstanding (red) and Unpaid JOs count.
- Table gains a JO # column and a totals footer row (grand total / paid /
  balance).

**Client History tab**
- Summary stat cards above the table once a client is selected: Total Paid,
  Payments count, Outstanding balance for that client (sum of the client's
  rows from the outstanding endpoint, enabled on this tab).

## Not changing

- Chart components (`SimpleBarChart` reused as-is), CSV exports, endpoints,
  DB schema.
