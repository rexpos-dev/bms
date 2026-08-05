# Editable Service Agreement Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin edit the whole Service Level Agreement in Settings, print it as extra pages on a Job Order with client and order values filled in, and reproduce the exact text a printed order was signed under.

**Architecture:** The template is an ordered list of `{ heading, body }` sections stored in immutable `AgreementVersion` rows. A pure `resolveSections(sections, values)` in `admin-web/src/components/print/` turns a template plus a Job Order into render blocks; `ServiceAgreement.tsx` only draws what it returns. A Job Order pins its `agreementVersionId` on first print, after which it always reproduces that version.

**Tech Stack:** NestJS 11, Prisma 6.19.3 (MySQL), React 19, Vite 8, TanStack Query 5, html2pdf.js 0.14, Jest 30 (backend), Vitest 3 (added by Task 1, admin-web).

**Spec:** [docs/superpowers/specs/2026-08-05-agreement-template-editor-design.md](../specs/2026-08-05-agreement-template-editor-design.md)

## Global Constraints

- Scope is `admin-web` and the NestJS backend. Do not touch `mobile/`.
- Database is MySQL. Migrations are hand-written `migration.sql` files under `prisma/migrations/<timestamp>_<name>/`, matching `20260804010000_item_categories/migration.sql`.
- Backend tests are Jest with `rootDir: src` and `testRegex: .*\.spec\.ts$`. Test files sit beside their source as `src/<name>.spec.ts`.
- Backend service tests use hand-built mock objects (no `@nestjs/testing` module), following `src/job-orders.service.spec.ts`.
- Warranty tier values are exactly `MAIN_SET`, `ACCESSORY`, `NONE`. `JobOrderItem.warrantyTier` defaults to `ACCESSORY`; `JobOrder.includeAgreement` defaults to `false`.
- The blank rule is exactly ten underscores: `__________`. Never an em dash.
- The known placeholder set is exactly: `date`, `client_name`, `client_address`, `client_owner`, `package_label`, `main_set_items`, `accessory_items`, `company_name`, `company_address`. Nothing else resolves.
- `client_name`, `company_name`, and `package_label` render bold — but never when they fall back to the blank rule.
- Unknown tokens render verbatim, braces included, and are reported. They never block a save.
- `CompanyProfile` gains no columns.
- `AgreementVersion` rows are never updated and never deleted.
- Existing print output must be unchanged when `includeAgreement` is false.

---

### Task 1: Vitest setup and warranty grouping

`admin-web` has no test runner. This task adds Vitest and delivers the first pure unit — the item grouping the agreement's two warranty lists depend on.

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
  - `warranty.util.ts` — `export function itemLabel(item: WarrantyItem): string`
  - `warranty.util.ts` — `export function derivePackageLabel(items: WarrantyItem[]): string`

- [ ] **Step 1: Install Vitest**

```bash
npm install --prefix admin-web --save-dev vitest@^3.2.4
```

- [ ] **Step 2: Add the test scripts**

In `admin-web/package.json`, the `scripts` block becomes:

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
import { derivePackageLabel, groupByTier, itemLabel, type WarrantyItem } from './warranty.util';

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

