# 19 — QA Test Checklists

A regression pass, module by module. Each item states the action and the
**expected** result. Reference the chapter in brackets for the underlying rule.

## Test accounts to prepare

| # | Email | Primary role | Additional roles | Purpose |
|---|-------|--------------|------------------|---------|
| 1 | `qa.super@…` | `SUPER_ADMIN` | — | Full access, approvals |
| 2 | `qa.admin@…` | `ADMIN_STAFF` | — | Second approver, permission boundary |
| 3 | `qa.sales@…` | `SALES_STAFF` | — | Sales scope |
| 4 | `qa.liaison@…` | `LIAISON` | — | Liaison scope |
| 5 | `qa.installer@…` | `INSTALLER` | — | Field flow |
| 6 | `qa.installer2@…` | `INSTALLER` | — | Cross-ownership 403 tests |
| 7 | `qa.dev@…` | `DEVELOPER` | — | Activation + dev projects |
| 8 | `qa.designer@…` | `DESIGNER` | — | TMS KPI |
| 9 | `qa.multi@…` | `SALES_STAFF` | `INSTALLER` | Merged nav + merged permissions |

Give account 1 a distinct base bonus (e.g. ₱20,000) so incentive maths is
visibly per-user.

---

## A — Authentication & session [03]

- [ ] A1 Valid login returns `accessToken`, `refreshToken` and a `user` with both `role` and `roles`
- [ ] A2 Wrong password, unknown email and deactivated account all return the **same** `401 Invalid credentials`
- [ ] A3 11 login attempts in 60 s → the 11th returns **429**
- [ ] A4 Access token expiry triggers a silent refresh; the user's action still completes
- [ ] A5 Reusing an already-rotated refresh token → `401 Access denied`
- [ ] A6 Logout, then refresh → `401 Access denied`
- [ ] A7 Deactivating a signed-in user breaks their **next API call**, not just their next login
- [ ] A8 Both successful and failed logins appear in the audit log; no plaintext password anywhere
- [ ] A9 Profile: new password without current password → 400; wrong current password → 401
- [ ] A10 Profile: changing email to an existing one → 409

## B — Roles & navigation [02]

- [ ] B1 Each of the 9 accounts sees exactly the sidebar links in the navigation matrix
- [ ] B2 Account 9 sees the Sales nav plus an **Installer** section containing *My Jobs* only
- [ ] B3 Account 9 passes an `@Roles(INSTALLER)` endpoint (e.g. `PATCH /jobs/:id/status` on their own job)
- [ ] B4 Direct-URL navigation to a route the role lacks redirects instead of rendering
- [ ] B5 For every endpoint in [18], a disallowed role gets **403** and no token gets **401**
- [ ] B6 Setting a role as both primary and additional stores it once only

## C — Clients [05]

- [ ] C1 Create a client; the code matches `CLT-[A-HJ-NP-Z2-9]{8}`
- [ ] C2 Duplicate client code is rejected
- [ ] C3 `SALES_STAFF` / `LIAISON` can list clients but get 403 on create/update/delete
- [ ] C4 `GET /clients/:id` includes `licenses[]` and `jobs[]`
- [ ] C5 Search matches code, business, owner, contact and email
- [ ] C6 Deleting a client with licenses/jobs — record the exact behaviour (see [20])

## D — Products & licenses [06]

- [ ] D1 `ADMIN_STAFF` can view products but gets 403 on create/edit/delete
- [ ] D2 Non-trial license without a key → `400 License key is required for a non-trial license`
- [ ] D3 Duplicate license key → 409
- [ ] D4 Trial license: key matches `TRIAL-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}`, `expirationDate` is null, `trialDays` defaults to 30
- [ ] D5 `trialDays` of 0 or 366 → 400
- [ ] D6 Only `DEVELOPER` can activate; `SUPER_ADMIN` → 403
- [ ] D7 Activating a 7-day trial sets expiry to activation + 7 days
- [ ] D8 Re-activating → `409 License is already activated`
- [ ] D9 Trial → full edit clears `trialDays` and `expirationDate`, keeps `ACTIVATED` and the token
- [ ] D10 Full → trial on an activated license → `400 An activated license cannot be changed back to a trial`
- [ ] D11 Back-date an activated license's expiry, run the 02:00 sweep → status becomes `EXPIRED`; `PENDING` / null-expiry licenses are untouched
- [ ] D12 NENPOS upload: template downloads, first sheet imports, blank Client Name → 400, blank Client ID → auto `NPC-` code

