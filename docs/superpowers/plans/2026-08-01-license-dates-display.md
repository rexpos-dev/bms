# License Install & Expiry Dates Display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Licenses screens show when a license was installed and when it expires — including a meaningful expiry hint for trials that are not activated yet.

**Architecture:** Presentation-only change. All the data (`activationDate`, `expirationDate`, `isTrial`, `trialDays`) is already returned by `GET /licenses`. A single pure function per package, `licenseDates(license)`, turns a license record into display strings plus a colour "tone"; the components only render what it returns. No backend, DB, or API change.

**Tech Stack:** React 19 + TypeScript + Vite (`admin-web`), Expo / React Native + TypeScript (`mobile`).

**Spec:** `docs/superpowers/specs/2026-08-01-license-dates-display-design.md`

## Global Constraints

- **Do not change when the trial countdown starts.** It stays `expirationDate = activationDate + trialDays`, computed at activation in `src/licenses.service.ts`. No file under `src/` or `prisma/` is touched by this plan.
- **Exact copy strings** (used verbatim in both packages): `Not yet installed`, `No expiry`, `Expired`, `{N} days after install`, `1 day left`, `{N} days left`.
- **Days-left formula:** `Math.ceil((expiry.getTime() - Date.now()) / 86_400_000)`. Danger tone when `daysLeft <= 7` (this includes `Expired`), muted otherwise.
- **Default trial length** when `trialDays` is null: `30`.
- **Date formatting:** `new Date(value).toLocaleDateString()` — matches the existing `fmtDate` behaviour.
- Neither `admin-web` nor `mobile` has a test runner configured. Verification is a type-check/build plus the manual UI checks written into each task. Do not add a test framework.

---

### Task 1: `licenseDates` helper + Licenses table columns (admin web)

**Files:**
- Modify: `admin-web/src/pages/LicensesPage.tsx:12-16` (shared-helpers block — add below `fmtDate`)
- Modify: `admin-web/src/pages/LicensesPage.tsx:929-948` (table header + row cells)

**Interfaces:**
- Consumes: `License` from `../lib/types` (already imported at `admin-web/src/pages/LicensesPage.tsx:8`); it already carries `isTrial: boolean` and `trialDays: number | null`.
- Produces: `type Tone`, `interface LicenseDatesView`, `function licenseDates(license: License): LicenseDatesView`, `const TONE_COLOR`, and `function LicenseDateCells({ license }: { license: License })` — all module-scope in `LicensesPage.tsx`, reused by Task 2.

- [ ] **Step 1: Add the helper below `fmtDate`**

In `admin-web/src/pages/LicensesPage.tsx`, immediately after the `fmtDate` function (line 16), insert:

```tsx
type Tone = 'normal' | 'muted' | 'danger';

interface LicenseDatesView {
  installed: string;
  installedTone: Tone;
  expires: string;
  expiresTone: Tone;
  expiresNote: string | null;
  expiresNoteTone: Tone;
}

const DAY_MS = 86_400_000;

const TONE_COLOR: Record<Tone, string | undefined> = {
  normal: undefined,
  muted: 'var(--text-muted)',
  danger: 'var(--danger)',
};

/**
 * Display strings for a license's install (= activation) and expiry dates.
 * A trial's clock only starts at activation, so a PENDING trial has no expiry
 * date yet — it shows the rule ("30 days after install") instead of a blank.
 */
function licenseDates(license: License): LicenseDatesView {
  const installed = license.activationDate
    ? new Date(license.activationDate).toLocaleDateString()
    : 'Not yet installed';
  const installedTone: Tone = license.activationDate ? 'normal' : 'muted';

  if (license.expirationDate) {
    const daysLeft = Math.ceil((new Date(license.expirationDate).getTime() - Date.now()) / DAY_MS);
    return {
      installed,
      installedTone,
      expires: new Date(license.expirationDate).toLocaleDateString(),
      expiresTone: 'normal',
      expiresNote: daysLeft <= 0 ? 'Expired' : daysLeft === 1 ? '1 day left' : `${daysLeft} days left`,
      expiresNoteTone: daysLeft <= 7 ? 'danger' : 'muted',
    };
  }

  return {
    installed,
    installedTone,
    expires: license.isTrial ? `${license.trialDays ?? 30} days after install` : 'No expiry',
    expiresTone: 'muted',
    expiresNote: null,
    expiresNoteTone: 'muted',
  };
}

/** The Installed + Expires `<td>` pair for one table row. */
function LicenseDateCells({ license }: { license: License }) {
  const d = licenseDates(license);
  return (
    <>
      <td style={{ whiteSpace: 'nowrap', color: TONE_COLOR[d.installedTone] }}>{d.installed}</td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <div style={{ color: TONE_COLOR[d.expiresTone] }}>{d.expires}</div>
        {d.expiresNote && (
          <div style={{ fontSize: '0.75rem', color: TONE_COLOR[d.expiresNoteTone] }}>
            {d.expiresNote}
          </div>
        )}
      </td>
    </>
  );
}
```

