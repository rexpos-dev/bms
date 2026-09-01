# Trial License — Fixed Expiry Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the trial license "Trial days" number input with a real calendar date the admin picks at creation, and make that date the license's fixed, non-negotiable expiry — independent of when (or whether) the developer activates it on-site.

**Architecture:** No schema change (`License.expirationDate` and `License.trialDays` already exist). Backend: `LicensesService.generate()` now requires and stores `expirationDate` directly for trials instead of leaving it `null` until activation; `activate()` prefers the already-stored date and only falls back to the old `activationDate + trialDays` computation for pre-existing trials that don't have one yet; the daily cron widens its sweep to also expire PENDING (not just ACTIVATED) licenses past their date; `update()` gains the same expirationDate-setting path for edits. Frontend: the Add/Edit License dialogs swap the day-count `<input type="number">` for `<input type="date">`.

**Tech Stack:** NestJS + Prisma + class-validator (backend, `src/`), React + TanStack Query (frontend, `admin-web/src/`), Jest (backend tests).

## Global Constraints

- Trial `expirationDate` must be strictly in the future at creation/edit time (`> Date.now()`), enforced server-side with `BadRequestException`.
- No Prisma migration — `expirationDate` and `trialDays` columns already exist on `License`.
- Existing PENDING trials created before this change (`expirationDate = null`, `trialDays` set) must keep activating correctly via the legacy `activationDate + trialDays` computation — no data backfill.
- `trialDays` remains populated on new trials too, but only as a derived display value (`daysBetween(now, expirationDate)`) — never read back for expiry enforcement on new-style trials.

---

### Task 1: Backend — trial creation requires and stores a fixed `expirationDate`

**Files:**
- Modify: `src/licenses.service.ts:1-71` (add `daysBetween` helper, rewrite the `isTrial` branch of `generate()`)
- Modify: `src/generate-license.dto.ts:22-27` (comment only — clarify `trialDays` is now ignored on create)
- Test: `src/licenses.service.spec.ts:24-47`

**Interfaces:**
- Produces: `daysBetween(start: Date, end: Date): number` — module-level function in `src/licenses.service.ts`, exported as a named export so the spec file (and Task 4) can reuse it: `Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))`.
- Consumes: `GenerateLicenseDto.expirationDate?: Date` (already exists, `src/generate-license.dto.ts:29-32`).

- [ ] **Step 1: Replace the existing trial-creation tests with the new expected behavior**

First, update the top-of-file import in `src/licenses.service.spec.ts` (line 2) from:

```ts
import { LicensesService } from './licenses.service';
```

to:

```ts
import { LicensesService, daysBetween } from './licenses.service';
```

Then replace the `describe('LicensesService.generate (trial)', ...)` block (lines 24-47) with:

```ts
describe('LicensesService.generate (trial)', () => {
  function futureDate(days: number): Date {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  it('auto-generates a unique TRIAL- key and stores the picked expirationDate', async () => {
    const { service } = buildService();
    const expiry = futureDate(30);
    const result = await service.generate({
      clientId: 'client-1',
      productId: 'product-1',
      isTrial: true,
      expirationDate: expiry,
    } as never);
    expect(result.licenseKey).toMatch(/^TRIAL-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(result.isTrial).toBe(true);
    expect(result.status).toBe('PENDING');
    expect(result.expirationDate).toBe(expiry);
    expect(result.trialDays).toBe(30);
  });

  it('derives trialDays from a shorter expirationDate', async () => {
    const { service } = buildService();
    const result = await service.generate({
      clientId: 'client-1',
      productId: 'product-1',
      isTrial: true,
      expirationDate: futureDate(14),
    } as never);
    expect(result.trialDays).toBe(14);
  });

  it('rejects trial creation with no expirationDate', async () => {
    const { service } = buildService();
    await expect(
      service.generate({ clientId: 'client-1', productId: 'product-1', isTrial: true } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects trial creation with a past expirationDate', async () => {
    const { service } = buildService();
    await expect(
      service.generate({
        clientId: 'client-1',
        productId: 'product-1',
        isTrial: true,
        expirationDate: new Date(Date.now() - 1000),
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a non-trial license with no key', async () => {
    const { service } = buildService();
    await expect(
      service.generate({ clientId: 'client-1', productId: 'product-1' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('daysBetween', () => {
  it('rounds up to the next full day', () => {
    const start = new Date('2026-09-01T00:00:00.000Z');
    const end = new Date('2026-09-15T12:00:00.000Z');
    expect(daysBetween(start, end)).toBe(15);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/licenses.service.spec.ts -t "generate \(trial\)"`