describe('itemLabel', () => {
  it('returns the bare name at quantity one', () => {
    expect(itemLabel(item('Monitor', 'MAIN_SET'))).toBe('Monitor');
  });

  it('appends the count above one', () => {
    expect(itemLabel(item('Monitor', 'MAIN_SET', 3))).toBe('Monitor (3)');
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

/** One line of a printed warranty list, e.g. "Monitor" or "Monitor (3)". */
export function itemLabel(item: WarrantyItem): string {
  return item.quantity > 1 ? `${item.name} (${item.quantity})` : item.name;
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
Expected: PASS — 12 tests across 3 describe blocks in one file.

- [ ] **Step 9: Commit**

```bash
git add admin-web/package.json admin-web/package-lock.json admin-web/vitest.config.ts admin-web/src/lib/types.ts admin-web/src/components/print/
git commit -m "feat(admin-web): add warranty tier grouping util and vitest setup"
```

---

### Task 2: Template resolver

The heart of the feature: turning stored section text plus Job Order values into render blocks. Pure, no DOM, no React.

**Files:**
- Create: `admin-web/src/components/print/agreement-template.util.ts`
- Test: `admin-web/src/components/print/agreement-template.util.spec.ts`

**Interfaces:**
- Consumes: `groupByTier`, `itemLabel`, `derivePackageLabel`, `WarrantyItem` (Task 1).
- Produces:
  - `export const BLANK = '__________'`
  - `export const KNOWN_TOKENS: readonly string[]`
  - `export interface TemplateSection { heading: string; body: string }`
  - `export interface AgreementValues { date?: string | null; clientName?: string | null; clientAddress?: string | null; clientOwner?: string | null; companyName?: string | null; companyAddress?: string | null; items: WarrantyItem[] }`
  - `export interface Inline { text: string; bold: boolean }`
  - `export type Line = Inline[]` and `export type Row = Line[]`
  - `export type Block = { kind: 'paragraph'; lines: Line[] } | { kind: 'list'; items: string[] } | { kind: 'columns'; rows: Row[] }`
  - `export interface ResolvedSection { heading: string; blocks: Block[] }`
  - `export interface UnknownToken { sectionIndex: number; heading: string; token: string }`
  - `export interface ResolveResult { sections: ResolvedSection[]; unknown: UnknownToken[] }`
  - `export function resolveSections(sections: TemplateSection[], values: AgreementValues): ResolveResult`
  - `export function findUnknownTokens(sections: TemplateSection[]): UnknownToken[]`

- [ ] **Step 1: Write the failing tests**

Create `admin-web/src/components/print/agreement-template.util.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  BLANK,
  findUnknownTokens,
  resolveSections,
  type AgreementValues,
  type Block,
} from './agreement-template.util';
import type { WarrantyItem } from './warranty.util';

const item = (name: string, warrantyTier: WarrantyItem['warrantyTier'], quantity = 1): WarrantyItem => ({
  name,
  quantity,
  warrantyTier,
});

const values = (over: Partial<AgreementValues> = {}): AgreementValues => ({
  date: '2026-07-27T02:00:00.000Z',
  clientName: 'A & R SPORTS CLUB',
  clientAddress: 'Purok 11, Bislig City',
  clientOwner: 'Juan Dela Cruz',
  companyName: 'Beulah ITS',
  companyAddress: 'Tagum City',
  items: [item('System Unit', 'MAIN_SET'), item('Cash Drawer', 'ACCESSORY')],
  ...over,
});

const one = (body: string, over: Partial<AgreementValues> = {}): Block[] =>
  resolveSections([{ heading: 'H', body }], values(over)).sections[0].blocks;

const flat = (blocks: Block[]): string =>
  blocks
    .map((b) =>
      b.kind === 'paragraph'
        ? b.lines.map((l) => l.map((i) => i.text).join('')).join('\n')
        : b.kind === 'list'
          ? b.items.join(' / ')
          : b.rows.map((r) => r.map((c) => c.map((i) => i.text).join('')).join(' | ')).join('\n'),
    )
    .join('\n\n');

describe('scalar placeholders', () => {
  it('substitutes every known token', () => {
    const blocks = one('{{client_name}} of {{client_address}}, owner {{client_owner}}, by {{company_name}} of {{company_address}}');
    expect(flat(blocks)).toBe(
      'A & R SPORTS CLUB of Purok 11, Bislig City, owner Juan Dela Cruz, by Beulah ITS of Tagum City',
    );
  });

  it('formats the date with an ordinal day', () => {
    expect(flat(one('signed {{date}}'))).toBe('signed 27th of July 2026');
  });

  it('uses st, nd and rd suffixes', () => {
    expect(flat(one('{{date}}', { date: '2026-07-01T02:00:00.000Z' }))).toBe('1st of July 2026');
    expect(flat(one('{{date}}', { date: '2026-07-02T02:00:00.000Z' }))).toBe('2nd of July 2026');
    expect(flat(one('{{date}}', { date: '2026-07-23T02:00:00.000Z' }))).toBe('23rd of July 2026');
    expect(flat(one('{{date}}', { date: '2026-07-11T02:00:00.000Z' }))).toBe('11th of July 2026');
  });

  it('derives the package label from the items', () => {
    expect(flat(one('for {{package_label}}.'))).toBe('for ONE (1) POS Complete Set with accessories.');
  });

  it('renders the blank rule when a value is missing', () => {
    expect(flat(one('at {{client_address}}', { clientAddress: null }))).toBe(`at ${BLANK}`);
  });

  it('renders the blank rule when a value is only whitespace', () => {
    expect(flat(one('at {{client_address}}', { clientAddress: '   ' }))).toBe(`at ${BLANK}`);
  });
});

describe('bold tokens', () => {
  it('bolds the client name, company name and package label', () => {
    const [block] = one('{{client_name}} and {{company_name}} for {{package_label}}');
    if (block.kind !== 'paragraph') throw new Error('expected a paragraph');
    expect(block.lines[0].filter((i) => i.bold).map((i) => i.text)).toEqual([
      'A & R SPORTS CLUB',
      'Beulah ITS',
      'ONE (1) POS Complete Set with accessories',
    ]);
  });

  it('does not bold a blank rule', () => {
    const [block] = one('{{client_name}}', { clientName: null });
    if (block.kind !== 'paragraph') throw new Error('expected a paragraph');
    expect(block.lines[0]).toEqual([{ text: BLANK, bold: false }]);
  });

  it('leaves other tokens unbolded', () => {
    const [block] = one('{{client_owner}}');
    if (block.kind !== 'paragraph') throw new Error('expected a paragraph');
    expect(block.lines[0]).toEqual([{ text: 'Juan Dela Cruz', bold: false }]);
  });
});

describe('unknown tokens', () => {
  it('renders an unknown token verbatim', () => {
    expect(flat(one('hello {{cleint_name}}'))).toBe('hello {{cleint_name}}');
  });

  it('reports an unknown token with its section', () => {
    const result = resolveSections(
      [{ heading: 'A', body: 'ok' }, { heading: 'B', body: '{{nope}} and {{alsonope}}' }],
      values(),
    );
    expect(result.unknown).toEqual([
      { sectionIndex: 1, heading: 'B', token: '{{nope}}' },
      { sectionIndex: 1, heading: 'B', token: '{{alsonope}}' },
    ]);
  });

  it('findUnknownTokens reports the same without needing values', () => {
    expect(findUnknownTokens([{ heading: 'B', body: 'x {{nope}} y' }])).toEqual([
      { sectionIndex: 0, heading: 'B', token: '{{nope}}' },
    ]);
  });

  it('findUnknownTokens returns nothing for a clean template', () => {
    expect(findUnknownTokens([{ heading: 'B', body: '{{client_name}} {{date}}' }])).toEqual([]);
  });
});

describe('paragraphs and line breaks', () => {
  it('starts a new paragraph at a blank line', () => {
    const blocks = one('first\n\nsecond');
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.kind === 'paragraph')).toBe(true);
  });

  it('keeps single newlines as line breaks inside one paragraph', () => {
    const [block] = one('a) one\nb) two\nc) three');
    if (block.kind !== 'paragraph') throw new Error('expected a paragraph');
    expect(block.lines).toHaveLength(3);
  });

  it('ignores trailing and repeated blank lines', () => {
    expect(one('only\n\n\n\n')).toHaveLength(1);
  });
});

describe('item lists', () => {
  it('expands a list token alone on a line into a list block', () => {
    const blocks = one('{{main_set_items}}', {
      items: [item('System Unit', 'MAIN_SET'), item('Monitor', 'MAIN_SET', 2)],
    });
    expect(blocks).toEqual([{ kind: 'list', items: ['System Unit', 'Monitor (2)'] }]);
  });

  it('renders "No items listed." when the group is empty', () => {
    expect(flat(one('{{accessory_items}}', { items: [] }))).toBe('No items listed.');
  });

  it('renders a comma-separated run when used inline', () => {
    expect(flat(one('covering {{main_set_items}} only', {
      items: [item('System Unit', 'MAIN_SET'), item('Monitor', 'MAIN_SET')],
    }))).toBe('covering System Unit, Monitor only');
  });

  it('renders the blank rule for an empty group used inline', () => {
    expect(flat(one('covering {{main_set_items}} only', { items: [] }))).toBe(`covering ${BLANK} only`);
  });

  it('excludes NONE-tier items from the list', () => {
    const blocks = one('{{main_set_items}}', {
      items: [item('System Unit', 'MAIN_SET'), item('Thermal Paper', 'NONE')],
    });
    expect(blocks).toEqual([{ kind: 'list', items: ['System Unit'] }]);
  });
});

describe('two-column lines', () => {
  it('turns a piped line into a columns block', () => {
    const blocks = one('left | right');
    expect(blocks).toEqual([
      { kind: 'columns', rows: [[[{ text: 'left', bold: false }], [{ text: 'right', bold: false }]]] },
    ]);
  });

  it('groups consecutive piped lines into one block', () => {
    const [block] = one('a | b\nc | d');
    if (block.kind !== 'columns') throw new Error('expected columns');
    expect(block.rows).toHaveLength(2);
  });

  it('splits a piped line into more than two columns', () => {
    const [block] = one('a | b | c');
    if (block.kind !== 'columns') throw new Error('expected columns');
    expect(block.rows[0]).toHaveLength(3);
  });

  it('resolves placeholders inside a column', () => {
    expect(flat(one('Michel | {{client_owner}}'))).toBe('Michel | Juan Dela Cruz');
  });

  it('ends the columns block at a plain line', () => {
    const blocks = one('a | b\nplain');
    expect(blocks.map((b) => b.kind)).toEqual(['columns', 'paragraph']);
  });

  it('does not treat a bare pipe without spaces as a column split', () => {
    expect(flat(one('a|b'))).toBe('a|b');
  });
});

describe('resolveSections', () => {
  it('preserves the heading and the section order', () => {
    const result = resolveSections(
      [{ heading: 'I. FIRST', body: 'x' }, { heading: '', body: 'y' }],
      values(),
    );
    expect(result.sections.map((s) => s.heading)).toEqual(['I. FIRST', '']);
  });

  it('returns no blocks for an empty body', () => {
    expect(resolveSections([{ heading: 'H', body: '' }], values()).sections[0].blocks).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --prefix admin-web`
Expected: FAIL — `Failed to resolve import "./agreement-template.util"`.

- [ ] **Step 3: Write the implementation**

Create `admin-web/src/components/print/agreement-template.util.ts`:

```ts
import { derivePackageLabel, groupByTier, itemLabel, type WarrantyItem } from './warranty.util';

export interface TemplateSection {
  heading: string;
  body: string;
}

export interface AgreementValues {
  /** ISO timestamp of the job order; the current date when absent. */
  date?: string | null;
  clientName?: string | null;
  clientAddress?: string | null;
  clientOwner?: string | null;
  companyName?: string | null;
  companyAddress?: string | null;
  items: WarrantyItem[];
}

export interface Inline {
  text: string;
  bold: boolean;
}

export type Line = Inline[];
export type Row = Line[];

export type Block =
  | { kind: 'paragraph'; lines: Line[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'columns'; rows: Row[] };

export interface ResolvedSection {
  heading: string;
  blocks: Block[];
}

export interface UnknownToken {
  sectionIndex: number;
  heading: string;
  token: string;
}

export interface ResolveResult {
  sections: ResolvedSection[];
  unknown: UnknownToken[];
}

/** A value that could not be filled in, left as a rule to complete by hand. */
export const BLANK = '__________';

export const KNOWN_TOKENS: readonly string[] = [
  'date',
  'client_name',
  'client_address',
  'client_owner',
  'package_label',
  'main_set_items',
  'accessory_items',
  'company_name',
  'company_address',
];

const BOLD_TOKENS: readonly string[] = ['client_name', 'company_name', 'package_label'];

const TOKEN_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** A list token alone on its line expands to a block rather than inline text. */
const LIST_LINE_RE = /^\{\{\s*(main_set_items|accessory_items)\s*\}\}$/;

const COLUMN_SEP = ' | ';

function ordinalDate(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  const day = d.getDate();
  const tens = day % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : day % 10 === 1
        ? 'st'
        : day % 10 === 2
          ? 'nd'
          : day % 10 === 3
            ? 'rd'
            : 'th';
  const month = d.toLocaleDateString('en-PH', { month: 'long' });
  return `${day}${suffix} of ${month} ${d.getFullYear()}`;
}

function tokenValue(token: string, values: AgreementValues): string | null | undefined {
  switch (token) {
    case 'date':
      return ordinalDate(values.date);
    case 'client_name':
      return values.clientName;
    case 'client_address':
      return values.clientAddress;
    case 'client_owner':
      return values.clientOwner;
    case 'company_name':
      return values.companyName;
    case 'company_address':
      return values.companyAddress;
    case 'package_label':
      return derivePackageLabel(values.items);
    case 'main_set_items':
      return groupByTier(values.items).mainSet.map(itemLabel).join(', ');
    case 'accessory_items':
      return groupByTier(values.items).accessory.map(itemLabel).join(', ');
    default:
      return undefined;
  }
}

interface Ctx {
  sectionIndex: number;
  heading: string;
  values: AgreementValues;
  unknown: UnknownToken[];
}

function toLine(text: string, ctx: Ctx): Line {
  const out: Line = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > last) out.push({ text: text.slice(last, match.index), bold: false });

    const token = match[1];
    if (!KNOWN_TOKENS.includes(token)) {
      // Rendered verbatim so the typo is visible on screen instead of silently blank.
      ctx.unknown.push({ sectionIndex: ctx.sectionIndex, heading: ctx.heading, token: match[0] });
      out.push({ text: match[0], bold: false });
    } else {
      const raw = tokenValue(token, ctx.values);
      const filled = raw && raw.trim() ? raw : BLANK;
      out.push({ text: filled, bold: BOLD_TOKENS.includes(token) && filled !== BLANK });
    }

    last = match.index + match[0].length;
  }

  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out.length > 0 ? out : [{ text: '', bold: false }];
}

function parseBody(body: string, ctx: Ctx): Block[] {
  const blocks: Block[] = [];
  let paragraph: Line[] = [];
  let columns: Row[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', lines: paragraph });
      paragraph = [];
    }
  };
  const flushColumns = () => {
    if (columns.length > 0) {
      blocks.push({ kind: 'columns', rows: columns });
      columns = [];
    }
  };

  for (const raw of body.split('\n')) {
    const line = raw.trim();

    if (line === '') {
      flushParagraph();
      flushColumns();
      continue;
    }

    const listMatch = line.match(LIST_LINE_RE);
    if (listMatch) {
      flushParagraph();
      flushColumns();
      const groups = groupByTier(ctx.values.items);
      const group = listMatch[1] === 'main_set_items' ? groups.mainSet : groups.accessory;
      if (group.length === 0) {
        blocks.push({ kind: 'paragraph', lines: [[{ text: 'No items listed.', bold: false }]] });
      } else {
        blocks.push({ kind: 'list', items: group.map(itemLabel) });
      }
      continue;
    }

    if (line.includes(COLUMN_SEP)) {
      flushParagraph();
      columns.push(line.split(COLUMN_SEP).map((cell) => toLine(cell, ctx)));
      continue;
    }

    flushColumns();
    paragraph.push(toLine(line, ctx));
  }

  flushParagraph();
  flushColumns();
  return blocks;
}

export function resolveSections(sections: TemplateSection[], values: AgreementValues): ResolveResult {
  const unknown: UnknownToken[] = [];
  const resolved = sections.map((section, sectionIndex) => ({
    heading: section.heading,
    blocks: parseBody(section.body, { sectionIndex, heading: section.heading, values, unknown }),
  }));
  return { sections: resolved, unknown };
}

/** The Settings editor's check — the same scan without needing a job order. */
export function findUnknownTokens(sections: TemplateSection[]): UnknownToken[] {
  const unknown: UnknownToken[] = [];
  sections.forEach((section, sectionIndex) => {
    TOKEN_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TOKEN_RE.exec(section.body)) !== null) {
      if (!KNOWN_TOKENS.includes(match[1])) {
        unknown.push({ sectionIndex, heading: section.heading, token: match[0] });
      }
    }
  });
  return unknown;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --prefix admin-web`
Expected: PASS — 41 tests total: the 12 from Task 1 plus 29 new ones.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/components/print/agreement-template.util.ts admin-web/src/components/print/agreement-template.util.spec.ts
git commit -m "feat(admin-web): add agreement template placeholder resolver"
```

---

### Task 3: Prisma schema and structural migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260805000000_agreement_template/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma client types `WarrantyTier` (enum), `AgreementVersion`, `AgreementSection`, `JobOrderItem.warrantyTier`, `JobOrder.includeAgreement`, `JobOrder.agreementVersionId`, `JobOrder.agreementVersion`.

- [ ] **Step 1: Add the WarrantyTier enum**

In `prisma/schema.prisma`, directly above `model JobOrder {` (line 397), add:

```prisma
enum WarrantyTier {
  MAIN_SET
  ACCESSORY
  NONE
}
```

- [ ] **Step 2: Add the JobOrder fields**

In `model JobOrder`, after the `docType` line (line 411), add:

```prisma
  includeAgreement   Boolean @default(false) @map("include_agreement")
  /** Pinned on first print; null means the order still follows the latest version. */
  agreementVersionId String? @map("agreement_version_id")
```

In the same model, after the `payments Payment[]` line (line 420), add:

```prisma
  agreementVersion AgreementVersion? @relation(fields: [agreementVersionId], references: [id])
```

- [ ] **Step 3: Add the JobOrderItem field**

In `model JobOrderItem`, after the `inventoryItemId` line (line 433), add:

```prisma
  warrantyTier WarrantyTier @default(ACCESSORY) @map("warranty_tier")
```

- [ ] **Step 4: Add the two new models**

Directly after the closing brace of `model JobOrderItem` (line 441), add:

```prisma
/**
 * One immutable revision of the Service Level Agreement template. Never updated,
 * never deleted — a printed job order pins the version it was signed under.
 */
model AgreementVersion {
  id          String   @id @default(uuid())
  versionNo   Int      @unique @map("version_no")
  note        String?  @db.Text
  createdById String?  @map("created_by_id")
  createdAt   DateTime @default(now()) @map("created_at")

  sections  AgreementSection[]
  jobOrders JobOrder[]
  createdBy User?              @relation(fields: [createdById], references: [id])

  @@map("agreement_versions")
}

model AgreementSection {
  id        String @id @default(uuid())
  versionId String @map("version_id")
  heading   String @db.Text
  body      String @db.Text
  sortOrder Int    @map("sort_order")

  version AgreementVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)

  @@index([versionId])
  @@map("agreement_sections")
}
```

- [ ] **Step 5: Add the User back-relation**

Prisma requires both sides of a relation. In `model User`, immediately above `@@map("users")` (line 181), add:

```prisma
  agreementVersions  AgreementVersion[]
```

- [ ] **Step 6: Write the migration**

Create `prisma/migrations/20260805000000_agreement_template/migration.sql`:

```sql
-- CreateTable
CREATE TABLE `agreement_versions` (
    `id` VARCHAR(191) NOT NULL,
    `version_no` INTEGER NOT NULL,
    `note` TEXT NULL,
    `created_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `agreement_versions_version_no_key`(`version_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agreement_sections` (
    `id` VARCHAR(191) NOT NULL,
    `version_id` VARCHAR(191) NOT NULL,
    `heading` TEXT NOT NULL,
    `body` TEXT NOT NULL,
    `sort_order` INTEGER NOT NULL,

    INDEX `agreement_sections_version_id_idx`(`version_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `agreement_versions` ADD CONSTRAINT `agreement_versions_created_by_id_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agreement_sections` ADD CONSTRAINT `agreement_sections_version_id_fkey`
    FOREIGN KEY (`version_id`) REFERENCES `agreement_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE `job_order_items`
    ADD COLUMN `warranty_tier` ENUM('MAIN_SET', 'ACCESSORY', 'NONE') NOT NULL DEFAULT 'ACCESSORY';

-- AlterTable
ALTER TABLE `job_orders`
    ADD COLUMN `include_agreement` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `agreement_version_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `job_orders_agreement_version_id_idx` ON `job_orders`(`agreement_version_id`);

-- AddForeignKey
ALTER TABLE `job_orders` ADD CONSTRAINT `job_orders_agreement_version_id_fkey`
    FOREIGN KEY (`agreement_version_id`) REFERENCES `agreement_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 7: Validate the schema**

Run: `npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 8: Apply the migration and regenerate the client**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: migration `20260805000000_agreement_template` applied, then `Generated Prisma Client`.

- [ ] **Step 9: Confirm the schema matches the database**

Run: `npx prisma migrate status`
Expected: `Database schema is up to date!`

If it reports drift, do not run `migrate reset` — the database holds real records. Stop and report the drift.

- [ ] **Step 10: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260805000000_agreement_template/
git commit -m "feat(db): add agreement template versions and warranty tiers"
```

---

### Task 4: Seed version 1

A separate data migration so the schema change and the legal text can be reviewed apart. The text is verbatim from the source document, including its two internal contradictions — resolving those is the owner's call, made in the UI.

**Files:**
- Create: `prisma/migrations/20260805010000_agreement_seed/migration.sql`

**Interfaces:**
- Consumes: the tables from Task 3.
- Produces: `agreement_versions` row with `version_no = 1` and its ten `agreement_sections` rows.

- [ ] **Step 1: Write the seed migration**

Create `prisma/migrations/20260805010000_agreement_seed/migration.sql`. Note that MySQL string literals escape an apostrophe by doubling it (`CLIENT''s`).

```sql
-- Seed version 1 from the source Google Doc. `created_by_id` is NULL: no user made it.
SET @version_id = UUID();

INSERT INTO `agreement_versions` (`id`, `version_no`, `note`, `created_by_id`, `created_at`)
VALUES (@version_id, 1, 'Imported from the original Google Doc', NULL, NOW(3));

INSERT INTO `agreement_sections` (`id`, `version_id`, `heading`, `body`, `sort_order`) VALUES
(UUID(), @version_id, '', 'KNOW ALL MEN BY THESE PRESENTS:

This Service Agreement made and entered into this {{date}} at Tagum City, Philippines, by and between:

Beulah Information Technology Services and Business Solutions a duly organized and existing under the laws of the Philippines, with principal place of business located at Blk.1 Lot.1 Maximo Village, Tagum City, Davao Del Norte, Philippines represented herein by its Sales Manager, Mrs. Michel Jean L. Rodulfa, and hereinafter referred to as the SERVICE PROVIDER;

-And-

{{client_name}}, duly organized and existing under the laws of the Philippines, with its principal place of business located at {{client_address}} and hereinafter referred to as the CLIENT;

WITNESSETH THAT:

WHEREAS, the SERVICE PROVIDER is engaged in the business of providing Point of Sales Systems to all retail, wholesaler, pharmacy, restaurant or all possible clients that need sales monitoring and inventory in the Philippines;

WHEREAS, the CLIENT is engaged in the business of providing products and services within various areas in the Philippines;

WHEREAS, the CLIENT has offered, and the SERVICE PROVIDER has agreed to provide its Point of Sales System Services to CLIENT''s {{package_label}}.', 0),

(UUID(), @version_id, 'I. SCOPE OF SERVICE:', 'a) The SERVICE PROVIDER shall set up {{package_label}} with the following:

{{main_set_items}}

Warranty Coverage:

All included computer set accessories and components are covered by a 7-Day Replacement Warranty for factory defects and a 3-Month Limited Service Warranty under normal use conditions. Warranty does not cover physical damage, misuse, liquid damage, electrical surges, unauthorized repairs, or improper handling.

The following accessories are covered by 7 Days Replacement Warranty for defects and 1 Month Limited Warranty under normal use. Warranty does not cover misuse or damage caused by improper handling.

{{accessory_items}}

b) The SERVICE PROVIDER shall install the above-listed equipment to {{client_address}} of the CLIENT.', 1),

(UUID(), @version_id, 'II. CLIENTS REQUIREMENTS: Customer responsibilities and/ requirements;', 'a) Completion of POS training- dedicated assigned personnel that will complete the training.
b) Person In-charge - the one who will communicate with the provider for any support and assistance.
c) POS Station - a well secured area in which POS is safe from dust, water, secured and well ventilated. (Not advisable for the POS to frequently change the area or uninstall)
d) Payment for the Package, Installation and Training
e) Database with updated inventory (Initial) we will send excel format.
f) Person in charge for database integration, update and monitoring.
g) Hardware care and maintenance - our hardware has 1 month warranty so we require the client to strictly observe proper use.
h) Thermal papers, usb hub are not part of the package so we required every client to prepare upon deployment.', 2),

(UUID(), @version_id, 'III. CONFIDENTIAL INFORMATION', 'a) The provisions entered into by the parties in this Agreement shall be considered strictly confidential and shall not be divulged to any person or entity. Further, the parties herein shall not, either during the term of this agreement or at any time thereafter, use or disclose to any person, firm or corporation any information concerning the business or affairs of the other party which it may have acquired by reason of this agreement, for its own benefit or to the detriment of the Other party;

b) Any information acquired from the POS shall not be divulged to any person, natural or juridical, unless ordered by the court or other government agency having authority to do so;

c) In default settings, each client account provides the POS PROVIDER''s support personnel the ability to log in and perform limited actions on the account. As such, the CLIENT''s POS or any data installed therein may be exposed to the said individuals or any third party who may find access to the said information. In this regard, the CLIENT may disable this function or request the SERVICE PROVIDER to disable the said function to ensure confidentiality, with an understanding that in doing so, the support access on the said account may be limited to a certain extent;', 3),