Leave `fmtDate` in place — other call sites still use it.

- [ ] **Step 2: Rename the table header**

At `admin-web/src/pages/LicensesPage.tsx:929`, change:

```tsx
                          <th>Activated</th>
```

to:

```tsx
                          <th>Installed</th>
```

Leave `<th>Expires</th>` on the next line unchanged.

- [ ] **Step 3: Swap the two row cells for the component**

At `admin-web/src/pages/LicensesPage.tsx:947-948`, replace these two lines:

```tsx
                              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(license.activationDate)}</td>
                              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(license.expirationDate)}</td>
```

with:

```tsx
                              <LicenseDateCells license={license} />
```

- [ ] **Step 4: Type-check and build**

Run: `cd admin-web && npm run build`
Expected: PASS — `tsc -b` reports no errors and vite writes `dist/`. Note `noUnusedLocals` is on (`admin-web/tsconfig.app.json`), so any leftover unused local breaks the build; `fmtDate` is fine — the NENPOS Clients tab in the same file still calls it (lines 341-342, 472-473, 483).

- [ ] **Step 5: Verify in the running app**

Run the dev server (`cd admin-web && npm run dev`) and open the **Licenses** tab as an admin.

Expected on the existing `TRIAL-4R3Z-PVWW` / CZZ Mini Store row (status PENDING):
- Column header reads **Installed**, not Activated
- Installed cell reads `Not yet installed` in muted grey
- Expires cell reads `30 days after install` in muted grey

- [ ] **Step 6: Commit**

```bash
git add admin-web/src/pages/LicensesPage.tsx
git commit -m "feat(admin-web): show install date and trial expiry in licenses table"
```

---

### Task 2: License Details modal uses the same dates (admin web)

**Files:**
- Modify: `admin-web/src/pages/LicensesPage.tsx` (add `LicenseDateDetails` beside `LicenseDateCells` from Task 1)
- Modify: `admin-web/src/pages/LicensesPage.tsx:794-797` (the Activation Date / Expiry Date grid inside the View dialog)

**Interfaces:**
- Consumes: `licenseDates`, `TONE_COLOR`, `DetailRow` (defined at `admin-web/src/pages/LicensesPage.tsx:31-38`), all from Task 1 / existing code.
- Produces: `function LicenseDateDetails({ license }: { license: License })`.

- [ ] **Step 1: Add the detail component**

In `admin-web/src/pages/LicensesPage.tsx`, immediately after the `LicenseDateCells` function added in Task 1, insert:

```tsx
/** The Installed + Expiry Date rows inside the View Details dialog. */
function LicenseDateDetails({ license }: { license: License }) {
  const d = licenseDates(license);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
      <DetailRow
        label="Installed"
        value={<span style={{ color: TONE_COLOR[d.installedTone] }}>{d.installed}</span>}
      />
      <DetailRow
        label="Expiry Date"
        value={
          <>
            <span style={{ color: TONE_COLOR[d.expiresTone] }}>{d.expires}</span>
            {d.expiresNote && (
              <div style={{ fontSize: '0.78rem', color: TONE_COLOR[d.expiresNoteTone] }}>
                {d.expiresNote}
              </div>
            )}
          </>
        }
      />
    </div>
  );
}
```

`DetailRow` is declared above this point in the file, so no import or reordering is needed.

- [ ] **Step 2: Use it in the View dialog**

At `admin-web/src/pages/LicensesPage.tsx:794-797`, replace this block:

```tsx
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <DetailRow label="Activation Date" value={fmtDate(viewLicense.activationDate)} />
                  <DetailRow label="Expiry Date" value={fmtDate(viewLicense.expirationDate)} />
                </div>
```

with:

```tsx
                <LicenseDateDetails license={viewLicense} />
```

Leave the `Trial Period — {trialDays} days from activation` row above it untouched.

- [ ] **Step 3: Type-check and build**

Run: `cd admin-web && npm run build`
Expected: PASS with no errors. Keep `fmtDate` — the NENPOS Clients tab in the same file still uses it, so `noUnusedLocals` will not complain.

- [ ] **Step 4: Verify in the running app**

In the Licenses tab, click **View** on the PENDING trial row.

Expected in the dialog:
- The label reads **Installed** (not "Activation Date") with the value `Not yet installed`
- **Expiry Date** reads `30 days after install`
- The `Trial Period` row still reads `30 days from activation`

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/pages/LicensesPage.tsx
git commit -m "feat(admin-web): show install date and trial expiry in license details"
```

---

### Task 3: Same dates on the mobile licenses screen

**Files:**
- Modify: `mobile/src/types.ts:98-103` (add `isTrial` / `trialDays` to `License`)
- Create: `mobile/src/license-dates.ts`
- Modify: `mobile/app/admin/licenses.tsx:25-27` (replace the conditional expiry line)

**Interfaces:**
- Consumes: `License` from `mobile/src/types.ts`; `cardStyles as s` from `@/AdminList` (already imported by the screen — `s.meta` is `{ fontSize: 13, color: '#6b7280' }`).
- Produces: `mobile/src/license-dates.ts` exporting `type Tone`, `interface LicenseDatesView`, and `licenseDates(license: License): LicenseDatesView` — the same shape and the same strings as the admin-web copy in Task 1.

- [ ] **Step 1: Extend the mobile `License` type**

In `mobile/src/types.ts`, the `License` interface starts at line 98. Add the two trial fields after `expirationDate`:

```ts
  activationDate?: string | null;
  expirationDate?: string | null;
  isTrial?: boolean;
  trialDays?: number | null;
```

They are optional to match the surrounding style in that interface.

- [ ] **Step 2: Create the helper module**

Create `mobile/src/license-dates.ts`:

```ts
import type { License } from './types';

export type Tone = 'normal' | 'muted' | 'danger';

export interface LicenseDatesView {
  installed: string;
  installedTone: Tone;
  expires: string;
  expiresTone: Tone;
  expiresNote: string | null;
  expiresNoteTone: Tone;
}

const DAY_MS = 86_400_000;

/**
 * Display strings for a license's install (= activation) and expiry dates.
 * A trial's clock only starts at activation, so a PENDING trial has no expiry
 * date yet — it shows the rule ("30 days after install") instead of a blank.
 * Mirrors the copy used by admin-web's LicensesPage.
 */
export function licenseDates(license: License): LicenseDatesView {
  const installed = license.activationDate
    ? new Date(license.activationDate).toLocaleDateString()
    : 'Not yet installed';
  const installedTone: Tone = license.activationDate ? 'normal' : 'muted';

  if (license.expirationDate) {
    const daysLeft = Math.ceil((new Date(license.expirationDate).getTime() - Date.now()) / DAY_MS);
    return {
      installed,
      installedTone,
      expires: new Date(license.expirationDate).toLocaleDateString(),
      expiresTone: 'normal',
      expiresNote: daysLeft <= 0 ? 'Expired' : daysLeft === 1 ? '1 day left' : `${daysLeft} days left`,
      expiresNoteTone: daysLeft <= 7 ? 'danger' : 'muted',
    };
  }

  return {
    installed,
    installedTone,
    expires: license.isTrial ? `${license.trialDays ?? 30} days after install` : 'No expiry',
    expiresTone: 'muted',
    expiresNote: null,
    expiresNoteTone: 'muted',
  };
}
```

- [ ] **Step 3: Render the two lines on the card**

Rewrite `mobile/app/admin/licenses.tsx` in full:

```tsx
import { Text, View } from 'react-native';
import { AdminList, cardStyles as s } from '@/AdminList';
import { licenseDates, type Tone } from '@/license-dates';
import type { License } from '@/types';