## E — Installations [07]

- [ ] E1 Account 5 sees only their own jobs from `GET /jobs`
- [ ] E2 Account 6 changing account 5's job status → `403 You are not assigned to this job`
- [ ] E3 `SUPER_ADMIN` calling `PATCH /jobs/:id/status` → 403
- [ ] E4 Completing without any activated license → the documented 400 message
- [ ] E5 Activate **any** license for that client → completion now succeeds
- [ ] E6 Proof submission sets `WAITING_ACTIVATION`; re-submitting upserts one proof row and updates `capturedAt`
- [ ] E7 Reassigning an `ON_GOING` job resets it to `ASSIGNED` and notifies the new installer
- [ ] E8 Upload a PDF → 400; an 11 MB image → rejected; 11 images in one request → rejected
- [ ] E9 A job created without an installer shows **Unassigned**

## F — Job orders & payments [08]

- [ ] F1 Step 3 (Payments) is disabled until the order is saved
- [ ] F2 Grand Total = `max(0, salePrice + Σ(qty×price) − discount)`; matches screen, API, print and payments panel
- [ ] F3 Percentage discount applies to the subtotal, not the sale price alone
- [ ] F4 A discount larger than the subtotal clamps the total to ₱0
- [ ] F5 Installer Labor is shown but excluded from the Grand Total
- [ ] F6 CCTV order finalized with no installer → `400 Assign an installer to the job before finalizing.` and **nothing is saved**
- [ ] F7 CCTV with 0 cameras / 0 rate → the cameras-and-rate 400
- [ ] F8 Signage with 0 labor % → the signage 400
- [ ] F9 Finalizing twice creates exactly **one** `INSTALLATION` earning
- [ ] F10 `SOFTWARE` type never creates a labor earning
- [ ] F11 Saving replaces line items wholesale; removed rows disappear
- [ ] F12 Convert a quotation → job created and linked, `docType` becomes `JOB_ORDER`; converting again → `400 already linked`
- [ ] F13 Record a payment; balance drops. Void it; balance recovers and the row stays visible
- [ ] F14 Void with a 2-character reason → 400; voiding twice → `400 Payment is already voided`
- [ ] F15 `SALES_STAFF` can record a payment but has no Void button and gets 403 from the void API
- [ ] F16 **Overpayment** — record more than the balance and note the result (see [20])
- [ ] F17 Print each of the four doc types; letterhead, subtitle, filename prefix and signature label match [08]

## G — Inventory [09]

- [ ] G1 Duplicate barcode → `400 That barcode is already used by another item`
- [ ] G2 Manual adjust below zero → `400 Stock cannot go below zero`
- [ ] G3 Complete a job order needing more stock than exists → succeeds, balance goes negative
- [ ] G4 Each change writes one ledger row with the correct running balance
- [ ] G5 Complete → un-complete nets to zero stock change (one DEDUCTION + one RESTORE)
- [ ] G6 Edit quantities on a completed order → only the difference moves
- [ ] G7 Barcode lookup ignores inactive items
- [ ] G8 Delete an item → job-order lines survive with a null inventory link

## H — Earnings & withdrawals [10]

Run the worked example in chapter 10 end to end, then:

- [ ] H1 `PENDING` earnings do not raise the balance
- [ ] H2 Marking an earning `PAID` leaves the balance unchanged
- [ ] H3 `PENDING → PAID` on an earning → 400; `APPROVED → PENDING` → 400
- [ ] H4 Account 1 approving their own earning → 403; account 2 approving it → 200
- [ ] H5 Requesting more than the balance → `400 Insufficient balance. Available: ₱x, requested: ₱y.`
- [ ] H6 A `PENDING` withdrawal reserves its amount immediately
- [ ] H7 Rejecting a withdrawal returns the amount to the balance
- [ ] H8 `PENDING → RELEASED` (skipping approval) → 400
- [ ] H9 `RELEASED → REJECTED` → 400 (`RELEASED` is final)
- [ ] H10 Each status change produces a notification containing the peso amount
- [ ] H11 Release with a proof photo → the Proof column shows it; without → *No proof attached*
- [ ] H12 Non-admin users see only their own rows from the API
- [ ] H13 `SUPER_ADMIN` gets 403 on `GET /withdrawals/balance` and `POST /withdrawals`

## I — KPI & incentives [11]

- [ ] I1 Complete 9 of 10 jobs for account 5 in one month → *Installation Completion Rate* = 90 %, score = 35
- [ ] I2 Actual above target never scores more than the full weight
- [ ] I3 Zero denominators produce 0, not `NaN`
- [ ] I4 Enter a manual value for an auto KPI → it overrides and is flagged manual
- [ ] I5 Total scores of 95.00 / 94.99 / 89.99 / 74.99 pay 100 / 75 / 50 / 0 %
- [ ] I6 Generate incentives twice for the same month → one incentive, one bonus earning
- [ ] I7 Approve an incentive → the mirrored earning becomes `APPROVED` and the balance rises
- [ ] I8 A user scoring below 75 → ₱0 incentive and **no** bonus earning
- [ ] I9 `SUPER_ADMIN` never appears in team KPI or incentive generation
- [ ] I10 Renaming a system-tracked KPI → `400 Cannot rename a system-tracked KPI`
- [ ] I11 Duplicate KPI name for a role → 409; a KPI for `SUPER_ADMIN` → 400
- [ ] I12 Designer sync with no token → the documented 400; with a bad token → the 401/non-JSON 400
- [ ] I13 Designer sync distributes points by weight; unmatched designers are written `applied: false`

## J — Dev projects [12]

- [ ] J1 A developer sees and acts on only their own projects
- [ ] J2 `ADMIN_STAFF` can view all projects but gets 403 on start/stop/edit
- [ ] J3 Start project B while A runs → A auto-stops as `PENDING` with its time banked
- [ ] J4 Start → 60 s → pause → 60 s idle → resume → 60 s → stop = **2 minutes** total
- [ ] J5 Pause when not running → 403; resume when not paused → 403
- [ ] J6 Start a `COMPLETED` project → `403 This project is already completed`
- [ ] J7 Progress 100 % on a running project completes it and ends the run
- [ ] J8 Dropping a completed project below 100 % re-opens it as `PENDING`
- [ ] J9 Tag a non-admin as reviewer → 404
- [ ] J10 Tagged admin posts feedback → report `REVIEWED` + author notified; an untagged non-Super-Admin → 403
- [ ] J11 Assign a project to a non-`DEVELOPER` user → `404 Developer not found`

## K — Financial reports [13]

- [ ] K1 Voided payments are excluded everywhere
- [ ] K2 The `to` filter includes the whole end day
- [ ] K3 The 6-month trend does not change when from/to narrows
- [ ] K4 `recentPayments` caps at 10
- [ ] K5 `CANCELLED` job orders never appear in outstanding; `DRAFT` ones do
- [ ] K6 A fully paid order drops off outstanding
- [ ] K7 CSV export row count matches the on-screen table
- [ ] K8 `LIAISON` / `INSTALLER` / `DEVELOPER` / `DESIGNER` get 403 on all four endpoints

## L — Leads [14]

- [ ] L1 Second `send-code` inside 60 s → the cooldown 400
- [ ] L2 6th `send-code` inside a minute → 429
- [ ] L3 Code expires after 10 minutes
- [ ] L4 5 wrong attempts discard the code with *Too many attempts*
- [ ] L5 Resend unconfigured → `{ sent: false }`, lead still submittable as `emailVerified: false`
- [ ] L6 A used code cannot be reused
- [ ] L7 Emails are stored trimmed and lower-cased
- [ ] L8 Both public endpoints work with **no** Authorization header
- [ ] L9 Finara tab fetches only when opened; upstream failure shows a readable 400