Expected: FAIL — `daysBetween` is not exported yet, and the still-old `generate()` returns `expirationDate: null` / ignores the new validation, so assertions on `result.expirationDate`, `result.trialDays`, and the two rejection tests all fail.

- [ ] **Step 3: Add the `daysBetween` helper and rewrite the trial branch of `generate()`**

In `src/licenses.service.ts`, add this exported function above the `@Injectable()` class (after the imports, before `export class LicensesService`):

```ts
/** Whole days between two dates, rounded up (used to derive a display-only trialDays). */
export function daysBetween(start: Date, end: Date): number {
  return Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}
```

Replace the `if (dto.isTrial) { ... }` block inside `generate()` (currently lines 36-48) with:

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

In `src/generate-license.dto.ts`, update the comment above `trialDays` (lines 22-23) from:

```ts
  // Trial length in days (default 30). Only used when isTrial is true.
```

to:

```ts
  // Ignored on create — trialDays is now derived from expirationDate. Kept for
  // backward compatibility with any external caller that still sends it.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/licenses.service.spec.ts -t "generate \(trial\)|daysBetween"`
Expected: PASS (6 tests: 4 in "generate (trial)", 1 in "daysBetween", plus the untouched "rejects a non-trial license with no key" already counted above)

- [ ] **Step 5: Commit**

```bash
git add src/licenses.service.ts src/generate-license.dto.ts src/licenses.service.spec.ts
git commit -m "feat(licenses): require a fixed expirationDate for new trial licenses"
```

---

### Task 2: Backend — activation uses the stored expiry as-is, blocks expired trials

**Files:**
- Modify: `src/licenses.service.ts` (`activate()` method, currently lines 107-142)
- Test: `src/licenses.service.spec.ts` (`describe('LicensesService.activate (trial)', ...)` block, currently lines 49-78)

**Interfaces:**
- Consumes: `daysBetween` not needed here. Uses `License.expirationDate`, `License.trialDays`, `License.isTrial`, `License.status` (all existing Prisma fields).
- Produces: no new exports — `activate()`'s external signature (`activate(id: string, developerId: string, dto: ActivateLicenseDto)`) is unchanged.

- [ ] **Step 1: Add the new failing tests**

Add these three tests inside the existing `describe('LicensesService.activate (trial)', ...)` block in `src/licenses.service.spec.ts`, after the existing `it('sets expirationDate = activation + trialDays and signs with that expiry', ...)` test:

```ts
  it('signs a new-style trial with the stored expirationDate unchanged', async () => {
    const { service, prisma, crypto } = buildService();
    const fixedExpiry = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    prisma.license.findUnique.mockResolvedValue({
      id: 'lic-1',
      status: 'PENDING',
      isTrial: true,
      trialDays: 999, // must be ignored — expirationDate already set
      licenseKey: 'TRIAL-AAAA-BBBB',
      clientId: 'client-1',
      productId: 'product-1',
      expirationDate: fixedExpiry,
      client: {},
      product: {},
      activatedBy: null,
    });

    const result = await service.activate('lic-1', 'dev-1', {
      fingerprint: { cpu: 'c', disk: 'd', mac: 'm' },
    } as never);

    expect(result.expirationDate).toBe(fixedExpiry);
    const passedExpiry = crypto.signLicenseToken.mock.calls[0][1] as Date;
    expect(passedExpiry).toBe(fixedExpiry);
  });

  it('rejects activating a PENDING trial past its expiration date', async () => {
    const { service, prisma } = buildService();
    prisma.license.findUnique.mockResolvedValue({
      id: 'lic-1',
      status: 'PENDING',
      isTrial: true,
      trialDays: 30,
      licenseKey: 'TRIAL-AAAA-BBBB',
      clientId: 'client-1',
      productId: 'product-1',
      expirationDate: new Date(Date.now() - 1000),
      client: {},
      product: {},
      activatedBy: null,
    });

    await expect(
      service.activate('lic-1', 'dev-1', { fingerprint: { cpu: 'c', disk: 'd', mac: 'm' } } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects activating a license that is already EXPIRED', async () => {
    const { service, prisma } = buildService();
    prisma.license.findUnique.mockResolvedValue({
      id: 'lic-1',
      status: 'EXPIRED',
      isTrial: true,
      trialDays: 30,
      licenseKey: 'TRIAL-AAAA-BBBB',
      clientId: 'client-1',
      productId: 'product-1',
      expirationDate: new Date(Date.now() - 100_000),
      client: {},
      product: {},
      activatedBy: null,
    });

    await expect(
      service.activate('lic-1', 'dev-1', { fingerprint: { cpu: 'c', disk: 'd', mac: 'm' } } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/licenses.service.spec.ts -t "activate \(trial\)"`