(UUID(), @version_id, 'IV. TRANSFERABILITY AND ASSIGNABILITY:', 'This agreement or any right there to shall not be assigned or transferred without the express written consent of the parties herein;', 4),

(UUID(), @version_id, 'V. ENTIRE AGREEMENT AND AMENDMENT', 'This Service Agreement constitutes the full and complete understanding between the parties hereto with respect to the subject matter of this agreement, and there are no other promises, representations or warranties affecting it. Any provisions in this agreement may not be altered, changed and/or modified in any manner, orally or otherwise, except by an instrument in writing signed by a duly authorized officer or representative of each of the parties hereto;', 5),

(UUID(), @version_id, 'VI. SEPARABILITY:', 'Each provision in this agreement is separate and independent from the others, and is not to be construed and/or interpreted as having any restrictive or expansive effect upon the meaning, intention, interpretation or execution of any other provision of this agreement either implicitly or explicitly, unless it so specifically provides;', 6),

(UUID(), @version_id, 'VII. CONFORMITY:', 'The parties have read and understood all terms and conditions of this agreement and hereby express their conformity thereof.', 7),

(UUID(), @version_id, 'VIII. OFFICIAL CONTACT PERSONS FOR THE SERVICE PROVIDER', 'Sales Manager - Michel Jean L. Rodulfa - 09755886714 - atty.mjbl.cpa@gmail.com
Operation Manager - Ronald Allan P. Rodulfa - 09552436673', 8),

(UUID(), @version_id, '', '__________________ | __________________
Mrs. Michel Jean L. Rodulfa | {{client_owner}}
Beulah Information Technology Services and Business Solutions | {{client_name}}', 9);
```

The source document uses en dashes in Section II and em dashes in Section VIII. They are written here as plain hyphens so the file survives any encoding round-trip between Windows tooling and MySQL. Restoring the typography is a one-minute edit in the UI and produces version 2.

- [ ] **Step 2: Apply the migration**

Run: `npx prisma migrate deploy`
Expected: migration `20260805010000_agreement_seed` applied.

- [ ] **Step 3: Verify the seed landed intact**

`npx prisma db execute` runs a statement but **never prints `SELECT` output** — it reports success and discards the rows. Verification queries therefore go through `$queryRaw`. Create `tmp-verify-seed.js` in the repo root:

```js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const sections = await prisma.$queryRaw`
    SELECT s.sort_order, LEFT(s.heading, 45) AS heading, CHAR_LENGTH(s.body) AS body_len
    FROM agreement_sections s
    JOIN agreement_versions v ON v.id = s.version_id
    WHERE v.version_no = 1
    ORDER BY s.sort_order`;
  console.table(sections);

  const [{ with_client_name }] = await prisma.$queryRaw`
    SELECT COUNT(*) AS with_client_name
    FROM agreement_sections
    WHERE body LIKE '%{{client_name}}%'`;
  console.log('sections containing {{client_name}}:', Number(with_client_name));
}

main().finally(() => prisma.$disconnect());
```

Run: `node tmp-verify-seed.js`

Expected: ten rows, `sort_order` 0 through 9, headings `''`, `I. SCOPE OF SERVICE:`, … `VIII. OFFICIAL CONTACT PERSONS FOR THE SERVICE PROVIDER`, `''`. Every `body_len` is greater than zero.

- [ ] **Step 4: Verify the placeholders survived**

The same script prints the placeholder count on its last line.

Expected: `sections containing {{client_name}}: 2` — section 0 (the parties block) and section 9 (the signature block). A count of 0 means the braces did not survive the encoding round-trip; stop and report rather than patching the data by hand.

Then delete the scratch file: `rm tmp-verify-seed.js`

- [ ] **Step 5: Commit**

```bash
git add prisma/migrations/20260805010000_agreement_seed/
git commit -m "feat(db): seed agreement template version 1 from the source document"
```

---

### Task 5: Agreement template API

**Files:**
- Create: `src/save-agreement-template.dto.ts`
- Create: `src/agreement-template.service.ts`
- Create: `src/agreement-template.controller.ts`
- Create: `src/agreement-template.module.ts`
- Modify: `src/app.module.ts`
- Test: `src/agreement-template.service.spec.ts`

**Interfaces:**
- Consumes: the Prisma models from Task 3.
- Produces:
  - `AgreementSectionDto { heading: string; body: string }`
  - `SaveAgreementTemplateDto { sections: AgreementSectionDto[]; note?: string }`
  - `AgreementTemplateService.getLatest(): Promise<AgreementVersion | null>`
  - `AgreementTemplateService.listVersions()`, `.getVersion(id)`, `.save(dto, userId)`
  - `GET /agreement-template`, `GET /agreement-template/versions`, `GET /agreement-template/versions/:id`, `POST /agreement-template`

- [ ] **Step 1: Write the failing tests**

Create `src/agreement-template.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { AgreementTemplateService } from './agreement-template.service';

const v1 = {
  id: 'v1',
  versionNo: 1,
  sections: [
    { heading: 'I', body: 'one' },
    { heading: 'II', body: 'two' },
  ],
};

function buildPrisma(latest: typeof v1 | null) {
  const tx = {
    agreementVersion: {
      findFirst: jest.fn().mockResolvedValue(latest ? { versionNo: latest.versionNo } : null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'v-new', ...data })),
    },
  };
  const prisma = {
    agreementVersion: {
      findFirst: jest.fn().mockResolvedValue(latest),
      findUnique: jest.fn().mockResolvedValue(latest),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
  };
  return { prisma, tx };
}

