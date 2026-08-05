# Editable Service Agreement Template — Design

**Date:** 2026-08-05
**Status:** Approved (design), pending implementation plan
**Supersedes:** [2026-08-04-service-agreement-attachment-design.md](2026-08-04-service-agreement-attachment-design.md)

## Problem

The Service Level Agreement lives in a Google Doc that is copied and hand-edited per
client. Company and client details are highlighted in red and retyped each time.

The earlier design (2026-08-04) moved the agreement into the Job Order print path but
hardcoded the clause bodies in a React component, exposing only a handful of variable
fields in Settings. Changing a clause — a new warranty duration, a reworded requirement —
would then need a developer and a deploy. The owner maintains this document, not a
developer.

## Goal

The whole agreement is editable in the admin UI. Printing a Job Order fills in the
per-client and per-order values from data already in the system. Editing the template
never changes what an already-printed Job Order reproduces.

## Scope

- **In scope:** `admin-web` and the NestJS backend.
- **Out of scope:** mobile. `mobile/app/admin/job-orders/[id].tsx` has no print or PDF
  path, and this design does not add one.
- **Out of scope:** e-signature, emailing the agreement, per-client template overrides,
  multiple named templates.

## Decisions

1. **Section-list editor, not rich text.** The template is an ordered list of
   `{ heading, body }` rows. No WYSIWYG library, no HTML storage, no sanitisation
   surface. Formatting comes from four render rules (below) that cover everything the
   source document actually uses.
2. **Company details are typed into the template.** No new `CompanyProfile` columns. The
   warranty durations, exclusions, contact persons, and signing location are literal text
   in the template — that is what makes them editable without a deploy. `{{company_name}}`
   and `{{company_address}}` are offered as placeholders because those two fields already
   exist in the Company Profile tab; using them is optional.
3. **Two warranty tiers per item.** `JobOrderItem.warrantyTier`
   (`MAIN_SET` / `ACCESSORY` / `NONE`) drives the two item lists in Section I, so the
   client can see which item carries which coverage.
4. **Full versioning, immutable versions.** Saving creates a new `AgreementVersion`.
   Versions are never updated and never deleted.
5. **Job Orders pin at first print.** A Job Order uses the latest version until it is
   printed or downloaded with the agreement on; then it pins to that version permanently.
   `SUPER_ADMIN` can unlock.
6. **Version 1 is seeded verbatim.** The migration inserts the current Google Doc text
   unchanged, including its two internal contradictions (see Known contradictions). They
   are the owner's to fix in the UI, not the migration's.

### Rejected alternatives

**Rich-text editor.** Closest to the Google Docs experience, but adds a ~150kB dependency,
an HTML-sanitisation surface, and print-CSS coupling to editor markup. The source document
uses bold, headings, and indented lists only — all reachable through render rules.

**Snapshot the resolved text onto the Job Order** instead of versioning. Cheaper (one Text
column, no version tables) and it also survives template edits. Rejected because it gives
no audit trail: you cannot see what the template said in January, only what one particular
Job Order printed.

**Keep structured settings fields** (warranty ints, exclusions textarea, contacts table)
alongside the template. Rejected as duplicate UI — two places to edit the same warranty
duration, and a placeholder indirection for values that are typed once and rarely change.

## Data model

`prisma/schema.prisma`:

```prisma
enum WarrantyTier {
  MAIN_SET
  ACCESSORY
  NONE
}

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

model JobOrderItem {
  // ...existing fields
  warrantyTier WarrantyTier @default(ACCESSORY) @map("warranty_tier")
}

model JobOrder {
  // ...existing fields
  includeAgreement   Boolean @default(false) @map("include_agreement")
  agreementVersionId String? @map("agreement_version_id")

  agreementVersion AgreementVersion? @relation(fields: [agreementVersionId], references: [id])
}
```

`CompanyProfile` is unchanged.

### Rationale

**Sections as rows, not one Text blob.** Reordering, adding, and deleting a clause are the
operations the owner actually performs. A blob would make those string surgery and would
lose the heading/body distinction the renderer needs for print styling.

**`versionNo` as a separate unique Int.** `createdAt` ordering is enough to find the
latest, but the owner refers to versions as "v3" in conversation and on the Job Order
badge. Computing `max(versionNo) + 1` inside the create transaction keeps it gapless.

