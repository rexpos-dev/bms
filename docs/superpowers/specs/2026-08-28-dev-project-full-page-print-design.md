# Dev Project full-page view + Print/PDF — Design

## Problem

The "Software Development Projects" detail (status, progress, timeframe, session
history, reports/checklist) is only reachable as a modal (`DevProjectsPage.tsx`,
two `<Dialog>` instances: the admin read-only "View Progress" dialog and the
developer/owner interactive dialog). There is no way to see it as a full page or
print/export it as a report.

## Goals

- Add a full-page view of a dev project's progress/reports, reachable alongside
  (not instead of) the existing modals.
- Let admins and developers/owners print or download a PDF of that page.

## Non-goals

- No new computed analytics (no charts, averages, completion-rate summaries).
  The printed/full-page content mirrors what the modals already show.
- No change to the existing modals' behavior beyond adding one outbound link.
- No refactor to de-duplicate shared JSX between the two existing dialogs and
  the new page — see "Duplication trade-off" below.

## Design

### 1. Route and page

- Add `path="/dev-projects/:id"` in `App.tsx`, nested under `ProtectedShell`,
  guarded the same way as `/dev-projects`:
  `RequireAuth roles={['DEVELOPER', 'ADMIN_STAFF', 'SUPER_ADMIN']}`.
- New component `admin-web/src/pages/DevProjectDetailPage.tsx`. It reads `id`
  from `useParams`, and fetches with
  `useQuery({ queryKey: ['dev-projects', id], queryFn: ... })` — the same query
  key the two existing dialogs use (`detailQuery` / `viewProgressQuery` in
  `DevProjectsPage.tsx`), so cache is shared and a project already loaded in
  the list/dialog shows instantly on navigation.
- Page layout:
  - Header row: Back button (`navigate(-1)`, falling back to `/dev-projects`),
    project name as page title, `StatusBadge`, and two action buttons on the
    right: **Print** and **Download PDF**.
  - Below the header, the same two-column content the dialogs render today:
    - Left: status + progress card, developer/time-tracked/progress-basis
      card, project timeframe (with the edit affordance — see role handling
      below), description.
    - Right: session history list, reports list (each report's `ReportChecklist`,
      comment, feedback thread, and feedback form where applicable).
  - Reuses existing presentational pieces as-is: `StatusBadge`, `ProgressBar`,
    `TimeframeEditor`, `TargetHoursEditor`, `ReportChecklist`, `Linkify`.
  - Reuses the existing mutations by re-declaring them in the new page exactly
    as `DevProjectsPage.tsx` does today (`startProject`, `stopProject`,
    `updateProgress`, `updateTargetHours`, `updateTimeframe`, `addReport`,
    `updateChecklistItem`, `addFeedback`), each invalidating
    `['dev-projects']` / `['dev-active']` / the detail query key on success,
    matching the existing pattern.

### 2. Role handling (same rules as today, just on one page)

- `isAdminRole` (`SUPER_ADMIN` or `ADMIN_STAFF`): sees the date-based
  `TimeframeEditor` ("Edit Timeframe") and, if `SUPER_ADMIN` or the tagged
  admin on a report, the feedback form.
- Project owner (`project.developerId === user.id`): sees Start/Stop,
  `TargetHoursEditor`, manual progress % input (when no target hours are set),
  and the new-report form.
- Everyone: read-only session history and reports/checklist history.
  Checklist items remain toggleable by the report's author or a super admin
  (`canEditChecklist`), matching current dialog behavior.

### 3. Navigation into the full page

- In the admin "View Progress" dialog (`DevProjectsPage.tsx` ~line 389) and the
  developer/owner dialog (~line 603), add a small "Open full page ↗" link near
  the top of the dialog body that navigates to `/dev-projects/:id` and closes
  the dialog. No changes to the table's existing "View Progress"/"Open"
  buttons or to any other dialog behavior.

### 4. Print and PDF export

Follows the existing pattern from `JobOrderPage.tsx` /
`components/print/print-styles.ts` exactly:

- A dedicated printable block inside the page, wrapped in a container with a
  unique id (`#dev-project-print`), rendering a clean black-on-white version
  of the same content (status, progress, developer/time, timeframe,
  description, session history, reports with checklist rendered as static
  checked/unchecked text — no interactive inputs, no forms, no buttons).
- New file `admin-web/src/components/print/dev-project-print-styles.ts`
  exporting `DEV_PROJECT_PRINT_STYLE`, following the same structure as
  `print-styles.ts`: `body * { visibility: hidden }`, the print block made
  `visibility: visible` and absolutely positioned (not fixed — same reasoning
  as the existing comment about pagination), `@page { margin: 15mm }`. No
  confidential watermark (that's specific to job-order agreements).
- **Print** button calls `window.print()` directly (no save-before-print step
  needed — dev project data isn't a draft-and-save document).
- **Download PDF** button uses `html2pdf()` on `#dev-project-print` with the
  same options `JobOrderPage.handleDownload` uses (`jsPDF: a4, portrait`,
  `html2canvas: { scale: 2 }`), filename
  `dev-project-<slugified-name>-<id-prefix>.pdf`.

### Duplication trade-off

The new page's JSX/mutations are a third copy of logic that already exists
twice (once per existing dialog) in `DevProjectsPage.tsx`. This is intentional:
extracting a shared component now would require touching the two working,
already-in-production dialogs, which is out of scope and riskier than adding
a new, isolated page. The codebase already tolerates this style of duplication
(the two existing dialogs duplicate the session-history and reports blocks
between each other). If the triplication becomes a maintenance problem later,
a follow-up refactor can extract a shared `DevProjectDetail` presentational
component used by both dialogs and the page.

## Testing

- Manual: open `/dev-projects/:id` directly as admin and as the owning
  developer; confirm role-gated controls match the dialog behavior.
- Manual: Print and Download PDF produce a clean, readable, non-interactive
  report matching the on-page data.
- Manual: the "Open full page" links in both dialogs navigate correctly and
  close the dialog.
