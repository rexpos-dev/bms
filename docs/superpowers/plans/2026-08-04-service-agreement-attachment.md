# Service Agreement Attachment Implementation Plan

> **SUPERSEDED 2026-08-05.** Do not execute this plan. The design changed to a fully
> editable, versioned template — see
> [the new spec](../specs/2026-08-05-agreement-template-editor-design.md). No task below
> was started.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin optionally emit the Service Level Agreement as extra pages when printing or downloading a Job Order, with every client, company, and warranty detail filled in from existing system data.

**Architecture:** A per-JO `includeAgreement` boolean and a per-item `warrantyTier` enum are added to Prisma. The `admin-web` print subtree is extracted from the 1626-line `JobOrderPage.tsx` into `admin-web/src/components/print/`, where a new pure `ServiceAgreement` component renders the SLA from props. Clause bodies are hardcoded; variable values (signing location, warranty durations, exclusions, contact persons) come from `CompanyProfile` and a new `CompanyContact` table, editable in Settings.

**Tech Stack:** NestJS 11, Prisma 6.19.3 (MySQL), React 19, Vite 8, TanStack Query 5, html2pdf.js 0.14, Jest 30 (backend), Vitest (added by Task 1, admin-web).

**Spec:** [docs/superpowers/specs/2026-08-04-service-agreement-attachment-design.md](../specs/2026-08-04-service-agreement-attachment-design.md)

## Global Constraints

- Scope is `admin-web` and the NestJS backend only. Do not touch `mobile/`.
- Database is MySQL. Migrations are hand-written `migration.sql` files under `prisma/migrations/<timestamp>_<name>/`, matching the style of `20260715090000_job_order_doc_type/migration.sql`.
- Backend tests are Jest with `rootDir: src` and `testRegex: .*\.spec\.ts$`. Test files sit beside their source as `src/<name>.spec.ts`.
- Backend service tests use hand-built mock objects (no `@nestjs/testing` module), following `src/job-orders.service.spec.ts`.
- Warranty tier values are exactly `MAIN_SET`, `ACCESSORY`, `NONE`.
- `JobOrderItem.warrantyTier` defaults to `ACCESSORY`. `JobOrder.includeAgreement` defaults to `false`.
- Default warranty durations: main set 7 days replacement / 3 months service; accessory 7 days replacement / 1 month limited.
- Section II(g) must not name a duration — it references Section I. Both Section I warranty paragraphs share one `warrantyExclusions` value.
- Missing company or client values render as `__________` (ten underscores), never an em dash.
- Existing print output must be unchanged when `includeAgreement` is false.

---

### Task 1: Warranty utility and Vitest setup

`admin-web` has no test runner today. This task adds Vitest and delivers the first pure, tested unit — the grouping and label logic the agreement depends on.

**Files:**
- Modify: `admin-web/package.json`
- Create: `admin-web/vitest.config.ts`
- Modify: `admin-web/src/lib/types.ts`
- Create: `admin-web/src/components/print/warranty.util.ts`
- Test: `admin-web/src/components/print/warranty.util.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `admin-web/src/lib/types.ts` — `export type WarrantyTier = 'MAIN_SET' | 'ACCESSORY' | 'NONE'`
  - `warranty.util.ts` — `export interface WarrantyItem { name: string; quantity: number; warrantyTier: WarrantyTier }`
  - `warranty.util.ts` — `export interface WarrantyGroups { mainSet: WarrantyItem[]; accessory: WarrantyItem[] }`
  - `warranty.util.ts` — `export function groupByTier(items: WarrantyItem[]): WarrantyGroups`
  - `warranty.util.ts` — `export function derivePackageLabel(items: WarrantyItem[]): string`

- [ ] **Step 1: Install Vitest**

```bash
npm install --prefix admin-web --save-dev vitest@^3.2.4
```

- [ ] **Step 2: Add the test script**

In `admin-web/package.json`, add `"test": "vitest run"` and `"test:watch": "vitest"` to `scripts`, so the block reads:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 3: Create the Vitest config**

Create `admin-web/vitest.config.ts`. A dedicated file is used rather than extending `vite.config.ts`, because `vite`'s `defineConfig` has no `test` key and would fail typecheck.

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
```

- [ ] **Step 4: Add the WarrantyTier type**

In `admin-web/src/lib/types.ts`, immediately above `export interface JobOrderItem {` (line 158), add:

```ts
export type WarrantyTier = 'MAIN_SET' | 'ACCESSORY' | 'NONE';
```

- [ ] **Step 5: Write the failing tests**

Create `admin-web/src/components/print/warranty.util.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { derivePackageLabel, groupByTier, type WarrantyItem } from './warranty.util';

const item = (name: string, warrantyTier: WarrantyItem['warrantyTier'], quantity = 1): WarrantyItem => ({
  name,
  quantity,
  warrantyTier,
});

describe('groupByTier', () => {
  it('splits items into the main set and accessory groups', () => {
    const groups = groupByTier([
      item('System Unit', 'MAIN_SET'),
      item('Barcode Scanner', 'ACCESSORY'),
      item('Monitor', 'MAIN_SET'),
    ]);

    expect(groups.mainSet.map((i) => i.name)).toEqual(['System Unit', 'Monitor']);
    expect(groups.accessory.map((i) => i.name)).toEqual(['Barcode Scanner']);
  });

  it('excludes NONE-tier items from both groups', () => {
    const groups = groupByTier([item('Thermal Paper', 'NONE'), item('Monitor', 'MAIN_SET')]);

    expect(groups.mainSet.map((i) => i.name)).toEqual(['Monitor']);
    expect(groups.accessory).toEqual([]);
  });

  it('returns empty groups for an empty item list', () => {
    expect(groupByTier([])).toEqual({ mainSet: [], accessory: [] });
  });
});

describe('derivePackageLabel', () => {
  it('spells out a single main set', () => {
    expect(derivePackageLabel([item('System Unit', 'MAIN_SET')])).toBe('ONE (1) POS Complete Set');
  });

  it('appends "with accessories" when an accessory item is present', () => {
    expect(derivePackageLabel([item('System Unit', 'MAIN_SET'), item('Cash Drawer', 'ACCESSORY')])).toBe(
      'ONE (1) POS Complete Set with accessories',
    );
  });

  it('sums quantity across main set rows', () => {
    expect(derivePackageLabel([item('System Unit', 'MAIN_SET', 2), item('Monitor', 'MAIN_SET', 1)])).toBe(
      'THREE (3) POS Complete Set',
    );
  });

  it('spells out a quantity above one on a single row', () => {
    expect(derivePackageLabel([item('System Unit', 'MAIN_SET', 2)])).toBe('TWO (2) POS Complete Set');
  });

  it('falls back to digits above ten', () => {
    expect(derivePackageLabel([item('System Unit', 'MAIN_SET', 11)])).toBe('11 (11) POS Complete Set');
  });

  it('drops the count when there is no main set item', () => {
    expect(derivePackageLabel([item('Cash Drawer', 'ACCESSORY')])).toBe('POS Package with accessories');
  });

  it('returns the bare package label for an empty item list', () => {
    expect(derivePackageLabel([])).toBe('POS Package');
  });

  it('ignores NONE-tier items when counting', () => {
    expect(derivePackageLabel([item('System Unit', 'MAIN_SET'), item('Thermal Paper', 'NONE')])).toBe(
      'ONE (1) POS Complete Set',
    );
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm test --prefix admin-web`
Expected: FAIL — `Failed to resolve import "./warranty.util"`.

