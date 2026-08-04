# Service Agreement Attachment on Job Order Print — Design

**Date:** 2026-08-04
**Status:** Approved (design), pending implementation plan

## Problem

When an admin prints or downloads a Job Order, only the JO document is produced. The
Service Level Agreement is maintained separately as a Google Doc that is manually
copied and edited per client — company details and client details are highlighted in
red and retyped by hand each time. This is slow and error-prone, and the printed JO
carries no record of which materials fall under which warranty.

## Goal

Printing or downloading a Job Order can, at the admin's choice, emit the Service Level
Agreement as additional pages in the same document, with all client/company/material
details filled in from data already in the system, and with materials grouped under the
warranty tier that covers them.

## Scope

- **In scope:** `admin-web` only.
- **Out of scope:** mobile. `mobile/app/admin/job-orders/[id].tsx` has no print or PDF
  path today, and this design does not add one.
- **Out of scope:** e-signature, emailing the agreement, agreement versioning/audit.

## Decisions

Four decisions were settled during brainstorming:

1. **Trigger — manual toggle.** A per-JO `includeAgreement` flag, persisted to the DB so
   a re-print or PDF download reproduces the same document. Not auto-derived from
   `docType` or from the presence of materials.
2. **Warranty — two tiers per item.** Each `JobOrderItem` carries a `warrantyTier`
   (`MAIN_SET` / `ACCESSORY` / `NONE`). The agreement groups items under their tier's
   warranty paragraph, so the client can see which item gets which coverage.
3. **Template — hybrid.** Clause bodies (II–VII) are hardcoded in the React component;
   the variable parts (signing location, warranty durations, exclusions list, contact
   persons) live in settings and are editable without a deploy.
4. **Contradiction — II(g) refers to Section I.** The source doc says "3-Month Limited
   Service Warranty" in Section I but "our hardware has 1 month warranty" in II(g).
   II(g) is reworded to reference Section I instead of naming a duration, so the settings
   values remain the single source of truth and cannot drift.

## Data model

`prisma/schema.prisma`:

```prisma
enum WarrantyTier {
  MAIN_SET
  ACCESSORY
  NONE
}

model JobOrderItem {
  // ...existing fields
  warrantyTier WarrantyTier @default(ACCESSORY) @map("warranty_tier")
}

model JobOrder {
  // ...existing fields
  includeAgreement Boolean @default(false) @map("include_agreement")
}

model CompanyProfile {
  // ...existing fields
  signingLocation String? @map("signing_location")

  mainSetReplacementDays   Int @default(7) @map("main_set_replacement_days")
  mainSetServiceMonths     Int @default(3) @map("main_set_service_months")
  accessoryReplacementDays Int @default(7) @map("accessory_replacement_days")
  accessoryServiceMonths   Int @default(1) @map("accessory_service_months")

  warrantyExclusions String? @map("warranty_exclusions") @db.Text // shared by both tiers

  contacts CompanyContact[]
}

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

  @@map("company_contacts")
}
```

### Rationale

**`CompanyContact` as a table, not two scalar fields.** Section VIII is a list (currently
two people, may grow). The `isSignatory` flag also supplies the parties-block phrase
"represented herein by its Sales Manager, Mrs. Michel Jean L. Rodulfa", so no separate
`repName`/`repTitle` fields are needed and the two can never disagree.

**Warranty terms as scalars, not a table.** Only two tiers exist, each carrying two
integers. A table would add a service, endpoints, and seed logic for no present benefit.
Promoting to a table later is mechanical if a third tier is ever needed.

**`ACCESSORY` as the item default.** Existing `job_order_items` rows need a backfill
value. `ACCESSORY` is the more common case. It is safe for existing data because
`includeAgreement` defaults to `false` — no pre-existing JO starts printing an agreement
as a result of this migration.

**One shared exclusions list.** The source doc carries two different exclusion lists —
Section I paragraph 1 excludes "physical damage, misuse, liquid damage, electrical surges,
unauthorized repairs, or improper handling" while paragraph 2 excludes only "misuse or
damage caused by improper handling". The narrower list is a subset of the wider one and
the difference reads as drafting drift rather than intent, so both tiers render the single
`warrantyExclusions` value. This is a deliberate deviation from the source, recorded
below. If the two lists must genuinely differ, this becomes two fields.

