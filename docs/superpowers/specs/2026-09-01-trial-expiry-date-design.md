# Trial License — Fixed Expiry Date — Design Spec

**Date:** 2026-09-01
**Status:** Approved (pending final spec review)

## Problem

Trial licenses currently take a plain **Trial days** number (default 30) at creation time.
That duration isn't turned into a real date until the developer activates the license on-site:
`expirationDate = activationDate + trialDays` (see `docs/superpowers/specs/2026-07-24-trial-license-design.md`).

This means:
- The admin can't see or communicate an actual expiry date when creating the trial — only "30 days after whenever it gets installed."
- A trial that's never activated has no expiry at all; it can sit PENDING indefinitely and still be activated later at full length.

We want the admin to pick a real calendar date for when the trial expires, and have that date
be the actual, fixed expiry — independent of when (or whether) the developer activates it.

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Input | Admin picks a calendar date (native date input), not a day count. Defaults to today + 30 days. |
| Semantics | **Fixed expiry date, set at creation.** The countdown no longer starts at activation — `expirationDate` is stored immediately and used as-is at activation. |
| Unactivated trials | A PENDING trial past its expiry date is blocked from being activated, and the daily cron flips PENDING (not just ACTIVATED) trials past their date to `EXPIRED`. |
| Backward compatibility | Existing PENDING trials created under the old flow (`expirationDate = null`, `trialDays` set) keep working via the old `activationDate + trialDays` computation at activation — no data migration. |
| `trialDays` column | Kept, but demoted to a derived/display-only value (days between creation and the picked expiry date) so existing "Trial Period: X days" copy keeps working without a rewrite. |

## Current state (reference)

- `License` model already has `expirationDate DateTime?` and `trialDays Int?` (`prisma/schema.prisma`).
- `LicensesService.generate()`: for `isTrial`, stores `expirationDate: null`, `trialDays: dto.trialDays ?? 30`. (`src/licenses.service.ts:36-48`)
- `LicensesService.activate()`: for trials, always recomputes `expirationDate = activationDate + trialDays`, overwriting whatever was stored. (`src/licenses.service.ts:114-118`)
- `LicensesService.expireOverdueLicenses()` (cron, daily `0 2 * * *`): only sweeps `status: ACTIVATED` licenses past `expirationDate`. (`src/licenses.service.ts:204-216`)
- `LicensesService.update()`: `UpdateLicenseDto` has `trialDays` but no `expirationDate`; editing a trial only ever changes `trialDays`. (`src/licenses.service.ts:154-197`)
- Frontend `licenseDates()` (admin-web `LicensesPage.tsx:42` and mirrored in `mobile/src/license-dates.ts`) **already prefers `expirationDate` when present**, showing the real date and an "N days left" countdown; it only falls back to `"${trialDays} days after install"` when `expirationDate` is null. This means no frontend display-logic changes are needed — restoring `expirationDate` at creation makes the existing countdown UI work correctly for trials automatically.
- Add License dialog: number input `id="trialDays"`, min 1 max 365, default 30. (`admin-web/src/pages/LicensesPage.tsx:797-809`)
- Edit License dialog: same number input, `id="edit-trialDays"`. (`admin-web/src/pages/LicensesPage.tsx:949-958`)
- View Details dialog: unconditionally shows `Trial Period: ${trialDays ?? 30} days from install` for trials, in addition to the `LicenseDateDetails` block. (`admin-web/src/pages/LicensesPage.tsx:887-889`)

## Design

### 1. Backend — `GenerateLicenseDto`

`expirationDate?: Date` already exists (currently only used for non-trial licenses, and not exposed in the UI). No DTO shape change — service-level validation changes:

- When `dto.isTrial` is true, `dto.expirationDate` becomes **required**: throw `BadRequestException('Expiry date is required for a trial license')` if missing, and `BadRequestException('Trial expiry date must be in the future')` if it's not after `now()`.

### 2. Backend — create trial (`LicensesService.generate`)

```ts
if (dto.isTrial) {
  if (!dto.expirationDate) {
    throw new BadRequestException('Expiry date is required for a trial license');
  }
  if (dto.expirationDate.getTime() <= Date.now()) {
    throw new BadRequestException('Trial expiry date must be in the future');
  }
  const licenseKey = await this.generateUniqueTrialKey();
  return this.prisma.license.create({
    data: {
      licenseKey,
      clientId: dto.clientId,
      productId: dto.productId,
      isTrial: true,
      trialDays: daysBetween(new Date(), dto.expirationDate),
      expirationDate: dto.expirationDate,
      status: LicenseStatus.PENDING,
    },
  });
}
```

`daysBetween` is a small local helper (`Math.ceil((end.getTime() - start.getTime()) / 86_400_000)`), used purely to keep `trialDays` populated for display. It is not read back for any expiry computation on new-style trials.

### 3. Backend — activate (`LicensesService.activate`)

Replace the trial-specific recomputation with a fallback chain that prefers the already-stored date:

```ts
const activationDate = new Date();

if (license.status === LicenseStatus.EXPIRED) {
  throw new ConflictException('This trial has expired and can no longer be activated');
}
if (license.isTrial && license.expirationDate && license.expirationDate.getTime() <= activationDate.getTime()) {
  throw new ConflictException(
    `This trial expired on ${license.expirationDate.toLocaleDateString()} and can no longer be activated`,
  );
}

const expirationDate =
  license.expirationDate ??
  (license.isTrial && license.trialDays
    ? new Date(activationDate.getTime() + license.trialDays * 24 * 60 * 60 * 1000)
    : undefined);
```