Expected: FAIL — the current `activate()` always recomputes `activationDate + trialDays` for any trial (ignoring a pre-set `expirationDate`), and has no EXPIRED/past-expiry guard, so all three new tests fail.

- [ ] **Step 3: Rewrite `activate()`**

Replace the full `activate()` method (currently lines 107-142) in `src/licenses.service.ts` with:

```ts
  /**
   * Developer activation step: binds the license to the requesting machine's
   * hardware fingerprint and issues an RS256 (RSA-4096) signed JWT license token.
   */
  async activate(id: string, developerId: string, dto: ActivateLicenseDto) {
    const license = await this.findOne(id);

    if (license.status === LicenseStatus.ACTIVATED) {
      throw new ConflictException('License is already activated');
    }
    if (license.status === LicenseStatus.EXPIRED) {
      throw new ConflictException('This trial has expired and can no longer be activated');
    }

    const activationDate = new Date();

    if (license.isTrial && license.expirationDate && license.expirationDate.getTime() <= activationDate.getTime()) {
      throw new ConflictException(
        `This trial expired on ${license.expirationDate.toLocaleDateString()} and can no longer be activated`,
      );
    }

    // New-style trials and full licenses already have a fixed expirationDate — use it as-is.
    // Old-style trials (created before fixed expiry dates existed) fall back to the legacy
    // activation-based computation so pre-existing PENDING rows keep working.
    const expirationDate: Date | null =
      license.expirationDate ??
      (license.isTrial && license.trialDays
        ? new Date(activationDate.getTime() + license.trialDays * 24 * 60 * 60 * 1000)
        : null);

    const licenseToken = this.licenseCrypto.signLicenseToken(
      {
        licenseId: license.id,
        licenseKey: license.licenseKey,
        clientId: license.clientId,
        productId: license.productId,
        fingerprint: dto.fingerprint,
      },
      expirationDate ?? undefined,
    );

    return this.prisma.license.update({
      where: { id },
      data: {
        status: LicenseStatus.ACTIVATED,
        activatedById: developerId,
        activationDate,
        expirationDate,
        hardwareFingerprint: dto.fingerprint as unknown as object,
        licenseToken,
      },
    });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/licenses.service.spec.ts -t "activate \(trial\)"`
Expected: PASS (4 tests: the original activation-based test plus the 3 new ones)

- [ ] **Step 5: Run the full backend test suite to check for regressions**

Run: `npx jest src/licenses.service.spec.ts`
Expected: PASS (all tests in the file, including the untouched `update` and `expireOverdueLicenses` describe blocks)

- [ ] **Step 6: Commit**

```bash
git add src/licenses.service.ts src/licenses.service.spec.ts
git commit -m "feat(licenses): activation honors a pre-set trial expiry and blocks expired trials"
```

---

### Task 3: Backend — daily cron also expires overdue PENDING trials

**Files:**
- Modify: `src/licenses.service.ts` (`expireOverdueLicenses()`, currently lines 204-216)
- Test: `src/licenses.service.spec.ts` (`describe('LicensesService.expireOverdueLicenses', ...)` block, currently lines 158-171)

**Interfaces:**
- No signature change — `expireOverdueLicenses(): Promise<void>` stays a no-arg `@Cron` method.

- [ ] **Step 1: Update the existing cron test and add a new one**

Replace the `describe('LicensesService.expireOverdueLicenses', ...)` block (lines 158-171) in `src/licenses.service.spec.ts` with:

```ts
describe('LicensesService.expireOverdueLicenses', () => {
  it('flips activated or pending, past-expiry licenses to EXPIRED', async () => {
    const { service, prisma } = buildService();
    prisma.license.updateMany.mockResolvedValue({ count: 2 });

    await service.expireOverdueLicenses();

    expect(prisma.license.updateMany).toHaveBeenCalledTimes(1);
    const arg = prisma.license.updateMany.mock.calls[0][0];
    expect(arg.where.status).toEqual({ in: ['PENDING', 'ACTIVATED'] });
    expect(arg.where.expirationDate.lt).toBeInstanceOf(Date);
    expect(arg.where.expirationDate.not).toBeNull();
    expect(arg.data).toEqual({ status: 'EXPIRED' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/licenses.service.spec.ts -t "expireOverdueLicenses"`
