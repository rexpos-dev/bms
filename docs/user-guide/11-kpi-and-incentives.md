# 11 — KPI & Incentives

Locations:

| Screen | Route | Roles |
|--------|-------|-------|
| Performance scorecard widget | `/` (Dashboard) | every KPI role |
| Analytics & KPI | `/analytics` | `SUPER_ADMIN` |
| KPI Settings | `/settings` → *KPI Settings* tab | `SUPER_ADMIN` |

## KPI-eligible roles

`INSTALLER`, `DEVELOPER`, `DESIGNER`, `LIAISON`, `SALES_STAFF`, `ADMIN_STAFF`.

**`SUPER_ADMIN` is not KPI-tracked** — it is excluded from team KPI listings and
from incentive generation.

## Scoring

For each KPI definition:

```
score = min(actual / target, 1) × weight        (0 when target ≤ 0)
totalScore = Σ score over all of the role's KPIs
```

Actual values are rounded to 1 decimal for display; scores to 2 decimals.

### Incentive tiers

```
totalScore ≥ 95  →  100 % of base bonus
totalScore ≥ 90  →   75 %
totalScore ≥ 85  →   50 %
totalScore ≥ 80  →   25 %
totalScore ≥ 75  →   10 %
below 75         →    0 %
```

`incentiveEstimate = baseBonus × tier%`

**Base bonus** is per-user (`users.base_bonus`, default **₱10,000**), editable on
the Users screen. It represents the salary grade the bonus is computed from.

**Expected:** a total score of exactly 95.00 pays 100 %; 94.99 pays 75 %.

## Default KPI definitions

Seeded into `kpi_definitions` once per role at startup, then the **database is the
source of truth**. `auto: true` means the value is computed by the system;
`auto: false` means it must be entered manually.

### INSTALLER

| KPI | Weight | Target | Unit | Auto |
|-----|-------:|-------:|------|:----:|
| Installation Completion Rate | 35 | 90 | % | ✓ |
| Proof Submission Rate | 30 | 100 | % | ✓ |
| Monthly Activity | 15 | 100 | % | ✓ |
| Customer Satisfaction | 15 | 90 | /100 | |
| Safety Compliance | 5 | 100 | % | |

Auto formulas (for jobs whose `scheduleDate` falls in the selected month):

```
Installation Completion Rate = completed / total × 100
Proof Submission Rate        = (jobs in WAITING_ACTIVATION|COMPLETED with a proof)
                             / (jobs in WAITING_ACTIVATION|COMPLETED) × 100
Monthly Activity             = min(total / 10, 1) × 100
```
All three return **0** when their denominator is 0.

### DEVELOPER

| KPI | Weight | Target | Unit | Auto |
|-----|-------:|-------:|------|:----:|
| License Activations | 40 | 10 | count | ✓ |
| Activation Quality | 30 | 90 | % | ✓ |
| On-Time Activation Rate | 20 | 95 | % | |
| Quality Score | 10 | 90 | /100 | |

```
License Activations = licenses activated by this developer in the month
Activation Quality  = (their licenses currently ACTIVATED) / (all licenses they ever activated) × 100
```

Note that *Activation Quality* is **all-time**, not month-scoped — a license that
later expires lowers it.

### DESIGNER

| KPI | Weight | Target | Unit | Auto |
|-----|-------:|-------:|------|:----:|
| On-Time Design Completion | 35 | 90 | % | ✓ |
| Monthly Activity | 25 | 100 | % | ✓ |
| First Approval Rate | 20 | 80 | % | |
| Design Quality Score | 20 | 90 | /100 | |

Designer actuals do **not** come from a local formula — they are populated from
TMS Pro (see below). Until a sync runs, auto designer KPIs read 0.

### LIAISON

| KPI | Weight | Target | Unit |
|-----|-------:|-------:|------|
| Project Completion Rate | 30 | 95 | % |
| On-Time Permit Processing | 20 | 100 | % |
| Client Satisfaction | 20 | 90 | /100 |
| Documentation Accuracy | 15 | 98 | % |
| Response Time | 15 | 90 | /100 |

All manual.

### SALES_STAFF