- New-style trials and full licenses: `license.expirationDate` is already set → used as-is, unchanged by activation.
- Old-style trials (pre-existing PENDING rows with `expirationDate = null`): fall back to the legacy `activationDate + trialDays` computation, exactly as today.
- The rest of `activate()` (fingerprint binding, token signing, `status = ACTIVATED`) is unchanged.

### 4. Backend — daily auto-expire cron

Widen the sweep from `status: ACTIVATED` to also catch PENDING trials/licenses whose fixed date has passed:

```ts
@Cron('0 2 * * *')
async expireOverdueLicenses(): Promise<void> {
  const result = await this.prisma.license.updateMany({
    where: {
      status: { in: [LicenseStatus.PENDING, LicenseStatus.ACTIVATED] },
      expirationDate: { not: null, lt: new Date() },
    },
    data: { status: LicenseStatus.EXPIRED },
  });
  ...
}
```

This only affects PENDING rows that already carry a non-null `expirationDate` — i.e. new-style trials. Old-style PENDING trials (`expirationDate = null`) are untouched by the cron, matching today's behavior (their clock hasn't started yet).

### 5. Backend — edit (`LicensesService.update` / `UpdateLicenseDto`)

`UpdateLicenseDto` gains:

```ts
@IsOptional() @Type(() => Date) @IsDate() expirationDate?: Date;
```

In `update()`, when `newIsTrial` is true and `dto.expirationDate` is provided: validate it's in the future (same rule as create), set `data.expirationDate = dto.expirationDate`, and recompute `data.trialDays` from it for display. If `dto.expirationDate` is omitted but the license is/becomes a trial, keep existing behavior (fall back to `dto.trialDays ?? existing.trialDays ?? 30`, `expirationDate` untouched) — editing trial length without changing the picked date isn't a case this feature needs to support, so it's left as-is (YAGNI).

### 6. Frontend — Add License dialog

Replace the `id="trialDays"` number input with:

```tsx
<label htmlFor="trialExpiresAt">Trial expires on</label>
<input
  id="trialExpiresAt"
  type="date"
  required
  min={todayIsoDate()}
  value={trialExpiresAt}
  onChange={(e) => setTrialExpiresAt(e.target.value)}
/>
<p className="...">
  A unique trial key is generated automatically. The trial expires on this exact date,
  whether or not the developer has activated it yet.
</p>
```

- State: `const [trialExpiresAt, setTrialExpiresAt] = useState(defaultTrialDate())` where `defaultTrialDate()` returns today + 30 days as an ISO date string (`YYYY-MM-DD`), and `todayIsoDate()` returns today's ISO date string for the `min` bound.
- Mutation payload: `{ clientId, productId, isTrial: true, expirationDate: trialExpiresAt }` (the date-only string parses fine into the DTO's `@Type(() => Date)`).
- Reset on success: `setTrialExpiresAt(defaultTrialDate())` instead of `setTrialDays(30)`.

### 7. Frontend — Edit License dialog

Same swap for `editForm.trialDays` → `editForm.expirationDate` (ISO date string):

- `openEdit()`: seed from `license.expirationDate ? toIsoDate(license.expirationDate) : defaultTrialDate()`.
- Input: same `type="date"` pattern as the Add dialog, `id="edit-trialExpiresAt"`.
- Mutation payload includes `expirationDate: editForm.expirationDate` when `editForm.isTrial`.

### 8. Frontend — table / View Details

No changes required — see "Current state" above. `licenseDates()` already renders the real date + countdown once `expirationDate` is non-null, and now it's non-null immediately at creation for new trials. The `Trial Period: X days from install` row in View Details keeps reading `trialDays`, which is still populated (now as a derived display value) — no code change needed there either.

### 9. Types

`admin-web/src/lib/types.ts` `License` interface: no change (`expirationDate` and `trialDays` already both present as `string | null` / `number | null`).

## Testing

Extend `src/licenses.service.spec.ts`:

- Trial creation without `expirationDate` throws `BadRequestException`.
- Trial creation with a past `expirationDate` throws `BadRequestException`.
- Trial creation with a valid future `expirationDate` stores it as-is and derives a sane `trialDays`.
- Activating a new-style trial (`expirationDate` set) signs the token with that unchanged date.
- Activating an old-style trial (`expirationDate` null, `trialDays` set) still computes `activationDate + trialDays` (regression guard for existing data).
- Activating a PENDING trial whose `expirationDate` has already passed throws `ConflictException`.
- Activating a license with `status === EXPIRED` throws `ConflictException`.
- Cron flips PENDING (new-style, date passed) and ACTIVATED (date passed) licenses to `EXPIRED`; leaves old-style PENDING trials (`expirationDate` null) and not-yet-due licenses untouched.
- Editing a trial's `expirationDate` via `update()` persists the new date and recomputed `trialDays`.

## Out of scope (YAGNI)

- Migrating existing PENDING trials to backfill a real `expirationDate` — the activation-time fallback handles them without a data migration.
- Editing trial length by day-count in the Edit dialog (date-only going forward).
- Any change to the daily cron's schedule or to full (non-trial) license expiry handling beyond widening the status filter.
