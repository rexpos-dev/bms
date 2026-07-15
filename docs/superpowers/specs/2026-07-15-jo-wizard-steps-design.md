# JO Detail Page Wizard Steps — Design

**Date:** 2026-07-15
**Status:** Approved

## Goal

Restructure the Project Job Order detail page's left column into a 3-step
wizard — Step 1 Client & Project, Step 2 Materials / Package, Step 3
Payments — with the Order Summary column always visible on the right.

## Behavior

- **Step indicator strip** at the top of the left column: numbered circles
  (1 Client & Project, 2 Materials / Package, 3 Payments), clickable,
  current step highlighted. Step 3 is disabled (muted, not clickable) until
  the JO has been saved at least once, since payments attach to a saved order.
- **One step visible at a time.** Form state lives in the component (already
  does), so switching steps loses nothing.
- Step footers: Step 1 → [Next →]; Step 2 → [← Back] [Next →] (Next disabled
  when the JO is unsaved); Step 3 → [← Back].
- The `JobOrderPayments` panel moves from above the job banner into Step 3.
  When unsaved, Step 3 is unreachable; the Step 2 footer shows a muted hint
  "Save the job order to record payments."
- Unchanged: header buttons (Save Draft / Finalize / Print / Download), doc
  type badge + Change dialog, parent job banner, error line, and the right
  column (Order Summary, Installer Labor, meta card).

## Out of scope

- Any backend change; print template; validation changes.

## Testing

Frontend type-check + manual: navigate steps, record a payment in Step 3,
confirm unsaved JOs cannot reach Step 3, totals update while switching steps.