| KPI | Weight | Target | Unit |
|-----|-------:|-------:|------|
| Sales Target Achievement | 35 | 100 | % |
| Job Orders Closed | 25 | 10 | count |
| New Client Acquisitions | 20 | 5 | count |
| Client Satisfaction | 20 | 90 | /100 |

All manual.

### ADMIN_STAFF

| KPI | Weight | Target | Unit |
|-----|-------:|-------:|------|
| Task Completion Rate | 30 | 95 | % |
| Documentation Accuracy | 25 | 98 | % |
| Attendance & Punctuality | 25 | 100 | % |
| Supervisor Rating | 20 | 90 | /100 |

All manual.

## Manual override

A stored `KpiResult` with `isManual = true` **always overrides** the auto
computation for that KPI, user, month and year.

`POST /api/kpis/manual` (roles `SUPER_ADMIN`, `ADMIN_STAFF`) — from the
Analytics page's **Enter Manual KPI** dialog. It upserts on
`(userId, month, year, kpiName)` and recomputes the score immediately.
Unknown KPI name for that user's role →
`404 KPI "{name}" not found for role {ROLE}`.

**Expected:** entering a manual value for an `auto: true` KPI (e.g. an installer's
*Installation Completion Rate*) replaces the computed value and the row shows as
manual.

## Managing KPI definitions

Settings → **KPI Settings**. Columns: **KPI Name · Weight (%) · Target · Unit ·
Type**, plus a **Total weight** readout.

| Operation | Endpoint | Rules |
|-----------|----------|-------|
| List for a role | `GET /api/kpis/definitions/:role` | Seeds defaults on first access |
| Create | `POST /api/kpis/definitions` | Always created with `auto: false`, `isCustom: true`. Non-KPI role → `400 Role {X} does not have KPI tracking`. Duplicate name → `409 KPI "{name}" already exists for {ROLE}` |
| Update | `PATCH /api/kpis/definitions/:id` | Renaming a **system-tracked** (`auto: true`) KPI → `400 Cannot rename a system-tracked KPI`. Weight/target/unit are always editable |
| Delete | `DELETE /api/kpis/definitions/:id` | Allowed for built-in KPIs too |

Roles for all four: `SUPER_ADMIN`, `ADMIN_STAFF`.

> Total weight is **not validated to 100**. A role whose weights sum to 120 can
> score above 100 and always land in the top incentive tier. Verify against
> product intent — noted in [20 — Known Gaps](20-known-gaps-and-troubleshooting.md).

## Generating incentives

`POST /api/kpis/incentives/generate` with `{ month, year, baseBonus? }`
(roles `SUPER_ADMIN`, `ADMIN_STAFF`).

For every **active** user in a KPI role:

1. `base = user.baseBonus || dto.baseBonus || 10000`
2. Compute `totalScore` for the month
3. `bonusAmount = base × incentivePct(totalScore)`
4. Upsert the `Incentive` on `(userId, month, year)` — status `PENDING` on create,
   amounts refreshed on re-run
5. **Mirror it into the earnings ledger**

The supplied `dto.baseBonus` is only a **fallback** for users with no base bonus
set — it does not override per-user values.

### Incentive ↔ Earning mirroring

Linked 1:1 via `Earning.incentiveId`, so repeated generation is idempotent.

| Incentive status | Earning status |
|-----------------|----------------|
| `PENDING` | `PENDING` |
| `APPROVED` | `APPROVED` |
| `PAID` | `PAID` |

The earning has `type = BONUS`. If the bonus amount is **0**, any existing linked
earning is **deleted** rather than kept at zero.

Approving (`PATCH /api/kpis/incentives/:id/approve`) or paying
(`PATCH /api/kpis/incentives/:id/pay`) an incentive re-syncs the earning.

**Expected:**
- Approving an incentive raises the recipient's withdrawable balance by the bonus
  amount (because the mirrored earning becomes `APPROVED`).
- Regenerating the same month twice produces one incentive and one earning.
- A user who scores below 75 gets a ₱0 incentive and **no** bonus earning.

### Viewing incentives

| Endpoint | Roles | Returns |
|----------|-------|---------|
| `GET /api/kpis/incentives?month=&year=` | `SUPER_ADMIN`, `ADMIN_STAFF` | All, sorted year ↓, month ↓, amount ↓ |
| `GET /api/kpis/incentives/mine` | every role except `SUPER_ADMIN` | Your own, newest first |