describe('AgreementTemplateService.getLatest', () => {
  it('reads the highest version number with its sections in order', async () => {
    const { prisma } = buildPrisma(v1);
    const service = new AgreementTemplateService(prisma as never);

    await service.getLatest();

    expect(prisma.agreementVersion.findFirst).toHaveBeenCalledWith({
      orderBy: { versionNo: 'desc' },
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
    });
  });

  it('returns null rather than throwing when no version exists', async () => {
    const { prisma } = buildPrisma(null);
    const service = new AgreementTemplateService(prisma as never);

    await expect(service.getLatest()).resolves.toBeNull();
  });
});

describe('AgreementTemplateService.getVersion', () => {
  it('404s on an unknown id', async () => {
    const { prisma } = buildPrisma(null);
    prisma.agreementVersion.findUnique.mockResolvedValue(null);
    const service = new AgreementTemplateService(prisma as never);

    await expect(service.getVersion('nope')).rejects.toThrow(NotFoundException);
  });
});

describe('AgreementTemplateService.save', () => {
  it('creates the next version number', async () => {
    const { prisma, tx } = buildPrisma(v1);
    const service = new AgreementTemplateService(prisma as never);

    await service.save({ sections: [{ heading: 'I', body: 'changed' }] }, 'user-1');

    expect(tx.agreementVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ versionNo: 2, createdById: 'user-1', note: null }),
      }),
    );
  });

  it('starts at version 1 on an empty table', async () => {
    const { prisma, tx } = buildPrisma(null);
    const service = new AgreementTemplateService(prisma as never);

    await service.save({ sections: [{ heading: 'I', body: 'one' }] }, 'user-1');

    expect(tx.agreementVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ versionNo: 1 }) }),
    );
  });

  it('writes sortOrder from the submitted order', async () => {
    const { prisma, tx } = buildPrisma(v1);
    const service = new AgreementTemplateService(prisma as never);

    await service.save(
      { sections: [{ heading: 'II', body: 'two' }, { heading: 'I', body: 'one' }] },
      'user-1',
    );

    expect(tx.agreementVersion.create.mock.calls[0][0].data.sections.createMany.data).toEqual([
      { heading: 'II', body: 'two', sortOrder: 0 },
      { heading: 'I', body: 'one', sortOrder: 1 },
    ]);
  });

  it('returns the existing version without creating one when nothing changed', async () => {
    const { prisma, tx } = buildPrisma(v1);
    const service = new AgreementTemplateService(prisma as never);

    const result = await service.save(
      { sections: [{ heading: 'I', body: 'one' }, { heading: 'II', body: 'two' }] },
      'user-1',
    );

    expect(tx.agreementVersion.create).not.toHaveBeenCalled();
    expect(result).toBe(v1);
  });

  it('creates a version when only the order changed', async () => {
    const { prisma, tx } = buildPrisma(v1);
    const service = new AgreementTemplateService(prisma as never);

    await service.save(
      { sections: [{ heading: 'II', body: 'two' }, { heading: 'I', body: 'one' }] },
      'user-1',
    );

    expect(tx.agreementVersion.create).toHaveBeenCalled();
  });

  it('creates a version when a section was removed', async () => {
    const { prisma, tx } = buildPrisma(v1);
    const service = new AgreementTemplateService(prisma as never);

    await service.save({ sections: [{ heading: 'I', body: 'one' }] }, 'user-1');

    expect(tx.agreementVersion.create).toHaveBeenCalled();
  });

  it('stores the note when given', async () => {
    const { prisma, tx } = buildPrisma(v1);
    const service = new AgreementTemplateService(prisma as never);

    await service.save({ sections: [{ heading: 'I', body: 'x' }], note: 'warranty bump' }, 'user-1');

    expect(tx.agreementVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ note: 'warranty bump' }) }),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/agreement-template.service.spec.ts`
Expected: FAIL — `Cannot find module './agreement-template.service'`.

- [ ] **Step 3: Write the DTO**

Create `src/save-agreement-template.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

export class AgreementSectionDto {
  /** May be empty — the preamble and signature block carry no title. */
  @IsString()
  heading!: string;

  @IsString()
  body!: string;
}

export class SaveAgreementTemplateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AgreementSectionDto)
  sections!: AgreementSectionDto[];

  /** Free-text reason shown in the version history. */
  @IsOptional()
  @IsString()
  note?: string;
}
```

- [ ] **Step 4: Write the service**

Create `src/agreement-template.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AgreementSectionDto, SaveAgreementTemplateDto } from './save-agreement-template.dto';

const SECTIONS_INCLUDE = { sections: { orderBy: { sortOrder: 'asc' as const } } };

