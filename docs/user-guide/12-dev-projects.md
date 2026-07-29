# 12 — Dev Projects

Route: `/dev-projects` · Roles: `DEVELOPER`, `ADMIN_STAFF`, `SUPER_ADMIN`

Tracks internal software development: a per-project **timer**, a manual
**progress %**, and **reports** that a developer submits for admin review.

## Project fields

| Field | Required | Notes |
|-------|:--------:|-------|
| Software name | ✓ | |
| Description | | Optional |
| Developer | ✓ | Must be a user whose **primary role is `DEVELOPER`** → otherwise `404 Developer not found` |
| Estimated timeframe (hours) | | `targetHours` |
| Project start date | | |
| Deadline / end date | | |
| Status | auto | `NOT_STARTED` → `IN_PROGRESS` → `PENDING` → `COMPLETED` |
| Progress | manual | 0–100 % |

**Ownership rules**

- A `DEVELOPER` creating a project always becomes its own developer — the
  supplied `developerId` is ignored.
- A `SUPER_ADMIN` creating a project **must** supply `developerId` →
  otherwise `403 developerId is required`.

## Visibility

| Role | Sees |
|------|------|
| `DEVELOPER` | Only their own projects |
| `ADMIN_STAFF`, `SUPER_ADMIN` | All projects |

Accessing someone else's project → `403 You do not have access to this development project`.

Note the asymmetry, which QA should verify explicitly:

- **Viewing** a project is allowed for `SUPER_ADMIN` **and** `ADMIN_STAFF`.
- **Acting** on a project (start/pause/resume/stop/progress/report) is allowed for
  the owning developer and `SUPER_ADMIN` only — `ADMIN_STAFF` gets 403.
- **Editing** project metadata (`PATCH /api/dev-projects/:id`) is `SUPER_ADMIN` only.

## The timer

Buttons: **Start**, **Pause/Resume**, **Stop**. A floating widget in the app shell
shows the running project.

### Status semantics

| Status | `startedAt` | Meaning |
|--------|-------------|---------|
| `NOT_STARTED` | null | Never started |
| `IN_PROGRESS` | a timestamp | **Running** |
| `IN_PROGRESS` | null | **Paused** — the widget stays visible |
| `PENDING` | null | Stopped, work not finished |
| `COMPLETED` | null | Progress reached 100 % |

### Time accounting

Two counters exist so paused time is never double-counted:

- `runSeconds` — seconds banked by pauses **within the current run**; reset to 0
  on start and on any run-ending transition.
- `totalMinutes` — grows **once**, when the run ends, by
  `round((runSeconds + lastSegmentSeconds) / 60)`.

Each start/resume opens a `DevProjectSession` row; each pause/stop closes it with
its `endedAt` and rounded `minutes`.

### Transition rules

| Action | Precondition | Error when violated |
|--------|--------------|--------------------|
| **Start** | Not already `IN_PROGRESS`, not `COMPLETED` | `403 This project is already being worked on` / `403 This project is already completed` |
| **Pause** | `IN_PROGRESS` **and** running (`startedAt` set) | `403 This project is not currently running` |
| **Resume** | `IN_PROGRESS` **and** paused (`startedAt` null) | `403 This project is not currently paused` |
| **Stop** | `IN_PROGRESS` (running **or** paused) | `403 This project is not currently running` |

### One active timer per developer

Starting project B while project A is running **auto-stops A first**, inside the
same transaction: A's open session is closed, its time is banked into
`totalMinutes`, and A becomes `PENDING`.

**Expected:** a developer can never have two projects in the running state at once,
and no time is lost during the hand-over.

## Progress

`PATCH /api/dev-projects/:id/progress` with `{ progressPercent }`.

| Value | Effect |
|-------|--------|
| ≥ 100 | Status → `COMPLETED`; ends the run (banks the open segment + paused seconds into `totalMinutes`, clears `runSeconds` and `startedAt`) |
| < 100 on a `COMPLETED` project | Status → `PENDING` (re-opened) |
| < 100 otherwise | Status unchanged |

**Expected:** setting a running project to 100 % stops the timer and records the
elapsed time — no manual Stop needed.

## Reports

A developer posts a report on their own project (`POST /api/dev-projects/:id/reports`).

| Field | Required | Notes |
|-------|:--------:|-------|
| Title | ✓ | |
| Comment | | Optional |
| Checklist | ✓ | Array of `{ label, done }` |
| Tag admin to review | | Must be a `SUPER_ADMIN` or `ADMIN_STAFF` user → otherwise `404 Reviewer not found` |

Report status: `PENDING` → `REVIEWED`.

Tagging an admin sends them a **"New dev report to review"** notification:
*A report "{title}" on "{project}" was tagged for your review.*

UI: **New report** dialog with Title, Comment (optional), Checklist,
*Tag admin to review (optional)* (**No tag** is the default). Empty state:
**"No reports yet."**; failure: **"Failed to post report. Try again."**

### Feedback

`POST /api/dev-projects/reports/:reportId/feedback` — roles `SUPER_ADMIN`,
`ADMIN_STAFF`.

- A non-Super-Admin who was **not** tagged gets `403 You were not tagged on this report`.
  A `SUPER_ADMIN` may reply to any report.
- Posting feedback flips the report to `REVIEWED` in the same transaction.
- The report author is notified (**"Feedback on your report"**) — unless they are
  the one leaving the feedback.

**Expected:** feedback and the status change are atomic — a failure leaves the
report `PENDING` with no feedback row.

## The page

Per project: **Software · Developer · Status · Progress · Time / Target ·
Project Timeframe · Started / Ended / Duration**, with **Start / Stop**,
**View Progress**, **Session History** and **Reports**.

Empty: **"No software development projects yet."**;
failure: **"Failed to load development projects."** / **"Failed to create project. Try again."**

## Supporting endpoints

| Endpoint | Returns | Roles |
|----------|---------|-------|
| `GET /api/dev-projects/developers` | Active users with primary role `DEVELOPER`, by name | `DEVELOPER`, `SUPER_ADMIN`, `ADMIN_STAFF` |
| `GET /api/dev-projects/reviewers` | Active `SUPER_ADMIN` + `ADMIN_STAFF`, by name | same |
| `GET /api/dev-projects/active` | The caller's currently `IN_PROGRESS` project (for the floating widget) | same |

## Expected behaviour summary

| # | Assertion |
|---|-----------|
| 12.1 | A developer sees and can act on only their own projects |
| 12.2 | `ADMIN_STAFF` can view all projects but cannot start/stop/edit them |
| 12.3 | Starting a second project auto-stops the first and banks its time |
| 12.4 | Pause → Resume → Stop totals the same minutes as an uninterrupted run of equal length |
| 12.5 | Paused time is never counted twice in `totalMinutes` |
| 12.6 | Progress 100 % completes the project and ends the run |
| 12.7 | Dropping a completed project below 100 % re-opens it as `PENDING` |
| 12.8 | Tagging a non-admin as reviewer returns 404 |
| 12.9 | Feedback sets the report to `REVIEWED` and notifies the author |
| 12.10 | A user with primary role other than `DEVELOPER` cannot be assigned a project |
</content>
