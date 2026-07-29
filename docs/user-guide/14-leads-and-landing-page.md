# 14 — Leads & the Public Landing Page

## The landing page

Route: `/` **when signed out**. Signing in replaces it with the dashboard; there
is no separate marketing URL.

It is a full marketing page for METRIQA covering the operational story
(*Office books the installation job → Installer gets it instantly on mobile →
Photos, signature, GPS from the site → License goes live against the proof →
Pay posts automatically, withdraw anytime*), plus feature sections for the KPI
Engine, Dev Project Timer, Proof of Service and the field app.

There is also a public `/developers` page (no authentication required).

### Download / lead capture

The **Get METRIQA** call to action opens a form offering two platforms:

| Platform | Value stored |
|----------|--------------|
| Android APK | `ANDROID_APK` |
| Desktop App (installs as a PWA in any modern browser) | `DESKTOP_PWA` |

Form fields and their server-side validation:

| Field | Rules |
|-------|-------|
| Company / Business Name | 2–160 characters |
| Contact Person | 2–120 characters |
| Contact Number | 7–40 characters |
| Email | Valid email format; stored **trimmed and lower-cased** |
| Code | Optional, exactly **6** characters when present |
| Platform | Must be `ANDROID_APK` or `DESKTOP_PWA` |

### Email verification (OTP)

1. Visitor enters their email → `POST /api/download-leads/send-code`
   (rate limit **5 / 60 s** per IP).
2. A **6-digit** code is emailed via **Resend** and held **in memory** on the server.
   - Time to live: **10 minutes**
   - Resend cooldown: **60 seconds** → `400 Please wait a minute before requesting another code.`
   - Maximum **5** verification attempts per code
3. The response is `{ sent: true | false }`.

`sent: false` is returned — **not** an error — when:

- `RESEND_API_KEY` is not configured, or
- Resend rejected the send (e.g. the sandbox sender can only reach the account
  owner's address).

In that case the form proceeds **without** a code and the lead is stored with
`emailVerified = false`.

4. Submitting the form with a code → `POST /api/download-leads`
   (rate limit **10 / 60 s**). The code is verified and **consumed**; the lead is
   stored with `emailVerified = true`.

Verification failures:

| Situation | Message |
|-----------|---------|
| No pending code, or expired | `400 Verification code expired — request a new one.` |
| 5 attempts already used | `400 Too many attempts — request a new code.` (the code is discarded) |
| Wrong code | `400 Incorrect verification code.` (attempt counter increments) |

**Important for QA:** codes live in **process memory**. Restarting the API
invalidates all pending codes — visitors simply request a new one. Do not report
"code stopped working after a deploy" as a defect.

**Expected:** a successful submission returns `{ id }` and the file download
begins from `/downloads/...` with a forced attachment header.

---

## Download Leads (admin)

Route: `/download-leads` · Roles: `SUPER_ADMIN`, `ADMIN_STAFF`

Heading **Download Leads**, with two tabs:

### Tab 1 — Downloads

Locally stored landing-page leads, newest first.

Columns: **Company · Contact Person · Contact No · Email · Platform · Date**.
The Platform cell shows a phone icon + *Android APK*, or a monitor icon +
*Desktop PWA*.

Empty: **"No leads captured yet."** / **"No matches."**;
failure: **"Failed to load leads."**

Endpoint: `GET /api/download-leads`.

### Tab 2 — Finara

A **live proxy** to the Finara ERP leads export — nothing is stored locally, and
the tab only fetches when you open it.

Columns: **Name · Company · Email · Phone · Message · Source · Status · Date**.
Statuses: `NEW`, `CONTACTED`, `CLOSED`.

Endpoint: `GET /api/download-leads/finara` → `GET {FINARA_API_URL}/api/leads/export`
with an `X-API-Key` header.

Failure modes (all **400** with a readable reason):

| Situation | Message |
|-----------|---------|
| `FINARA_API_KEY` unset | `FINARA_API_KEY is not configured on the server.` |
| Network failure | `Could not reach the Finara API.` |
| HTTP 401 | `Finara API rejected the key (401 Unauthorized).` |
| Other non-2xx | `Finara API returned HTTP {status}.` |
| Non-JSON body | `Finara API did not return JSON — the API key may be invalid.` |

> **Known environment issue:** the Finara production deployment has been observed
> returning **404** for `/api/leads/export`. That surfaces here as
> `Finara API returned HTTP 404.` — an upstream problem, not a METRIQA defect.

---

## Permissions

| Endpoint | Auth |
|----------|------|
| `POST /api/download-leads/send-code` | **Public**, 5/min per IP |
| `POST /api/download-leads` | **Public**, 10/min per IP |
| `GET /api/download-leads` | `SUPER_ADMIN`, `ADMIN_STAFF` |
| `GET /api/download-leads/finara` | `SUPER_ADMIN`, `ADMIN_STAFF` |

**Expected:** the two public endpoints work with **no** Authorization header;
the two admin endpoints return 401 without one.

## Expected behaviour summary

| # | Assertion |
|---|-----------|
| 14.1 | Requesting a second code within 60 s returns the cooldown message |
| 14.2 | A code expires exactly 10 minutes after it was sent |
| 14.3 | The 6th wrong attempt discards the code with *Too many attempts* |
| 14.4 | With Resend unconfigured, `send-code` returns `{ sent: false }` and the lead can still be submitted, stored as `emailVerified: false` |
| 14.5 | A submitted code is single-use — reusing it returns *expired* |
| 14.6 | Emails are stored lower-cased and trimmed |
| 14.7 | The 6th `send-code` call inside a minute returns 429 |
| 14.8 | The Finara tab fetches only when opened and surfaces upstream failures as readable 400s |
| 14.9 | Landing page is shown only to signed-out visitors at `/` |
</content>