## Team KPI (Analytics page)

Heading **Analytics & KPI**. Sections:

- **Total Revenue** (*All-time finalized sales*), **This Month**, **Last Month**
  (*Previous month total*)
- **Team KPI Performance** table: Name · Role · Score · Base Bonus · Incentive ·
  Status · Actions, sorted by total score descending. Empty:
  **"No active team members found."**
- **Enter Manual KPI** dialog. Success toast: **"Saved successfully."**

`GET /api/kpis/team?month=&year=` powers it (roles `SUPER_ADMIN`, `ADMIN_STAFF`);
only **active** users in KPI roles are included.

### Financial figures on this page

| Endpoint | Definition |
|----------|-----------|
| `GET /api/kpis/financial-summary` | Revenue = Σ `salePrice` of **`FINALIZED`** job orders. Growth = (current − previous) / previous × 100; when the previous month is ₱0 → 100 % if this month is positive, else 0 %. Also returns revenue split by product name (`Other` when no product). |
| `GET /api/kpis/revenue-trend` | Last **6** months including the current one, oldest first, again `FINALIZED` only |

> ⚠️ Revenue here counts **only `FINALIZED`** orders — an `ON_GOING` or
> `COMPLETED` order is *excluded*. This is a real behaviour to confirm with the
> product owner; see [20 — Known Gaps](20-known-gaps-and-troubleshooting.md).

## Designer KPI — TMS Pro integration

Designer points come from an external system (TMS Pro).

| Endpoint | Purpose |
|----------|---------|
| `GET /api/kpis/designers/points` | Read-only preview: matched designers + the raw TMS roster |
| `POST /api/kpis/designers/sync` | Pull points and write them as manual KPI results |

Configuration: `TMS_KPI_API_URL` (default `https://tmspro.up.railway.app`) and
`TMS_KPI_API_TOKEN` (needs the `kpi:read` ability). The call is
`GET {base}/api/v1/kpi/export?from=&to=`.

**Matching:** designers (primary role *or* additional role `DESIGNER`, active only)
are matched to TMS employees **by email first**, then by normalised full name.
The UI's **TMS Match** column shows how each matched, or that it didn't.

**Sync maths:** each designer's `total_points` is distributed across their
DESIGNER KPI definitions **proportionally to weight**:

```
allocated(kpi) = totalPoints × (kpi.weight / Σ weights)
```

and stored as a manual `KpiResult`. Default date range when none is given: the
first to the last day of the requested month.

Error handling (all surface as **400** with a readable reason):

| Situation | Message |
|-----------|---------|
| No token configured | `TMS_KPI_API_TOKEN is not configured on the server.` |
| Network failure | `Could not reach the TMS KPI API.` |
| HTTP 401 | `TMS KPI API rejected the token (401 Unauthorized).` |
| Other non-2xx | `TMS KPI API returned HTTP {status}.` |
| Non-JSON body (HTML login redirect) | `TMS KPI API did not return JSON — the token may be invalid or lack the kpi:read ability.` |

Unmatched designers are returned with `applied: false` and `totalScore: 0` — they
are **not** written to.

## Expected behaviour summary

| # | Assertion |
|---|-----------|
| 11.1 | `score = min(actual/target, 1) × weight` — exceeding the target never earns more than the full weight |
| 11.2 | Tier boundaries are inclusive at 95 / 90 / 85 / 80 / 75 |
| 11.3 | Manual values override auto values for the same KPI/month |
| 11.4 | KPI definitions seed once per role; edits persist and are not re-seeded |
| 11.5 | System-tracked KPIs cannot be renamed |
| 11.6 | Incentive generation is idempotent per (user, month, year) |
| 11.7 | Incentive status and the mirrored `BONUS` earning status always match |
| 11.8 | A ₱0 incentive leaves no bonus earning behind |
| 11.9 | `SUPER_ADMIN` never appears in team KPI or incentive generation |
| 11.10 | TMS sync distributes points by weight and writes nothing for unmatched designers |
| 11.11 | Every TMS/Finara failure mode returns a readable 400, never a 500 |
</content>