- [ ] **Step 7: Write the implementation**

Create `admin-web/src/components/print/warranty.util.ts`:

```ts
import type { WarrantyTier } from '../../lib/types';

export interface WarrantyItem {
  name: string;
  quantity: number;
  warrantyTier: WarrantyTier;
}

export interface WarrantyGroups {
  mainSet: WarrantyItem[];
  accessory: WarrantyItem[];
}

/** Splits line items by warranty tier. NONE-tier items appear in neither group. */
export function groupByTier(items: WarrantyItem[]): WarrantyGroups {
  return {
    mainSet: items.filter((i) => i.warrantyTier === 'MAIN_SET'),
    accessory: items.filter((i) => i.warrantyTier === 'ACCESSORY'),
  };
}

// Index 0 is unused — counts start at one.
const NUMBER_WORDS = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];

function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/**
 * Builds the package phrase used in the WHEREAS clause and Section I(a),
 * e.g. "ONE (1) POS Complete Set with accessories".
 */
export function derivePackageLabel(items: WarrantyItem[]): string {
  const { mainSet, accessory } = groupByTier(items);
  const count = mainSet.reduce((sum, i) => sum + i.quantity, 0);
  const suffix = accessory.length > 0 ? ' with accessories' : '';

  if (count === 0) return `POS Package${suffix}`;
  return `${numberWord(count)} (${count}) POS Complete Set${suffix}`;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test --prefix admin-web`
Expected: PASS — 11 tests across 2 suites.

- [ ] **Step 9: Commit**

```bash
git add admin-web/package.json admin-web/package-lock.json admin-web/vitest.config.ts admin-web/src/lib/types.ts admin-web/src/components/print/
git commit -m "feat(admin-web): add warranty tier grouping util and vitest setup"
```

---

### Task 2: Prisma schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260804000000_service_agreement/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma client types `WarrantyTier` (enum), `JobOrderItem.warrantyTier`, `JobOrder.includeAgreement`, `CompanyProfile.signingLocation | mainSetReplacementDays | mainSetServiceMonths | accessoryReplacementDays | accessoryServiceMonths | warrantyExclusions | contacts`, and model `CompanyContact { id, profileId, name, title, phone, email, isSignatory, sortOrder }`.

- [ ] **Step 1: Add the WarrantyTier enum**

In `prisma/schema.prisma`, directly above `model JobOrder {` (line 397), add:

```prisma
enum WarrantyTier {
  MAIN_SET
  ACCESSORY
  NONE
}
```

- [ ] **Step 2: Add the JobOrder and JobOrderItem fields**

In `model JobOrder`, after the `docType` line (line 411), add:

```prisma
  includeAgreement Boolean @default(false) @map("include_agreement")
```

In `model JobOrderItem`, after the `inventoryItemId` line (line 433), add:

```prisma
  warrantyTier WarrantyTier @default(ACCESSORY) @map("warranty_tier")
```

- [ ] **Step 3: Extend CompanyProfile and add CompanyContact**

In `model CompanyProfile`, after the `logoUrl` line (line 589), add:

```prisma
  signingLocation String? @map("signing_location")

  mainSetReplacementDays   Int @default(7) @map("main_set_replacement_days")
  mainSetServiceMonths     Int @default(3) @map("main_set_service_months")
  accessoryReplacementDays Int @default(7) @map("accessory_replacement_days")
  accessoryServiceMonths   Int @default(1) @map("accessory_service_months")

  /** Shared by both warranty tiers — see the design's deviations section. */
  warrantyExclusions String? @map("warranty_exclusions") @db.Text

  contacts CompanyContact[]
```

Directly after the closing brace of `model CompanyProfile`, add:

```prisma
/** Section VIII contacts. The `isSignatory` row also supplies the parties-block representative. */
model CompanyContact {
  id          String  @id @default(uuid())
  profileId   String  @map("profile_id")
  name        String
  title       String
  phone       String?
  email       String?
  isSignatory Boolean @default(false) @map("is_signatory")
  sortOrder   Int     @default(0) @map("sort_order")

  profile CompanyProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@index([profileId])
  @@map("company_contacts")
}
```

- [ ] **Step 4: Write the migration**

Create `prisma/migrations/20260804000000_service_agreement/migration.sql`:

```sql
-- AlterTable
ALTER TABLE `job_orders`
    ADD COLUMN `include_agreement` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `job_order_items`
    ADD COLUMN `warranty_tier` ENUM('MAIN_SET', 'ACCESSORY', 'NONE') NOT NULL DEFAULT 'ACCESSORY';

-- AlterTable
ALTER TABLE `company_profile`
    ADD COLUMN `signing_location` VARCHAR(191) NULL,
    ADD COLUMN `main_set_replacement_days` INTEGER NOT NULL DEFAULT 7,
    ADD COLUMN `main_set_service_months` INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN `accessory_replacement_days` INTEGER NOT NULL DEFAULT 7,
    ADD COLUMN `accessory_service_months` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `warranty_exclusions` TEXT NULL;

-- CreateTable
CREATE TABLE `company_contacts` (
    `id` VARCHAR(191) NOT NULL,
    `profile_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `is_signatory` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `company_contacts_profile_id_idx`(`profile_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `company_contacts` ADD CONSTRAINT `company_contacts_profile_id_fkey` FOREIGN KEY (`profile_id`) REFERENCES `company_profile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 5: Validate the schema**

Run: `npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 6: Apply the migration and regenerate the client**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: migration `20260804000000_service_agreement` applied, then `Generated Prisma Client`.

- [ ] **Step 7: Confirm the schema matches the database**

Run: `npx prisma migrate status`
Expected: `Database schema is up to date!`

If it instead reports drift, do not run `migrate reset` — the database holds real records. Stop and report the drift.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260804000000_service_agreement/
git commit -m "feat(db): add warranty tiers, agreement flag, and company contacts"
```

---

### Task 3: Persist includeAgreement and warrantyTier

**Files:**
- Modify: `src/upsert-job-order.dto.ts:16-36` (`JobOrderItemDto`), `:96-104` (`UpsertJobOrderDto`)
- Modify: `src/job-orders.service.ts:33-55`
- Test: `src/job-orders.service.spec.ts`

**Interfaces:**
- Consumes: Prisma `WarrantyTier` enum from Task 2.
- Produces: `UpsertJobOrderDto.includeAgreement?: boolean`, `JobOrderItemDto.warrantyTier?: WarrantyTier`. The `POST /job-orders` response now carries `includeAgreement` on the order and `warrantyTier` on each item.

- [ ] **Step 1: Write the failing tests**

Append to `src/job-orders.service.spec.ts`, inside the existing `describe('JobOrdersService.upsert', ...)` block (before its closing `});` on line 85):

```ts
  it('persists includeAgreement when the dto sets it', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert({ ...baseDto, includeAgreement: true }, user);

    expect(tx.jobOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ includeAgreement: true }) }),
    );
  });

  it('defaults includeAgreement to false when the dto omits it', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert(baseDto, user);

    expect(tx.jobOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ includeAgreement: false }) }),
    );
  });

  it('persists the warranty tier on each item', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert(
      {
        ...baseDto,
        items: [
          { name: 'System Unit', quantity: 1, unitPrice: 20000, warrantyTier: 'MAIN_SET' },
          { name: 'Cash Drawer', quantity: 1, unitPrice: 3000, warrantyTier: 'ACCESSORY' },
        ],
      },
      user,
    );

    const created = tx.jobOrder.create.mock.calls[0][0].data.items.createMany.data;
    expect(created.map((i: { warrantyTier: string }) => i.warrantyTier)).toEqual(['MAIN_SET', 'ACCESSORY']);
  });

  it('defaults an item warranty tier to ACCESSORY when omitted', async () => {
    const tx = buildTx();
    const { service } = buildService(tx);

    await service.upsert(
      { ...baseDto, items: [{ name: 'Cash Drawer', quantity: 1, unitPrice: 3000 }] },
      user,
    );

    const created = tx.jobOrder.create.mock.calls[0][0].data.items.createMany.data;
    expect(created[0].warrantyTier).toBe('ACCESSORY');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/job-orders.service.spec.ts -t "includeAgreement"`
Expected: FAIL — `data` does not contain `includeAgreement`, and TypeScript rejects `includeAgreement` / `warrantyTier` as unknown DTO properties.

- [ ] **Step 3: Extend the DTOs**

In `src/upsert-job-order.dto.ts`, change the import on line 14 to add `WarrantyTier`:

```ts
import { DiscountType, DocType, JobOrderStatus, JobOrderType, WarrantyTier } from '@prisma/client';
```

In `JobOrderItemDto`, after the `inventoryItemId` field (line 35), add:

```ts
  /** Which Section I warranty paragraph covers this line on the printed agreement. */
  @IsOptional()
  @IsEnum(WarrantyTier)
  warrantyTier?: WarrantyTier;
```

In `UpsertJobOrderDto`, after the `docType` field (line 98), add:

```ts
  /** Appends the Service Level Agreement pages when the order is printed. */
  @IsOptional()
  @IsBoolean()
  includeAgreement?: boolean;
```

Add `IsBoolean` to the `class-validator` import list on lines 2-13, keeping it alphabetical:

```ts
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
```

- [ ] **Step 4: Persist both fields in the service**

In `src/job-orders.service.ts`, add to the `data` object after the `docType` line (line 45):

```ts
      includeAgreement: dto.includeAgreement ?? false,
```

And in `itemsCreate`, after the `inventoryItemId` line (line 54):

```ts
      warrantyTier: item.warrantyTier ?? 'ACCESSORY',
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/job-orders.service.spec.ts`
Expected: PASS — all existing tests plus the four new ones.

- [ ] **Step 6: Commit**

```bash
git add src/upsert-job-order.dto.ts src/job-orders.service.ts src/job-orders.service.spec.ts
git commit -m "feat(api): persist includeAgreement and per-item warranty tier"
```

---

### Task 4: Company profile warranty settings and contacts

**Files:**
- Modify: `src/update-company-profile.dto.ts`
- Modify: `src/company-profile.service.ts`
- Test: `src/company-profile.service.spec.ts` (create)

**Interfaces:**
- Consumes: Prisma `CompanyContact` model from Task 2.
- Produces:
  - `CompanyContactDto { name: string; title: string; phone?: string; email?: string; isSignatory?: boolean; sortOrder?: number }`
  - `UpdateCompanyProfileDto` gains `signingLocation?`, `mainSetReplacementDays?`, `mainSetServiceMonths?`, `accessoryReplacementDays?`, `accessoryServiceMonths?`, `warrantyExclusions?`, `contacts?: CompanyContactDto[]`
  - `GET /company-profile` now returns `contacts` ordered by `sortOrder` ascending, plus the six new scalar fields.

- [ ] **Step 1: Write the failing tests**

Create `src/company-profile.service.spec.ts`:

```ts
import { CompanyProfileService } from './company-profile.service';

function buildPrisma(existing: { id: string } | null) {
  const tx = {
    companyProfile: {
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'cp-1', ...data })),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'cp-new', ...data })),
      // `update` re-reads the profile with contacts before returning.
      findFirst: jest.fn().mockResolvedValue({ id: 'cp-1', contacts: [] }),
    },
    companyContact: {
      deleteMany: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const prisma = {
    companyProfile: { findFirst: jest.fn().mockResolvedValue(existing) },
    $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
  };
  return { prisma, tx };
}

describe('CompanyProfileService.get', () => {
  it('includes contacts ordered by sortOrder', async () => {
    const { prisma } = buildPrisma({ id: 'cp-1' });
    const service = new CompanyProfileService(prisma as never);

    await service.get();

    expect(prisma.companyProfile.findFirst).toHaveBeenCalledWith({
      include: { contacts: { orderBy: { sortOrder: 'asc' } } },
    });
  });

  it('returns an empty contacts array when no profile exists', async () => {
    const { prisma } = buildPrisma(null);
    const service = new CompanyProfileService(prisma as never);

    const result = await service.get();

    expect(result.contacts).toEqual([]);
    expect(result.mainSetServiceMonths).toBe(3);
    expect(result.accessoryServiceMonths).toBe(1);
  });
});

describe('CompanyProfileService.update', () => {
  it('replaces contacts wholesale so removed rows disappear', async () => {
    const { prisma, tx } = buildPrisma({ id: 'cp-1' });
    const service = new CompanyProfileService(prisma as never);

    await service.update({
      businessName: 'Beulah',
      contacts: [{ name: 'Michel Jean L. Rodulfa', title: 'Sales Manager', isSignatory: true }],
    });

    expect(tx.companyContact.deleteMany).toHaveBeenCalledWith({ where: { profileId: 'cp-1' } });
    expect(tx.companyContact.createMany).toHaveBeenCalledWith({
      data: [
        {
          profileId: 'cp-1',
          name: 'Michel Jean L. Rodulfa',
          title: 'Sales Manager',
          phone: null,
          email: null,
          isSignatory: true,
          sortOrder: 0,
        },
      ],
    });
  });

  it('leaves contacts untouched when the dto omits them', async () => {
    const { prisma, tx } = buildPrisma({ id: 'cp-1' });
    const service = new CompanyProfileService(prisma as never);

    await service.update({ businessName: 'Beulah' });

    expect(tx.companyContact.deleteMany).not.toHaveBeenCalled();
  });

  it('does not pass the contacts array to the profile update', async () => {
    const { prisma, tx } = buildPrisma({ id: 'cp-1' });
    const service = new CompanyProfileService(prisma as never);

    await service.update({ contacts: [{ name: 'A', title: 'B' }] });

    expect(tx.companyProfile.update.mock.calls[0][0].data).not.toHaveProperty('contacts');
  });

  it('round-trips the warranty duration fields', async () => {
    const { prisma, tx } = buildPrisma({ id: 'cp-1' });
    const service = new CompanyProfileService(prisma as never);

    await service.update({ mainSetServiceMonths: 6, accessoryReplacementDays: 14 });

    expect(tx.companyProfile.update.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ mainSetServiceMonths: 6, accessoryReplacementDays: 14 }),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/company-profile.service.spec.ts`
Expected: FAIL — `findFirst` called with no argument, `result.contacts` undefined, and TypeScript rejects `contacts` on the DTO.

- [ ] **Step 3: Extend the DTO**

Replace the whole of `src/update-company-profile.dto.ts` with:

```ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/** One row of the agreement's Section VIII contact list. */
export class CompanyContactDto {
  @IsString()
  name!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  /** Marks the representative named in the agreement's parties block. */
  @IsOptional()
  @IsBoolean()
  isSignatory?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateCompanyProfileDto {
  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  tin?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  /** Where the agreement is signed, e.g. "Tagum City, Philippines". */
  @IsOptional()
  @IsString()
  signingLocation?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  mainSetReplacementDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  mainSetServiceMonths?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  accessoryReplacementDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  accessoryServiceMonths?: number;

  @IsOptional()
  @IsString()
  warrantyExclusions?: string;

  /** Replaces the entire contact list when present; omit to leave it untouched. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompanyContactDto)
  contacts?: CompanyContactDto[];
}
```

- [ ] **Step 4: Update the service**

Replace the whole of `src/company-profile.service.ts` with:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CompanyContactDto, UpdateCompanyProfileDto } from './update-company-profile.dto';

