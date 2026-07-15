# Finara Leads Tab — Design

**Date:** 2026-07-15
**Status:** Approved

## Goal

Add a second tab to the admin-web Download Leads page that shows inquiry leads
from the external Finara Accounting ERP system, fetched live through its
`/api/leads/export` API.

## Background

- The existing Download Leads page (`admin-web/src/pages/DownloadLeadsPage.tsx`)
  shows a single table of leads captured by our own landing page.
- Finara exposes `GET /api/leads/export` authenticated by an `X-API-Key` header.
  It returns a JSON array of all leads, newest first:

  ```json
  [
    { "id": 7, "name": "Rex Domingo", "company": "ABC Trading",
      "email": "rextechpos@gmail.com", "phone": "09357117604",
      "message": "Hi! I'm interested in the Professional plan.",
      "source": "pricing:professional", "status": "NEW",
      "createdAt": "2026-07-15T03:16:10.569Z" }
  ]
  ```

  Optional query params: `since=<ISO date>` and `status=NEW|CONTACTED|CLOSED`.
- Decision: **live proxy, no local storage** (same approach as the existing
  TMS KPI integration in `src/kpis.service.ts`). The `since` param is not used.

## Backend

New endpoint on the existing `DownloadLeadsController`:

- `GET /download-leads/finara`
- Guards: `JwtAuthGuard` + `RolesGuard`, roles `SUPER_ADMIN`, `ADMIN_STAFF`
  (same as the existing admin leads list).
- Delegates to a new `DownloadLeadsService.fetchFinaraLeads()` method that:
  - Builds the URL from `FINARA_API_URL` env var, defaulting to
    `https://finara.up.railway.app`, path `/api/leads/export`.
  - Sends header `X-API-Key: process.env.FINARA_API_KEY`. If the env var is
    missing, throws `BadRequestException('FINARA_API_KEY is not configured on the server.')`.
  - Error handling mirrors `fetchTmsDesignerPoints` in `kpis.service.ts`:
    - fetch rejection → `BadRequestException('Could not reach the Finara API.')`
    - 401 → `BadRequestException` naming the rejected key
    - non-OK → `BadRequestException` with the HTTP status
    - non-JSON content type → `BadRequestException` (invalid key may redirect to HTML)
  - Returns the parsed array as-is (empty array if the body is not an array).

The API key stays server-side only; it is never shipped to the browser.

## Frontend (admin-web)

`DownloadLeadsPage.tsx` becomes a two-tab page using the same `TabButton`
pattern as `LicensesPage.tsx`:

1. **Download Leads** — the existing table and pagination, unchanged.
2. **Finara Leads** — new tab:
   - `useQuery` on `GET /download-leads/finara` (fetch on first tab open;
     react-query caches for the session).
   - Client-side status filter dropdown: All / NEW / CONTACTED / CLOSED.
   - Table columns: Name, Company, Email, Phone, Message, Source, Status, Date.
   - Status rendered as a colored badge (NEW = accent/blue, CONTACTED = warning,
     CLOSED = muted).
   - Reuses the shared `Pagination` / `usePagination` component.
   - Loading / error / empty states matching the existing tab's style.

A `FinaraLead` type is added to `admin-web/src/lib/types.ts`.

## Configuration

| Env var | Required | Default |
|---|---|---|
| `FINARA_API_URL` | no | `https://finara.up.railway.app` |
| `FINARA_API_KEY` | yes (endpoint errors without it) | — |

Set in local `.env` and in the Railway service variables.

## Out of scope

- Storing/syncing Finara leads into our database.
- Incremental polling with `since`.
- Updating lead status back into Finara (read-only view).

## Testing

- Backend: unit test `fetchFinaraLeads` happy path + missing-key error
  (fetch mocked), following existing service spec patterns.
- Manual: open the page, switch tabs, verify Finara rows render, filter by
  status, and that a missing key shows a friendly error in the tab.
