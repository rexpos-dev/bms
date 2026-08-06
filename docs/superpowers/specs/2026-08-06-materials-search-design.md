# Materials/Package item search — design

## Problem

In the Job Order wizard's Step 2 ("Materials / Package"), the item search box
always renders every inventory item as a quick-add button below it, even when
the box is empty. This clutters the screen and the search bar itself is
plain, unstyled.

## Design

**Search bar.** Restyle the existing scan/search `<input>` to match the
app's established glass-input pattern (icon-in-input, rounded border, focus
glow — the same visual language already used on the login page's `.lg-input`
fields, scoped here under new `.item-search-*` classes so it doesn't touch
unrelated login styles). Add a magnifying-glass button inside the input on
the right. It's a `type="submit"` button on the existing form, so it
triggers the same `handleScan` the Enter key already does — no new behavior,
just a visible affordance.

**Quick-add buttons.** Remove the always-visible button grid entirely.
Replace `quickAddItems`'s current behavior (return all items when the query
is empty) with: return matches only when there's a non-empty query.

- Empty search box → nothing renders below the input.
- Typed query with matches → a dropdown list (`.item-search-results`) appears
  under the input. Each row shows the item name, description, and stock qty
  (styled red via the existing low-stock check). Clicking a row calls the
  existing `addInventoryItem(item)` and clears the search box, closing the
  dropdown. Rows use `onMouseDown={e => e.preventDefault()}` so the click
  registers before the input's blur would otherwise dismiss the list.
- Typed query with no matches → a small muted "No items match…" line.

Barcode scanning on Enter, the loading state, and the "no inventory items
yet" empty-state message are unchanged.

## Scope

- [admin-web/src/pages/JobOrderPage.tsx](../../../admin-web/src/pages/JobOrderPage.tsx) — Step 2 markup (~L982-1017) and the `quickAddItems` filter (~L572-575).
- [admin-web/src/index.css](../../../admin-web/src/index.css) — new `.item-search-*` CSS block.

No backend, schema, or route changes.