const CONTACTS_INCLUDE = { contacts: { orderBy: { sortOrder: 'asc' as const } } };

@Injectable()
export class CompanyProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const profile = await this.prisma.companyProfile.findFirst({ include: CONTACTS_INCLUDE });
    if (profile) return profile;

    return {
      id: null,
      businessName: '',
      address: null,
      phone: null,
      email: null,
      website: null,
      tin: null,
      logoUrl: null,
      signingLocation: null,
      mainSetReplacementDays: 7,
      mainSetServiceMonths: 3,
      accessoryReplacementDays: 7,
      accessoryServiceMonths: 1,
      warrantyExclusions: null,
      contacts: [],
      createdAt: null,
      updatedAt: null,
    };
  }

  async update(dto: UpdateCompanyProfileDto) {
    const { contacts, ...profileData } = dto;
    const existing = await this.prisma.companyProfile.findFirst();

    return this.prisma.$transaction(async (tx) => {
      const profile = existing
        ? await tx.companyProfile.update({ where: { id: existing.id }, data: profileData })
        : await tx.companyProfile.create({
            data: { ...profileData, businessName: profileData.businessName ?? '' },
          });

      // Replace-all: the Settings form always submits the whole list, and it is
      // small enough that diffing by id would add complexity for no benefit.
      if (contacts) {
        await tx.companyContact.deleteMany({ where: { profileId: profile.id } });
        await tx.companyContact.createMany({ data: contacts.map(toContactRow(profile.id)) });
      }

      return tx.companyProfile.findFirst({ where: { id: profile.id }, include: CONTACTS_INCLUDE });
    });
  }
}