const STATUS_COLOR: Record<string, string> = {
  ACTIVATED: '#16a34a', PENDING: '#d97706', EXPIRED: '#dc2626', SUSPENDED: '#6b7280',
};

const TONE_COLOR: Record<Tone, string> = {
  normal: '#111827', muted: '#6b7280', danger: '#dc2626',
};

function LicenseDateLines({ license }: { license: License }) {
  const d = licenseDates(license);
  return (
    <>
      <Text style={[s.meta, { color: TONE_COLOR[d.installedTone] }]}>Installed: {d.installed}</Text>
      <Text style={[s.meta, { color: TONE_COLOR[d.expiresTone] }]}>
        Expires: {d.expires}
        {d.expiresNote ? (
          <Text style={{ color: TONE_COLOR[d.expiresNoteTone] }}> · {d.expiresNote}</Text>
        ) : null}
      </Text>
    </>
  );
}

export default function LicensesScreen() {
  return (
    <AdminList<License>
      url="/licenses"
      keyExtractor={(l) => l.id}
      emptyText="No licenses yet."
      renderItem={(l) => (
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.title} numberOfLines={1}>{l.client?.businessName ?? 'Client'}</Text>
            <View style={[s.badge, { backgroundColor: STATUS_COLOR[l.status] ?? '#6b7280' }]}>
              <Text style={s.badgeText}>{l.status}</Text>
            </View>
          </View>
          <Text style={s.meta}>{l.product?.productName ?? '—'}</Text>
          <Text style={[s.meta, { fontFamily: 'monospace' }]} numberOfLines={1}>{l.licenseKey}</Text>
          <LicenseDateLines license={l} />
        </View>
      )}
    />
  );
}
```

- [ ] **Step 4: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS — no errors. (`mobile` has no `build` script; `tsconfig.json` maps `@/*` to `./src/*`, so `@/license-dates` resolves.)

- [ ] **Step 5: Verify on the device/emulator**

Run `cd mobile && npm start`, open the app, log in as an admin, and go to the **Licenses** screen.

Expected on the PENDING trial card:
- A line `Installed: Not yet installed` in grey
- A line `Expires: 30 days after install` in grey
- The status badge, product, and key lines are unchanged

- [ ] **Step 6: Commit**

```bash
git add mobile/src/types.ts mobile/src/license-dates.ts mobile/app/admin/licenses.tsx
git commit -m "feat(mobile): show install date and trial expiry on licenses screen"
```

---

### Task 4: End-to-end check against a real activation

**Files:** none — verification only.

**Interfaces:**
- Consumes: the finished UI from Tasks 1-3 and the existing activation endpoint `PATCH /licenses/:id/activate` (`src/licenses.controller.ts`).

- [ ] **Step 1: Activate the pending trial as a developer**

With the backend running, sign in to admin-web as a **developer** account, open the Licenses tab, click **Activate** on the `TRIAL-4R3Z-PVWW` row, and submit any CPU / disk / MAC values.

- [ ] **Step 2: Confirm the activated row**

Reload the Licenses tab as an admin.

Expected on that row:
- Installed = today's date, in normal text
- Expires = today + 30 days, with a second line `30 days left` in muted grey
- Status badge = ACTIVATED

- [ ] **Step 3: Confirm the near-expiry and expired styling**

In a database client, set that license's expiry close to now, reload the page after each change:

```sql
UPDATE licenses SET expiration_date = now() + interval '3 days' WHERE license_key = 'TRIAL-4R3Z-PVWW';
```
Expected: the date shows with `3 days left` in red.

```sql
UPDATE licenses SET expiration_date = now() - interval '1 day' WHERE license_key = 'TRIAL-4R3Z-PVWW';
```
Expected: the date shows with `Expired` in red.

Then restore the real value:

```sql
UPDATE licenses SET expiration_date = activation_date + interval '30 days' WHERE license_key = 'TRIAL-4R3Z-PVWW';
```

- [ ] **Step 4: Confirm the non-trial case**

Add a Full (non-trial) license for any client without an expiry.

Expected: its Expires cell reads `No expiry` in muted grey, and its Installed cell reads `Not yet installed`.

- [ ] **Step 5: Confirm the mobile screen matches**

Open the mobile Licenses screen and confirm the same license now reads `Installed: <date>` and `Expires: <date> · 30 days left`.
