# Products Page with Category Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the Software Products page to Products and give it a pinned Software tab plus one tab per user-managed item category, with categories created from Settings and driving the job order materials picker filter.

**Architecture:** A new `ItemCategory` table holds user-defined categories, each declaring an optional `JobOrderType`. `InventoryItem` gains a nullable `categoryId`. The existing `InventoryPage` component is reused with a scope prop rather than duplicated, so the Products tabs, the Settings inventory view, and the uncategorised view are all one component. Filtering happens client-side — the catalog is ten rows and both consumers already fetch it whole.

**Tech Stack:** NestJS 11, Prisma 6.19.3 (MySQL), React 19, Vite 8, TanStack Query 5, Jest 30 (backend).

**Spec:** [docs/superpowers/specs/2026-08-04-product-categories-design.md](../specs/2026-08-04-product-categories-design.md)

## Global Constraints

- Scope is `admin-web` and the NestJS backend only. Do not touch `mobile/` — `mobile/app/admin/products.tsx` keeps reading `/software-products` unchanged.
- Database is MySQL. Migrations are hand-written `migration.sql` under `prisma/migrations/<timestamp>_<name>/`, matching `20260715090000_job_order_doc_type/migration.sql`.
- Backend tests are Jest, `rootDir: src`, `testRegex: .*\.spec\.ts$`, test file beside its source. Service tests use hand-built mocks, no `@nestjs/testing` — follow `src/job-orders.service.spec.ts`.
- **`admin-web` has no test runner.** Frontend tasks are verified by `npm run build --prefix admin-web` plus the named manual steps. Do not add a test runner in this plan.
- Category write endpoints carry `@UseGuards(RolesGuard)` + `@Roles('SUPER_ADMIN', 'ADMIN_STAFF')`, matching `src/inventory.controller.ts:37`. Reads stay open to any authenticated user.
- `ItemCategory.jobOrderType` is nullable; `null` means the category appears in every job order type.
- `InventoryItem.categoryId` is nullable with `onDelete: SetNull`. An uncategorised item appears in every picker.
- Deleting a category holding items must return 409, never orphan the items.
- Seeded categories are exactly three: `POS Hardware` (SOFTWARE), `CCTV` (CCTV), `General` (null). No Signage category is seeded.
- Software products (`software_products`) are never merged into the category system.

## Coordination note

`docs/superpowers/plans/2026-08-04-service-agreement-attachment.md` is written but **not executed**, and it edits `admin-web/src/pages/JobOrderPage.tsx` heavily — extracting the print template (its Task 5) and adding a Warranty column to the materials table (its Task 6). This plan's Task 7 edits the Quick Add picker in the same file, around line 949, a different region from the items table at 967-1033.

The two are independent in content but will collide in the file. Whichever plan runs second rebases. If the service-agreement plan has already run when this one starts, expect the line numbers quoted in Task 7 to have shifted — locate the code by its surrounding markers, not by line number.

---

### Task 1: Category table, column, seed, and backfill

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260804010000_item_categories/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma model `ItemCategory { id, name, jobOrderType, sortOrder, active, createdAt, updatedAt, items }` and `InventoryItem.categoryId: string | null` / `InventoryItem.category`.

- [ ] **Step 1: Add the model and relation**

In `prisma/schema.prisma`, directly above `model InventoryItem {` (line 468), add:

```prisma
/** A user-managed grouping of inventory items. Each active row becomes a Products page tab. */
model ItemCategory {
  id           String        @id @default(uuid())
  name         String        @unique
  /** Which job order type this category's items belong to. Null = shows in every type. */
  jobOrderType JobOrderType? @map("job_order_type")
  sortOrder    Int           @default(0) @map("sort_order")
  active       Boolean       @default(true)

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  items InventoryItem[]

  @@map("item_categories")
}
```

In `model InventoryItem`, after the `active` field (line 477), add:

```prisma
  categoryId String? @map("category_id")
```

and in its relation block, after `movements` (line 483), add:

```prisma
  category ItemCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
```

and after the `movements` relation, add the index alongside the existing `@@map`:

```prisma
  @@index([categoryId])
```

- [ ] **Step 2: Write the migration**

Create `prisma/migrations/20260804010000_item_categories/migration.sql`:

```sql
-- CreateTable
CREATE TABLE `item_categories` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `job_order_type` ENUM('SOFTWARE', 'CCTV', 'SIGNAGE') NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `item_categories_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `inventory_items` ADD COLUMN `category_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `inventory_items_category_id_idx` ON `inventory_items`(`category_id`);

-- AddForeignKey
ALTER TABLE `inventory_items` ADD CONSTRAINT `inventory_items_category_id_fkey`
    FOREIGN KEY (`category_id`) REFERENCES `item_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the three starting categories