@Injectable()
export class AgreementTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  /** The current template. Null on a database seeded before this feature existed. */
  getLatest() {
    return this.prisma.agreementVersion.findFirst({
      orderBy: { versionNo: 'desc' },
      include: SECTIONS_INCLUDE,
    });
  }

  listVersions() {
    return this.prisma.agreementVersion.findMany({
      orderBy: { versionNo: 'desc' },
      include: {
        createdBy: { select: { fullName: true } },
        _count: { select: { jobOrders: true } },
      },
    });
  }

  async getVersion(id: string) {
    const version = await this.prisma.agreementVersion.findUnique({
      where: { id },
      include: SECTIONS_INCLUDE,
    });
    if (!version) throw new NotFoundException('Agreement version not found');
    return version;
  }

  async save(dto: SaveAgreementTemplateDto, userId: string) {
    const latest = await this.getLatest();
    // Opening the tab and pressing Save should not mint an identical version.
    if (latest && sameContent(latest.sections, dto.sections)) return latest;

    return this.prisma.$transaction(async (tx) => {
      const top = await tx.agreementVersion.findFirst({
        orderBy: { versionNo: 'desc' },
        select: { versionNo: true },
      });

      return tx.agreementVersion.create({
        data: {
          versionNo: (top?.versionNo ?? 0) + 1,
          note: dto.note ?? null,
          createdById: userId,
          sections: {
            createMany: {
              data: dto.sections.map((s, i) => ({ heading: s.heading, body: s.body, sortOrder: i })),
            },
          },
        },
        include: SECTIONS_INCLUDE,
      });
    });
  }
}

function sameContent(
  stored: { heading: string; body: string }[],
  submitted: AgreementSectionDto[],
): boolean {
  if (stored.length !== submitted.length) return false;
  return stored.every((s, i) => s.heading === submitted[i].heading && s.body === submitted[i].body);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/agreement-template.service.spec.ts`
Expected: PASS — 10 tests.

- [ ] **Step 6: Write the controller**

Create `src/agreement-template.controller.ts`, mirroring the read/write split in `src/company-profile.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from './authenticated-user.type';
import { CurrentUser } from './current-user.decorator';
import { Roles } from './roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { AgreementTemplateService } from './agreement-template.service';
import { SaveAgreementTemplateDto } from './save-agreement-template.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('agreement-template')
export class AgreementTemplateController {
  constructor(private readonly service: AgreementTemplateService) {}

  /** The current template — read by the Job Order print page. */
  @Get()
  getLatest() {
    return this.service.getLatest();
  }

  @Get('versions')
  listVersions() {
    return this.service.listVersions();
  }

  @Get('versions/:id')
  getVersion(@Param('id') id: string) {
    return this.service.getVersion(id);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post()
  save(@Body() dto: SaveAgreementTemplateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.save(dto, user.id);
  }
}
```

`versions` is declared before `versions/:id`, and neither collides with the bare `@Get()`.

- [ ] **Step 7: Write the module**

Create `src/agreement-template.module.ts`, following `src/item-categories.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AgreementTemplateService } from './agreement-template.service';
import { AgreementTemplateController } from './agreement-template.controller';
import { PrismaModule } from './prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AgreementTemplateService],
  controllers: [AgreementTemplateController],
  exports: [AgreementTemplateService],
})
export class AgreementTemplateModule {}
```

- [ ] **Step 8: Register the module**

In `src/app.module.ts`, add the import beside the other module imports (they are alphabetical — place it above `import { AppVersionModule }` or wherever `A` names sit):

```ts
import { AgreementTemplateModule } from './agreement-template.module';
```

and add `AgreementTemplateModule,` to the `imports` array, next to `ItemCategoriesModule`.

- [ ] **Step 9: Verify the app boots and the route answers**

Run: `npm run build`
Expected: PASS — `nest build` completes with no TypeScript errors.

Then start the backend (`npm run start:dev`), log in, and run:

```bash
curl -s -H "Authorization: Bearer <token>" http://localhost:3000/agreement-template | head -c 400
```

Expected: JSON with `"versionNo":1` and a `sections` array of ten entries.

- [ ] **Step 10: Commit**

```bash
git add src/save-agreement-template.dto.ts src/agreement-template.service.ts src/agreement-template.service.spec.ts src/agreement-template.controller.ts src/agreement-template.module.ts src/app.module.ts
git commit -m "feat(api): add agreement template versions endpoint"
```

---

### Task 6: Persist the job order agreement fields

**Files:**
- Modify: `src/upsert-job-order.dto.ts`
- Modify: `src/job-orders.service.ts`
- Modify: `src/job-orders.controller.ts`
- Test: `src/job-orders.service.spec.ts`

**Interfaces:**
- Consumes: Prisma `WarrantyTier` and `AgreementVersion` (Task 3).
- Produces:
  - `UpsertJobOrderDto.includeAgreement?: boolean`, `JobOrderItemDto.warrantyTier?: WarrantyTier`
  - `JobOrdersService.pinAgreement(id)` and `.unpinAgreement(id)`, both returning `{ agreementVersionId: string | null }`
  - `POST /job-orders/:id/pin-agreement`, `DELETE /job-orders/:id/pin-agreement`
  - Every job order read now carries `includeAgreement`, `agreementVersionId`, `agreementVersion` (with sections), and `items[].warrantyTier`

- [ ] **Step 1: Write the failing tests**

In `src/job-orders.service.spec.ts`, extend `buildTx` so the new calls have mocks. Replace the `jobOrder` block (lines 13-21) with:

```ts
    jobOrder: {
      findUnique: jest.fn(),
      update: jest.fn().mockImplementation(({ where, data }) =>
        Promise.resolve({ id: where.id, jobId: null, job: null, items: [], ...stripNested(data) }),
      ),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: 'jo-created', job: null, items: [], ...stripNested(data) }),
      ),
    },
    agreementVersion: { findFirst: jest.fn() },
```

Replace `buildService` (lines 34-42) with a version whose top-level `prisma` also carries the calls the pin methods make:

```ts
function buildService(tx: ReturnType<typeof buildTx>) {
  const prisma = {
    jobOrder: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    agreementVersion: { findFirst: jest.fn() },
    $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
  };
  const inventory = { applyJobOrderStock: jest.fn() };
  const service = new JobOrdersService(prisma as never, inventory as never);
  return { service, prisma, inventory };
}
```

Append these tests inside the existing `describe('JobOrdersService.upsert', …)` block, before its closing `});`:

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

    await service.upsert({ ...baseDto, items: [{ name: 'Cash Drawer', quantity: 1, unitPrice: 3000 }] }, user);

    const created = tx.jobOrder.create.mock.calls[0][0].data.items.createMany.data;
    expect(created[0].warrantyTier).toBe('ACCESSORY');
  });
```

Then append a new describe block at the end of the file:

```ts
describe('JobOrdersService.pinAgreement', () => {
  it('pins an unpinned order to the latest version', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', agreementVersionId: null });
    prisma.agreementVersion.findFirst.mockResolvedValue({ id: 'v3' });

    const result = await service.pinAgreement('jo-1');

    expect(prisma.jobOrder.update).toHaveBeenCalledWith({
      where: { id: 'jo-1' },
      data: { agreementVersionId: 'v3' },
    });
    expect(result).toEqual({ agreementVersionId: 'v3' });
  });

  it('leaves an already-pinned order alone', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', agreementVersionId: 'v1' });
    prisma.agreementVersion.findFirst.mockResolvedValue({ id: 'v3' });

    const result = await service.pinAgreement('jo-1');

    expect(prisma.jobOrder.update).not.toHaveBeenCalled();
    expect(result).toEqual({ agreementVersionId: 'v1' });
  });

  it('is a no-op when no template version exists', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', agreementVersionId: null });
    prisma.agreementVersion.findFirst.mockResolvedValue(null);

    const result = await service.pinAgreement('jo-1');

    expect(prisma.jobOrder.update).not.toHaveBeenCalled();
    expect(result).toEqual({ agreementVersionId: null });
  });

  it('404s on a missing order', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue(null);

    await expect(service.pinAgreement('nope')).rejects.toThrow(NotFoundException);
  });
});

describe('JobOrdersService.unpinAgreement', () => {
  it('clears the pin', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue({ id: 'jo-1', agreementVersionId: 'v1' });

    const result = await service.unpinAgreement('jo-1');

    expect(prisma.jobOrder.update).toHaveBeenCalledWith({
      where: { id: 'jo-1' },
      data: { agreementVersionId: null },
    });
    expect(result).toEqual({ agreementVersionId: null });
  });

  it('404s on a missing order', async () => {
    const tx = buildTx();
    const { service, prisma } = buildService(tx);
    prisma.jobOrder.findUnique.mockResolvedValue(null);

    await expect(service.unpinAgreement('nope')).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/job-orders.service.spec.ts`
Expected: FAIL — `service.pinAgreement is not a function`, and TypeScript rejects `includeAgreement` / `warrantyTier` as unknown DTO properties.

- [ ] **Step 3: Extend the DTOs**

In `src/upsert-job-order.dto.ts`, change the `class-validator` import (lines 2-13) to add `IsBoolean`:

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

and the Prisma import (line 14) to add `WarrantyTier`:

```ts
import { DiscountType, DocType, JobOrderStatus, JobOrderType, WarrantyTier } from '@prisma/client';
```

In `JobOrderItemDto`, after the `inventoryItemId` field (line 35), add:

```ts
  /** Which Section I warranty list this line appears under on the printed agreement. */
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

- [ ] **Step 4: Persist the fields and add the pin methods**

In `src/job-orders.service.ts`, extend `INCLUDE_FULL` (lines 9-14) so a single read carries the pinned text:

```ts
const INCLUDE_FULL = {
  client: true,
  product: true,
  job: { include: { installer: true } },
  items: { orderBy: { createdAt: 'asc' as const } },
  agreementVersion: { include: { sections: { orderBy: { sortOrder: 'asc' as const } } } },
};
```

In `upsert`, add to the `data` object after the `docType` line (line 45):

```ts
      includeAgreement: dto.includeAgreement ?? false,
```

and in `itemsCreate`, after the `inventoryItemId` line (line 54):

```ts
      warrantyTier: item.warrantyTier ?? 'ACCESSORY',