**Signatory ambiguity.** If zero contacts are flagged `isSignatory`, the parties block
renders a blank line. If more than one is flagged, the lowest `sortOrder` wins. The
Settings UI uses a radio group, so more than one is not reachable through the UI.

## Backend

| File | Change |
|---|---|
| `prisma/migrations/<ts>_service_agreement/migration.sql` | new enum, three model changes, new table |
| `src/update-company-profile.dto.ts` | `signingLocation`, four warranty ints, `warrantyExclusions`, `contacts[]` |
| `src/company-profile.service.ts` | replace-all write for `contacts` inside a transaction |
| `src/upsert-job-order.dto.ts` | `includeAgreement`, `warrantyTier` per item |
| `src/job-orders.service.ts` | persist both; include `warrantyTier` in the read shape |

Contacts are written replace-all (delete then create within one transaction) rather than
diffed by id. The list is small and always submitted whole by the Settings form.

## Frontend

### New files — `admin-web/src/components/print/`

| File | Purpose |
|---|---|
| `PrintTemplate.tsx` | moved verbatim from `JobOrderPage.tsx:1467` |
| `ServiceAgreement.tsx` | new — renders the SLA |
| `print-styles.ts` | `PRINT_STYLE` plus the page-break rule |
| `warranty.util.ts` | pure helpers: group items by tier, derive package label |

`JobOrderPage.tsx` is 1626 lines. Moving the print template and style constant out drops
it to roughly 1400 and puts the agreement logic where it can be unit-tested without a
DOM — matching the existing `*.util.spec.ts` pattern (`src/job-order-pricing.util.spec.ts`).

### Render structure

```jsx
<div id="job-order-print">
  <PrintTemplate ... />
  {includeAgreement && <ServiceAgreement ... />}
</div>
```

### Print paths

Both existing output paths need a change:

1. **`window.print()`** — add to `PRINT_STYLE`:
   `.agreement-page { page-break-before: always; break-before: page; }`
2. **PDF download** (`JobOrderPage.tsx:630`) — the html2pdf config has no `pagebreak`
   key, so appended pages are sliced at arbitrary offsets. Add
   `pagebreak: { mode: ['css', 'legacy'] }`.

The existing `CONFIDENTIAL` watermark (`#job-order-print::before`, `position: fixed`)
carries onto the agreement pages. This is intentional and consistent with Section III.
Its behaviour under html2canvas is unchanged by this work and is not being altered;
verify visually during implementation that it does not obscure clause text.

### JobOrderPage controls

- Checkbox **"Include Service Agreement"** near the Print / Download buttons, bound to
  `includeAgreement`. When checked and the JO has no material line items, show an inline
  hint that the warranty section will be empty.
- A `warrantyTier` select on each materials row (`MAIN SET` / `ACCESSORY` / `NONE`).

### Settings page

New "Service Agreement" section in `SettingsPage.tsx` (746 lines today):

- Signing location (text)
- Four warranty duration numbers, labelled by tier
- Warranty exclusions (textarea)
- Contacts editor: add/remove rows with name, title, phone, email; radio to pick the
  signatory; drag-free ordering via an explicit sort-order number

## Data flow

`ServiceAgreement` is a pure presentational component. Everything it renders is passed
in as props from `JobOrderPage`, which already holds all four sources:

| Agreement element | Source |
|---|---|
| Signing date | `jo.createdAt` |
| Signing location | `companyProfile.signingLocation` |
| Provider name, address | `companyProfile.businessName`, `.address` |
| Provider representative | `companyProfile.contacts` where `isSignatory` |
| Client name, address, owner | `client.businessName`, `.address`, `.ownerName` |
| Package label (WHEREAS + I-a) | derived from `MAIN_SET` item count |
| Item lists i–vi | `items` grouped by `warrantyTier` |
| Warranty durations | the four `companyProfile` ints |
| Exclusions | `companyProfile.warrantyExclusions` |
| Installation address (I-b) | `client.address` |
| Section VIII contacts | `companyProfile.contacts` ordered by `sortOrder` |
| Client signatory | `client.ownerName` over `client.businessName` |

### Package label derivation