**`agreementVersionId` nullable.** Null means "not yet printed, follows latest". This makes
the unlock operation a single `SET NULL` and needs no extra boolean.

**`ACCESSORY` as the item default.** Existing `job_order_items` rows need a backfill value
and it is the more common case. Safe for existing data because `includeAgreement` defaults
to `false`, so no pre-existing Job Order starts printing an agreement.

**Versions are never deleted.** A version referenced by a printed Job Order must stay
readable. Rather than a delete guard, the feature has no delete path at all.

**No new version when nothing changed.** Saving compares the submitted sections
(heading, body, order) against the latest version and returns it unchanged if they match.
Without this, opening the tab and clicking Save mints a version, and the history fills with
identical rows.

## Template language

### Placeholders

| Token | Source | Renders as |
|---|---|---|
| `{{date}}` | `jobOrder.createdAt` | `27th of July 2026` |
| `{{client_name}}` | `client.businessName` | bold |
| `{{client_address}}` | `client.address` | plain |
| `{{client_owner}}` | `client.ownerName` | plain |
| `{{package_label}}` | derived from items | bold |
| `{{main_set_items}}` | items with tier `MAIN_SET` | roman-numeral list |
| `{{accessory_items}}` | items with tier `ACCESSORY` | roman-numeral list |
| `{{company_name}}` | `companyProfile.businessName` | bold |
| `{{company_address}}` | `companyProfile.address` | plain |

`{{client_name}}`, `{{company_name}}`, and `{{package_label}}` render bold automatically.
These are exactly the spans bolded in the source document, so no bold control is needed.

### Render rules

Applied to each section `body`:

1. A blank line starts a new paragraph. A single newline is a line break — so `a)` `b)`
   `c)` lists render as typed.
2. `{{main_set_items}}` or `{{accessory_items}}` alone on a line expands to an indented
   list numbered `i.`, `ii.`, `iii.` …, with `(n)` appended when quantity exceeds one.
   Used inline (not alone on a line) the token renders as a comma-separated run.
3. A line containing ` | ` renders as a two-column row. This covers the signature block
   and any side-by-side content:
   ```
   __________________ | __________________
   Mrs. Michel Jean L. Rodulfa | {{client_owner}}
   Beulah Information Technology Services | {{client_name}}
   ```
   Consecutive two-column lines form one aligned grid.
4. `heading` renders bold and slightly larger; an empty `heading` renders nothing, which
   is how the preamble section carries text with no title.

### Missing values versus unknown tokens

These are deliberately different:

- **Known token, no data** (client has no address on file) renders `__________` — ten
  underscores, a rule to complete by hand. Never an em dash.
- **Unknown token** (`{{cleint_name}}`) renders verbatim, braces included, and the Settings
  editor shows a warning naming the section and the token. Rendering a blank would hide the
  typo until it reached paper.

Saving with an unknown token is allowed — the warning is not a block. The owner may be
mid-edit, and refusing the save would lose work.

### Package label derivation

`derivePackageLabel(items)`:

- Sum `quantity` across `MAIN_SET` items.
- Render `"<WORD> (<n>) POS Complete Set"`, e.g. `"ONE (1) POS Complete Set"`, with a
  number-word lookup for 1–10 and digits above 10.
- Append `" with accessories"` when at least one `ACCESSORY` item is present.
- With zero `MAIN_SET` items, render `"POS Package"` with no count.

`NONE`-tier items are excluded from both lists and from the label.

## Backend

| File | Change |
|---|---|
| `prisma/migrations/<ts>_agreement_template/migration.sql` | enum, two tables, three columns, seed of version 1 |
| `src/agreement-template.module.ts` | new |
| `src/agreement-template.controller.ts` | new |
| `src/agreement-template.service.ts` | new |
| `src/save-agreement-template.dto.ts` | new |
| `src/upsert-job-order.dto.ts` | `includeAgreement`, per-item `warrantyTier` |
| `src/job-orders.service.ts` | persist both; pin endpoint; include `warrantyTier` and `agreementVersionId` in the read shape |

### Endpoints