## M — Settings & administration [15]

- [ ] M1 Every `/settings` tab is 403/redirect for all non-Super-Admins
- [ ] M2 Password under 8 characters at user creation → 400
- [ ] M3 Duplicate email on create and on edit → 409
- [ ] M4 No users API response contains a password hash
- [ ] M5 Company profile change appears on the next print preview
- [ ] M6 Create a backup; it appears in the list with a non-zero size
- [ ] M7 Upload a `.txt` renamed to `.sql`? → accepted by extension (document the result); a genuine `.txt` → `400 Only .sql backup files can be uploaded.`
- [ ] M8 Upload with a path-traversal filename → the stored name is sanitised inside `backups/`
- [ ] M9 Restore with a wrong password → `401 Incorrect password`
- [ ] M10 Module restore with no modules → 400; with an unknown id → 400; with modules absent from the dump → the documented 400
- [ ] M11 After a module restore, the scratch database `sdlmp_restore_*` is gone
- [ ] M12 Reset requires the password; a failed backup aborts the reset with nothing deleted
- [ ] M13 Reset never removes Users, Clients, Products, Company Profile, Inventory or KPI definitions
- [ ] M14 Reset `kpi` keeps KPI definitions and unlinks incentives from earnings
- [ ] M15 Audit log metadata masks every sensitive key

## N — Mobile [16]

- [ ] N1 Tokens survive an app restart; a 401 refreshes silently
- [ ] N2 Admins see *Dashboard / Menu / Profile*; field staff see *Dashboard / My Jobs / Earnings / Profile*
- [ ] N3 An installer's job list contains only their own jobs
- [ ] N4 Photo + GPS proof submission lands on the web portal immediately
- [ ] N5 *Mark complete* is blocked with the same message as the web
- [ ] N6 The Server switcher persists across restarts and defaults to **prod**
- [ ] N7 A non-admin deep-linking to `/admin/clients` is redirected to the tabs
- [ ] N8 Withdrawal requests obey the same balance rules

## O — Cross-cutting

- [ ] O1 Every mutation appears in the audit log with the right action name and actor
- [ ] O2 SSE: a change made in one browser updates another browser's dashboard and sidebar dot without a reload
- [ ] O3 Posting an unknown property to any endpoint → 400 (`forbidNonWhitelisted`)
- [ ] O4 301 requests in 60 s from one IP → 429
- [ ] O5 Sidebar collapse state survives a reload; the mobile drawer closes on navigation
- [ ] O6 Light and dark themes are both legible on every page, and the theme persists
- [ ] O7 Peso amounts render with the `₱` symbol and thousands separators throughout
- [ ] O8 Every list has a distinct empty state, no-match state and error state (see each chapter for the exact strings)

---

## Smoke test (15 minutes)

The shortest path that exercises the whole chain:

1. Sign in as Super Admin → create a client
2. Create a software product → generate a **trial** license for that client
3. Create an installation job for the client, assign account 5
4. Sign in as account 7 (developer) → activate the license with a fingerprint
5. Sign in as account 5 (mobile or web) → start the job, submit proof → `WAITING_ACTIVATION`
6. Mark complete → succeeds because the license is activated
7. Super Admin → create a **CCTV** job order on that job with 4 cameras @ ₱500,
   two line items, 10 % discount → finalize → verify Grand Total and that a
   ₱2,000 `INSTALLATION` earning appeared for account 5
8. Record a partial payment → check the balance on the order and in Financial Reports
9. Approve account 5's earning (as Super Admin) → account 5 requests a withdrawal →
   approve → release with proof
10. Generate incentives for the current month → check the KPI scorecard and the
    mirrored bonus earning
11. Settings → create a backup → confirm it lists and downloads
</content>