`warranty.util.ts` exports `derivePackageLabel(items)`:

- Count items with tier `MAIN_SET`, summing `quantity`.
- Render as `"<WORD> (<n>) POS Complete Set"`, e.g. `"ONE (1) POS Complete Set"`, using a
  number-word lookup for 1–10 and falling back to the digits above 10.
- Append `" with accessories"` when at least one `ACCESSORY` item is present.
- With zero `MAIN_SET` items, render `"POS Package"` with no count.

`NONE`-tier items appear in neither warranty group and are excluded from the label.

## Error handling

- Any missing `CompanyProfile` field renders as `__________` — a blank rule that can be
  completed by hand — rather than an em dash. The same applies to a missing client
  address or owner name.
- With no contacts configured, Section VIII renders its heading and one blank rule.
- With `includeAgreement` true and no material items, the warranty section renders the
  tier headings with an explicit "No items listed." line rather than collapsing, so the
  omission is visible on paper instead of silent.
- A failed `companyProfile` query already leaves `PrintTemplate` rendering fallbacks;
  `ServiceAgreement` follows the same pattern and never throws.

## Testing

**Unit — `admin-web/src/components/print/warranty.util.spec.ts`:**
- grouping: items split correctly across the three tiers; `NONE` excluded from both groups
- `derivePackageLabel`: zero / one / many `MAIN_SET` items; quantity above one on a single
  row; with and without accessories; count above ten

**Unit — `src/job-orders.service.spec.ts`:**
- `includeAgreement` round-trips through upsert
- `warrantyTier` persists per item and defaults to `ACCESSORY` when omitted

**Unit — company profile service:**
- contacts replace-all removes rows absent from the payload
- warranty duration fields round-trip

**Manual:**
- Print preview with the toggle on: agreement starts on a fresh page, clauses are not
  split mid-sentence
- PDF download with the toggle on: same, and the logo still renders
- Toggle off: output is byte-identical in structure to today's JO print
- Settings empty: agreement prints with blank rules, no crash

## Appendix — source agreement text

Verbatim from the client's Google Doc (private link, sample instance: A & R SPORTS CLUB,
27 July 2026). Recorded here because the source is not accessible to the repo.