Guarded like `company-profile.controller.ts` — read requires authentication, write
requires `SUPER_ADMIN`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/agreement-template` | latest version with sections |
| `GET` | `/agreement-template/versions` | all versions, newest first, each with `jobOrderCount` |
| `GET` | `/agreement-template/versions/:id` | one version with sections |
| `POST` | `/agreement-template` | create a version from `{ sections[], note? }`; returns the latest unchanged when the content matches |
| `POST` | `/job-orders/:id/pin-agreement` | set `agreementVersionId` to the latest **only if null**; returns the pinned version |
| `DELETE` | `/job-orders/:id/pin-agreement` | `SUPER_ADMIN` unlock — sets it back to null |

Restore needs no endpoint: the client reads the old version and posts its sections as a
new one.

`POST /job-orders/:id/pin-agreement` is idempotent. The print handler calls it
unconditionally; a second print is a no-op that returns the existing pin.

## Frontend

### New files

| File | Purpose |
|---|---|
| `admin-web/src/pages/AgreementTemplatePage.tsx` | the Settings tab — editor plus history |
| `admin-web/src/components/print/agreement-template.util.ts` | placeholder resolution and body parsing — pure, no DOM |
| `admin-web/src/components/print/warranty.util.ts` | `groupByTier`, `derivePackageLabel` |
| `admin-web/src/components/print/ServiceAgreement.tsx` | renders parsed sections |
| `admin-web/src/components/print/PrintTemplate.tsx` | moved verbatim out of `JobOrderPage.tsx` |
| `admin-web/src/components/print/print-styles.ts` | `PRINT_STYLE` plus the page-break rule |
| `admin-web/src/components/print/doc-types.ts` | `DOC_TYPES` / `DOC_META`, shared to avoid an import cycle |

`JobOrderPage.tsx` is 1626 lines. Moving the print subtree out drops it to roughly 1400 and
puts the agreement logic where it is unit-testable without a DOM, matching the existing
`*.util.spec.ts` pattern.

The new tab is its own page component rendered by `SettingsPage.tsx`, following how that
file already hosts `UsersPage`, `KpiSettingsPage`, `InventoryPage`, and `AuditLogsPage`.
`SettingsPage.tsx` is 678 lines today and gains one tab entry and one line.

### Settings → Agreement tab

- A placeholder reference strip at the top; clicking a token copies it.
- One card per section: heading input, body textarea, up/down reorder, delete.
  Reorder is buttons, not drag — no dependency, and the list is under a dozen rows.
- `+ Add section` appends an empty row.
- Unknown-token warnings listed under the editor, each naming its section.
- `Save as new version` with an optional note field.
- Version history: version number, date, author, and how many Job Orders pinned it.
  `View` opens a version read-only; `Restore` copies it into a new version.
- A version dropdown at the top switches between editing the current version and viewing
  an older one. Viewing an old version disables the editor.

### Job Order page

- A `Warranty` select on each materials row: Main set / Accessory / Not covered.
- An `Include Service Agreement` checkbox beside Print / Download. When checked with no
  material line items, an inline hint says the warranty section will be empty.
- When pinned, a line reading `Agreement: v3 · locked 5 Aug` with an `Unlock` button for
  `SUPER_ADMIN`.

### Render structure

```jsx
<div id="job-order-print">
  <PrintTemplate ... />
  {includeAgreement && <ServiceAgreement sections={...} values={...} />}
</div>
```

`JobOrderPage` reads the pinned version when `agreementVersionId` is set and the latest
otherwise, so the preview always matches what will print.

### Print paths

1. **`window.print()`** — `PRINT_STYLE` gains
   `.agreement-page { page-break-before: always; break-before: page; }`.
2. **PDF download** (`JobOrderPage.tsx:630`) — the html2pdf config has no `pagebreak` key,
   so appended pages are sliced at arbitrary offsets. Add
   `pagebreak: { mode: ['css', 'legacy'] }`.

Both handlers call `POST /job-orders/:id/pin-agreement` before rendering when
`includeAgreement` is true.

The existing `CONFIDENTIAL` watermark (`#job-order-print::before`, `position: fixed`)
carries onto the agreement pages. This is intentional and consistent with Section III. Its
behaviour under html2canvas is unchanged by this work; verify visually that it does not
obscure clause text.

## Data flow

```
CompanyProfile ─┐
Client ─────────┤
JobOrder ───────┼─▶ values ─┐
JobOrderItem[] ─┘           ├─▶ resolveSections() ─▶ ServiceAgreement ─▶ print
AgreementVersion.sections ──┘        (pure)
```

`ServiceAgreement` is presentational. `resolveSections` is a pure function over
`(sections, values)`, which is where every test for this feature lands.

