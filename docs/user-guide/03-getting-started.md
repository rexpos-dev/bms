# 03 — Getting Started

## First-time setup (fresh environment)

1. Point `DATABASE_URL` at a MySQL instance in `.env`.
2. `npx prisma migrate dev` — creates the schema.
3. `npm run db:seed` — creates the first Super Admin.
   - Email: `SEED_SUPER_ADMIN_EMAIL`, default **`admin@sdlmp.local`**
   - Password: `SEED_SUPER_ADMIN_PASSWORD`, default **`ChangeMe123!`**
   - Full name is set to `Super Admin`.
   - Re-running the seed on an existing account is a **no-op** and logs
     `Super admin already exists`.
4. Start the API (`npm run start:dev` → port 3002) and the portal.

**Expected:** the seed never overwrites an existing user's password.

On first API start, an RSA-4096 key pair is generated under `keys/` for license
signing. Back it up — regenerating it invalidates previously issued license tokens.

Also seeded automatically at startup: **KPI definitions** for every KPI role
(see [11 — KPI & Incentives](11-kpi-and-incentives.md)). Seeding runs once per
role, sequentially, and is skipped when definitions already exist.

## Signing in

Route: `/login`.

| Field | Rules |
|-------|-------|
| Email | Must match an existing user exactly (unique index) |
| Password | bcrypt-compared against the stored hash |

On success the API returns `{ accessToken, refreshToken, user }` where `user`
contains `id`, `email`, `role` (primary), `roles` (merged array) and `fullName`.

Failure cases — **all return the same generic message** so accounts cannot be
enumerated:

| Situation | Response |
|-----------|----------|
| Unknown email | `401 Invalid credentials` |
| Wrong password | `401 Invalid credentials` |
| Account deactivated (`isActive = false`) | `401 Invalid credentials` |
| More than 10 attempts in 60 s from one IP | `429 ThrottlerException: Too Many Requests` |

**Expected:** every login attempt — success *and* failure — writes an audit-log
row. Failures are recorded as `Failed User Login (401)`.

> **MFA:** the `users` table carries `mfaEnabled` / `mfaSecret` columns and the
> Users screen displays an MFA column, but **no OTP step is implemented in the
> login flow**. Treat MFA as not-yet-shipped. See
> [20 — Known Gaps](20-known-gaps-and-troubleshooting.md).

## Sessions and token refresh

- Access token lifetime: **15 minutes** by default.
- Refresh token lifetime: **7 days** by default; only the bcrypt **hash** is stored.
- `POST /api/auth/refresh` issues a *new pair* and rotates the stored hash.
- `POST /api/auth/logout` sets `users.refresh_token = NULL`.

**Expected behaviour**

| Scenario | Result |
|----------|--------|
| Access token expires mid-session | Client silently refreshes and the action completes |
| Refresh with an already-rotated token | `401 Access denied` |
| Refresh after logout | `401 Access denied` |
| Logout while the network is down (web) | Local session is cleared anyway and the user lands on `/login` |

## The app shell

After login every role lands on `/` (Dashboard) inside the same shell:

- **Sidebar (left)** — brand block (METRIQA logo + *Measure · Monitor · Reward*),
  role-based navigation, then the user block: avatar initials, full name, role
  label, **Profile Settings**, **Log out**.
- **Header (top)** — sidebar collapse toggle (desktop) or hamburger (mobile),
  **notification bell**, **theme toggle**.
- **Content** — the routed page, with a fade/slide page transition.
- **Floating timer widget** — bottom of the viewport, only while a dev project
  timer is running.

### Sidebar behaviour

| Viewport | Behaviour |
|----------|-----------|
| > 900 px | Fixed sidebar, 256 px expanded / 74 px icon-only rail. Collapse state is persisted in `localStorage` under `sdlmp-sidebar-collapsed`. |
| ≤ 900 px | Off-canvas drawer with a dimmed backdrop; opens via the hamburger, auto-closes on route change and on backdrop click. |

**Expected:** in rail mode, labels are hidden, icons are centred, and hovering a
link shows its label as a native tooltip.

### Unread indicators

A small red dot appears on a sidebar link when its module has changed since you
last visited it (driven by the SSE broadcast). Opening that route clears the dot.

**Expected:** the dot never shows on the route you are currently viewing.

## Notifications

The bell in the header lists your persisted notifications, newest first (up to 50).

| Action | Endpoint |
|--------|----------|
| List | `GET /api/notifications` |
| Unread badge count | `GET /api/notifications/unread-count` |
| Mark one read | `PATCH /api/notifications/:id/read` |
| Mark all read | `PATCH /api/notifications/read-all` |

Events that generate a notification:

| Event type | Recipient | Trigger |
|-----------|-----------|---------|
| `job_assigned` | The installer | A job is created with, or reassigned to, that installer |
| `withdrawal_status` | The requester | Withdrawal approved / rejected / released |
| `dev_report_tagged` | The tagged admin | A developer posts a report tagging them |
| `dev_report_feedback` | The report author | The tagged admin (or a Super Admin) replies |

Rules:

- Marking someone else's notification read returns `403 Not your notification`.
- Marking an already-read notification is idempotent (returns it unchanged).
- Notification delivery failures are swallowed — **a failed notification must
  never fail the underlying action** (e.g. job assignment still succeeds).

**Expected:** with FCM unconfigured, the in-app bell still works; only device
push is skipped.

## Theme

The header toggle switches light/dark. The choice persists across reloads.

## Your profile (`/profile`)

Three sections: **Account Info**, **Change Password**, and read-only account details.

| Field | Rules |
|-------|-------|
| Full name | Free text |
| Email address | Must be unique → `409 Email already in use by another account` |
| Phone / contact number | Optional; empty string is stored as `NULL` |
| Current password | **Required** whenever a new password is supplied |
| New password / Confirm new password | Must match (client-side check) |

Server rules:

- New password without current password → `400 Current password is required to set a new one`
- Wrong current password → `401 Current password is incorrect`
- Passwords are re-hashed with bcrypt cost 12.

**Expected:** you cannot change your own **role**, **base bonus**, or **active
status** from `/profile` — those are Super Admin operations on `/users`.
</content>