Expected: FAIL — `arg.where.status` is currently the plain string `'ACTIVATED'`, not `{ in: ['PENDING', 'ACTIVATED'] }`.

- [ ] **Step 3: Widen the cron's status filter**

Replace the `expireOverdueLicenses()` method (currently lines 204-216) in `src/licenses.service.ts` with:

```ts
  /**
   * Daily sweep: mark licenses whose expiry has passed as EXPIRED so the admin
   * dashboard reflects reality. Covers ACTIVATED licenses (trial or regular) and
   * PENDING trials that were never activated before their fixed expiry date —
   * the signed JWT already enforces expiry on the client for activated ones;
   * this keeps the DB in sync and blocks late activation of overdue trials.
   */
  @Cron('0 2 * * *')
  async expireOverdueLicenses(): Promise<void> {
    const result = await this.prisma.license.updateMany({
      where: {
        status: { in: [LicenseStatus.PENDING, LicenseStatus.ACTIVATED] },
        expirationDate: { not: null, lt: new Date() },
      },
      data: { status: LicenseStatus.EXPIRED },
    });
    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} license(s) past their expiration date`);
    }
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/licenses.service.spec.ts -t "expireOverdueLicenses"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/licenses.service.ts src/licenses.service.spec.ts
git commit -m "feat(licenses): daily cron also expires overdue unactivated trials"
```

---

### Task 4: Backend — editing a trial's expiry date

**Files:**
- Modify: `src/update-license.dto.ts`
- Modify: `src/licenses.service.ts` (`update()`, currently lines 154-197)
- Test: `src/licenses.service.spec.ts` (`describe('LicensesService.update', ...)` block, currently lines 80-156)

**Interfaces:**
- Consumes: `daysBetween` from Task 1 (same file, no import needed — already in scope).
- Produces: `UpdateLicenseDto.expirationDate?: Date` — new optional field.

- [ ] **Step 1: Add the new failing tests**

Add these two tests inside the existing `describe('LicensesService.update', ...)` block in `src/licenses.service.spec.ts`, after the existing `it('allows setting isTrial=true on a PENDING license', ...)` test:

```ts
  it('updates a trial expirationDate and recomputes trialDays', async () => {
    const { service, prisma } = buildService();
    prisma.license.findUnique.mockImplementation(({ where }: { where: { id?: string; licenseKey?: string } }) =>
      Promise.resolve(where.id ? pendingTrial() : null),
    );
    const newExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const result = await service.update('lic-1', { isTrial: true, expirationDate: newExpiry });

    expect(result.expirationDate).toBe(newExpiry);
    expect(result.trialDays).toBe(14);
  });

  it('rejects updating a trial to a past expirationDate', async () => {
    const { service, prisma } = buildService();
    prisma.license.findUnique.mockImplementation(({ where }: { where: { id?: string; licenseKey?: string } }) =>
      Promise.resolve(where.id ? pendingTrial() : null),
    );

    await expect(
      service.update('lic-1', { isTrial: true, expirationDate: new Date(Date.now() - 1000) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/licenses.service.spec.ts -t "LicensesService.update"`
Expected: FAIL — `UpdateLicenseDto` has no `expirationDate` field yet and `update()` never reads or validates one, so `result.expirationDate` stays `null` and the past-date test doesn't throw.

- [ ] **Step 3: Add `expirationDate` to `UpdateLicenseDto`**

Replace the full contents of `src/update-license.dto.ts` with:

```ts
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateLicenseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  licenseKey?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;

  // Ignored when expirationDate is also sent — kept for backward compatibility.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  trialDays?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expirationDate?: Date;
}
```

- [ ] **Step 4: Handle `dto.expirationDate` in `update()`**

Replace the `if (newIsTrial) { ... }` block inside `update()` (currently lines 184-190) in `src/licenses.service.ts` with:

```ts
    if (newIsTrial) {
      if (dto.expirationDate) {
        if (dto.expirationDate.getTime() <= Date.now()) {
          throw new BadRequestException('Trial expiry date must be in the future');
        }
        data.expirationDate = dto.expirationDate;
        data.trialDays = daysBetween(new Date(), dto.expirationDate);
      } else {
        data.trialDays = dto.trialDays ?? existing.trialDays ?? 30;
      }
    } else if (existing.isTrial) {
      // Converting trial -> full: drop the trial window entirely.
      data.trialDays = null;
      data.expirationDate = null;
    }
```

Note: the `data` type declaration just above (lines 169-176) already includes `trialDays?: number | null` and `expirationDate?: Date | null`, so no type changes are needed there.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/licenses.service.spec.ts -t "LicensesService.update"`
Expected: PASS (all tests in the `update` describe block, including the 5 pre-existing ones)

- [ ] **Step 6: Run the full backend suite**

Run: `npx jest src/licenses.service.spec.ts`
Expected: PASS (every test in the file)

- [ ] **Step 7: Commit**

```bash
git add src/update-license.dto.ts src/licenses.service.ts src/licenses.service.spec.ts
git commit -m "feat(licenses): support editing a trial's fixed expiration date"
```

---

### Task 5: Frontend — Add License dialog picks a date instead of a day count

**Files:**
- Modify: `admin-web/src/pages/LicensesPage.tsx`

**Interfaces:**
- Produces: `todayIsoDate(): string`, `tomorrowIsoDate(): string`, `defaultTrialDate(): string` — module-level helpers in `LicensesPage.tsx`, reused by Task 6.
- Consumes: `POST /licenses` now sent as `{ clientId, productId, isTrial: true, expirationDate: string }` for trials (backend already accepts an ISO date string into `@Type(() => Date)` per Task 1).

- [ ] **Step 1: Add date helpers**

In `admin-web/src/pages/LicensesPage.tsx`, after the existing `fmtDate` helper (currently lines 14-16), add:

```ts
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function defaultTrialDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}
```

(`tomorrowIsoDate` is used as the input's `min` — the backend rejects an expiry that isn't strictly in the future, so a same-day date would always be rejected on submit; picking tomorrow as the earliest selectable date keeps the picker and the validation in agreement.)

- [ ] **Step 2: Replace the `trialDays` state with `trialExpiresAt`**

In the `LicensesPage()` component, replace this line (currently line 601):

```ts
  const [trialDays, setTrialDays] = useState(30);
```

with:

```ts
  const [trialExpiresAt, setTrialExpiresAt] = useState(defaultTrialDate());
```

- [ ] **Step 3: Update the `generateLicense` mutation**

Replace the `generateLicense` mutation (currently lines 631-647) with:

```ts
  const generateLicense = useMutation({
    mutationFn: async () => {
      const payload = isTrial
        ? { clientId, productId, isTrial: true, expirationDate: trialExpiresAt }
        : { clientId, productId, licenseKey: licenseKey.trim() };
      return (await api.post<License>('/licenses', payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      setClientId(''); setProductId(''); setLicenseKey('');
      setIsTrial(false); setTrialExpiresAt(defaultTrialDate());
      setGenerateError(''); setShowForm(false);
    },
    onError: (err: any) => {
      setGenerateError(err?.response?.data?.message ?? 'Could not save the license. Try again.');
    },
  });
```

- [ ] **Step 4: Replace the Trial-days field in the Add License form**

Replace the `{isTrial ? ( ... ) : ( ... )}` trial branch (currently lines 795-810 — just the `isTrial` branch, leave the `else` branch with the `licenseKey` field untouched) with:

```tsx
              {isTrial ? (
                <div className="field">
                  <label htmlFor="trialExpiresAt">Trial expires on</label>
                  <input
                    id="trialExpiresAt"
                    type="date"
                    required
                    min={tomorrowIsoDate()}
                    value={trialExpiresAt}
                    onChange={(e) => setTrialExpiresAt(e.target.value)}
                  />
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    A unique trial key is generated automatically. The trial expires on this exact
                    date, whether or not the developer has activated it yet.
                  </p>
                </div>
              ) : (
```

(Everything from the `) : (` onward — the existing `licenseKey` field block, lines ~811-827 — stays exactly as-is.)

- [ ] **Step 5: Type-check the frontend**

Run: `cd admin-web && npx tsc --noEmit`
Expected: no errors. (If `trialDays` still appears as an unused/undefined reference anywhere in this file, `tsc` will report it — fix any such reference before moving on. `editForm.trialDays` in the Edit dialog is handled in Task 6, not here.)

- [ ] **Step 6: Manually verify the Add License dialog**

Run: `cd admin-web && npm run dev` (leave running), then in the browser:
1. Open the Licenses page as a SUPER_ADMIN user, click **+ Add License**.
2. Switch to **Trial**. Confirm the field now shows a date picker labeled "Trial expires on", pre-filled to a date 30 days out, and that dates before tomorrow cannot be selected.
3. Pick a client and product, leave the default date, save. Confirm the new row shows the real expiry date and a "N days left" note (not "30 days after install").
4. Repeat, but try to submit with a date of tomorrow minus... (i.e. try selecting today via keyboard entry if the browser allows it) — confirm the backend's `BadRequestException` message surfaces in the form's error text if a same-day/past date somehow gets submitted.

- [ ] **Step 7: Commit**

```bash
git add admin-web/src/pages/LicensesPage.tsx
git commit -m "feat(admin-web): Add License trial form uses a date picker for the fixed expiry"
```

---

### Task 6: Frontend — Edit License dialog picks a date instead of a day count

**Files:**
- Modify: `admin-web/src/pages/LicensesPage.tsx`

**Interfaces:**
- Consumes: `todayIsoDate`, `tomorrowIsoDate`, `defaultTrialDate` from Task 5 (same file).
- Consumes: `PATCH /licenses/:id` now sent with `expirationDate` (string) instead of `trialDays` (number) when `editForm.isTrial` is true (backend already accepts this per Task 4).

- [ ] **Step 1: Replace `trialDays` with `expirationDate` in `editForm` state**

Replace this line (currently line 607):

```ts
  const [editForm, setEditForm] = useState({ licenseKey: '', clientId: '', productId: '', isTrial: false, trialDays: 30 });
```

with:

```ts
  const [editForm, setEditForm] = useState({ licenseKey: '', clientId: '', productId: '', isTrial: false, expirationDate: defaultTrialDate() });
```

- [ ] **Step 2: Seed `expirationDate` in `openEdit`**

Replace this line inside `openEdit` (currently line 656):

```ts
      trialDays: license.trialDays ?? 30,
```

with:

```ts
      expirationDate: license.expirationDate ? license.expirationDate.slice(0, 10) : defaultTrialDate(),
```

- [ ] **Step 3: Update the `updateLicense` mutation**

Replace this line inside `updateLicense`'s `mutationFn` (currently line 667):

```ts
        ...(editForm.isTrial ? { trialDays: editForm.trialDays } : { licenseKey: editForm.licenseKey.trim() }),
```

with:

```ts
        ...(editForm.isTrial ? { expirationDate: editForm.expirationDate } : { licenseKey: editForm.licenseKey.trim() }),
```

- [ ] **Step 4: Replace the Trial-days field in the Edit License form**

Replace the `editForm.isTrial` input block (currently lines 948-958 — just the `<div className="field">...</div>` for `edit-trialDays`) with:

```tsx
                  <div className="field">
                    <label htmlFor="edit-trialExpiresAt">Trial expires on</label>
                    <input
                      id="edit-trialExpiresAt"
                      type="date"
                      required
                      min={tomorrowIsoDate()}
                      value={editForm.expirationDate}
                      onChange={(e) => setEditForm({ ...editForm, expirationDate: e.target.value })}
                    />
                  </div>
```

- [ ] **Step 5: Type-check the frontend**

Run: `cd admin-web && npx tsc --noEmit`
Expected: no errors, and no remaining references to `trialDays` as component state anywhere in `LicensesPage.tsx` (the read-only `license.trialDays` / `viewLicense.trialDays` displays in `licenseDates()` and the View Details dialog are untouched API-data reads, not state — those still compile fine since `License.trialDays` remains on the type).

- [ ] **Step 6: Manually verify the Edit License dialog**

With `npm run dev` still running:
1. Open an existing PENDING trial license's Edit dialog. Confirm the date picker is pre-filled with its current expiry (or 30 days out if it's an old-style trial with no expiry yet).
2. Change the date to something closer, save. Confirm the table and View Details now reflect the new date and a shorter "N days left".
3. Confirm a non-trial (Full) license's Edit dialog is unaffected — it still shows the License key field, no date picker.

- [ ] **Step 7: Commit**

```bash
git add admin-web/src/pages/LicensesPage.tsx
git commit -m "feat(admin-web): Edit License trial form uses a date picker for the fixed expiry"
```