## Version 1 seed

The migration inserts version 1 with ten sections, taken verbatim from the appendix of
[2026-08-04-service-agreement-attachment-design.md](2026-08-04-service-agreement-attachment-design.md),
with the red-highlighted spans replaced by placeholders:

| # | heading | Notes |
|---|---|---|
| 0 | *(empty)* | `KNOW ALL MEN…` through the three `WHEREAS` clauses. Uses `{{date}}`, `{{client_name}}`, `{{client_address}}`, `{{package_label}}`; company name, address, and representative typed literally |
| 1 | `I. SCOPE OF SERVICE:` | Uses `{{package_label}}`, `{{main_set_items}}`, `{{accessory_items}}`, `{{client_address}}`; both warranty paragraphs and both exclusion lists typed literally |
| 2 | `II. CLIENTS REQUIREMENTS: Customer responsibilities and/ requirements;` | verbatim, a)–h) |
| 3 | `III. CONFIDENTIAL INFORMATION` | verbatim, a)–c) |
| 4 | `IV. TRANSFERABILITY AND ASSIGNABILITY:` | verbatim |
| 5 | `V. ENTIRE AGREEMENT AND AMENDMENT` | verbatim |
| 6 | `VI. SEPARABILITY:` | verbatim |
| 7 | `VII. CONFORMITY:` | verbatim |
| 8 | `VIII. OFFICIAL CONTACT PERSONS FOR THE SERVICE PROVIDER` | both contacts typed literally |
| 9 | *(empty)* | signature block, three two-column lines |

`createdById` is null on the seed row — no user created it.

The seed types the company name and address literally rather than using
`{{company_name}}` / `{{company_address}}`, so version 1 is a byte-faithful copy of the
source document. The placeholders remain available; switching to them is an ordinary edit
that produces version 2.

### Known contradictions, seeded as-is

The source document contradicts itself in two places. Per decision 6 both are seeded
verbatim and left for the owner to resolve in the UI:

1. **Section II(g)** says "our hardware has 1 month warranty" while Section I says
   "3-Month Limited Service Warranty".
2. **Section I** carries two different exclusion lists — paragraph 1 excludes "physical
   damage, misuse, liquid damage, electrical surges, unauthorized repairs, or improper
   handling"; paragraph 2 excludes only "misuse or damage caused by improper handling".

Both should be reviewed before the first live print. Neither blocks implementation.

## Error handling

- A missing client or company value renders `__________`.
- An unknown token renders verbatim and is flagged in Settings.
- With `includeAgreement` on and no material items, each item-list token renders
  `No items listed.` rather than collapsing, so the omission is visible on paper.
- A failed template query leaves the agreement unrendered and the Job Order printing as it
  does today; `ServiceAgreement` never throws.
- Pinning failure (network) does not block printing. The print proceeds; the pin is retried
  on the next print. A Job Order that prints without pinning is indistinguishable from one
  never printed, which is the safe direction — it follows the latest template until a pin
  succeeds.

## Testing

**Vitest — `admin-web` (new runner):**
- `agreement-template.util.spec.ts`: every placeholder resolves; missing value yields
  `__________`; unknown token survives verbatim and is reported; blank-line paragraphs;
  single-newline line breaks; item-list expansion alone on a line and inline; two-column
  lines grouped into one grid; empty heading renders no title
- `warranty.util.spec.ts`: grouping across the three tiers with `NONE` excluded;
  `derivePackageLabel` for zero / one / many main-set items, quantity above one, with and
  without accessories, count above ten

**Jest — backend:**
- `agreement-template.service.spec.ts`: creating a version increments `versionNo`;
  identical content returns the existing version without creating a row; sections persist
  in submitted order
- `job-orders.service.spec.ts`: `includeAgreement` round-trips; `warrantyTier` persists per
  item and defaults to `ACCESSORY`; pin sets `agreementVersionId` only when null; unlock
  clears it

**Manual:**
- Print with the toggle on: the agreement starts on a fresh page, no clause splits
  mid-sentence
- PDF download with the toggle on: same breaks, logo still renders
- Toggle off: output is structurally identical to today's Job Order print
- Edit the template after printing, then reprint: the original text reproduces
- Print a second Job Order after that edit: the new text appears
- Unlock, reprint: the new text appears on the first Job Order too
