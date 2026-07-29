# 16 — Mobile App (Beulah Field)

React Native / Expo Router app for field staff, talking to the **same** NestJS API
as the web portal. Distributed as an Android APK (`mobile/beulah-field-v1.0.0.apk`,
also downloadable from the landing page).

## Authentication

Screen: **Beulah Field** → *Sign in to your account* → **Sign In**.

- Same `POST /api/auth/login` as the web.
- Tokens are stored in **`expo-secure-store`** (`beulah_access`, `beulah_refresh`).
- A 401 triggers an automatic access-token refresh and a retry; if the refresh
  fails the app signs out.
- The auth gate at `/` redirects to `/login` when there is no session, or to the
  tabs when there is.

**Expected:** killing and reopening the app keeps you signed in until the refresh
token expires (7 days by default).

## Backend environment switcher

Profile → **Server** lets you switch between two backends and persists the choice
in secure store (`beulah_api_env`, `beulah_local_url`):

| Env | URL |
|-----|-----|
| **prod** (default) | `EXPO_PUBLIC_API_URL`, else `app.json → expo.extra.apiUrl` (currently the Tailscale Funnel URL), else `http://10.0.2.2:3001/api` |
| **local** | Editable at runtime; defaults to `http://192.168.1.246:3001/api` |

The selection is applied at boot and takes effect immediately when saved.

**Expected (QA):** switching to a local backend and back to prod requires no
reinstall; a wrong local URL produces network errors on that env only.

Emulator/device URL cheat-sheet:

| Target | URL |
|--------|-----|
| Android emulator | `http://10.0.2.2:<port>/api` |
| iOS simulator | `http://localhost:<port>/api` |
| Physical device | `http://<computer LAN IP>:<port>/api` |

## Tabs

Material top-tab bar. Which tabs appear depends on the role:

| Tab | Icon | Shown to |
|-----|------|----------|
| **Dashboard** | 📊 | everyone |
| **My Jobs** | 🧰 | non-admins (hidden for `SUPER_ADMIN` / `ADMIN_STAFF`) |
| **Earnings** | 💰 | non-admins |
| **Menu** | 🗂️ | admins only (`SUPER_ADMIN` / `ADMIN_STAFF`) |
| **Profile** | 👤 | everyone |

### Dashboard

Greeting: *Welcome, {first name} 👋* with the subtitle **System overview**
(admin) or **Your overview**.

| Admin cards | Field-staff cards |
|-------------|-------------------|
| Clients, Active Clients, Licenses, Active Licenses, Open Jobs, Pending Withdrawals | Available Balance, Open Jobs, Completed Jobs, Pending Withdrawals |

### My Jobs

Jobs assigned to the signed-in installer (`GET /api/jobs`, server-scoped),
pull-to-refresh, status badges. Tapping a row opens the job detail.

### Job detail — `/job/[id]`

Actions:

1. **Start job** → `PATCH /api/jobs/:id/status` → `ON_GOING`
2. **Proof of Installation**:
   - Capture a photo with the camera
   - Grab GPS coordinates
   - Upload the image → `POST /api/uploads/images`
   - Submit → `POST /api/jobs/:id/proof` → job becomes `WAITING_ACTIVATION`
3. **Mark complete** → blocked until the license is activated, with the same
   server message as the web

The **Submitted Proof** section shows what was captured.

All the server rules in [07 — Installations](07-installations.md) apply
identically — the mobile app is a different client, not a different ruleset.

### Earnings

- **Available Balance** — `GET /api/withdrawals/balance`
- **Earnings** list — empty state *"No earnings yet."*
- **Withdrawals** list — empty state *"No withdrawals yet."*
- **Request Withdrawal** form: Method, Account name, Account number, amount.
  The same insufficient-balance rule applies.

### Menu (admins)

A tile grid headed **Management**:

| Tile | Route | Restriction |
|------|-------|-------------|
| 🏢 Clients | `/admin/clients` | |
| 📦 Products | `/admin/products` | |
| 🔑 Licenses | `/admin/licenses` | |
| 📋 Job Orders | `/admin/job-orders` | |
| 🧰 Jobs | `/admin/jobs` | |
| 💸 Withdrawals | `/admin/withdrawals` | |
| 👥 Users | `/admin/users` | `SUPER_ADMIN` only |
| 📜 Audit Logs | `/admin/audit-logs` | `SUPER_ADMIN` only |

Tapping a job order opens **Job Order Payment** (`/admin/job-orders/[id]`).

### Profile

Account info, the **Server** environment switcher, and **Sign Out**.

## Admin section guard

`/admin/*` requires `SUPER_ADMIN`, `ADMIN_STAFF` **or** `SALES_STAFF`; anyone else
is redirected back to the tabs.

> Note the mismatch: the **Menu tab** only appears for `SUPER_ADMIN` and
> `ADMIN_STAFF`, but the `/admin` **route guard** also admits `SALES_STAFF`.
> A sales user therefore has no way into the admin section from the UI even
> though the routes would accept them. Logged in
> [20 — Known Gaps](20-known-gaps-and-troubleshooting.md).

## Push notifications

- The app requests notification permission and registers its FCM token via
  `POST /api/notifications/device-token`.
- `DELETE /api/notifications/device-token/:token` unregisters it.
- One user can hold several tokens (phone, tablet, web); tokens FCM reports as
  unregistered are pruned automatically.
- **Expo Go cannot resolve native FCM tokens** — a dev/standalone build
  (`npx expo prebuild` + EAS build) with `google-services.json` is required.
- Without backend FCM credentials the app still works; only background push is
  missing.

**Expected:** with push unavailable, in-app data still refreshes normally through
the API — no crash, no blocking error.

## Expected behaviour summary

| # | Assertion |
|---|-----------|
| 16.1 | Tokens survive an app restart and refresh silently on 401 |
| 16.2 | Admins do not see *My Jobs* / *Earnings*; field staff do not see *Menu* |
| 16.3 | An installer's job list contains only their own jobs |
| 16.4 | Proof submission moves the job to `WAITING_ACTIVATION` and is visible on the web portal immediately |
| 16.5 | *Mark complete* is blocked with the same message as the web when no license is activated |
| 16.6 | The Server switcher persists across restarts and defaults to **prod** |
| 16.7 | `SALES_STAFF` and below cannot reach `/admin/*` screens from the UI |
| 16.8 | Withdrawal requests obey the same balance rules as the web |
</content>