> KNOW ALL MEN BY THESE PRESENTS:
>
> This Service Agreement made and entered into this **27th of July 2026** at **Tagum
> City, Philippines**, by and between:
>
> **Beulah Information Technology Services and Business Solutions** a duly organized and
> existing under the laws of the Philippines, with principal place of business located at
> **Blk.1 Lot.1 Maximo Village, Tagum City, Davao Del Norte, Philippines** represented
> herein by its **Sales Manager, Mrs. Michel Jean L. Rodulfa**, and hereinafter referred
> to as the SERVICE PROVIDER;
>
> -And-
>
> **A & R SPORTS CLUB**, duly organized and existing under the laws of the Philippines,
> with its principal place of business located at **Purok 11, A. De Castro St., Baywalk,
> Brgy. Poblacion, Bislig City, 8311 Surigao Del Sur** and hereinafter referred to as the
> CLIENT;
>
> WITNESSETH THAT:
>
> WHEREAS, the SERVICE PROVIDER is engaged in the business of providing Point of Sales
> Systems to all retail, wholesaler, pharmacy, restaurant or all possible clients that
> need sales monitoring and inventory in the Philippines;
>
> WHEREAS, the CLIENT is engaged in the business of providing products and services
> within various areas in the Philippines;
>
> WHEREAS, the CLIENT has offered, and the SERVICE PROVIDER has agreed to provide its
> Point of Sales System Services to CLIENT's **ONE (1) POS Package with accessories**.
>
> **I. SCOPE OF SERVICE:**
>
> a) The SERVICE PROVIDER shall set up **One (1) POS Complete Set Accessories** with the
> following: i. System Unit / ii. Monitor / iii. Keyboard & Mouse / iv. Barcode Scanner /
> v. Cash Drawer / vi. Barcode Printer
>
> Warranty Coverage:
>
> All included computer set accessories and components are covered by a 7-Day Replacement
> Warranty for factory defects and a 3-Month Limited Service Warranty under normal use
> conditions. Warranty does not cover physical damage, misuse, liquid damage, electrical
> surges, unauthorized repairs, or improper handling.
>
> All included accessories are covered by 7 Days Replacement Warranty for defects and 1
> Month Limited Warranty under normal use. Warranty does not cover misuse or damage
> caused by improper handling.
>
> b) The SERVICE PROVIDER shall install the above-listed equipment to **Purok 11, A. De
> Castro St., Baywalk, Brgy. Poblacion, Bislig City, 8311 Surigao Del Sur** of the CLIENT.
>
> **II. CLIENTS REQUIREMENTS: Customer responsibilities and/ requirements;**
>
> a) Completion of POS training- dedicated assigned personnel that will complete the
> training.
> b) Person In-charge – the one who will communicate with the provider for any support
> and assistance.
> c) POS Station – a well secured area in which POS is safe from dust, water, secured and
> well ventilated. (Not advisable for the POS to frequently change the area or uninstall)
> d) Payment for the Package, Installation and Training
> e) Database with updated inventory (Initial) we will send excel format.
> f) Person in charge for database integration, update and monitoring.
> g) Hardware care and maintenance – our hardware has 1 month warranty so we require the
> client to strictly observe proper use.
> h) Thermal papers, usb hub are not part of the package so we required every client to
> prepare upon deployment.
>
> **III. CONFIDENTIAL INFORMATION**
>
> a) The provisions entered into by the parties in this Agreement shall be considered
> strictly confidential and shall not be divulged to any person or entity. Further, the
> parties herein shall not, either during the term of this agreement or at any time
> thereafter, use or disclose to any person, firm or corporation any information
> concerning the business or affairs of the other party which it may have acquired by
> reason of this agreement, for its own benefit or to the detriment of the Other party;
>
> b) Any information acquired from the POS shall not be divulged to any person, natural or
> juridical, unless ordered by the court or other government agency having authority to do
> so;
>
> c) In default settings, each client account provides the POS PROVIDER's support
> personnel the ability to log in and perform limited actions on the account. As such, the
> CLIENT's POS or any data installed therein may be exposed to the said individuals or any
> third party who may find access to the said information. In this regard, the CLIENT may
> disable this function or request the SERVICE PROVIDER to disable the said function to
> ensure confidentiality, with an understanding that in doing so, the support access on
> the said account may be limited to a certain extent;
>
> **IV. TRANSFERABILITY AND ASSIGNABILITY:**
>
> This agreement or any right there to shall not be assigned or transferred without the
> express written consent of the parties herein;
>
> **V. ENTIRE AGREEMENT AND AMENDMENT**
>
> This Service Agreement constitutes the full and complete understanding between the
> parties hereto with respect to the subject matter of this agreement, and there are no
> other promises, representations or warranties affecting it. Any provisions in this
> agreement may not be altered, changed and/or modified in any manner, orally or
> otherwise, except by an instrument in writing signed by a duly authorized officer or
> representative of each of the parties hereto;
>
> **VI. SEPARABILITY:**
>
> Each provision in this agreement is separate and independent from the others, and is not
> to be construed and/or interpreted as having any restrictive or expansive effect upon
> the meaning, intention, interpretation or execution of any other provision of this
> agreement either implicitly or explicitly, unless it so specifically provides;
>
> **VII. CONFORMITY:**
>
> The parties have read and understood all terms and conditions of this agreement and
> hereby express their conformity thereof.
>
> **VIII. OFFICIAL CONTACT PERSONS FOR THE SERVICE PROVIDER**
>
> Sales Manager — Michel Jean L. Rodulfa — 09755886714 — atty.mjbl.cpa@gmail.com
> Operation Manager — Ronald Allan P. Rodulfa — 09552436673

### Deviations from source

**1. Section II(g) wording.** Per decision 4 it becomes:

> g) Hardware care and maintenance – our hardware is covered by the warranty stated in
> Section I, so we require the client to strictly observe proper use.

**2. Section I exclusions unified.** Both Warranty Coverage paragraphs render the same
`warrantyExclusions` value, dropping the source's narrower second list. See the data model
rationale above.

**3. Section I durations.** Both paragraphs keep their wording but take their durations
from settings rather than literal text.

Deviations 1 and 2 change the legal text the client signs and should be confirmed by
whoever owns the agreement before the first live print.