INSERT INTO `item_categories` (`id`, `name`, `job_order_type`, `sort_order`, `active`, `created_at`, `updated_at`)
VALUES
    (UUID(), 'POS Hardware', 'SOFTWARE', 0, true, NOW(3), NOW(3)),
    (UUID(), 'CCTV',         'CCTV',     1, true, NOW(3), NOW(3)),
    (UUID(), 'General',      NULL,       2, true, NOW(3), NOW(3));

-- Backfill: the ten existing rows are all POS hardware.
-- Names are matched exactly; an unmatched row stays uncategorised and keeps
-- appearing in every picker, which is the pre-migration behaviour.
UPDATE `inventory_items`
SET `category_id` = (SELECT `id` FROM `item_categories` WHERE `name` = 'POS Hardware')
WHERE `name` IN (
    'Complete Set',
    'Computer / PC',
    'Cash Drawer',
    'Thermal Printer 80mm',
    'Thermal Printer 58mm',
    'Barcode Scanner',
    'Keyboard & Mouse',
    'Monitor'
);

UPDATE `inventory_items`
SET `category_id` = (SELECT `id` FROM `item_categories` WHERE `name` = 'General')
WHERE `name` IN ('UPS / AVR', 'Network Switch');
```

- [ ] **Step 3: Validate the schema**

Run: `npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 4: Apply and regenerate**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: migration `20260804010000_item_categories` applied, then `Generated Prisma Client`.

- [ ] **Step 5: Verify the backfill landed**

Run:

```bash
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{console.table(await p.itemCategory.findMany({select:{name:true,jobOrderType:true,sortOrder:true,_count:{select:{items:true}}}}));console.log('uncategorised:',await p.inventoryItem.count({where:{categoryId:null}}));await p.\$disconnect()})()"
```

Expected: three categories — POS Hardware with 8 items, CCTV with 0, General with 2 — and `uncategorised: 0`.

If any row is uncategorised, an item was renamed since the spec was written. Do not guess a mapping — report the item names so the human can classify them from Settings after Task 6.

- [ ] **Step 6: Confirm no drift**

Run: `npx prisma migrate status`
Expected: `Database schema is up to date!`

Do not run `migrate reset` on drift — the database holds real records. Stop and report.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260804010000_item_categories/
git commit -m "feat(db): add item categories with seed and inventory backfill"
```

---

### Task 2: Item categories CRUD API

**Files:**
- Create: `src/item-category.dto.ts`
- Create: `src/item-categories.service.ts`
- Create: `src/item-categories.controller.ts`
- Create: `src/item-categories.module.ts`
- Modify: `src/app.module.ts`
- Test: `src/item-categories.service.spec.ts`

**Interfaces:**
- Consumes: Prisma `ItemCategory` from Task 1.
- Produces:
  - `CreateItemCategoryDto { name: string; jobOrderType?: JobOrderType | null; sortOrder?: number; active?: boolean }`
  - `UpdateItemCategoryDto` — same fields, all optional
  - `ItemCategoriesService.findAll(includeInactive?: boolean)` → categories ordered by `sortOrder` then `name`, each with `_count.items`
  - `ItemCategoriesService.create`, `.update(id, dto)`, `.remove(id)` — `remove` throws `ConflictException` when the category holds items
  - Routes: `GET /item-categories`, `POST /item-categories`, `PATCH /item-categories/:id`, `DELETE /item-categories/:id`

- [ ] **Step 1: Write the failing tests**

Create `src/item-categories.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ItemCategoriesService } from './item-categories.service';

function buildPrisma() {
  const prisma = {
    itemCategory: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 'cat-1', name: 'CCTV' }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'cat-new', ...data })),
      update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      delete: jest.fn().mockResolvedValue({ id: 'cat-1' }),
    },
    inventoryItem: {
      count: jest.fn().mockResolvedValue(0),
    },
  };
  return { prisma, service: new ItemCategoriesService(prisma as never) };
}

describe('ItemCategoriesService.findAll', () => {
  it('returns only active categories ordered by sortOrder then name', async () => {
    const { prisma, service } = buildPrisma();

    await service.findAll();

    expect(prisma.itemCategory.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { items: true } } },
    });
  });

  it('includes inactive categories when asked', async () => {
    const { prisma, service } = buildPrisma();

    await service.findAll(true);

    expect(prisma.itemCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });
});