function toContactRow(profileId: string) {
  return (contact: CompanyContactDto, index: number) => ({
    profileId,
    name: contact.name,
    title: contact.title,
    phone: contact.phone ?? null,
    email: contact.email ?? null,
    isSignatory: contact.isSignatory ?? false,
    sortOrder: contact.sortOrder ?? index,
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/company-profile.service.spec.ts`
Expected: PASS — 6 tests.

- [ ] **Step 6: Run the whole backend suite for regressions**

Run: `npm test`
Expected: PASS — no previously-passing test breaks.

- [ ] **Step 7: Commit**

```bash
git add src/update-company-profile.dto.ts src/company-profile.service.ts src/company-profile.service.spec.ts
git commit -m "feat(api): add warranty settings and company contacts to profile"
```

---

### Task 5: Extract the print subtree

Pure refactor. No behaviour changes — this exists to get `JobOrderPage.tsx` under control before adding to it.

**Files:**
- Create: `admin-web/src/components/print/print-styles.ts`
- Create: `admin-web/src/components/print/doc-types.ts`
- Create: `admin-web/src/components/print/PrintTemplate.tsx`
- Modify: `admin-web/src/pages/JobOrderPage.tsx`
- Modify: `admin-web/src/lib/types.ts`

**Interfaces:**
- Consumes: `WarrantyTier` from Task 1.
- Produces:
  - `print-styles.ts` — `export const PRINT_STYLE: string`
  - `doc-types.ts` — `export const DOC_TYPES` and `export const DOC_META: Record<DocumentType, { value; label; subtitle; filePrefix }>`
  - `PrintTemplate.tsx` — `export interface LineItem { _key: string; inventoryItemId?: string | null; name: string; description: string; quantity: number; unitPrice: number; warrantyTier: WarrantyTier }`
  - `PrintTemplate.tsx` — `export interface PrintTemplateProps { ... }` and `export function PrintTemplate(props: PrintTemplateProps)`
  - `lib/types.ts` — `CompanyContact` interface; `JobOrderItem.warrantyTier`; `JobOrder.includeAgreement`; six new `CompanyProfile` fields

- [ ] **Step 1: Extend the frontend types**

In `admin-web/src/lib/types.ts`, add `warrantyTier: WarrantyTier;` to `JobOrderItem` after `inventoryItemId` (line 165), and `includeAgreement: boolean;` to `JobOrder` after `docType` (line 187).

Replace the `CompanyProfile` interface (lines 230-241) with:

```ts
export interface CompanyContact {
  id: string;
  name: string;
  title: string;
  phone: string | null;
  email: string | null;
  isSignatory: boolean;
  sortOrder: number;
}

export interface CompanyProfile {
  id: string | null;
  businessName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  tin: string | null;
  logoUrl: string | null;
  signingLocation: string | null;
  mainSetReplacementDays: number;
  mainSetServiceMonths: number;
  accessoryReplacementDays: number;
  accessoryServiceMonths: number;
  warrantyExclusions: string | null;
  contacts: CompanyContact[];
  createdAt: string | null;
  updatedAt: string | null;
}
```

- [ ] **Step 2: Move the print styles**

Create `admin-web/src/components/print/print-styles.ts` containing the `PRINT_STYLE` template literal currently at `JobOrderPage.tsx:270-299`, copied verbatim, with `export` added and one new rule appended inside the `@media print` block just before its closing brace:

```ts
export const PRINT_STYLE = `
@media print {
  body * { visibility: hidden; }
  #job-order-print, #job-order-print * { visibility: visible; }
  #job-order-print {
    display: block !important;
    position: fixed;
    inset: 0;
    background: #fff;
    color: #000;
    padding: 15mm;
    z-index: 99999;
  }
  #job-order-print::before {
    content: "CONFIDENTIAL";
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 80pt;
    font-weight: 900;
    color: rgba(0, 0, 0, 0.07);
    white-space: nowrap;
    letter-spacing: 0.15em;
    pointer-events: none;
    z-index: 99998;
  }
  .agreement-page { page-break-before: always; break-before: page; }
  @page { margin: 0; }
}
`;
```

Then delete lines 268-299 from `JobOrderPage.tsx` and add the import at the top:

```ts
import { PRINT_STYLE } from '../components/print/print-styles';
```

- [ ] **Step 3: Move the document types**

`DOC_TYPES` and `DOC_META` are needed by both `JobOrderPage.tsx` and the extracted template. Leaving them in the page would make `PrintTemplate.tsx` import from `pages/JobOrderPage`, which already imports `PrintTemplate` — a cycle. Move them to a shared module instead.

Create `admin-web/src/components/print/doc-types.ts` with lines 1430-1439 of `JobOrderPage.tsx` moved verbatim, `DocType` renamed to reuse the shared alias, and both constants exported:

```ts
import type { DocumentType } from '../../lib/types';

export const DOC_TYPES: { value: DocumentType; label: string; subtitle: string; filePrefix: string }[] = [
  { value: 'JOB_ORDER', label: 'Job Order', subtitle: 'Job Order / Delivery Receipt', filePrefix: 'JO' },
  { value: 'QUOTATION', label: 'Quotation', subtitle: 'Quotation / Price Estimate', filePrefix: 'QUO' },
  { value: 'INVOICE', label: 'Sales Invoice', subtitle: 'Sales Invoice', filePrefix: 'INV' },
  { value: 'RECEIPT', label: 'Official Receipt', subtitle: 'Official Receipt', filePrefix: 'OR' },
];

export const DOC_META = Object.fromEntries(DOC_TYPES.map((d) => [d.value, d])) as Record<
  DocumentType,
  (typeof DOC_TYPES)[number]
>;
```

In `JobOrderPage.tsx`, delete lines 1428-1439 (the `DocType` alias and both constants) and import instead:

```ts
import { DOC_TYPES, DOC_META } from '../components/print/doc-types';
import type { DocumentType } from '../lib/types';
```

`JobOrderPage.tsx` uses the local name `DocType` throughout. Rather than renaming every use, alias it at the import: `import type { DocumentType as DocType } from '../lib/types';`

- [ ] **Step 4: Move the print template**

Create `admin-web/src/components/print/PrintTemplate.tsx`. Move `JobOrderPage.tsx:1441-1626` (the print-template section through the end of the file) verbatim, plus the `LineItem` interface from lines 235-242. Export both `LineItem` and `PrintTemplate`, add `warrantyTier: WarrantyTier;` as the last field of `LineItem`, and add the imports the moved code needs:

```tsx
import type { Client, DocumentType, JobOrderStatus, SoftwareProduct, WarrantyTier } from '../../lib/types';
import { DOC_META } from './doc-types';
```

Inside the moved code, the prop `docType: DocType` becomes `docType: DocumentType`.

In `JobOrderPage.tsx`, delete the moved `LineItem` interface and `PrintTemplate` function, then import:

```ts
import { PrintTemplate, type LineItem } from '../components/print/PrintTemplate';
```

- [ ] **Step 5: Give LineItem a tier everywhere it is constructed**

`LineItem` now requires `warrantyTier`. Add it at all four construction sites in `JobOrderPage.tsx`:

- `fromSaved` (line 247): add `warrantyTier: item.warrantyTier ?? 'ACCESSORY',`
- `addInventoryItem` (line 540): add `warrantyTier: 'ACCESSORY',`
- `customForm` initial state (line 397) and its reset (line 571): add `warrantyTier: 'ACCESSORY' as WarrantyTier,`

- [ ] **Step 6: Verify the build is clean**

Run: `npm run build --prefix admin-web`
Expected: PASS — `tsc -b` reports no errors and Vite writes `dist/`.

- [ ] **Step 7: Verify no behaviour changed**

Start the app, open a job order with materials, click Print, and confirm the preview is identical to before this task: same header, same tables, same CONFIDENTIAL watermark, one page group.

- [ ] **Step 8: Commit**

```bash
git add admin-web/src/components/print/ admin-web/src/pages/JobOrderPage.tsx admin-web/src/lib/types.ts
git commit -m "refactor(admin-web): extract print template and styles from JobOrderPage"
```

---

### Task 6: Agreement toggle and per-item tier control

**Files:**
- Modify: `admin-web/src/pages/JobOrderPage.tsx`

**Interfaces:**
- Consumes: `LineItem` (Task 5), `JobOrder.includeAgreement` (Task 5), the `POST /job-orders` contract (Task 3).
- Produces: `includeAgreement` state in `JobOrderPage`, available to Task 7 for conditional rendering.

- [ ] **Step 1: Add the state**

In `JobOrderPage.tsx`, after the `showCustomForm` state (line 398), add:

```ts
  const [includeAgreement, setIncludeAgreement] = useState(false);
```

- [ ] **Step 2: Hydrate it from the saved order**

In the populate effect, after the `setDocType` line (line 424), add:

```ts
    setIncludeAgreement(jo.includeAgreement ?? false);
```

- [ ] **Step 3: Send both fields on save**

In the `upsert` mutation payload, after the `docType` line (line 465), add:

```ts
          includeAgreement,
```

and change the `items` mapping (lines 466-472) to carry the tier:

```ts
          items: items.map(({ name, description, quantity, unitPrice, inventoryItemId, warrantyTier }) => ({
            name,
            description: description || undefined,
            quantity,
            unitPrice,
            inventoryItemId: inventoryItemId ?? undefined,
            warrantyTier,
          })),
```

- [ ] **Step 4: Add the tier column to the items table**

In the items table header (lines 971-978), insert a new `<th>` between Description and Qty:

```tsx
                      <th style={{ width: 130 }}>Warranty</th>
```

In the row body, insert a matching `<td>` after the description cell (line 996):

```tsx
                        <td>
                          <select
                            value={item.warrantyTier}
                            style={{ width: '100%', border: 'none', background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.85rem' }}
                            onChange={(e) => updateItem(item._key, { warrantyTier: e.target.value as WarrantyTier })}
                          >
                            <option value="MAIN_SET">Main set</option>
                            <option value="ACCESSORY">Accessory</option>
                            <option value="NONE">Not covered</option>
                          </select>
                        </td>
```

The totals row below the item rows uses `colSpan` — increase it by one so the columns still line up.

- [ ] **Step 5: Add the toggle beside the Print button**

In the button row, immediately before the Print button (line 776), add:

```tsx
            <label
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}
              title="Appends the Service Level Agreement pages to the printed document"
            >
              <input
                type="checkbox"
                checked={includeAgreement}
                onChange={(e) => setIncludeAgreement(e.target.checked)}
              />
              Include Service Agreement
              {includeAgreement && items.length === 0 && (
                <span style={{ color: 'var(--danger)' }}>— no materials, warranty section will be empty</span>
              )}
            </label>
```

- [ ] **Step 6: Add the WarrantyTier import**

Add `WarrantyTier` to the existing `import type { ... } from '../lib/types'` list in `JobOrderPage.tsx`.

- [ ] **Step 7: Verify the build**

Run: `npm run build --prefix admin-web`
Expected: PASS.

- [ ] **Step 8: Verify the round trip**

Start the app. On a job order: set one item to Main set and another to Accessory, tick Include Service Agreement, Save Draft, reload the page. Both selects and the checkbox must come back with the saved values.

- [ ] **Step 9: Commit**

```bash
git add admin-web/src/pages/JobOrderPage.tsx
git commit -m "feat(admin-web): add agreement toggle and per-item warranty tier control"
```

---

### Task 7: ServiceAgreement component

**Files:**
- Create: `admin-web/src/components/print/ServiceAgreement.tsx`
- Modify: `admin-web/src/pages/JobOrderPage.tsx`

**Interfaces:**
- Consumes: `groupByTier`, `derivePackageLabel`, `WarrantyItem` (Task 1); `CompanyContact`, `Client` (Task 5); `includeAgreement` state (Task 6).
- Produces: `export function ServiceAgreement(props: ServiceAgreementProps)`.

- [ ] **Step 1: Write the component**

Create `admin-web/src/components/print/ServiceAgreement.tsx`:

```tsx
import type { CompanyContact } from '../../lib/types';
import { derivePackageLabel, groupByTier, type WarrantyItem } from './warranty.util';

export interface ServiceAgreementProps {
  createdAt?: string;
  signingLocation?: string | null;
  providerName?: string | null;
  providerAddress?: string | null;
  clientName?: string | null;
  clientAddress?: string | null;
  clientOwner?: string | null;
  items: WarrantyItem[];
  mainSetReplacementDays: number;
  mainSetServiceMonths: number;
  accessoryReplacementDays: number;
  accessoryServiceMonths: number;
  warrantyExclusions?: string | null;
  contacts: CompanyContact[];
}

/** Renders a blank rule for anything not configured, so it can be filled in by pen. */
const blank = (value?: string | null) => (value && value.trim() ? value : '__________');

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];

const S = {
  body: { fontFamily: 'Arial, sans-serif', color: '#000', fontSize: '11pt', lineHeight: 1.5 },
  title: { fontSize: '14pt', fontWeight: 'bold' as const, textAlign: 'center' as const, marginBottom: '14pt' },
  heading: { fontWeight: 'bold' as const, marginTop: '12pt', marginBottom: '4pt' },
  para: { marginBottom: '8pt', textAlign: 'justify' as const },
  list: { margin: '4pt 0 8pt 18pt', padding: 0 },
};

function ItemList({ items }: { items: WarrantyItem[] }) {
  if (items.length === 0) return <div style={{ marginLeft: '18pt', fontStyle: 'italic' }}>No items listed.</div>;
  return (
    <div style={S.list}>
      {items.map((item, i) => (
        <div key={`${item.name}-${i}`}>
          {ROMAN[i] ?? i + 1}. {item.name}
          {item.quantity > 1 && ` (${item.quantity})`}
        </div>
      ))}
    </div>
  );
}

export function ServiceAgreement({
  createdAt, signingLocation, providerName, providerAddress,
  clientName, clientAddress, clientOwner, items,
  mainSetReplacementDays, mainSetServiceMonths,
  accessoryReplacementDays, accessoryServiceMonths,
  warrantyExclusions, contacts,
}: ServiceAgreementProps) {
  const { mainSet, accessory } = groupByTier(items);
  const packageLabel = derivePackageLabel(items);
  const signedOn = createdAt ? new Date(createdAt) : new Date();
  const dateText = signedOn.toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });
  const signatory = contacts.find((c) => c.isSignatory) ?? null;
  const exclusions = blank(warrantyExclusions);

  return (
    <div className="agreement-page" style={S.body}>
      <div style={S.title}>SERVICE LEVEL AGREEMENT</div>

      <p style={S.para}>KNOW ALL MEN BY THESE PRESENTS:</p>
      <p style={S.para}>
        This Service Agreement made and entered into this {dateText} at {blank(signingLocation)}, by and between:
      </p>
      <p style={S.para}>
        <strong>{blank(providerName)}</strong> a duly organized and existing under the laws of the Philippines, with
        principal place of business located at {blank(providerAddress)} represented herein by its{' '}
        {signatory ? `${signatory.title}, ${signatory.name}` : '__________'}, and hereinafter referred to as the
        SERVICE PROVIDER;
      </p>
      <p style={{ ...S.para, textAlign: 'center' }}>-And-</p>
      <p style={S.para}>
        <strong>{blank(clientName)}</strong>, duly organized and existing under the laws of the Philippines, with its
        principal place of business located at {blank(clientAddress)} and hereinafter referred to as the CLIENT;
      </p>

      <p style={S.para}>WITNESSETH THAT:</p>
      <p style={S.para}>
        WHEREAS, the SERVICE PROVIDER is engaged in the business of providing Point of Sales Systems to all retail,
        wholesaler, pharmacy, restaurant or all possible clients that need sales monitoring and inventory in the
        Philippines;
      </p>
      <p style={S.para}>
        WHEREAS, the CLIENT is engaged in the business of providing products and services within various areas in the
        Philippines;
      </p>
      <p style={S.para}>
        WHEREAS, the CLIENT has offered, and the SERVICE PROVIDER has agreed to provide its Point of Sales System
        Services to CLIENT's <strong>{packageLabel}</strong>.
      </p>

      <div style={S.heading}>I. SCOPE OF SERVICE:</div>
      <p style={S.para}>
        a) The SERVICE PROVIDER shall set up <strong>{packageLabel}</strong> with the following:
      </p>

      <div style={{ ...S.heading, marginTop: '8pt' }}>Warranty Coverage:</div>
      <p style={{ ...S.para, marginBottom: '2pt' }}>
        The following computer set accessories and components are covered by a{' '}
        {plural(mainSetReplacementDays, 'Day')} Replacement Warranty for factory defects and a{' '}
        {plural(mainSetServiceMonths, 'Month')} Limited Service Warranty under normal use conditions.
      </p>
      <ItemList items={mainSet} />
      <p style={{ ...S.para, marginBottom: '2pt' }}>
        The following accessories are covered by a {plural(accessoryReplacementDays, 'Day')} Replacement Warranty for
        defects and a {plural(accessoryServiceMonths, 'Month')} Limited Warranty under normal use.
      </p>
      <ItemList items={accessory} />
      <p style={S.para}>Warranty does not cover {exclusions}.</p>
      <p style={S.para}>
        b) The SERVICE PROVIDER shall install the above-listed equipment to {blank(clientAddress)} of the CLIENT.
      </p>

      <div style={S.heading}>II. CLIENTS REQUIREMENTS: Customer responsibilities and/ requirements;</div>
      <div style={S.list}>
        <div>a) Completion of POS training- dedicated assigned personnel that will complete the training.</div>
        <div>b) Person In-charge – the one who will communicate with the provider for any support and assistance.</div>
        <div>c) POS Station – a well secured area in which POS is safe from dust, water, secured and well ventilated. (Not advisable for the POS to frequently change the area or uninstall)</div>
        <div>d) Payment for the Package, Installation and Training</div>
        <div>e) Database with updated inventory (Initial) we will send excel format.</div>
        <div>f) Person in charge for database integration, update and monitoring.</div>
        <div>g) Hardware care and maintenance – our hardware is covered by the warranty stated in Section I, so we require the client to strictly observe proper use.</div>
        <div>h) Thermal papers, usb hub are not part of the package so we required every client to prepare upon deployment.</div>
      </div>

      <div style={S.heading}>III. CONFIDENTIAL INFORMATION</div>
      <p style={S.para}>
        a) The provisions entered into by the parties in this Agreement shall be considered strictly confidential and
        shall not be divulged to any person or entity. Further, the parties herein shall not, either during the term of
        this agreement or at any time thereafter, use or disclose to any person, firm or corporation any information
        concerning the business or affairs of the other party which it may have acquired by reason of this agreement,
        for its own benefit or to the detriment of the Other party;
      </p>
      <p style={S.para}>
        b) Any information acquired from the POS shall not be divulged to any person, natural or juridical, unless
        ordered by the court or other government agency having authority to do so;
      </p>
      <p style={S.para}>
        c) In default settings, each client account provides the POS PROVIDER's support personnel the ability to log in
        and perform limited actions on the account. As such, the CLIENT's POS or any data installed therein may be
        exposed to the said individuals or any third party who may find access to the said information. In this regard,
        the CLIENT may disable this function or request the SERVICE PROVIDER to disable the said function to ensure
        confidentiality, with an understanding that in doing so, the support access on the said account may be limited
        to a certain extent;
      </p>

      <div style={S.heading}>IV. TRANSFERABILITY AND ASSIGNABILITY:</div>
      <p style={S.para}>
        This agreement or any right there to shall not be assigned or transferred without the express written consent
        of the parties herein;
      </p>

      <div style={S.heading}>V. ENTIRE AGREEMENT AND AMENDMENT</div>
      <p style={S.para}>
        This Service Agreement constitutes the full and complete understanding between the parties hereto with respect
        to the subject matter of this agreement, and there are no other promises, representations or warranties
        affecting it. Any provisions in this agreement may not be altered, changed and/or modified in any manner,
        orally or otherwise, except by an instrument in writing signed by a duly authorized officer or representative
        of each of the parties hereto;
      </p>

      <div style={S.heading}>VI. SEPARABILITY:</div>
      <p style={S.para}>
        Each provision in this agreement is separate and independent from the others, and is not to be construed and/or
        interpreted as having any restrictive or expansive effect upon the meaning, intention, interpretation or
        execution of any other provision of this agreement either implicitly or explicitly, unless it so specifically
        provides;
      </p>

      <div style={S.heading}>VII. CONFORMITY:</div>
      <p style={S.para}>
        The parties have read and understood all terms and conditions of this agreement and hereby express their
        conformity thereof.
      </p>

      <div style={S.heading}>VIII. OFFICIAL CONTACT PERSONS FOR THE SERVICE PROVIDER</div>
      {contacts.length === 0 ? (
        <div style={{ marginLeft: '18pt' }}>__________</div>
      ) : (
        <div style={S.list}>
          {contacts.map((c) => (
            <div key={c.id} style={{ marginBottom: '4pt' }}>
              <strong>{c.title}</strong> — {c.name}
              {c.phone && ` — ${c.phone}`}
              {c.email && ` — ${c.email}`}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40pt', marginTop: '48pt' }}>
        <div style={{ borderTop: '1px solid #000', paddingTop: '6pt', textAlign: 'center', fontSize: '10pt' }}>
          {signatory ? `${signatory.name}` : '__________'}
          <div style={{ color: '#555' }}>{blank(providerName)}</div>
        </div>
        <div style={{ borderTop: '1px solid #000', paddingTop: '6pt', textAlign: 'center', fontSize: '10pt' }}>
          {blank(clientOwner)}
          <div style={{ color: '#555' }}>{blank(clientName)}</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render it after the job order**

In `JobOrderPage.tsx`, inside `<div id="job-order-print">`, immediately after the closing `/>` of `<PrintTemplate ... />` (line 718), add:

```tsx
        {includeAgreement && (
          <ServiceAgreement
            createdAt={jo?.createdAt}
            signingLocation={companyProfileQuery.data?.signingLocation}
            providerName={companyProfileQuery.data?.businessName}
            providerAddress={companyProfileQuery.data?.address}
            clientName={client?.businessName}
            clientAddress={client?.address}
            clientOwner={client?.ownerName}
            items={items}
            mainSetReplacementDays={companyProfileQuery.data?.mainSetReplacementDays ?? 7}
            mainSetServiceMonths={companyProfileQuery.data?.mainSetServiceMonths ?? 3}
            accessoryReplacementDays={companyProfileQuery.data?.accessoryReplacementDays ?? 7}
            accessoryServiceMonths={companyProfileQuery.data?.accessoryServiceMonths ?? 1}
            warrantyExclusions={companyProfileQuery.data?.warrantyExclusions}
            contacts={companyProfileQuery.data?.contacts ?? []}
          />
        )}
```

Add the import:

```ts
import { ServiceAgreement } from '../components/print/ServiceAgreement';
```

- [ ] **Step 3: Teach html2pdf about page breaks**

In `handleDownload`, add `pagebreak` to the html2pdf options (line 630-636). Without it the library ignores the CSS break and slices the agreement mid-clause:

```ts
      await html2pdf().set({
        margin: [10, 10],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      }).from(element).save();
```

- [ ] **Step 4: Verify the build**

Run: `npm run build --prefix admin-web`
Expected: PASS.

- [ ] **Step 5: Verify the print output**

Start the app and open a job order with at least one Main set item and one Accessory item.

1. Toggle off, Print — output is the job order alone, unchanged from Task 5.
2. Toggle on, Print — the agreement starts on a fresh page; the two warranty lists show the right items; no clause is split mid-sentence; the CONFIDENTIAL watermark sits behind the text without obscuring any clause.
3. Toggle on, Download PDF — same page breaks, and the company logo still renders on page one.
4. With Settings not yet filled in, the agreement shows `__________` in place of the signing location, provider address, exclusions, and contacts, and does not crash.

- [ ] **Step 6: Commit**

```bash
git add admin-web/src/components/print/ServiceAgreement.tsx admin-web/src/pages/JobOrderPage.tsx
git commit -m "feat(admin-web): render service agreement pages on job order print"
```

---

### Task 8: Service Agreement settings UI

**Files:**
- Modify: `admin-web/src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: `CompanyProfile`, `CompanyContact` (Task 5); `PATCH /company-profile` contract (Task 4).
- Produces: nothing downstream.

- [ ] **Step 1: Extend the form type**

In `SettingsPage.tsx`, replace `CompanyProfileForm` (lines 25-33) with:

```ts
type ContactRow = {
  name: string;
  title: string;
  phone: string;
  email: string;
  isSignatory: boolean;
};

type CompanyProfileForm = {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  tin: string;
  logoUrl: string;
  signingLocation: string;
  mainSetReplacementDays: number;
  mainSetServiceMonths: number;
  accessoryReplacementDays: number;
  accessoryServiceMonths: number;
  warrantyExclusions: string;
  contacts: ContactRow[];
};
```

- [ ] **Step 2: Hydrate the new fields**

In the populate effect (lines 48-60), add to the `setForm({ ... })` object:

```ts
        signingLocation: profileQuery.data.signingLocation ?? '',
        mainSetReplacementDays: profileQuery.data.mainSetReplacementDays ?? 7,
        mainSetServiceMonths: profileQuery.data.mainSetServiceMonths ?? 3,
        accessoryReplacementDays: profileQuery.data.accessoryReplacementDays ?? 7,
        accessoryServiceMonths: profileQuery.data.accessoryServiceMonths ?? 1,
        warrantyExclusions: profileQuery.data.warrantyExclusions ?? '',
        contacts: (profileQuery.data.contacts ?? []).map((c) => ({
          name: c.name,
          title: c.title,
          phone: c.phone ?? '',
          email: c.email ?? '',
          isSignatory: c.isSignatory,
        })),
```

- [ ] **Step 3: Send sortOrder on save**

The backend derives `sortOrder` from array index when omitted, so the form's array order is the printed order. No change to `handleSubmit` is needed — but confirm `saveMutation` posts `form` wholesale (line 63) and therefore includes `contacts`.

- [ ] **Step 4: Add contact row helpers**

After `handleLogoUpload` (line 96), add:

```tsx
  const addContact = () => {
    if (!form) return;
    setForm({ ...form, contacts: [...form.contacts, { name: '', title: '', phone: '', email: '', isSignatory: form.contacts.length === 0 }] });
  };

  const updateContact = (index: number, patch: Partial<ContactRow>) => {
    if (!form) return;
    setForm({ ...form, contacts: form.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
  };

  const removeContact = (index: number) => {
    if (!form) return;
    setForm({ ...form, contacts: form.contacts.filter((_, i) => i !== index) });
  };

  /** Exactly one contact may be the signatory named in the agreement's parties block. */
  const setSignatory = (index: number) => {
    if (!form) return;
    setForm({ ...form, contacts: form.contacts.map((c, i) => ({ ...c, isSignatory: i === index })) });
  };
```

- [ ] **Step 5: Add the Service Agreement section**

After the closing `</div>` of the two-column grid that holds the existing profile fields, and before the form's submit button, add:

```tsx
      <h3 style={{ marginTop: '2rem', marginBottom: '0.25rem' }}>Service Agreement</h3>
      <p style={{ color: 'var(--text-muted)', marginTop: 0, fontSize: '0.85rem' }}>
        Used when "Include Service Agreement" is ticked on a Job Order print.
      </p>

      <div className="field">
        <label htmlFor="cp-signing">Signing location</label>
        <input
          id="cp-signing"
          placeholder="Tagum City, Philippines"
          value={form.signingLocation}
          onChange={(e) => setForm({ ...form, signingLocation: e.target.value })}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '1rem' }}>
        <div className="field">
          <label htmlFor="cp-msr">Main set — replacement (days)</label>
          <input id="cp-msr" type="number" min={0} value={form.mainSetReplacementDays}
            onChange={(e) => setForm({ ...form, mainSetReplacementDays: Number(e.target.value) || 0 })} />
        </div>
        <div className="field">
          <label htmlFor="cp-mss">Main set — service (months)</label>
          <input id="cp-mss" type="number" min={0} value={form.mainSetServiceMonths}
            onChange={(e) => setForm({ ...form, mainSetServiceMonths: Number(e.target.value) || 0 })} />
        </div>
        <div className="field">
          <label htmlFor="cp-asr">Accessory — replacement (days)</label>
          <input id="cp-asr" type="number" min={0} value={form.accessoryReplacementDays}
            onChange={(e) => setForm({ ...form, accessoryReplacementDays: Number(e.target.value) || 0 })} />
        </div>
        <div className="field">
          <label htmlFor="cp-ass">Accessory — limited (months)</label>
          <input id="cp-ass" type="number" min={0} value={form.accessoryServiceMonths}
            onChange={(e) => setForm({ ...form, accessoryServiceMonths: Number(e.target.value) || 0 })} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="cp-excl">Warranty exclusions</label>
        <textarea
          id="cp-excl"
          rows={2}
          placeholder="physical damage, misuse, liquid damage, electrical surges, unauthorized repairs, or improper handling"
          value={form.warrantyExclusions}
          onChange={(e) => setForm({ ...form, warrantyExclusions: e.target.value })}
        />
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Printed as "Warranty does not cover …" — no leading or trailing punctuation needed.
        </span>
      </div>

      <div className="field">
        <label>Official contact persons</label>
        <table>
          <thead>
            <tr>
              <th style={{ width: 70 }}>Signs</th>
              <th>Name</th>
              <th>Title</th>
              <th>Phone</th>
              <th>Email</th>
              <th style={{ width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {form.contacts.map((c, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="radio"
                    name="cp-signatory"
                    checked={c.isSignatory}
                    onChange={() => setSignatory(i)}
                    title="Named as the representative in the agreement's parties block"
                  />
                </td>
                <td><input value={c.name} onChange={(e) => updateContact(i, { name: e.target.value })} /></td>
                <td><input value={c.title} onChange={(e) => updateContact(i, { title: e.target.value })} /></td>
                <td><input value={c.phone} onChange={(e) => updateContact(i, { phone: e.target.value })} /></td>
                <td><input value={c.email} onChange={(e) => updateContact(i, { email: e.target.value })} /></td>
                <td>
                  <button
                    type="button"
                    onClick={() => removeContact(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '1rem' }}
                    title="Remove"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn btn-secondary" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }} onClick={addContact}>
          + Add contact
        </button>
      </div>
```

- [ ] **Step 6: Verify the build**

Run: `npm run build --prefix admin-web`
Expected: PASS.

- [ ] **Step 7: Verify end to end**

1. Settings → Company Profile: fill in the signing location, all four warranty numbers, the exclusions, and two contacts. Mark the first as the signatory. Save.
2. Reload the page — every value comes back, including which contact is the signatory.
3. Remove one contact, save, reload — it stays removed.
4. Open a job order with materials, tick Include Service Agreement, Print — the parties block names the signatory with their title, Section I shows the configured durations, Section VIII lists both contacts in form order.

- [ ] **Step 8: Run the full test suites**

Run: `npm test && npm test --prefix admin-web`
Expected: PASS for both.

- [ ] **Step 9: Commit**

```bash
git add admin-web/src/pages/SettingsPage.tsx
git commit -m "feat(admin-web): add service agreement settings and contacts editor"
```

---

## Open items for the owner

These are recorded in the spec and need a human decision before the first live print, but they do not block implementation:

1. **Section II(g) reworded** — no longer names "1 month"; it references Section I.
2. **Exclusions unified** — both Section I paragraphs share one exclusions list, dropping the source's narrower second list.