```

Then add both methods immediately before the closing brace of the class (after `convert`, line 151):

```ts
  /**
   * Locks the order to the current template so a reprint reproduces the signed
   * text. Idempotent — the print handler calls it on every print.
   */
  async pinAgreement(id: string) {
    const jobOrder = await this.prisma.jobOrder.findUnique({
      where: { id },
      select: { id: true, agreementVersionId: true },
    });
    if (!jobOrder) throw new NotFoundException(`Job order ${id} not found`);
    if (jobOrder.agreementVersionId) return { agreementVersionId: jobOrder.agreementVersionId };

    const latest = await this.prisma.agreementVersion.findFirst({
      orderBy: { versionNo: 'desc' },
      select: { id: true },
    });
    if (!latest) return { agreementVersionId: null };

    await this.prisma.jobOrder.update({
      where: { id },
      data: { agreementVersionId: latest.id },
    });
    return { agreementVersionId: latest.id };
  }

  /** Releases the lock so the order follows the latest template again. */
  async unpinAgreement(id: string) {
    const jobOrder = await this.prisma.jobOrder.findUnique({ where: { id }, select: { id: true } });
    if (!jobOrder) throw new NotFoundException(`Job order ${id} not found`);

    await this.prisma.jobOrder.update({ where: { id }, data: { agreementVersionId: null } });
    return { agreementVersionId: null };
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/job-orders.service.spec.ts`
Expected: PASS — the existing tests plus the ten new ones.

- [ ] **Step 6: Add the endpoints**

In `src/job-orders.controller.ts`, change the `@nestjs/common` import on line 1 to add `Delete`:

```ts
import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
```

and add both routes before the closing brace of the class (after `convert`, line 47):

```ts
  /** Locks the order's agreement text — called by the print and download handlers */
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF, UserRole.LIAISON, UserRole.SALES_STAFF)
  @Post(':id/pin-agreement')
  pinAgreement(@Param('id') id: string) {
    return this.jobOrdersService.pinAgreement(id);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Delete(':id/pin-agreement')
  unpinAgreement(@Param('id') id: string) {
    return this.jobOrdersService.unpinAgreement(id);
  }
```

- [ ] **Step 7: Run the whole backend suite for regressions**

Run: `npm test`
Expected: PASS — no previously-passing test breaks.

- [ ] **Step 8: Commit**

```bash
git add src/upsert-job-order.dto.ts src/job-orders.service.ts src/job-orders.service.spec.ts src/job-orders.controller.ts
git commit -m "feat(api): persist agreement flag, warranty tiers and version pin"
```

---

### Task 7: Extract the print subtree

Pure refactor. No behaviour changes — this exists to get `JobOrderPage.tsx` under control before adding to it.

**Files:**
- Create: `admin-web/src/components/print/print-styles.ts`
- Create: `admin-web/src/components/print/doc-types.ts`
- Create: `admin-web/src/components/print/PrintTemplate.tsx`
- Modify: `admin-web/src/pages/JobOrderPage.tsx`
- Modify: `admin-web/src/lib/types.ts`

**Interfaces:**
- Consumes: `WarrantyTier` (Task 1).
- Produces:
  - `print-styles.ts` — `export const PRINT_STYLE: string`
  - `doc-types.ts` — `export const DOC_TYPES` and `export const DOC_META: Record<DocumentType, { value: DocumentType; label: string; subtitle: string; filePrefix: string }>`
  - `PrintTemplate.tsx` — `export interface LineItem { _key: string; inventoryItemId?: string | null; name: string; description: string; quantity: number; unitPrice: number; warrantyTier: WarrantyTier }`
  - `PrintTemplate.tsx` — `export function PrintTemplate(props: PrintTemplateProps)`
  - `lib/types.ts` — `JobOrderItem.warrantyTier`, `JobOrder.includeAgreement`, `JobOrder.agreementVersionId`, `JobOrder.agreementVersion`, plus `AgreementSection`, `AgreementVersion`, `AgreementVersionSummary`

- [ ] **Step 1: Extend the frontend types**

In `admin-web/src/lib/types.ts`, add to `JobOrderItem` after `inventoryItemId` (line 165):

```ts
  warrantyTier: WarrantyTier;
```

Add to `JobOrder` after `docType` (line 187):

```ts
  includeAgreement: boolean;
  agreementVersionId: string | null;
  agreementVersion?: AgreementVersion | null;
```

Then add the agreement types immediately above `export interface CompanyProfile {` (line 230):

```ts
export interface AgreementSection {
  id: string;
  heading: string;
  body: string;
  sortOrder: number;
}

export interface AgreementVersion {
  id: string;
  versionNo: number;
  note: string | null;
  createdById: string | null;
  createdAt: string;
  sections: AgreementSection[];
}

/** The version-history row shape — no sections, but the usage count. */
export interface AgreementVersionSummary {
  id: string;
  versionNo: number;
  note: string | null;
  createdAt: string;
  createdBy: { fullName: string } | null;
  _count: { jobOrders: number };
}
```

- [ ] **Step 2: Move the print styles**

Create `admin-web/src/components/print/print-styles.ts` with the `PRINT_STYLE` literal currently at `JobOrderPage.tsx:270-299`, copied verbatim, exported, and with one rule added inside the `@media print` block just before its closing brace:

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

Then delete lines 268-299 from `JobOrderPage.tsx` (the comment banner and the constant) and add at the top of its import block:

```ts
import { PRINT_STYLE } from '../components/print/print-styles';
```

- [ ] **Step 3: Move the document types**

`DOC_TYPES` and `DOC_META` are needed by both `JobOrderPage.tsx` and the extracted template. Leaving them in the page would make `PrintTemplate.tsx` import from `pages/JobOrderPage`, which already imports `PrintTemplate` — a cycle.

Create `admin-web/src/components/print/doc-types.ts` with `JobOrderPage.tsx:1430-1439` moved over, the local `DocType` alias dropped in favour of the shared `DocumentType`, and both constants exported:

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

Copy the four literal rows from the current file rather than trusting the values above — if `subtitle` or `filePrefix` differ, the file wins.

In `JobOrderPage.tsx`, delete lines 1428-1439 (the `DocType` alias and both constants) and import instead. The page uses the local name `DocType` throughout, so alias it rather than renaming every use:

```ts
import { DOC_META, DOC_TYPES } from '../components/print/doc-types';
import type { DocumentType as DocType } from '../lib/types';
```

- [ ] **Step 4: Move the print template**

Create `admin-web/src/components/print/PrintTemplate.tsx`. Move `JobOrderPage.tsx:1441-1626` (the print-template section through the end of the file) verbatim, plus the `LineItem` interface from lines 235-242. Export both `LineItem` and `PrintTemplate`, add `warrantyTier` as the last field of `LineItem`, and add the imports the moved code needs:

```tsx
import type { Client, DocumentType, JobOrderStatus, SoftwareProduct, WarrantyTier } from '../../lib/types';
import { DOC_META } from './doc-types';
```

`LineItem` becomes:

```ts
export interface LineItem {
  _key: string; // local only
  inventoryItemId?: string | null; // links to InventoryItem (used for stock deduction)
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  warrantyTier: WarrantyTier;
}
```

Inside the moved code, the prop `docType: DocType` becomes `docType: DocumentType`.

In `JobOrderPage.tsx`, delete the moved `LineItem` interface and `PrintTemplate` function, then import:

```ts
import { PrintTemplate, type LineItem } from '../components/print/PrintTemplate';
```

- [ ] **Step 5: Give LineItem a tier everywhere it is constructed**

`LineItem` now requires `warrantyTier`. Add it at all four construction sites in `JobOrderPage.tsx`:

- `fromSaved` (line 247), inside the returned object: `warrantyTier: item.warrantyTier ?? 'ACCESSORY',`
- `addInventoryItem` (line 540), inside the pushed object: `warrantyTier: 'ACCESSORY',`
- `customForm` initial state (line 397): `useState({ name: '', description: '', quantity: 1, unitPrice: 0, warrantyTier: 'ACCESSORY' as WarrantyTier })`
- the `customForm` reset in `addCustom` (line 571): `setCustomForm({ name: '', description: '', quantity: 1, unitPrice: 0, warrantyTier: 'ACCESSORY' });`

Add `WarrantyTier` to the existing `import type { … } from '../lib/types'` list in `JobOrderPage.tsx`.

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

### Task 8: ServiceAgreement component

**Files:**
- Create: `admin-web/src/components/print/ServiceAgreement.tsx`

**Interfaces:**
- Consumes: `resolveSections`, `TemplateSection`, `AgreementValues`, `Block`, `Line` (Task 2).
- Produces: `export interface ServiceAgreementProps { sections: TemplateSection[]; values: AgreementValues }` and `export function ServiceAgreement(props: ServiceAgreementProps)`.

- [ ] **Step 1: Write the component**

Create `admin-web/src/components/print/ServiceAgreement.tsx`:

```tsx
import {
  resolveSections,
  type AgreementValues,
  type Block,
  type Line,
  type TemplateSection,
} from './agreement-template.util';

export interface ServiceAgreementProps {
  sections: TemplateSection[];
  values: AgreementValues;
}

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];

const S = {
  page: { fontFamily: 'Arial, sans-serif', color: '#000', fontSize: '11pt', lineHeight: 1.5 },
  title: { fontSize: '14pt', fontWeight: 'bold' as const, textAlign: 'center' as const, marginBottom: '14pt' },
  heading: { fontWeight: 'bold' as const, fontSize: '11.5pt', marginTop: '12pt', marginBottom: '4pt' },
  para: { marginBottom: '8pt', textAlign: 'justify' as const },
  list: { margin: '4pt 0 8pt 18pt' },
  columns: { display: 'grid', gap: '24pt', marginTop: '8pt' },
};

function InlineRun({ line }: { line: Line }) {
  return (
    <>
      {line.map((piece, i) =>
        piece.bold ? <strong key={i}>{piece.text}</strong> : <span key={i}>{piece.text}</span>,
      )}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.kind === 'paragraph') {
    return (
      <p style={S.para}>
        {block.lines.map((line, i) => (
          <span key={i}>
            {i > 0 && <br />}
            <InlineRun line={line} />
          </span>
        ))}
      </p>
    );
  }

  if (block.kind === 'list') {
    return (
      <div style={S.list}>
        {block.items.map((text, i) => (
          <div key={i}>
            {ROMAN[i] ?? i + 1}. {text}
          </div>
        ))}
      </div>
    );
  }

  // Column count comes from the widest row, so a short row simply leaves a gap.
  const columnCount = Math.max(...block.rows.map((r) => r.length));
  return (
    <div style={{ ...S.columns, gridTemplateColumns: `repeat(${columnCount}, 1fr)` }}>
      {block.rows.map((row, r) =>
        Array.from({ length: columnCount }, (_, c) => (
          <div key={`${r}-${c}`}>{row[c] ? <InlineRun line={row[c]} /> : null}</div>
        )),
      )}
    </div>
  );
}

/**
 * The Service Level Agreement pages appended to a printed job order.
 * Purely presentational — every decision lives in resolveSections.
 */
export function ServiceAgreement({ sections, values }: ServiceAgreementProps) {
  const resolved = resolveSections(sections, values);

  return (
    <div className="agreement-page" style={S.page}>
      <div style={S.title}>SERVICE LEVEL AGREEMENT</div>
      {resolved.sections.map((section, i) => (
        <div key={i}>
          {section.heading && <div style={S.heading}>{section.heading}</div>}
          {section.blocks.map((block, b) => (
            <BlockView key={b} block={block} />
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build --prefix admin-web`
Expected: PASS. The component is not yet rendered anywhere, so nothing changes on screen.

- [ ] **Step 3: Commit**

```bash
git add admin-web/src/components/print/ServiceAgreement.tsx
git commit -m "feat(admin-web): render resolved agreement sections for print"
```

---

### Task 9: Job Order controls and print wiring

**Files:**
- Modify: `admin-web/src/pages/JobOrderPage.tsx`

**Interfaces:**
- Consumes: `LineItem` (Task 7), `ServiceAgreement` (Task 8), `AgreementVersion` (Task 7), the `POST /job-orders` and pin endpoints (Task 6), `GET /agreement-template` (Task 5).
- Produces: nothing downstream.

- [ ] **Step 1: Add the state and the template query**

In `JobOrderPage.tsx`, after the `showCustomForm` state (line 398), add:

```ts
  const [includeAgreement, setIncludeAgreement] = useState(false);
```

Beside the other queries, near `companyProfileQuery` (line 360), add:

```ts
  const agreementTemplateQuery = useQuery({
    queryKey: ['agreement-template'],
    queryFn: async () => (await api.get<AgreementVersion | null>('/agreement-template')).data,
  });
```

Add `AgreementVersion` to the existing `import type { … } from '../lib/types'` list.

- [ ] **Step 2: Hydrate the checkbox from the saved order**

In the populate effect, after the `setDocType` line (line 424), add:

```ts
    setIncludeAgreement(jo.includeAgreement ?? false);
```

- [ ] **Step 3: Send both new fields on save**

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

- [ ] **Step 4: Pin the version on print and download**

Add this helper immediately above `handlePrint` (line 601):

```ts
  /**
   * Locks the agreement text to the current template the first time it reaches
   * paper. A failure here must not stop the print — the pin retries next time.
   */
  const pinAgreement = async (id: string | undefined) => {
    if (!includeAgreement || !id) return;
    try {
      await api.post(`/job-orders/${id}/pin-agreement`);
      queryClient.invalidateQueries({ queryKey: ['job-order', jobId ?? standaloneId] });
    } catch {
      // Ignored on purpose — see the doc comment.
    }
  };
```

Change `handlePrint` (lines 601-606) to:

```ts
  const handlePrint = async () => {
    if (!canSave) return;
    // Save first so the print reflects the latest state
    const saved = await upsert.mutateAsync({ status: jo?.status ?? 'DRAFT' });
    await pinAgreement(saved.id);
    window.print();
  };
```

In `handleDownload`, replace the save block (lines 622-624) with:

```ts
    if (canSave) {
      const saved = await upsert.mutateAsync({ status: jo?.status ?? 'DRAFT' });
      await pinAgreement(saved.id);
    }
```

- [ ] **Step 5: Teach html2pdf about page breaks**

In `handleDownload`, add `pagebreak` to the html2pdf options (lines 630-636). Without it the library ignores the CSS break and slices the agreement mid-clause:

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

- [ ] **Step 6: Render the agreement**

In the print block, immediately after the closing `/>` of `<PrintTemplate … />` (line 718), add:

```tsx
        {includeAgreement && agreementSections.length > 0 && (
          <ServiceAgreement
            sections={agreementSections}
            values={{
              date: jo?.createdAt,
              clientName: client?.businessName,
              clientAddress: client?.address,
              clientOwner: client?.ownerName,
              companyName: companyProfileQuery.data?.businessName,
              companyAddress: companyProfileQuery.data?.address,
              items: items.map((i) => ({
                name: i.name,
                quantity: i.quantity,
                warrantyTier: i.warrantyTier,
              })),
            }}
          />
        )}
```

Define `agreementSections` just above the `return` of the component, next to the other derived values (near line 590):

```ts
  // A printed order reproduces the version it was pinned to; an unprinted one
  // follows the current template.
  const agreementSections =
    jo?.agreementVersion?.sections ?? agreementTemplateQuery.data?.sections ?? [];
```

Add the import:

```ts
import { ServiceAgreement } from '../components/print/ServiceAgreement';
```

- [ ] **Step 7: Add the warranty column to the items table**

In the items table header (lines 971-978), insert a new `<th>` between Description and Qty:

```tsx
                      <th style={{ width: 130 }}>Warranty</th>
```

In the row body, insert a matching `<td>` immediately after the description cell (which closes on line 996):

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

The table gains one column. Check every `colSpan` inside this table's `<tfoot>` or totals rows and increase each by one so the columns still line up.

- [ ] **Step 8: Add the toggle and the pin badge**

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
                <span style={{ color: 'var(--danger)' }}>— no materials, warranty lists will be empty</span>
              )}
            </label>
```

Immediately after the closing `</div>` of the button row (line 794), add the pin badge:

```tsx
        {jo?.agreementVersion && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>
              Agreement locked to v{jo.agreementVersion.versionNo} ·{' '}
              {new Date(jo.agreementVersion.createdAt).toLocaleDateString()}
            </span>
            {role === 'SUPER_ADMIN' && (
              <button
                type="button"
                onClick={() => unpin.mutate()}
                disabled={unpin.isPending}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}
              >
                {unpin.isPending ? 'Unlocking…' : 'Unlock'}
              </button>
            )}
          </div>
        )}
```

and define the mutation beside the other mutations (after `upsert`, line 484):

```ts
  const unpin = useMutation({
    mutationFn: async () => api.delete(`/job-orders/${jo?.id}/pin-agreement`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['job-order', jobId ?? standaloneId] }),
  });
```

`role` is already read in this component — it is used by the payments section at line 1139.

- [ ] **Step 9: Verify the build**

Run: `npm run build --prefix admin-web`
Expected: PASS.

- [ ] **Step 10: Verify the round trip and the print**

Start the app and open a job order with at least one Main set item and one Accessory item.

1. Set the tiers, tick Include Service Agreement, Save Draft, reload — both selects and the checkbox come back with the saved values.
2. Toggle off, Print — the output is the job order alone, unchanged from Task 7.
3. Toggle on, Print — the agreement starts on a fresh page; the two lists show the right items; the parties block names the client in bold; no clause splits mid-sentence.
4. After that print, the `Agreement locked to v1` badge appears. Print again — the same text.
5. Toggle on, Download PDF — same page breaks, and the company logo still renders on page one.
6. Open a job order whose client has no address — the agreement shows `__________` there and does not crash.

- [ ] **Step 11: Commit**

```bash
git add admin-web/src/pages/JobOrderPage.tsx
git commit -m "feat(admin-web): print the service agreement and pin its version"
```

---

### Task 10: Settings → Agreement tab

**Files:**
- Create: `admin-web/src/pages/AgreementTemplatePage.tsx`
- Modify: `admin-web/src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: `findUnknownTokens`, `KNOWN_TOKENS` (Task 2); `AgreementVersion` (Task 7); `GET /agreement-template` and `POST /agreement-template` (Task 5).
- Produces: `export function AgreementTemplatePage()`. Task 11 adds the history panel to this same file.

- [ ] **Step 1: Write the page**

Create `admin-web/src/pages/AgreementTemplatePage.tsx`:

```tsx
import { type FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { AgreementVersion } from '../lib/types';
import { KNOWN_TOKENS, findUnknownTokens } from '../components/print/agreement-template.util';

type SectionRow = { heading: string; body: string };

const TOKEN_HELP: Record<string, string> = {
  date: 'Job order date, e.g. 27th of July 2026',
  client_name: 'Client business name (bold)',
  client_address: 'Client address',
  client_owner: 'Client owner name',
  package_label: 'e.g. ONE (1) POS Complete Set with accessories (bold)',
  main_set_items: 'Main-set items — a numbered list when alone on a line',
  accessory_items: 'Accessory items — a numbered list when alone on a line',
  company_name: 'Your business name from Company Profile (bold)',
  company_address: 'Your address from Company Profile',
};

export function AgreementTemplatePage() {
  const qc = useQueryClient();
  const [sections, setSections] = useState<SectionRow[] | null>(null);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState('');

  const templateQuery = useQuery({
    queryKey: ['agreement-template'],
    queryFn: async () => (await api.get<AgreementVersion | null>('/agreement-template')).data,
  });

  useEffect(() => {
    if (!templateQuery.data || sections) return;
    setSections(templateQuery.data.sections.map((s) => ({ heading: s.heading, body: s.body })));
  }, [templateQuery.data, sections]);

  const save = useMutation({
    mutationFn: async () =>
      (await api.post<AgreementVersion>('/agreement-template', { sections, note: note || undefined })).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['agreement-template'] });
      qc.invalidateQueries({ queryKey: ['agreement-versions'] });
      setSections(data.sections.map((s) => ({ heading: s.heading, body: s.body })));
      setNote('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  if (templateQuery.isLoading || !sections) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading template…</p>;
  }

  const unknown = findUnknownTokens(sections);

  const update = (index: number, patch: Partial<SectionRow>) =>
    setSections(sections.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next);
  };

  const remove = (index: number) => setSections(sections.filter((_, i) => i !== index));
  const add = () => setSections([...sections, { heading: '', body: '' }]);

  const copyToken = async (token: string) => {
    await navigator.clipboard.writeText(`{{${token}}}`);
    setCopied(token);
    setTimeout(() => setCopied(''), 1500);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <form onSubmit={onSubmit}>
      <p style={{ color: 'var(--text-muted)', marginTop: 0, fontSize: '0.85rem' }}>
        Printed when “Include Service Agreement” is ticked on a Job Order. Saving creates a new
        version; job orders already printed keep the version they were signed under.
      </p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <strong style={{ fontSize: '0.85rem' }}>Placeholders</strong>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
          {KNOWN_TOKENS.map((token) => (
            <button
              key={token}
              type="button"
              onClick={() => copyToken(token)}
              title={TOKEN_HELP[token]}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '0.2rem 0.5rem',
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                color: copied === token ? 'var(--success)' : 'var(--accent)',
                cursor: 'pointer',
              }}
            >
              {copied === token ? 'copied!' : `{{${token}}}`}
            </button>
          ))}
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0.6rem 0 0' }}>
          A blank line starts a paragraph. A list token alone on its line becomes a numbered list.
          A line containing “ | ” becomes columns — use it for the signature block.
        </p>
      </div>

      {sections.map((section, i) => (
        <div className="card" key={i} style={{ marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <input
              value={section.heading}
              placeholder="Heading — leave empty for the preamble or signature block"
              style={{ flex: 1, fontWeight: 600 }}
              onChange={(e) => update(i, { heading: e.target.value })}
            />
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }} onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }} onClick={() => move(i, 1)} disabled={i === sections.length - 1} title="Move down">↓</button>
            <button type="button" onClick={() => remove(i)} title="Remove section" style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
          </div>
          <textarea
            value={section.body}
            rows={Math.min(20, Math.max(4, section.body.split('\n').length + 1))}
            style={{ width: '100%', fontFamily: 'inherit', fontSize: '0.85rem', lineHeight: 1.5 }}
            onChange={(e) => update(i, { body: e.target.value })}
          />
        </div>
      ))}

      <button type="button" className="btn btn-secondary" style={{ fontSize: '0.85rem' }} onClick={add}>
        + Add section
      </button>

      {unknown.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginTop: '1rem' }}>
          <strong style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>Unknown placeholders</strong>
          <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem', fontSize: '0.82rem' }}>
            {unknown.map((u, i) => (
              <li key={i}>
                <code>{u.token}</code> in “{u.heading || 'untitled section'}” — it will print exactly as
                written.
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1.25rem', flexWrap: 'wrap' }}>
        <input
          value={note}
          placeholder="What changed? (optional)"
          style={{ flex: 1, minWidth: 220 }}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save as new version'}
        </button>
        {saved && <span style={{ color: 'var(--success)', fontSize: '0.85rem' }}>Saved.</span>}
        {save.isError && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>Could not save.</span>}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Register the tab**

In `admin-web/src/pages/SettingsPage.tsx`, add the import beside the other page imports (lines 7-10):

```ts
import { AgreementTemplatePage } from './AgreementTemplatePage';
```

Change the tab union (line 12):

```ts
type SettingsTab = 'company' | 'agreement' | 'users' | 'kpis' | 'inventory' | 'database' | 'audit';
```

Add the entry to `TABS` (line 14-21), directly after `company`:

```ts
  { id: 'agreement', label: 'Agreement' },
```

Add the render line after `{tab === 'company' && <CompanyProfileTab />}` (line 738):

```tsx
      {tab === 'agreement' && <AgreementTemplatePage />}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build --prefix admin-web`
Expected: PASS.

- [ ] **Step 4: Verify the editor**

Start the app, sign in as a `SUPER_ADMIN`, and open Settings → Agreement.

1. Ten sections load, in order, the first with an empty heading.
2. Click a placeholder chip — it reads “copied!”, and pasting into a body inserts the token.
3. Type `{{cleint_name}}` into a body — the red Unknown placeholders card names it and the section.
4. Move a section up, then save. Reload — the new order persists.
5. Save again without changing anything — no new version appears. Confirm in the Version
   history panel added by Task 11, or before that lands, with a scratch query file
   containing `SELECT version_no, note FROM agreement_versions ORDER BY version_no;` run via
   `npx prisma db execute --file tmp-versions.sql --schema prisma/schema.prisma`.

Expected: exactly one row more than before step 4, not two.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/pages/AgreementTemplatePage.tsx admin-web/src/pages/SettingsPage.tsx
git commit -m "feat(admin-web): add editable service agreement template tab"
```

---

### Task 11: Version history

**Files:**
- Modify: `admin-web/src/pages/AgreementTemplatePage.tsx`

**Interfaces:**
- Consumes: `AgreementVersionSummary`, `AgreementVersion` (Task 7); `GET /agreement-template/versions` and `/versions/:id` (Task 5).
- Produces: nothing downstream.

- [ ] **Step 1: Add the viewing state and the two queries**

In `AgreementTemplatePage.tsx`, add below the existing `templateQuery`:

```ts
  /** Null means editing the current version; an id means viewing an old one read-only. */
  const [viewingId, setViewingId] = useState<string | null>(null);

  const versionsQuery = useQuery({
    queryKey: ['agreement-versions'],
    queryFn: async () => (await api.get<AgreementVersionSummary[]>('/agreement-template/versions')).data,
  });

  const viewingQuery = useQuery({
    queryKey: ['agreement-version', viewingId],
    queryFn: async () => (await api.get<AgreementVersion>(`/agreement-template/versions/${viewingId}`)).data,
    enabled: !!viewingId,
  });
```

Add `AgreementVersionSummary` to the type import.

- [ ] **Step 2: Show the viewed version instead of the editable one**

Immediately after the `unknown` line, add:

```ts
  const viewing = viewingId ? viewingQuery.data : null;
  const shown: SectionRow[] = viewing
    ? viewing.sections.map((s) => ({ heading: s.heading, body: s.body }))
    : sections;
  const readOnly = !!viewingId;
```

Then change the section list to render `shown` instead of `sections`, and disable editing while viewing. In the map, change `{sections.map((section, i) => (` to `{shown.map((section, i) => (`, add `disabled={readOnly}` to the heading `<input>` and the body `<textarea>`, and wrap the three row buttons so they disappear while viewing:

```tsx
            {!readOnly && (
              <>
                <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }} onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
                <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }} onClick={() => move(i, 1)} disabled={i === shown.length - 1} title="Move down">↓</button>
                <button type="button" onClick={() => remove(i)} title="Remove section" style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
              </>
            )}
```

Wrap the `+ Add section` button, the unknown-token card, and the whole save row in `{!readOnly && ( … )}` so an old version cannot be edited or saved over.

- [ ] **Step 3: Add the read-only banner and Restore**

Immediately above the section list, add:

```tsx
      {viewing && (
        <div
          className="card"
          style={{ borderColor: 'var(--accent)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}
        >
          <span style={{ fontSize: '0.85rem' }}>
            Viewing <strong>v{viewing.versionNo}</strong> from{' '}
            {new Date(viewing.createdAt).toLocaleDateString()} — read only.
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem' }}
            onClick={() => {
              // Restore is an ordinary edit: it loads the old text into the
              // editor, and saving mints the next version from it.
              setSections(viewing.sections.map((s) => ({ heading: s.heading, body: s.body })));
              setNote(`Restored from v${viewing.versionNo}`);
              setViewingId(null);
            }}
          >
            Restore into the editor
          </button>
          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => setViewingId(null)}>
            Back to current
          </button>
        </div>
      )}
```

- [ ] **Step 4: Add the history panel**

At the very bottom of the returned form, after the save row, add:

```tsx
      <h3 style={{ marginTop: '2rem', marginBottom: '0.5rem', fontSize: '1rem' }}>Version history</h3>
      <table style={{ fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th style={{ width: 70 }}>Version</th>
            <th style={{ width: 120 }}>Date</th>
            <th style={{ width: 160 }}>By</th>
            <th>Note</th>
            <th style={{ width: 90, textAlign: 'right' }}>Job orders</th>
            <th style={{ width: 70 }}></th>
          </tr>
        </thead>
        <tbody>
          {(versionsQuery.data ?? []).map((v, i) => (
            <tr key={v.id}>
              <td>
                v{v.versionNo}
                {i === 0 && <span style={{ color: 'var(--success)', fontSize: '0.75rem' }}> current</span>}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>{new Date(v.createdAt).toLocaleDateString()}</td>
              <td>{v.createdBy?.fullName ?? 'System'}</td>
              <td style={{ color: 'var(--text-muted)' }}>{v.note ?? '—'}</td>
              <td style={{ textAlign: 'right' }}>{v._count.jobOrders}</td>
              <td>
                {i === 0 ? null : (
                  <button
                    type="button"
                    onClick={() => setViewingId(v.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}
                  >
                    View
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
```

- [ ] **Step 5: Verify the build**

Run: `npm run build --prefix admin-web`
Expected: PASS.

- [ ] **Step 6: Verify the history end to end**

In Settings → Agreement:

1. The history table lists v1 as `current`, authored by `System`, with a job-order count.
2. Edit a section, add the note `warranty bump`, save. The table now shows v2 as current and v1 with a View button.
3. Click View on v1 — the banner appears, every field is disabled, the Save row is gone, and the text is the original.
4. Click `Restore into the editor`, then Save — v3 appears with the note `Restored from v1`, and its text matches v1.
5. Open a job order that printed under v1 and print it again — the v1 text still appears, not v3.
6. Open a fresh job order, tick the agreement, print — the v3 text appears.

- [ ] **Step 7: Run both test suites**

Run: `npm test && npm test --prefix admin-web`
Expected: PASS for both.

- [ ] **Step 8: Commit**

```bash
git add admin-web/src/pages/AgreementTemplatePage.tsx
git commit -m "feat(admin-web): add agreement version history with view and restore"
```

---

## Open items for the owner

Recorded in the spec, needing a human decision before the first live print. Neither blocks implementation — both are edits in the new UI:

1. **Section II(g)** says "our hardware has 1 month warranty" while Section I says "3-Month Limited Service Warranty". Seeded verbatim.
2. **Section I** carries two different exclusion lists. Seeded verbatim.
3. **Typography.** The seed writes en and em dashes as plain hyphens to survive encoding round-trips. Restore them in the UI if the printed look matters.
