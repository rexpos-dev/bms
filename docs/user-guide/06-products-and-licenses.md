# 06 — Software Products & Licenses

## Part A — Software Products

Route: `/products` · Roles: `SUPER_ADMIN`, `ADMIN_STAFF` (route) — but
**write operations are `SUPER_ADMIN` only**.

A product is a sellable software package + version.

| Field | Required | Rules |
|-------|:--------:|-------|
| Product name | ✓ | |
| Version | ✓ | Free text (e.g. `2.4.1`) |
| License type | ✓ | `SUBSCRIPTION_MONTHLY` · `SUBSCRIPTION_ANNUAL` · `LIFETIME` |
| Price | ✓ | Number ≥ 0, `Decimal(12,2)` |
| Maintenance fee | | Optional, number ≥ 0 |

| Operation | Endpoint | Roles |
|-----------|----------|-------|
| Create | `POST /api/software-products` | `SUPER_ADMIN` |
| List / get | `GET /api/software-products[/:id]` | any authenticated user |
| Update | `PATCH /api/software-products/:id` | `SUPER_ADMIN` |
| Delete | `DELETE /api/software-products/:id` | `SUPER_ADMIN` |

**Expected:** `ADMIN_STAFF` can open `/products` and see the list, but every
create/edit/delete returns **403**.

Empty state: **"No matches."** after filtering; **"Failed to load products."** on error.

---

## Part B — Licenses

Route: `/licenses` · Sidebar for `SUPER_ADMIN` and `DEVELOPER`.

The page has **two tabs**:

1. **Licenses** — real license records
2. **NENPOS Clients** — imported legacy records (see Part C)

### License record

| Field | Notes |
|-------|-------|
| License key | **Unique**. Either a provider-issued key you paste in, or an auto-generated trial key |
| Client | Required, must exist |
| Software product | Required, must exist |
| Status | `PENDING` → `ACTIVATED` → (`EXPIRED` \| `SUSPENDED`) |
| Is trial / Trial days | Trial length 1–365, **default 30** |
| Activation date / Expiration date | Set at activation |
| Activated by | The developer who activated it |
| Hardware fingerprint | `{ cpu, disk, mac }` captured at activation |
| License token | RS256 JWT signed with the RSA-4096 private key |

### Generating a license — `POST /api/licenses` (`SUPER_ADMIN`)

Two modes:

**Full license (`isTrial` false/omitted)**

- `licenseKey` is **required** → otherwise `400 License key is required for a non-trial license`
- Duplicate key → `409 A license with this key already exists`
- `expirationDate` optional
- Created with status `PENDING`

**Trial license (`isTrial: true`)**

- The server generates the key itself in the form **`TRIAL-XXXX-XXXX`** using the
  ambiguity-free alphabet (no I, O, 0, 1). Any `licenseKey` you send is ignored.
- `trialDays` defaults to **30**; validated to 1–365.
- `expirationDate` is stored as **null** — the trial window only starts at activation.
- Created with status `PENDING`.
- Key generation retries up to 5 times on a collision, then
  `500 Could not generate a unique trial license key`.

Missing client or product → `404 Client {id} not found` / `404 Software product {id} not found`.

### Activating a license — `PATCH /api/licenses/:id/activate` (`DEVELOPER` only)

The activation dialog collects the machine's hardware fingerprint:

| Field | Required |
|-------|:--------:|
| CPU identifier | ✓ |
| Disk serial | ✓ |
| MAC address | ✓ |

On activation the API:

1. Rejects an already-activated license → `409 License is already activated`.
2. Sets `activationDate = now`.
3. Computes `expirationDate`:
   - **Trial:** `now + trialDays × 24 h`
   - **Non-trial:** keeps whatever `expirationDate` was set at generation (may be null = perpetual)
4. Signs an **RS256 JWT** containing `licenseId`, `licenseKey`, `clientId`,
   `productId`, `fingerprint`; the JWT's `exp` matches the expiration date when
   one exists.
5. Stores status `ACTIVATED`, `activatedById`, the fingerprint and the token.

**Expected:**
- A `SUPER_ADMIN` calling activate gets **403** — only `DEVELOPER` may activate.
- Activating a 7-day trial sets `expirationDate` to exactly 7 days after
  activation, not after generation.
- The issued token verifies against `keys/license-public.pem`.

### Suspending — `PATCH /api/licenses/:id/suspend` (`SUPER_ADMIN`)

Sets status to `SUSPENDED`. The signed token is **not** revoked — suspension is a
record-keeping state.

### Editing — `PATCH /api/licenses/:id` (`SUPER_ADMIN`)

Designed for the **trial → full upgrade**: record the real provider key once the
client pays.

Rules:

| Rule | Result |
|------|--------|
| Setting `isTrial: true` on a license that is not `PENDING` | `400 An activated license cannot be changed back to a trial` |
| New `licenseKey` already used by another license | `409 A license with this key already exists` |
| Converting **trial → full** | `trialDays` and `expirationDate` are both cleared to `null` |
| Staying a trial | `trialDays` = supplied value, else existing, else 30 |
| Activation state and the signed token | **Left untouched** |

**Expected:** upgrading an *activated* trial to a full license keeps status
`ACTIVATED`, keeps `activationDate` and the original token, but clears the trial
expiry — the license becomes perpetual on the record.

### Automatic expiry

Nightly at **02:00**, every `ACTIVATED` license whose `expirationDate` is in the
past flips to `EXPIRED`. The count is logged.

**Expected:** the sweep never touches `PENDING` or `SUSPENDED` licenses, and never
touches licenses with a null `expirationDate`.

### The list

Columns include License Key, Client, Product, Status, Activated, Expires, and the
action buttons. Filters: a search box plus an **All statuses** dropdown
(`ACTIVE`/`EXPIRED`/`SUSPENDED`/`CANCELLED` labels appear in the client filter;
license statuses filter the license rows).

Empty/error states: **"No licenses match your search."** / **"Failed to load licenses."**

### Permissions

| Operation | Endpoint | Roles |
|-----------|----------|-------|
| Generate | `POST /api/licenses` | `SUPER_ADMIN` |
| List | `GET /api/licenses` | `SUPER_ADMIN`, `DEVELOPER` |
| Get one | `GET /api/licenses/:id` | `SUPER_ADMIN`, `DEVELOPER` |
| Activate | `PATCH /api/licenses/:id/activate` | `DEVELOPER` |
| Suspend | `PATCH /api/licenses/:id/suspend` | `SUPER_ADMIN` |
| Edit | `PATCH /api/licenses/:id` | `SUPER_ADMIN` |

> ⚠️ The admin-web route `/licenses` also admits `ADMIN_STAFF`, but
> `GET /api/licenses` does not. See
> [20 — Known Gaps](20-known-gaps-and-troubleshooting.md#permission-mismatches).

---

## Part C — NENPOS Clients (legacy import)

Second tab on the Licenses page. These are pre-system client records kept for
reference; they are **not** linked to clients, licenses or jobs.

| Column | Excel header |
|--------|--------------|
| Client ID | `Client ID` — auto-generated as `NPC-XXXXXXXX` when blank |
| Client Name | `Client Name` — **required** |
| Start Date | `Start Date` |
| Expiry Date | `Expiry Date` |
| License | `License` |
| Status | `Status` — defaults to `ACTIVE` |
| Installer | `Installer` |
| Notes | `Notes` |
| Address | `Address` |

Workflow:

1. **Download template** → `nenpos_clients_template.csv` with one example row
   (`NPC-ABC123`, `Juan dela Cruz Store`, …).
2. Fill it in and **Upload** the Excel/CSV file → `POST /api/nenpos-clients/upload`.
   Only the **first sheet** is read. Dates accept Excel serial numbers, `Date`
   values, or parseable date strings; unparseable values become `null`.
3. The response reports `{ imported: n }`.

Manual add/edit is also available via the **Add NENPOS Client** dialog.

| Operation | Endpoint | Roles |
|-----------|----------|-------|
| List / create / upload / update / delete one | `/api/nenpos-clients…` | `SUPER_ADMIN`, `ADMIN_STAFF` |
| Delete **all** | `DELETE /api/nenpos-clients` | `SUPER_ADMIN` |

Empty state: **"No NENPOS client records yet. Download the template, fill it in,
and upload your Excel file."**

**Expected:** a row with a blank Client Name is rejected
(`400 Client Name is required.`); a row with a blank Client ID gets an
auto-generated `NPC-` code.

---

## Expected behaviour summary

| # | Assertion |
|---|-----------|
| 6.1 | Trial keys always match `TRIAL-[A-Z2-9]{4}-[A-Z2-9]{4}` and never contain I, O, 0, 1 |
| 6.2 | A trial license has `expirationDate = null` until it is activated |
| 6.3 | Trial expiry = activation time + `trialDays` days |
| 6.4 | Only `DEVELOPER` can activate; re-activating returns 409 |
| 6.5 | Trial → full conversion clears `trialDays` and `expirationDate`, preserves `ACTIVATED` status and the token |
| 6.6 | Full → trial conversion is blocked unless the license is still `PENDING` |
| 6.7 | The 02:00 sweep expires only `ACTIVATED` licenses with a past expiry |
| 6.8 | Product create/update/delete is `SUPER_ADMIN` only, even though the page is reachable by `ADMIN_STAFF` |
| 6.9 | NENPOS import reads only the first worksheet and reports the imported count |
</content>