describe('ItemCategoriesService.remove', () => {
  it('refuses to delete a category that still holds items', async () => {
    const { prisma, service } = buildPrisma();
    prisma.inventoryItem.count.mockResolvedValue(3);

    await expect(service.remove('cat-1')).rejects.toThrow(ConflictException);
    expect(prisma.itemCategory.delete).not.toHaveBeenCalled();
  });

  it('names the item count in the conflict message', async () => {
    const { prisma, service } = buildPrisma();
    prisma.inventoryItem.count.mockResolvedValue(3);

    await expect(service.remove('cat-1')).rejects.toThrow(/3/);
  });

  it('deletes an empty category', async () => {
    const { prisma, service } = buildPrisma();

    await service.remove('cat-1');

    expect(prisma.itemCategory.delete).toHaveBeenCalledWith({ where: { id: 'cat-1' } });
  });

  it('throws 404 for a category that does not exist', async () => {
    const { prisma, service } = buildPrisma();
    prisma.itemCategory.findUnique.mockResolvedValue(null);

    await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
  });
});

describe('ItemCategoriesService.update', () => {
  it('accepts an explicit null jobOrderType for the all-types case', async () => {
    const { prisma, service } = buildPrisma();

    await service.update('cat-1', { jobOrderType: null });

    expect(prisma.itemCategory.update).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: { jobOrderType: null },
    });
  });

  it('leaves jobOrderType untouched when the dto omits it', async () => {
    const { prisma, service } = buildPrisma();

    await service.update('cat-1', { name: 'Renamed' });

    expect(prisma.itemCategory.update).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: { name: 'Renamed' },
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/item-categories.service.spec.ts`
Expected: FAIL — `Cannot find module './item-categories.service'`.

- [ ] **Step 3: Write the DTOs**

Create `src/item-category.dto.ts`:

```ts
import { JobOrderType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class CreateItemCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  /** Null means the category's items appear in every job order type. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(JobOrderType)
  jobOrderType?: JobOrderType | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateItemCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(JobOrderType)
  jobOrderType?: JobOrderType | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
```

`@ValidateIf` is required because `@IsEnum` rejects `null`, and null is the meaningful "all types" value rather than an absent field.

- [ ] **Step 4: Write the service**

Create `src/item-categories.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { CreateItemCategoryDto, UpdateItemCategoryDto } from './item-category.dto';

@Injectable()
export class ItemCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(includeInactive = false) {
    return this.prisma.itemCategory.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { items: true } } },
    });
  }

  async create(dto: CreateItemCategoryDto) {
    try {
      return await this.prisma.itemCategory.create({
        data: {
          name: dto.name.trim(),
          jobOrderType: dto.jobOrderType ?? null,
          sortOrder: dto.sortOrder ?? 0,
          active: dto.active ?? true,
        },
      });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async update(id: string, dto: UpdateItemCategoryDto) {
    await this.getOrThrow(id);
    const data: Prisma.ItemCategoryUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.jobOrderType !== undefined) data.jobOrderType = dto.jobOrderType;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.active !== undefined) data.active = dto.active;
    try {
      return await this.prisma.itemCategory.update({ where: { id }, data });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async remove(id: string) {
    await this.getOrThrow(id);
    // SetNull protects the rows, but silently orphaning a dozen items on a
    // misclick is still bad — make the caller reassign or deactivate instead.
    const itemCount = await this.prisma.inventoryItem.count({ where: { categoryId: id } });
    if (itemCount > 0) {
      throw new ConflictException(
        `This category still holds ${itemCount} item(s). Move them to another category, or deactivate this one instead of deleting it.`,
      );
    }
    await this.prisma.itemCategory.delete({ where: { id } });
    return { id };
  }

  private async getOrThrow(id: string) {
    const category = await this.prisma.itemCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Item category not found');
    return category;
  }

  private mapError(e: unknown): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException('A category with that name already exists');
    }
    return e as Error;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/item-categories.service.spec.ts`
Expected: PASS — 8 tests.

- [ ] **Step 6: Write the controller**

Create `src/item-categories.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { ItemCategoriesService } from './item-categories.service';
import { CreateItemCategoryDto, UpdateItemCategoryDto } from './item-category.dto';

@Controller('item-categories')
@UseGuards(JwtAuthGuard)
export class ItemCategoriesController {
  constructor(private readonly categories: ItemCategoriesService) {}

  /** List categories — any authenticated user (drives the Products tabs). */
  @Get()
  list(@Query('all') all?: string) {
    return this.categories.findAll(all === 'true');
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN_STAFF')
  create(@Body() dto: CreateItemCategoryDto) {
    return this.categories.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN_STAFF')
  update(@Param('id') id: string, @Body() dto: UpdateItemCategoryDto) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN_STAFF')
  remove(@Param('id') id: string) {
    return this.categories.remove(id);
  }
}
```

- [ ] **Step 7: Write and register the module**

Create `src/item-categories.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ItemCategoriesService } from './item-categories.service';
import { ItemCategoriesController } from './item-categories.controller';
import { PrismaModule } from './prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ItemCategoriesService],
  controllers: [ItemCategoriesController],
  exports: [ItemCategoriesService],
})
export class ItemCategoriesModule {}
```

In `src/app.module.ts`, add the import beside the existing `InventoryModule` import (line 20):

```ts
import { ItemCategoriesModule } from './item-categories.module';
```

and add `ItemCategoriesModule,` to the `imports` array directly after `InventoryModule,` (line 69).

- [ ] **Step 8: Verify the app boots**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS — no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/item-category.dto.ts src/item-categories.service.ts src/item-categories.service.spec.ts src/item-categories.controller.ts src/item-categories.module.ts src/app.module.ts
git commit -m "feat(api): add item categories CRUD with in-use delete guard"
```

---

### Task 3: Inventory carries categoryId

**Files:**
- Modify: `src/create-inventory-item.dto.ts`
- Modify: `src/update-inventory-item.dto.ts`
- Modify: `src/inventory.service.ts:11-16` (`list`), `:26-43` (`create`), `:45-61` (`update`)
- Test: `src/inventory.service.spec.ts` (create)

**Interfaces:**
- Consumes: `ItemCategory` from Task 1.
- Produces: `CreateInventoryItemDto.categoryId?: string | null`, `UpdateInventoryItemDto.categoryId?: string | null`. `GET /inventory` items now carry a `category` object (or null).

- [ ] **Step 1: Write the failing tests**

Create `src/inventory.service.spec.ts`:

```ts
import { InventoryService } from './inventory.service';

function buildService() {
  const prisma = {
    inventoryItem: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 'item-1', stockQty: 0 }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'item-new', ...data })),
      update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
    },
  };
  return { prisma, service: new InventoryService(prisma as never) };
}

describe('InventoryService.list', () => {
  it('includes the category relation so the picker can filter on it', async () => {
    const { prisma, service } = buildService();

    await service.list();

    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { category: true } }),
    );
  });
});

describe('InventoryService.create', () => {
  it('persists categoryId when given', async () => {
    const { prisma, service } = buildService();

    await service.create({ name: 'Dahua 2MP Bullet', categoryId: 'cat-cctv' });

    expect(prisma.inventoryItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ categoryId: 'cat-cctv' }) }),
    );
  });

  it('leaves categoryId null when omitted', async () => {
    const { prisma, service } = buildService();

    await service.create({ name: 'Loose Cable' });

    expect(prisma.inventoryItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ categoryId: null }) }),
    );
  });
});

describe('InventoryService.update', () => {
  it('reassigns the category when given', async () => {
    const { prisma, service } = buildService();

    await service.update('item-1', { categoryId: 'cat-general' });

    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { categoryId: 'cat-general' },
    });
  });

  it('clears the category when given null', async () => {
    const { prisma, service } = buildService();

    await service.update('item-1', { categoryId: null });

    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { categoryId: null },
    });
  });

  it('leaves the category untouched when the dto omits it', async () => {
    const { prisma, service } = buildService();

    await service.update('item-1', { name: 'Renamed' });

    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { name: 'Renamed' },
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/inventory.service.spec.ts`
Expected: FAIL — `findMany` called without `include`, and TypeScript rejects `categoryId` on both DTOs.

- [ ] **Step 3: Extend both DTOs**

In `src/create-inventory-item.dto.ts`, after the `active` field (line 37), add:

```ts
  /** Null leaves the item uncategorised, which shows it in every job order type. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  categoryId?: string | null;
```

and add `ValidateIf` to the `class-validator` import on line 1.

Apply the identical field and import change to `src/update-inventory-item.dto.ts` after its `active` field (line 38).

- [ ] **Step 4: Update the service**

In `src/inventory.service.ts`, change `list` (lines 11-16) to include the relation:

```ts
  list(includeInactive = false) {
    return this.prisma.inventoryItem.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { category: true },
    });
  }
```

Drop the `: Promise<InventoryItem[]>` return annotation on `list` — the included relation widens the row type past `InventoryItem`. Leave the other methods' annotations alone.

In `create`, add to the `data` object after `active` (line 37):

```ts
          categoryId: dto.categoryId ?? null,
```

In `update`, add after the `active` line (line 55):

```ts
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
```

`Prisma.InventoryItemUpdateInput` types relations as nested writes, so assigning a scalar `categoryId` will not typecheck against it. Change the `data` declaration on line 47 to:

```ts
    const data: Prisma.InventoryItemUncheckedUpdateInput = {};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/inventory.service.spec.ts`
Expected: PASS — 6 tests.

- [ ] **Step 6: Run the full backend suite**

Run: `npm test`
Expected: PASS — no previously-passing test breaks.

- [ ] **Step 7: Commit**

```bash
git add src/create-inventory-item.dto.ts src/update-inventory-item.dto.ts src/inventory.service.ts src/inventory.service.spec.ts
git commit -m "feat(api): carry categoryId on inventory items"
```

---

### Task 4: Frontend types and a scoped InventoryPage

**Files:**
- Modify: `admin-web/src/lib/types.ts`
- Modify: `admin-web/src/pages/InventoryPage.tsx`

**Interfaces:**
- Consumes: `GET /item-categories` (Task 2), `GET /inventory` with `category` (Task 3).
- Produces:
  - `lib/types.ts` — `export interface ItemCategory { id: string; name: string; jobOrderType: JobOrderType | null; sortOrder: number; active: boolean; _count?: { items: number } }`
  - `lib/types.ts` — `InventoryItem.categoryId: string | null` and `InventoryItem.category?: ItemCategory | null`
  - `InventoryPage.tsx` — `export interface InventoryPageProps { scope?: { categoryId: string } | { uncategorised: true } }` and `export function InventoryPage(props: InventoryPageProps)`

- [ ] **Step 1: Add the types**

In `admin-web/src/lib/types.ts`, directly above `export interface InventoryItem {` (line 402), add:

```ts
export interface ItemCategory {
  id: string;
  name: string;
  /** Null means this category's items appear in every job order type. */
  jobOrderType: JobOrderType | null;
  sortOrder: number;
  active: boolean;
  _count?: { items: number };
}
```

In `InventoryItem`, after `active` (line 411), add:

```ts
  categoryId: string | null;
  category?: ItemCategory | null;
```

- [ ] **Step 2: Add the scope prop**

A single `scope` prop is used rather than two independent props, so "this category" and "uncategorised" cannot both be requested at once.

In `admin-web/src/pages/InventoryPage.tsx`, replace the `export function InventoryPage() {` signature (line 44) with:

```tsx
export interface InventoryPageProps {
  /** Omit for the full catalog (Settings). Pass a scope to render one Products tab. */
  scope?: { categoryId: string } | { uncategorised: true };
}

export function InventoryPage({ scope }: InventoryPageProps = {}) {
```

- [ ] **Step 3: Fetch categories and filter the list**

After the `movementsQuery` block (line 66), add:

```tsx
  const categoriesQuery = useQuery({
    queryKey: ['item-categories'],
    queryFn: async () => (await api.get<ItemCategory[]>('/item-categories')).data,
  });

  const scopedCategoryId = scope && 'categoryId' in scope ? scope.categoryId : null;
```

Replace the `filteredItems` definition (lines 158-160) with:

```tsx
  const scopedItems = (itemsQuery.data ?? []).filter((item) => {
    if (!scope) return true;
    if ('uncategorised' in scope) return item.categoryId === null;
    return item.categoryId === scope.categoryId;
  });
  const filteredItems = scopedItems.filter((item) =>
    matchesSearch(itemSearch, item.name, item.description, item.barcode),
  );
```

Every later reference to `itemsQuery.data` for emptiness — lines 181 and 183 — must switch to `scopedItems`, otherwise a category with no items renders the full-catalog table shell with "No matches" instead of its own empty state.

Add `ItemCategory` to the existing `import type { … } from '../lib/types'` on line 4.

- [ ] **Step 4: Default new items to the scoped category**

In `ItemForm` (lines 14-22), add `categoryId: string;`. In `emptyForm` (lines 24-32), add `categoryId: '',`.

In `openAdd` (lines 113-118), replace `setForm(emptyForm)` with:

```tsx
    setForm({ ...emptyForm, categoryId: scopedCategoryId ?? '' });
```

In `openEdit` (lines 120-133), add to the `setForm({ … })` object:

```tsx
      categoryId: item.categoryId ?? '',
```

In `saveMutation`'s `payload` (lines 74-81), add:

```tsx
        categoryId: form.categoryId || null,
```

- [ ] **Step 5: Add the category select to the item form**

In the item form dialog, directly after the Name field, add:

```tsx
          <div className="field">
            <label htmlFor="inv-category">Category</label>
            <select
              id="inv-category"
              value={form.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
            >
              <option value="">Uncategorised — shows in every job order type</option>
              {(categoriesQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.jobOrderType ? ` (${c.jobOrderType})` : ' (all types)'}
                </option>
              ))}
            </select>
          </div>
```

- [ ] **Step 6: Add the category column, only when unscoped**

Inside a Products tab every row shares one category, so the column is noise there. In the table header (lines 192-199), after the `<th>Item</th>` cell, add:

```tsx
                {!scope && <th>Category</th>}
```

In the row body, after the item name `<td>` (lines 207-212), add:

```tsx
                  {!scope && (
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      {item.category?.name ?? 'Uncategorised'}
                    </td>
                  )}
```

The "No matches" row's `colSpan={6}` (line 203) becomes `colSpan={scope ? 6 : 7}`.

- [ ] **Step 7: Verify the build**

Run: `npm run build --prefix admin-web`
Expected: PASS.

- [ ] **Step 8: Verify in Settings**

Start the app, open Settings → Inventory Management. The Category column shows "POS Hardware" for the eight items and "General" for UPS/AVR and Network Switch. Edit an item, change its category, save, confirm the column updates.

- [ ] **Step 9: Commit**

```bash
git add admin-web/src/lib/types.ts admin-web/src/pages/InventoryPage.tsx
git commit -m "feat(admin-web): scope InventoryPage by category and edit item category"
```

---

### Task 5: Products page tabs and nav rename

**Files:**
- Modify: `admin-web/src/pages/ProductsPage.tsx`
- Modify: `admin-web/src/layouts/AdminLayout.tsx:66`, `:115`

**Interfaces:**
- Consumes: `InventoryPage` with `scope` (Task 4), `GET /item-categories` (Task 2).
- Produces: nothing downstream.

- [ ] **Step 1: Rename the nav entries**

In `admin-web/src/layouts/AdminLayout.tsx`, change `label: 'Software Products'` to `label: 'Products'` on both line 66 and line 115. The `to: '/products'` paths are already correct.

- [ ] **Step 2: Extract the software tab body**

In `ProductsPage.tsx`, the current component body — the heading block, the New product dialog, and `<ProductsTable … />` — becomes the Software tab. Rename the existing `export function ProductsPage()` to `function SoftwareTab()`, and delete only its outer heading `<div>` (lines 54-64), since the page-level heading moves up to the new `ProductsPage`.

- [ ] **Step 3: Write the new page shell**

Add the new `ProductsPage` above `SoftwareTab`:

```tsx
export function ProductsPage() {
  const [tab, setTab] = useState<string>('software');

  const categoriesQuery = useQuery({
    queryKey: ['item-categories'],
    queryFn: async () => (await api.get<ItemCategory[]>('/item-categories')).data,
  });

  const itemsQuery = useQuery({
    queryKey: ['inventory', 'all'],
    queryFn: async () => (await api.get<InventoryItem[]>('/inventory', { params: { all: true } })).data,
  });

  const categories = categoriesQuery.data ?? [];
  // Only offer the uncategorised tab when something is actually stranded there,
  // so a clean catalog does not carry a permanently empty tab.
  const hasUncategorised = (itemsQuery.data ?? []).some((i) => i.categoryId === null);

  const active = categories.find((c) => c.id === tab);

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ marginBottom: '0.25rem' }}>Products</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          Licensable software systems and the hardware catalog, grouped by category.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <TabButton active={tab === 'software'} onClick={() => setTab('software')}>
          Software
        </TabButton>
        {categories.map((c) => (
          <TabButton key={c.id} active={tab === c.id} onClick={() => setTab(c.id)}>
            {c.name}
          </TabButton>
        ))}
        {hasUncategorised && (
          <TabButton active={tab === 'uncategorised'} onClick={() => setTab('uncategorised')}>
            Uncategorised
          </TabButton>
        )}
      </div>

      {tab === 'software' && <SoftwareTab />}
      {tab === 'uncategorised' && <InventoryPage scope={{ uncategorised: true }} />}
      {active && <InventoryPage key={active.id} scope={{ categoryId: active.id }} />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn ${active ? 'btn-primary' : 'btn-secondary'}`}
      style={{ fontSize: '0.85rem' }}
    >
      {children}
    </button>
  );
}
```

The `key={active.id}` on the scoped `InventoryPage` forces a remount when switching category tabs, so its internal form and dialog state does not leak across tabs.

`ProductsPage.tsx` already imports `useState` (line 1) and `useQuery` (line 2) — do not re-import them. Add only what is new:

```tsx
import type { ReactNode } from 'react';
import { InventoryPage } from './InventoryPage';
import type { InventoryItem, ItemCategory } from '../lib/types';
```

`ReactNode` must be imported explicitly — this project uses the automatic JSX runtime, so the `React` namespace is not in scope.

- [ ] **Step 4: Verify the build**

Run: `npm run build --prefix admin-web`
Expected: PASS.

- [ ] **Step 5: Verify the page**

Start the app and open Products. The sidebar reads "Products". Tabs read Software, POS Hardware, CCTV, General — no Uncategorised tab, because the backfill left nothing stranded. Software shows the six products unchanged; POS Hardware shows eight items; CCTV is empty; General shows two.

- [ ] **Step 6: Commit**

```bash
git add admin-web/src/pages/ProductsPage.tsx admin-web/src/layouts/AdminLayout.tsx
git commit -m "feat(admin-web): rename to Products and add category tabs"
```

---

### Task 6: Product Categories settings tab

**Files:**
- Modify: `admin-web/src/pages/SettingsPage.tsx:12-21` (tab list), and the tab body switch at `:735-745`
- Create: `admin-web/src/pages/ProductCategoriesPage.tsx`

**Interfaces:**
- Consumes: the `/item-categories` routes (Task 2), `ItemCategory` (Task 4).
- Produces: `export function ProductCategoriesPage()`.

- [ ] **Step 1: Write the settings tab component**

Create `admin-web/src/pages/ProductCategoriesPage.tsx`:

```tsx
import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Dialog } from '../components/Dialog';
import type { ItemCategory, JobOrderType } from '../lib/types';

