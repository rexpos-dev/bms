# 07 — Installations (Jobs)

Route: `/jobs` · Roles: `SUPER_ADMIN`, `ADMIN_STAFF`, `SALES_STAFF`, `LIAISON`,
`INSTALLER`

A **Job** is one scheduled installation visit.

## Two views of the same page

The page renders one of two views:

| View | Shown when | Heading |
|------|-----------|---------|
| **Installer view** | The user has the `INSTALLER` role **and** their *primary* role is not an admin-type role | **My Jobs** |
| **Admin view** | Otherwise | **Installations** |

An admin who also holds `INSTALLER` as an additional role still gets the admin view.

Empty states: **"No jobs assigned to you yet."** (installer) /
**"No installations scheduled yet."** (admin). Errors:
**"Failed to load your jobs."** / **"Failed to load installations."**

## Job fields

| Field | Required | Notes |
|-------|:--------:|-------|
| Client | ✓ | |
| Schedule date | ✓ | |
| Installer | | Optional at creation — the job can be scheduled unassigned (shown as **Unassigned**) |
| License | | Optional link to a specific license |
| Status | ✓ | Defaults to `ASSIGNED` when an installer is set at creation |
| Remarks | | Free text |

## Data scoping

`GET /api/jobs` filters to `installerId = you` **only when your *primary* role is
`INSTALLER`**. Everyone else receives all jobs.

Two consequences QA should test explicitly:

- A user whose primary role is e.g. `SALES_STAFF` with `INSTALLER` as an
  *additional* role sees **all** jobs — consistent with the admin view they get in
  the UI.
- `GET /api/jobs?mine=true` has **no effect** for anyone whose primary role is not
  `INSTALLER`; the full list is still returned. See
  [20 — Known Gaps](20-known-gaps-and-troubleshooting.md).

**Expected:** a pure `INSTALLER` cannot see another installer's jobs through the
API, even by removing UI filters.

## The job lifecycle

```
                    assign / create with installer
                              │
                              ▼
                          ASSIGNED
                              │  installer taps "Start job"
                              ▼
                          ON_GOING
                              │  installer submits proof
                              ▼
                     WAITING_ACTIVATION
                              │  requires an ACTIVATED license
                              ▼
                         COMPLETED
                       (CANCELLED at any point)
```

### Assigning an installer — `PATCH /api/jobs/:id/assign`

Roles: `SUPER_ADMIN`, `ADMIN_STAFF`.

Sets `installerId` and forces status back to `ASSIGNED`, then sends the installer
a **"New installation job assigned"** notification with the body
*"You've been assigned an installation job for {client business name}."* and a
deep link to `/jobs`.

**Expected:** reassigning an `ON_GOING` job resets it to `ASSIGNED` and notifies
the new installer.

### Changing status — `PATCH /api/jobs/:id/status`

Roles: **`INSTALLER` only.**

- An installer who is not the job's assignee gets `403 You are not assigned to this job`.
- Moving to `COMPLETED` requires an activated license. The check accepts **either**:
  - the job's directly linked license is `ACTIVATED`, **or**
  - the job's client has **at least one** `ACTIVATED` license.
- Otherwise:
  `400 Cannot complete this job: the license has not been activated yet. Please wait for the license to be activated before completing the task.`
- `remarks` is optional; omitting it preserves the existing remarks.

**Expected:** a `SUPER_ADMIN` calling this endpoint gets 403. Job completion is
an installer action only.

### Submitting proof of installation — `POST /api/jobs/:id/proof`

Roles: `INSTALLER`, and only for their own job (else `403 You are not assigned to this job`).

Captured:

| Field | Required | Notes |
|-------|:--------:|-------|
| Installation photos | ✓ (array) | Uploaded first via `POST /api/uploads/images` |
| Client signature | | A photo URL |
| GPS latitude / longitude | | `Decimal(10,7)` |
| Device info | | JSON blob |
| Captured at | auto | Set to now |

Behaviour:

- The proof record is **upserted** — resubmitting overwrites the previous proof
  and refreshes `capturedAt`. There is exactly one proof per job (`job_id` unique).
- After a successful submit the job moves to **`WAITING_ACTIVATION`**, regardless
  of its previous status.

**Expected:** submitting proof twice leaves one proof row with the latest data and
the job in `WAITING_ACTIVATION`.

### Image uploads

`POST /api/uploads/images` (any authenticated user):

- Field name `files`, **max 10 files** per request
- **Max 10 MB** per file
- Allowed MIME types: `image/jpeg`, `image/png`, `image/gif`, `image/webp` —
  anything else → `400 Only image files (JPEG, PNG, GIF, WEBP) are allowed`
- Files are stored with a random UUID name; the response is
  `{ urls: ["/api/uploads/files/<uuid>.<ext>", …] }`
- `GET /api/uploads/files/:filename` serves them (no auth guard on the read)

## Admin UI

Admins see, per job: **Client · Schedule · Installer · Status · Remarks**, with:

- **Assign** — pick an installer
- **Submitted Proof** panel — photos, signature, GPS. When nothing has been
  submitted: **"No proof submitted for this job yet."**; with a proof but no
  images: **"No photos attached."**

Installers see **Start job**, **Submit proof** and **Mark complete** actions plus
the proof form (photos, optional signature photo, optional GPS lat/long).

## Calendar

Two endpoints back the dashboard/page calendar:

| Endpoint | Returns |
|----------|---------|
| `GET /api/jobs/calendar/month?month=&year=` | `id`, `scheduleDate`, `jobStatus` for jobs in that calendar month, ascending |
| `GET /api/jobs/calendar/day?date=` | Full job records (client, installer, license, proof) for that day |

Roles for both: `SUPER_ADMIN`, `INSTALLER`, `ADMIN_STAFF`, `LIAISON`, `SALES_STAFF`.

> Note: the calendar endpoints are **not** installer-scoped — they return all
> jobs for the period. Flagged in [20 — Known Gaps](20-known-gaps-and-troubleshooting.md).

## Creating jobs

| Path | How |
|------|-----|
| `POST /api/jobs` | `SUPER_ADMIN` only |
| Converting a standalone quotation | `POST /api/job-orders/:id/convert` creates the job and links it — see [08](08-job-orders-and-payments.md#converting-a-quotation) |

## Expected behaviour summary

| # | Assertion |
|---|-----------|
| 7.1 | Installers see only their own jobs from `GET /api/jobs` |
| 7.2 | Only `INSTALLER` can change job status or submit proof; wrong installer → 403 |
| 7.3 | `COMPLETED` is blocked with the documented message unless the job's license — or *any* license of that client — is `ACTIVATED` |
| 7.4 | Submitting proof always sets the job to `WAITING_ACTIVATION` |
| 7.5 | Re-submitting proof upserts (one proof row per job) and updates `capturedAt` |
| 7.6 | Uploading a PDF or an 11 MB image is rejected with the documented message |
| 7.7 | Assigning an installer creates a `job_assigned` notification and (if FCM is configured) a device push |
| 7.8 | A job created without an installer shows **Unassigned** and has no `ASSIGNED` forcing |
</content>
