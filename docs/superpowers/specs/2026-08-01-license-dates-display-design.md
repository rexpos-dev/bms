# License Install & Expiry Dates — Display Design

**Date:** 2026-08-01
**Status:** Approved (pending final spec review)

## Problem

In the admin Licenses table, a PENDING trial shows `—` in both the **Activated** and
**Expires** columns. An admin looking at the list cannot tell when the trial will expire,
and the word "Activated" does not obviously mean "installed on the client's machine".

Both columns are literally correct — the trial clock starts at activation
(`2026-07-24-trial-license-design.md`, "Countdown start: from activation"), so a PENDING
license genuinely has no `expirationDate` yet — but the display communicates nothing.

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Trial countdown start | **Unchanged — from activation.** `expirationDate = activationDate + trialDays`. The client gets the full trial period from install. |
| What "install date" means | **The activation date itself.** On-site developer activation *is* the install. Rename the column rather than add new data. |
| PENDING trial expiry cell | **Explain the rule:** muted `30 days after install` instead of `—`. No fabricated or drifting date. |
| Activated trial expiry cell | **Date + days remaining** (`Aug 23, 2026` / `12 days left`), turning red when close to expiry. |
| Scope | **Admin web + mobile**, so both screens read the same. |

## Non-goals (YAGNI)

- No change to when the trial clock starts.
- No new DB column, migration, or backend endpoint.
- No change to the daily auto-expire cron.
- No change to the Add/Edit License forms.

## Current state (reference)

- `LicensesService.activate` computes `expirationDate = activationDate + trialDays` for
  trials and persists it. Nothing else writes an expiry.
  (`src/licenses.service.ts:107-142`)
- `LicensesService.generate` stores a trial with `expirationDate: null`, `trialDays`
  (default 30), `status: PENDING`. (`src/licenses.service.ts:36-49`)
- Admin table renders `fmtDate(license.activationDate)` and `fmtDate(license.expirationDate)`
  under the headers `Activated` / `Expires`; `fmtDate` returns `—` for null.
  (`admin-web/src/pages/LicensesPage.tsx:14-16, 929-948`)
- View Details modal renders `Activation Date` / `Expiry Date` via the same helper.
  (`admin-web/src/pages/LicensesPage.tsx:794-797`)
- Mobile card renders `Expires: <date>` only when `expirationDate` is set; no install line.
  (`mobile/app/admin/licenses.tsx:25-27`)
- `admin-web/src/lib/types.ts` already carries `isTrial` and `trialDays`
  (`admin-web/src/lib/types.ts:64-65`); **`mobile/src/types.ts` does not**
  (`mobile/src/types.ts:98-103`).

**Everything needed is already on the client.** This is a presentation-only change.

## Design

### 1. Shared helper: `licenseDates(license)`

A pure function holding every rule, so components only render. One copy per package
(`admin-web` and `mobile` are separate packages with independently duplicated `types.ts`;
duplication follows the existing pattern).

```ts
type Tone = 'normal' | 'muted' | 'danger';

interface LicenseDatesView {
  installed: string;          // "Aug 1, 2026" | "Not yet installed"
  installedTone: Tone;
  expires: string;            // "Aug 31, 2026" | "30 days after install" | "No expiry"
  expiresTone: Tone;
  expiresNote: string | null; // "12 days left" | "Expired" | null
  expiresNoteTone: Tone;
}

function licenseDates(license: License): LicenseDatesView;
```

**Installed:**

| Condition | `installed` | `installedTone` |
|---|---|---|
| `activationDate` set | localized date | `normal` |
| `activationDate` null | `Not yet installed` | `muted` |

**Expires:**

| Condition | `expires` | `expiresTone` | `expiresNote` | `expiresNoteTone` |
|---|---|---|---|---|
| `expirationDate` set, `daysLeft > 7` | date | `normal` | `N days left` | `muted` |
| `expirationDate` set, `1 ≤ daysLeft ≤ 7` | date | `normal` | `N days left` | `danger` |
| `expirationDate` set, `daysLeft ≤ 0` | date | `normal` | `Expired` | `danger` |
| No `expirationDate`, `isTrial` | `{trialDays ?? 30} days after install` | `muted` | `null` | — |
| No `expirationDate`, not a trial | `No expiry` | `muted` | `null` | — |

- `daysLeft = Math.ceil((expiry.getTime() - Date.now()) / 86_400_000)`.
- `N days left` uses `1 day left` when `N === 1`.
- The note is derived purely from `expirationDate` vs. now, not from `status`. A SUSPENDED
  or EXPIRED license still shows its real date; the status badge already carries the state,
  so the note never contradicts it.

Date formatting keeps the existing `toLocaleDateString()` behavior.

### 2. Admin web — `LicensesPage.tsx`

- Add `licenseDates` next to `fmtDate` in the shared-helpers block at the top of the file.
  `fmtDate` stays for other call sites.
- Rename the table header `Activated` → **`Installed`**.
- Table cell renders `installed`, and the expires cell renders `expires` with `expiresNote`
  on a second line (smaller, tone-colored). Tones map to existing CSS variables:
  `muted → var(--text-muted)`, `danger → var(--danger)`, `normal → inherit`.
- View Details modal: `Activation Date` → **`Installed`**, and both rows use the helper so a
  PENDING trial reads `30 days after install` instead of `—`. The existing
  `Trial Period — N days from activation` row is unchanged.

### 3. Mobile — `app/admin/licenses.tsx`

- Add `isTrial?: boolean` and `trialDays?: number | null` to `License` in `mobile/src/types.ts`
  (optional, matching the surrounding style in that interface).
- Add `licenseDates` (same rules) as `mobile/src/license-dates.ts`, imported by the screen
  via the existing `@/` alias.
- The card gains two always-present meta lines, replacing the conditional expiry line:
  `Installed: <installed>` and `Expires: <expires>`, with `expiresNote` appended when
  present. Tones map to the existing card text colors, using `#dc2626` (already the EXPIRED
  status color in that file) for `danger`.

## Testing / verification

`admin-web` and `mobile` have no test runner (no vitest/jest configured), and there is no
backend change, so no automated tests are added.

Verification steps:

1. `npm run build` in `admin-web` — type check passes.
2. Existing PENDING trial row shows `Not yet installed` and `30 days after install`.
3. Activate that license — the row shows the activation date and the expiry date with
   `N days left`.
4. A license whose expiry is within 7 days shows the note in red; a past expiry shows `Expired`.
5. A non-trial license with no expiry shows `No expiry`.
6. Mobile licenses screen shows the same two lines for the same records.