const JOB_ORDER_TYPES: JobOrderType[] = ['SOFTWARE', 'CCTV', 'SIGNAGE'];

interface CategoryForm {
  name: string;
  jobOrderType: string; // '' = all types
  sortOrder: string;
  active: boolean;
}

const emptyForm: CategoryForm = { name: '', jobOrderType: '', sortOrder: '0', active: true };

function apiErrorMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return msg ?? fallback;
}

export function ProductCategoriesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ItemCategory | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [formError, setFormError] = useState('');
  const [rowError, setRowError] = useState('');

  const query = useQuery({
    queryKey: ['item-categories', 'all'],
    queryFn: async () => (await api.get<ItemCategory[]>('/item-categories', { params: { all: true } })).data,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['item-categories'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        jobOrderType: form.jobOrderType === '' ? null : (form.jobOrderType as JobOrderType),
        sortOrder: form.sortOrder === '' ? 0 : Number(form.sortOrder),
        active: form.active,
      };
      if (editing) return api.patch(`/item-categories/${editing.id}`, payload);
      return api.post('/item-categories', payload);
    },
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      setFormError('');
    },
    onError: (err) => setFormError(apiErrorMessage(err, 'Failed to save category.')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/item-categories/${id}`),
    onSuccess: () => {
      invalidate();
      setRowError('');
    },
    // The 409 body names how many items block the delete — surface it verbatim.
    onError: (err) => setRowError(apiErrorMessage(err, 'Failed to delete category.')),
  });

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (c: ItemCategory) => {
    setEditing(c);
    setForm({
      name: c.name,
      jobOrderType: c.jobOrderType ?? '',
      sortOrder: String(c.sortOrder),
      active: c.active,
    });
    setFormError('');
    setShowForm(true);
  };

  const submitForm = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError('Name is required.');
      return;
    }
    saveMutation.mutate();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
          Each active category is a tab on the Products page. The job order type decides which
          orders show its items in Quick Add.
        </p>
        <button type="button" className="btn btn-primary" onClick={openAdd}>+ Add category</button>
      </div>

      {rowError && <p className="error-text">{rowError}</p>}
      {query.isLoading && <p>Loading categories…</p>}
      {query.isError && <p className="error-text">Failed to load categories.</p>}

      {query.data && query.data.length > 0 && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Job order type</th>
                <th style={{ textAlign: 'center' }}>Items</th>
                <th style={{ textAlign: 'center' }}>Order</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ width: 150 }}></th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((c) => (
                <tr key={c.id} style={{ opacity: c.active ? 1 : 0.55 }}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>{c.jobOrderType ?? 'All types'}</td>
                  <td style={{ textAlign: 'center' }}>{c._count?.items ?? 0}</td>
                  <td style={{ textAlign: 'center' }}>{c.sortOrder}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`badge ${c.active ? 'badge-success' : ''}`} style={{ fontSize: '0.72rem' }}>
                      {c.active ? 'Active' : 'Hidden'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                      <button type="button" className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }} onClick={() => openEdit(c)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(c.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit category' : 'New category'} maxWidth={440}>
        <form onSubmit={submitForm}>
          <div className="field">
            <label htmlFor="cat-name">Name</label>
            <input id="cat-name" required placeholder="CCTV" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="cat-jotype">Job order type</label>
            <select id="cat-jotype" value={form.jobOrderType} onChange={(e) => setForm({ ...form, jobOrderType: e.target.value })}>
              <option value="">All types</option>
              {JOB_ORDER_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              "All types" puts these items in every job order's Quick Add — use it for shared
              gear like cable and power supplies.
            </span>
          </div>
          <div className="field">
            <label htmlFor="cat-sort">Sort order</label>
            <input id="cat-sort" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Active — show as a Products tab
            </label>
          </div>
          {formError && <p className="error-text">{formError}</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending} style={{ flex: 1 }}>
              {saveMutation.isPending ? 'Saving…' : 'Save category'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Register the settings tab**

In `admin-web/src/pages/SettingsPage.tsx`, add `'categories'` to the `SettingsTab` union (line 12) and this entry to `TABS` (lines 14-21), directly before the inventory entry:

```ts
  { id: 'categories', label: 'Product Categories' },
```

Add the import beside the other page imports (line 8):

```ts
import { ProductCategoriesPage } from './ProductCategoriesPage';
```

And add the render line beside the others (near line 741):

```tsx
      {tab === 'categories' && <ProductCategoriesPage />}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build --prefix admin-web`
Expected: PASS.

- [ ] **Step 4: Verify the tab end to end**

Start the app, open Settings → Product Categories.

1. The three seeded categories list with item counts 8 / 0 / 2.
2. Add "Signage" with job order type SIGNAGE. Open Products — a Signage tab appears.
3. Delete "Signage" while empty — it succeeds and its tab disappears.
4. Try to delete "POS Hardware" — a 409 message names its 8 items and nothing is deleted.
5. Deactivate "General" — its Products tab disappears; its two items are still listed under
   Settings → Inventory Management. Reactivate it.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/pages/ProductCategoriesPage.tsx admin-web/src/pages/SettingsPage.tsx
git commit -m "feat(admin-web): add product categories settings tab"
```

---

### Task 7: Filter the job order materials picker

**Files:**
- Modify: `admin-web/src/pages/JobOrderPage.tsx` — the quick-add block around lines 940-965

**Interfaces:**
- Consumes: `InventoryItem.category` (Task 4).
- Produces: nothing downstream.

Locate the code by the `{/* Preset quick-add buttons (from Inventory) + barcode scan */}` comment rather than by line number — the service-agreement plan may have shifted this file. See the Coordination note.

- [ ] **Step 1: Add the filter**

In `JobOrderPage.tsx`, beside the other derived values near `const { materialsTotal, … } = computeTotals(…)` (line 583), add:

```tsx
  // A category with no jobOrderType, and an item with no category at all, both
  // mean "usable on any job" — so they show regardless of the order's type.
  const pickerItems = (inventoryQuery.data ?? []).filter(
    (item) => item.category?.jobOrderType == null || item.category.jobOrderType === joType,
  );
```

- [ ] **Step 2: Render from the filtered list**

In the quick-add block, change `inventoryQuery.data?.map((item) => (` (line 949) to `pickerItems.map((item) => (`.

- [ ] **Step 3: Fix the empty-state copy**

The current message (lines 943-945) claims the catalog is empty. With filtering on, it also fires when the catalog is full but nothing matches this job type, which reads as a bug. Replace the `inventoryQuery.data?.length === 0 && (…)` block with:

```tsx
                {inventoryQuery.data?.length === 0 && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    No inventory items yet. Add them under Settings → Inventory Management.
                  </p>
                )}
                {inventoryQuery.data && inventoryQuery.data.length > 0 && pickerItems.length === 0 && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    No items are set up for {joType} job orders yet. Assign a category with this
                    job order type under Settings → Product Categories, or scan a barcode below.
                  </p>
                )}
```

Keep the surrounding `<p>` styling identical to the block being replaced.

- [ ] **Step 4: Verify the build**

Run: `npm run build --prefix admin-web`
Expected: PASS.

- [ ] **Step 5: Verify the filter**

Start the app and open a job order.

1. Type Software — Quick Add shows the eight POS Hardware items plus UPS/AVR and Network Switch (General, all types). No CCTV items.
2. Add a CCTV item under Products → CCTV, then switch the order to type CCTV — Quick Add shows that item plus the two General ones, and none of the POS Hardware.
3. Switch to type Signage with no Signage category — Quick Add shows the two General items.
4. Deactivate every category except CCTV, then open a Software order — the copy explains no items are set up for SOFTWARE rather than claiming the catalog is empty.
5. Scan a CCTV item's barcode into a Software order — it is added, by design.

- [ ] **Step 6: Run both suites**

Run: `npm test && npm run build --prefix admin-web`
Expected: PASS for both.

- [ ] **Step 7: Commit**

```bash
git add admin-web/src/pages/JobOrderPage.tsx
git commit -m "feat(admin-web): filter job order quick-add by category job type"
```
