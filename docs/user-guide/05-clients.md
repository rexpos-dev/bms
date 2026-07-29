# 05 — Clients

Route: `/clients` · Roles: `SUPER_ADMIN`, `ADMIN_STAFF`, `SALES_STAFF`, `LIAISON`

A **Client** is the paying business. Everything commercial hangs off it:
licenses, installation jobs and job orders.

## Fields

| Field | Required | Rules |
|-------|:--------:|-------|
| Client code | ✓ | **Unique**. Format `CLT-XXXXXXXX` using an ambiguity-free alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no I, O, 0, 1). Generated client-side; regenerate with the ↺ button. |
| Business name | ✓ | Displayed everywhere the client is referenced |
| Owner name | ✓ | |
| Contact no. | ✓ | |
| Email | | Optional |
| Address | | Optional |
| Client type | ✓ | `SOFTWARE` (default) or `ADVERTISING` |
| Status | ✓ | `ACTIVE` (default), `EXPIRED`, `SUSPENDED`, `CANCELLED` |

**Expected:** a duplicate `clientCode` is rejected by the database unique index.

## The list

Columns: **Code · Business · Owner · Contact · Email · Type · Status · Edit/Delete**.

- Sorted by creation date, newest first.
- A search box filters the loaded rows client-side; no match shows **"No matches."**
- An empty dataset shows **"No clients yet."**
- A failed load shows **"Failed to load clients."**

The list can be filtered by type via `GET /api/clients?type=SOFTWARE|ADVERTISING`.

## Creating a client

Two entry points, same dialog:

1. Dashboard → **+ New Client**
2. Clients page → **New Client**

Also available inline while building a job order — see
[08 — Job Orders](08-job-orders-and-payments.md#step-1--client--project).

## Editing

Opens the same form pre-filled. On failure the dialog shows
**"Could not update the client. Try again."**

## Deleting

Roles: `SUPER_ADMIN`, `ADMIN_STAFF`.

⚠️ **Delete is a hard delete with no cascade guard.** A client that still has
licenses, jobs or job orders will fail on a foreign-key constraint and surface as
a 500-level error. Delete only clients with no downstream records.

**Expected (QA):** attempt to delete a client that owns a license — record the
exact error returned. This is a known rough edge, tracked in
[20 — Known Gaps](20-known-gaps-and-troubleshooting.md).

## Permissions

| Operation | Endpoint | Roles |
|-----------|----------|-------|
| Create | `POST /api/clients` | `SUPER_ADMIN`, `ADMIN_STAFF` |
| List | `GET /api/clients` | `SUPER_ADMIN`, `ADMIN_STAFF`, `LIAISON`, `SALES_STAFF`, `DESIGNER` |
| Get one | `GET /api/clients/:id` | same as list (includes `licenses` and `jobs`) |
| Update | `PATCH /api/clients/:id` | `SUPER_ADMIN`, `ADMIN_STAFF` |
| Delete | `DELETE /api/clients/:id` | `SUPER_ADMIN`, `ADMIN_STAFF` |

Note that `DESIGNER` can **read** clients (needed by the job-order view) but not
write them, and has no `/clients` sidebar link or route access — designers reach
client data only through a job order.

## Client status meaning

| Status | Meaning |
|--------|---------|
| `ACTIVE` | Live account, counts toward the *Active Clients* dashboard card |
| `EXPIRED` | Subscription lapsed |
| `SUSPENDED` | Temporarily disabled |
| `CANCELLED` | Terminated |

Client status is **informational** — it is not automatically driven by license
expiry, and it does not block creating jobs or job orders for that client.

**Expected:** setting a client to `CANCELLED` does not cancel their licenses,
jobs or job orders.

## Expected behaviour summary

| # | Assertion |
|---|-----------|
| 5.1 | Client code is unique; a duplicate is rejected |
| 5.2 | Generated codes never contain I, O, 0 or 1 |
| 5.3 | `LIAISON` and `SALES_STAFF` can open `/clients` but get **403** on create/update/delete |
| 5.4 | Search filters across code, business, owner, contact and email |
| 5.5 | `GET /api/clients/:id` returns the client with its `licenses[]` and `jobs[]` |
| 5.6 | Every create/update/delete writes an audit-log row (`Created Client` / `Updated Client` / `Deleted Client`) |
</content>
