# 01 — System Overview

## What METRIQA is

METRIQA is a centralised platform for a software/hardware deployment business.
It tracks the full chain from **client acquisition → job order → installation →
license activation → payment collection → staff incentive payout**, plus
internal development-project tracking and KPI-based performance bonuses.

Tagline shown in the sidebar: *Measure · Monitor · Reward*.

## Components

| Component | Technology | Location | Notes |
|-----------|-----------|----------|-------|
| **API / backend** | NestJS 11 + Prisma 6 + MySQL | `src/`, `prisma/` | All business logic and authorization |
| **Admin web portal** | React 19 + Vite + React Router + TanStack Query | `admin-web/` | Built to `admin-web/dist`, served *by the API* as static files |
| **Mobile app** ("Beulah Field") | React Native / Expo Router | `mobile/` | Field staff + a cut-down admin section |
| **Public landing page** | Part of admin-web (`/` when signed out) | `admin-web/src/pages/LandingPage.tsx` | Lead capture + app download |

### Request routing

- API is mounted under the global prefix **`/api`**.
- `/downloads/*` serves installer files (e.g. the mobile APK) from `<cwd>/downloads`
  with a forced `Content-Disposition: attachment` header.
- Everything else falls through to the built admin-web SPA (`admin-web/dist`),
  excluding `/api/*` and `/downloads/*`.

**Expected:** hitting a non-API, non-download path returns the SPA shell, and the
SPA's catch-all route (`*`) redirects to `/`.

## Ports and startup

| Command | Effect |
|---------|--------|
| `npm run start:dev` | Sets `PORT=3002` and starts Nest in watch mode |
| `npm run start:prod` | `node dist/main`, port from `PORT` env, default **3000** |
| `npm run dev` | Runs backend + admin-web Vite dev server concurrently |
| `npm run build` | Builds admin-web then compiles the Nest app |
| `npm run db:seed` | Creates the first Super Admin |

On boot, `main.ts` runs `npx prisma migrate deploy` **before** creating the Nest
app. If migrations fail the app still boots — the failure is logged, not fatal.

**Expected:** a schema-drifted database produces migration output in the logs and
endpoints touching missing columns return 500 rather than the app crash-looping.

## Scheduled jobs

| Cron | Job | Effect |
|------|-----|--------|
| `0 2 * * *` (02:00 daily) | `LicensesService.expireOverdueLicenses` | `ACTIVATED` licenses whose `expirationDate` has passed become `EXPIRED` |
| `0 3 * * *` (03:00 daily) | `BackupsService.scheduledBackup` | Full SQL dump into `backups/`, keeps the newest **14**, prunes the rest |

## Security model

- **Auth:** email + password (bcrypt, cost 12) → JWT access token + refresh token.
  - Access token default lifetime `15m` (`JWT_ACCESS_EXPIRES_IN`).
  - Refresh token default lifetime `7d` (`JWT_REFRESH_EXPIRES_IN`), stored in the
    `users.refresh_token` column as a bcrypt hash.
- **Authorization:** `RolesGuard` — a request passes when **any** of the user's
  roles (primary + additional) matches **any** role on the `@Roles(...)` decorator.
- **Rate limiting** (per IP, `@nestjs/throttler`, `trust proxy` = loopback):
  - Global: **300 requests / 60 s**
  - `POST /api/auth/login`: **10 / 60 s**
  - `POST /api/download-leads/send-code`: **5 / 60 s**
  - `POST /api/download-leads`: **10 / 60 s**
- **Validation:** global `ValidationPipe` with `whitelist: true`, `transform: true`,
  `forbidNonWhitelisted: true`.
  **Expected:** posting an unknown property returns **400**, not a silent drop.
- **License signing:** activation issues an RS256 JWT signed with an RSA-4096 key
  pair generated on first run under `keys/` (gitignored). Losing that key pair
  invalidates previously issued license tokens.
- **Audit trail:** a global interceptor records every `POST/PUT/PATCH/DELETE`
  (plus login/logout, including *failed* logins) into `audit_logs`, scrubbing
  `password`, `refreshToken`, `token`, `secret`, `mfaSecret` to `********`.

## Real-time updates

- **SSE** — `GET /api/events` streams two things:
  - per-user notifications (persisted in the `notifications` table first);
  - a broadcast "data changed" event on every mutation, carrying
    `{ resource, module, action, actor, actorRole }`.
- The admin web uses these to show the notification bell badge and a red dot on
  sidebar items whose module changed.
- **Push** — Firebase Cloud Messaging, when `FIREBASE_SERVICE_ACCOUNT_PATH` (or
  `FIREBASE_SERVICE_ACCOUNT`) is configured. Without credentials, push is skipped
  silently and everything else keeps working.

## External integrations

| Integration | Env vars | Used by |
|-------------|----------|---------|
| **TMS Pro** (designer KPI points) | `TMS_KPI_API_URL` (default `https://tmspro.up.railway.app`), `TMS_KPI_API_TOKEN` | Settings → KPI Settings → Designer sync |
| **Finara ERP** (leads) | `FINARA_API_URL` (default `https://finara.up.railway.app`), `FINARA_API_KEY` | Download Leads → Finara tab |
| **Resend** (email OTP) | `RESEND_API_KEY`, `RESEND_FROM` | Landing page lead verification |
| **Firebase FCM** | `FIREBASE_SERVICE_ACCOUNT_PATH` / `FIREBASE_SERVICE_ACCOUNT` | Device push |

**Expected:** every one of these degrades gracefully — a missing key produces a
clear 400 with a human-readable reason (or, for Resend, falls back to accepting
the lead with an unverified email), never a 500.

## Glossary

| Term | Meaning |
|------|---------|
| **Client** | The paying business. Has a `clientCode` (`CLT-XXXXXXXX`), type `SOFTWARE` or `ADVERTISING`. |
| **Software Product** | A sellable product + version with a license type and price. |
| **License** | A key issued to a client for a product. May be a **trial** (`TRIAL-XXXX-XXXX`, auto-generated) or a real provider key. |
| **Job** | An installation appointment: client + schedule date + optional installer + optional license. |
| **Job Order (JO)** | The commercial document for a job: sale price, line items, discount, payments. Can print as Job Order / Quotation / Invoice / Official Receipt. |
| **Proof of Installation** | Photos + optional signature + GPS + device info, captured by the installer. |
| **Earning** | A money credit to a staff member (`INSTALLATION`, `ACTIVATION`, `BONUS`, `COMMISSION`). |
| **Withdrawal** | A staff request to cash out available balance. |
| **Incentive** | A monthly KPI-derived bonus; mirrored 1:1 into an `Earning` of type `BONUS`. |
| **Dev Project** | An internal software project with a start/pause/stop timer and progress %. |
| **NENPOS Client** | Legacy pre-system client records, bulk-imported from Excel. Read/report only — not linked to licenses or jobs. |
| **Download Lead** | A visitor who filled the landing-page form to download the app. |
</content>
