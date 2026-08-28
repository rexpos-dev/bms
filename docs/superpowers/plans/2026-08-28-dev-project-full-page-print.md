# Dev Project Full-Page View + Print/PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-page view of a Software Development project's progress/reports at `/dev-projects/:id`, reachable from the existing modals, with Print and Download-PDF buttons.

**Architecture:** A new React Router route renders a new page component (`DevProjectDetailPage.tsx`) that fetches the same `/dev-projects/:id` data the existing modals use and re-renders it full-page, reusing exported helpers/subcomponents from `DevProjectsPage.tsx`. A hidden print-only block plus a dedicated print stylesheet (mirroring the existing `JobOrderPage`/`print-styles.ts` pattern) backs both `window.print()` and an `html2pdf.js` download.

**Tech Stack:** Vite + React 19 + TypeScript, `react-router-dom` v7, `@tanstack/react-query` v5, `html2pdf.js`, `vitest` for unit tests (no component-render test harness exists in this repo — UI tasks are verified manually plus `tsc -b` / `vite build`).

## Global Constraints

- No new computed analytics beyond what the existing modals already show (no charts, no averages, no completion-rate summaries).
- The two existing dialogs in `DevProjectsPage.tsx` keep their current behavior; the only change to them is adding one outbound "Open full page" link each.
- No shared-component extraction/refactor of the two dialogs — the new page re-declares its own mutations, matching the existing dialogs' pattern, to avoid touching working modal code (see spec's "Duplication trade-off"). Pure formatting helpers and the three presentational subcomponents (`TargetHoursEditor`, `ReportChecklist`, `TimeframeEditor`) plus the `useTick` hook ARE reused via import (just adding `export`, no behavior change).
- Printed/PDF content must be non-interactive (no buttons, inputs, or checkboxes — static text/marks only).

---

### Task 1: Export shared helpers and subcomponents from `DevProjectsPage.tsx`

**Files:**
- Modify: `admin-web/src/pages/DevProjectsPage.tsx`

**Interfaces:**
- Produces (newly exported, unchanged signatures): `computeProgress(project: DevProject): number`, `progressBasis(project: DevProject): string`, `daysRemaining(project: DevProject): number | null`, `formatTrackedVsTarget(project: DevProject): string`, `fieldLabel(text: string): JSX.Element`, `formatMinutes(totalMinutes: number): string`, `formatLiveDuration(project: DevProject): string`, `useTick(intervalMs: number, enabled: boolean): void`, `TargetHoursEditor`, `ReportChecklist`, `TimeframeEditor` (all as React components with their existing prop types, unchanged).

This task only adds the `export` keyword to ten existing declarations. No logic changes, so no new test is needed — verification is a type-check plus a manual smoke check that the existing dialogs still work.

- [ ] **Step 1: Add `export` to the pure helper functions**

In `admin-web/src/pages/DevProjectsPage.tsx`, change each of these six lines (leave everything else in each function body untouched):

```ts
// before: function computeProgress(project: DevProject): number {
export function computeProgress(project: DevProject): number {
```
```ts
// before: function progressBasis(project: DevProject): string {
export function progressBasis(project: DevProject): string {
```
```ts
// before: function daysRemaining(project: DevProject): number | null {
export function daysRemaining(project: DevProject): number | null {
```
```ts
// before: function formatTrackedVsTarget(project: DevProject) {
export function formatTrackedVsTarget(project: DevProject) {
```
```ts
// before: function fieldLabel(text: string) {
export function fieldLabel(text: string) {
```
```ts
// before: function formatMinutes(totalMinutes: number) {
export function formatMinutes(totalMinutes: number) {
```
```ts
// before: function formatLiveDuration(project: DevProject) {
export function formatLiveDuration(project: DevProject) {
```
```ts
// before: function useTick(intervalMs: number, enabled: boolean) {
export function useTick(intervalMs: number, enabled: boolean) {
```

- [ ] **Step 2: Add `export` to the three subcomponents**

```ts
// before: function TargetHoursEditor({ current, onSave, isPending }: {
export function TargetHoursEditor({ current, onSave, isPending }: {
```
```ts
// before: function ReportChecklist({ items, editable, isPending, onToggle, onSaveNote }: {
export function ReportChecklist({ items, editable, isPending, onToggle, onSaveNote }: {
```
```ts
// before: function TimeframeEditor({ project, onSave, onCancel, isPending }: {
export function TimeframeEditor({ project, onSave, onCancel, isPending }: {
```

- [ ] **Step 3: Type-check**

Run: `cd admin-web && npm run build`
Expected: builds successfully with no TypeScript errors (adding `export` cannot break existing callers in the same file).

- [ ] **Step 4: Manual smoke check**

Run `cd admin-web && npm run dev`, log in as a `SUPER_ADMIN`/`ADMIN_STAFF` user, open Software Development, click "View Progress" on any project, then close it and open a project you own (or log in as its developer) via "Open" — confirm both dialogs render exactly as before (status, progress, timeframe editing, session history, reports, checklist ticking all still work).

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/pages/DevProjectsPage.tsx
git commit -m "refactor(admin-web): export dev-project detail helpers for reuse"
```

---

### Task 2: PDF filename helper (TDD)

**Files:**
- Create: `admin-web/src/components/print/dev-project-report-filename.util.ts`
- Test: `admin-web/src/components/print/dev-project-report-filename.util.spec.ts`

**Interfaces:**
- Produces: `buildDevProjectReportFilename(name: string, id: string): string` — used by Task 7's download handler.

- [ ] **Step 1: Write the failing test**

Create `admin-web/src/components/print/dev-project-report-filename.util.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildDevProjectReportFilename } from './dev-project-report-filename.util';

describe('buildDevProjectReportFilename', () => {
  it('slugifies the project name and uppercases the id prefix', () => {
    expect(buildDevProjectReportFilename('Inventory System v2', 'a1b2c3d4-e5f6-7890')).toBe(
      'dev-project-inventory-system-v2-A1B2C3D4.pdf',
    );
  });

  it('collapses non-alphanumeric characters and trims leading/trailing dashes', () => {
    expect(buildDevProjectReportFilename('  --POS™ (Mobile)!!--  ', 'abcdef1234567890')).toBe(
      'dev-project-pos-mobile-ABCDEF12.pdf',
    );
  });

  it('falls back to "project" when the name has no alphanumeric characters', () => {
    expect(buildDevProjectReportFilename('!!!', 'abcdef1234567890')).toBe('dev-project-project-ABCDEF12.pdf');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd admin-web && npx vitest run src/components/print/dev-project-report-filename.util.spec.ts`
Expected: FAIL — cannot find module `./dev-project-report-filename.util`.

- [ ] **Step 3: Write the implementation**

Create `admin-web/src/components/print/dev-project-report-filename.util.ts`:

```ts
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project'
  );
}

export function buildDevProjectReportFilename(name: string, id: string): string {
  const slug = slugify(name);
  const idPrefix = id.slice(0, 8).toUpperCase();
  return `dev-project-${slug}-${idPrefix}.pdf`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd admin-web && npx vitest run src/components/print/dev-project-report-filename.util.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/components/print/dev-project-report-filename.util.ts admin-web/src/components/print/dev-project-report-filename.util.spec.ts
git commit -m "feat(admin-web): add dev project PDF filename helper"
```

---

### Task 3: Route + page skeleton (header, fetch, back button)

**Files:**
- Create: `admin-web/src/pages/DevProjectDetailPage.tsx`
- Modify: `admin-web/src/App.tsx`

**Interfaces:**
- Consumes (from Task 1): `computeProgress`, `formatLiveDuration` from `./DevProjectsPage` (imported here for later tasks' use; not yet rendered in this task beyond the status badge).
- Produces: `DevProjectDetailPage` (default export style not used — named export `export function DevProjectDetailPage()`), consumed by `App.tsx`'s new route.

- [ ] **Step 1: Create the page skeleton**

Create `admin-web/src/pages/DevProjectDetailPage.tsx`:

```tsx
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { useAuthStore } from '../lib/auth-store';
import type { DevProject } from '../lib/types';

export function DevProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const detailQuery = useQuery({
    queryKey: ['dev-projects', id],
    queryFn: async () => (await api.get<DevProject>(`/dev-projects/${id}`)).data,
    enabled: !!id,
  });

  const project = detailQuery.data ?? null;

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdminStaff = user?.role === 'ADMIN_STAFF';
  const isAdminRole = isSuperAdmin || isAdminStaff;
  const isOwner = !!project && project.developerId === user?.id;
  const canControl = isOwner;
  const canTagAdmins = user?.role === 'DEVELOPER' || isSuperAdmin;
  // Referenced so lint doesn't flag them as unused before Tasks 4-5 wire them up.
  void isAdminRole;
  void canControl;
  void canTagAdmins;

  return (
    <div style={{ padding: '2rem' }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}
        onClick={() => navigate('/dev-projects')}
      >
        ← Back to Software Development
      </button>

      {detailQuery.isLoading && <p>Loading…</p>}
      {detailQuery.isError && <p className="error-text">Failed to load this project.</p>}

      {project && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <h1 style={{ margin: 0 }}>{project.name}</h1>
          <StatusBadge status={project.status} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the route**

In `admin-web/src/App.tsx`, change the import line:

```ts
// before:
import { DevProjectsPage } from './pages/DevProjectsPage';
// after:
import { DevProjectsPage } from './pages/DevProjectsPage';
import { DevProjectDetailPage } from './pages/DevProjectDetailPage';
```

Then add a new `<Route>` immediately after the existing `/dev-projects` route:

```tsx
// before:
        <Route
          path="/dev-projects"
          element={
            <RequireAuth roles={['DEVELOPER', 'ADMIN_STAFF', 'SUPER_ADMIN']}>
              <DevProjectsPage />
            </RequireAuth>
          }
        />

// after:
        <Route
          path="/dev-projects"
          element={
            <RequireAuth roles={['DEVELOPER', 'ADMIN_STAFF', 'SUPER_ADMIN']}>
              <DevProjectsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/dev-projects/:id"
          element={
            <RequireAuth roles={['DEVELOPER', 'ADMIN_STAFF', 'SUPER_ADMIN']}>
              <DevProjectDetailPage />
            </RequireAuth>
          }
        />
```

- [ ] **Step 3: Type-check**

Run: `cd admin-web && npm run build`
Expected: builds successfully.

- [ ] **Step 4: Manual verification**

Run `cd admin-web && npm run dev`, log in, open the Software Development page, open browser devtools → Network tab, reload the page, find the `GET /dev-projects` response and copy any project's `id`. Navigate to `http://localhost:5173/dev-projects/<that-id>`. Confirm: the back button, page title (project name), and status badge render; a project ID that doesn't exist shows the error message instead of crashing.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/pages/DevProjectDetailPage.tsx admin-web/src/App.tsx
git commit -m "feat(admin-web): add /dev-projects/:id full-page route skeleton"
```

---

### Task 4: Left column — status, progress, timeframe, description

**Files:**
- Modify: `admin-web/src/pages/DevProjectDetailPage.tsx`

**Interfaces:**
- Consumes (from Task 1, via `./DevProjectsPage`): `computeProgress`, `progressBasis`, `daysRemaining`, `formatTrackedVsTarget`, `fieldLabel`, `formatLiveDuration`, `useTick`, `TargetHoursEditor`, `TimeframeEditor`.
- Produces: local state `progressDraft: string`, `editingTimeframe: boolean`, and mutations `startProject`, `stopProject`, `updateProgress`, `updateTargetHours`, `updateTimeframe`, `invalidate()` — consumed by Task 5's `useMutation`/`useQueryClient` setup pattern (Task 5 adds its own, sharing the same `qc`/`invalidate`).

- [ ] **Step 1: Replace the skeleton with the left-column content**

Replace the full contents of `admin-web/src/pages/DevProjectDetailPage.tsx` with:

```tsx
import { type FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ProgressBar } from '../components/ProgressBar';
import { StatusBadge } from '../components/StatusBadge';
import { useAuthStore } from '../lib/auth-store';
import type { DevProject } from '../lib/types';
import {
  computeProgress,
  daysRemaining,
  fieldLabel,
  formatLiveDuration,
  progressBasis,
  TargetHoursEditor,
  TimeframeEditor,
  useTick,
} from './DevProjectsPage';

export function DevProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ['dev-projects', id],
    queryFn: async () => (await api.get<DevProject>(`/dev-projects/${id}`)).data,
    enabled: !!id,
  });

  const project = detailQuery.data ?? null;

  useTick(1000, project?.status === 'IN_PROGRESS');

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdminStaff = user?.role === 'ADMIN_STAFF';
  const isAdminRole = isSuperAdmin || isAdminStaff;
  const isOwner = !!project && project.developerId === user?.id;
  const canControl = isOwner;
  const canTagAdmins = user?.role === 'DEVELOPER' || isSuperAdmin;
  void canTagAdmins; // used starting Task 5

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['dev-projects'] });
    qc.invalidateQueries({ queryKey: ['dev-active'] });
  };

  const startProject = useMutation({
    mutationFn: (projectId: string) => api.post(`/dev-projects/${projectId}/start`),
    onSuccess: invalidate,
  });

  const stopProject = useMutation({
    mutationFn: (projectId: string) => api.post(`/dev-projects/${projectId}/stop`),
    onSuccess: invalidate,
  });

  const updateProgress = useMutation({
    mutationFn: ({ projectId, progressPercent }: { projectId: string; progressPercent: number }) =>
      api.patch(`/dev-projects/${projectId}/progress`, { progressPercent }),
    onSuccess: invalidate,
  });

  const updateTargetHours = useMutation({
    mutationFn: ({ projectId, targetHours }: { projectId: string; targetHours: number | null }) =>
      api.patch(`/dev-projects/${projectId}`, { targetHours }),
    onSuccess: invalidate,
  });

  const updateTimeframe = useMutation({
    mutationFn: ({ projectId, projectStart, projectDeadline }: { projectId: string; projectStart: string | null; projectDeadline: string | null }) =>
      api.patch(`/dev-projects/${projectId}`, { projectStart, projectDeadline }),
    onSuccess: invalidate,
  });

  const [progressDraft, setProgressDraft] = useState('');
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (project && project.id !== loadedId) {
    setLoadedId(project.id);
    setProgressDraft(String(project.progressPercent));
  }

  const [editingTimeframe, setEditingTimeframe] = useState(false);

  const handleProgressSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!project) return;
    const value = Number(progressDraft);
    if (!Number.isNaN(value) && value >= 0 && value <= 100) {
      updateProgress.mutate({ projectId: project.id, progressPercent: value });
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}
        onClick={() => navigate('/dev-projects')}
      >
        ← Back to Software Development
      </button>

      {detailQuery.isLoading && <p>Loading…</p>}
      {detailQuery.isError && <p className="error-text">Failed to load this project.</p>}

      {project && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <h1 style={{ margin: 0 }}>{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>

          <div className="dp-detail-grid">
            <section className="dp-detail-col" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="card" style={{ padding: '1rem' }}>
                  {fieldLabel('Status')}
                  <div style={{ marginTop: '0.25rem' }}><StatusBadge status={project.status} /></div>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  {fieldLabel('Progress')}
                  <div style={{ fontWeight: 700, fontSize: '1.5rem', marginBottom: '0.35rem' }}>{computeProgress(project)}%</div>
                  <ProgressBar percent={computeProgress(project)} />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    {progressBasis(project)}
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
                <div>
                  {fieldLabel('Developer')}
                  <div style={{ fontWeight: 600 }}>{project.developer?.fullName ?? '—'}</div>
                </div>
                <div>
                  {fieldLabel('Time tracked')}
                  <div style={{ fontWeight: 600 }}>{formatLiveDuration(project)}</div>
                  {project.targetHours && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {Math.max(0, project.targetHours - project.totalMinutes / 60).toFixed(1)}h remaining
                    </div>
                  )}
                </div>
                <div>
                  {fieldLabel('Progress basis')}
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent)' }}>{progressBasis(project)}</div>
                </div>
              </div>

              {isAdminRole && (
                <div className="card" style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Project Timeframe</div>
                    {!editingTimeframe && (
                      <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
                        onClick={() => setEditingTimeframe(true)}>
                        Edit Timeframe
                      </button>
                    )}
                  </div>

                  {editingTimeframe ? (
                    <TimeframeEditor
                      project={project}
                      onSave={({ projectStart, projectDeadline }) => {
                        updateTimeframe.mutate({ projectId: project.id, projectStart, projectDeadline });
                        setEditingTimeframe(false);
                      }}
                      onCancel={() => setEditingTimeframe(false)}
                      isPending={updateTimeframe.isPending}
                    />
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        {fieldLabel('Start date')}
                        <div style={{ fontWeight: 600 }}>
                          {project.projectStart ? new Date(project.projectStart).toLocaleDateString() : <span style={{ color: 'var(--text-muted)' }}>Not set</span>}
                        </div>
                      </div>
                      <div>
                        {fieldLabel('Deadline')}
                        <div style={{ fontWeight: 600 }}>
                          {project.projectDeadline ? (
                            <>
                              {new Date(project.projectDeadline).toLocaleDateString()}
                              {daysRemaining(project) !== null && (
                                <span style={{
                                  marginLeft: '0.5rem', fontSize: '0.75rem', fontWeight: 700,
                                  color: (daysRemaining(project) ?? 0) < 0 ? 'var(--danger)' : (daysRemaining(project) ?? 0) <= 7 ? 'var(--warning)' : 'var(--success)',
                                }}>
                                  {(daysRemaining(project) ?? 0) < 0
                                    ? `${Math.abs(daysRemaining(project)!)}d overdue`
                                    : `${daysRemaining(project)}d left`}
                                </span>
                              )}
                            </>
                          ) : <span style={{ color: 'var(--text-muted)' }}>Not set</span>}
                        </div>
                      </div>
                      {project.projectStart && project.projectDeadline && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          {fieldLabel('Duration')}
                          <div style={{ fontWeight: 600 }}>
                            {Math.round((new Date(project.projectDeadline).getTime() - new Date(project.projectStart).getTime()) / (1000 * 60 * 60 * 24))} days total
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {canControl && (
                <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Timeframe</div>
                  <TargetHoursEditor
                    current={project.targetHours}
                    onSave={(h) => updateTargetHours.mutate({ projectId: project.id, targetHours: h })}
                    isPending={updateTargetHours.isPending}
                  />
                  {!project.targetHours && (
                    <form onSubmit={handleProgressSubmit} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Manual %:</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={progressDraft}
                        onChange={(e) => setProgressDraft(e.target.value)}
                        style={{ width: 80 }}
                      />
                      <button type="submit" className="btn btn-secondary" disabled={updateProgress.isPending} style={{ fontSize: '0.82rem' }}>
                        {updateProgress.isPending ? 'Saving…' : 'Set %'}
                      </button>
                    </form>
                  )}
                  {project.status !== 'COMPLETED' && (
                    project.status === 'IN_PROGRESS' ? (
                      <button type="button" className="btn btn-secondary" disabled={stopProject.isPending} onClick={() => stopProject.mutate(project.id)}>
                        {stopProject.isPending ? 'Stopping…' : 'Stop development'}
                      </button>
                    ) : (
                      <button type="button" className="btn btn-primary" disabled={startProject.isPending} onClick={() => startProject.mutate(project.id)}>
                        {startProject.isPending ? 'Starting…' : 'Start development'}
                      </button>
                    )
                  )}
                </div>
              )}

              {project.description && (
                <div>
                  {fieldLabel('Description')}
                  <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
                    {project.description}
                  </p>
                </div>
              )}
            </section>

            <section className="dp-detail-col" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Session history + reports added in Task 5 */}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd admin-web && npm run build`
Expected: builds successfully.

- [ ] **Step 3: Manual verification**

With `npm run dev` running, navigate to `/dev-projects/<id>` (as in Task 3) for a project you own as a `DEVELOPER`: confirm the "Timeframe" card with Start/Stop and target-hours editor appears and works (start it, confirm the live-tracked time ticks once per second, stop it). Then view the same project as `SUPER_ADMIN`/`ADMIN_STAFF`: confirm the date-based "Project Timeframe" card with "Edit Timeframe" appears instead, and saving a date range updates the displayed days-remaining badge.

- [ ] **Step 4: Commit**

```bash
git add admin-web/src/pages/DevProjectDetailPage.tsx
git commit -m "feat(admin-web): render status/progress/timeframe on dev project full page"
```

---

### Task 5: Right column — session history, reports, checklist, feedback, new report

**Files:**
- Modify: `admin-web/src/pages/DevProjectDetailPage.tsx`

**Interfaces:**
- Consumes (from Task 1, via `./DevProjectsPage`): `formatMinutes`, `ReportChecklist`.
- Consumes (from Task 4): `id`, `qc`, `invalidate`, `isSuperAdmin`, `isAdminStaff`, `canTagAdmins`, `user`.
- Produces: nothing consumed by later tasks (Task 6 only touches `DevProjectsPage.tsx`; Task 7 wraps this same file's render output in a print block using `project` data already in scope).

- [ ] **Step 1: Add imports, state, queries, mutations and handlers**

In `admin-web/src/pages/DevProjectDetailPage.tsx`, update the import block at the top:

```tsx
// before:
import { type FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ProgressBar } from '../components/ProgressBar';
import { StatusBadge } from '../components/StatusBadge';
import { useAuthStore } from '../lib/auth-store';
import type { DevProject } from '../lib/types';
import {
  computeProgress,
  daysRemaining,
  fieldLabel,
  formatLiveDuration,
  progressBasis,
  TargetHoursEditor,
  TimeframeEditor,
  useTick,
} from './DevProjectsPage';

// after:
import { type FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Linkify } from '../components/Linkify';
import { ProgressBar } from '../components/ProgressBar';
import { StatusBadge } from '../components/StatusBadge';
import { useAuthStore } from '../lib/auth-store';
import type { ChecklistItem, DevProject, DevProjectReport } from '../lib/types';
import {
  computeProgress,
  daysRemaining,
  fieldLabel,
  formatLiveDuration,
  formatMinutes,
  progressBasis,
  ReportChecklist,
  TargetHoursEditor,
  TimeframeEditor,
  useTick,
} from './DevProjectsPage';

const EMPTY_REPORT_FORM = { title: '', comment: '', taggedAdminId: '' };
```

Then replace this line:

```ts
// before:
  void canTagAdmins; // used starting Task 5
```

with the reviewers query, checklist/report/feedback state, mutations, and handlers:

```tsx
  const reviewersQuery = useQuery({
    queryKey: ['dev-projects', 'reviewers'],
    queryFn: async () => (await api.get<{ id: string; fullName: string; role: string }[]>('/dev-projects/reviewers')).data,
    enabled: canTagAdmins,
  });

  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [reportForm, setReportForm] = useState(EMPTY_REPORT_FORM);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistInput, setChecklistInput] = useState('');

  const updateChecklistItem = useMutation({
    mutationFn: ({ reportId, index, done, note }: { reportId: string; index: number; done?: boolean; note?: string }) =>
      api.patch<DevProject>(`/dev-projects/reports/${reportId}/checklist`, { index, done, note }),
    onSuccess: (res) => {
      if (id) qc.setQueryData(['dev-projects', id], res.data);
      invalidate();
    },
  });

  const addFeedback = useMutation({
    mutationFn: (reportId: string) =>
      api.post<DevProject>(`/dev-projects/reports/${reportId}/feedback`, { message: (feedbackDrafts[reportId] ?? '').trim() }),
    onSuccess: (res, reportId) => {
      if (id) qc.setQueryData(['dev-projects', id], res.data);
      invalidate();
      setFeedbackDrafts((prev) => ({ ...prev, [reportId]: '' }));
    },
  });

  const addReport = useMutation({
    mutationFn: () =>
      api.post<DevProject>(`/dev-projects/${id}/reports`, {
        title: reportForm.title.trim(),
        comment: reportForm.comment.trim() || undefined,
        checklist: checklistItems.map((item) => ({ label: item.label, done: item.done })),
        taggedAdminId: reportForm.taggedAdminId || undefined,
      }),
    onSuccess: (res) => {
      if (id) qc.setQueryData(['dev-projects', id], res.data);
      invalidate();
      setReportForm(EMPTY_REPORT_FORM);
      setChecklistItems([]);
      setChecklistInput('');
    },
  });

  const canEditChecklist = (report: DevProjectReport) => isSuperAdmin || report.authorId === user?.id;

  const handleAddChecklistItem = () => {
    const label = checklistInput.trim();
    if (!label) return;
    setChecklistItems((items) => [...items, { label, done: false }]);
    setChecklistInput('');
  };

  const toggleDraftItem = (index: number) => {
    setChecklistItems((items) => items.map((item, i) => (i === index ? { ...item, done: !item.done } : item)));
  };

  const removeDraftItem = (index: number) => {
    setChecklistItems((items) => items.filter((_, i) => i !== index));
  };

  const handleReportSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!reportForm.title.trim()) return;
    addReport.mutate();
  };
```

- [ ] **Step 2: Fill in the right column**

Replace:

```tsx
            <section className="dp-detail-col" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Session history + reports added in Task 5 */}
            </section>
```

with:

```tsx
            <section className="dp-detail-col" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {project.sessions && project.sessions.length > 0 && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem' }}>Session History</div>
                  <div className="card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 260, overflowY: 'auto' }}>
                    {project.sessions.map((s, i) => (
                      <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.75rem', fontSize: '0.85rem', padding: '0.4rem 0', borderBottom: i < (project.sessions?.length ?? 0) - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '0.1rem' }}>Started</div>
                          <div>{new Date(s.startedAt).toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '0.1rem' }}>Ended</div>
                          <div>{s.endedAt ? new Date(s.endedAt).toLocaleString() : <span style={{ color: 'var(--warning)' }}>In progress…</span>}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '0.1rem' }}>Duration</div>
                          <div style={{ fontWeight: 600 }}>{s.endedAt ? formatMinutes(s.minutes ?? 0) : '—'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem' }}>Reports</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 380, overflowY: 'auto' }}>
                  {(!project.reports || project.reports.length === 0) && (
                    <p style={{ color: 'var(--text-muted)', margin: 0 }}>No reports yet.</p>
                  )}
                  {project.reports?.map((report) => {
                    const canGiveFeedback = isSuperAdmin || (isAdminStaff && report.taggedAdminId === user?.id);
                    return (
                      <div key={report.id} style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.6rem 0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{report.title}</span>
                          <StatusBadge status={report.status} />
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                          {report.author?.fullName ?? 'Unknown'} · {new Date(report.createdAt).toLocaleString()}
                          {report.taggedAdmin && <> · Tagged: {report.taggedAdmin.fullName}</>}
                        </div>
                        {report.checklist.length > 0 && (
                          <ReportChecklist
                            key={report.id}
                            items={report.checklist}
                            editable={canEditChecklist(report)}
                            isPending={updateChecklistItem.isPending}
                            onToggle={(index, done) => updateChecklistItem.mutate({ reportId: report.id, index, done })}
                            onSaveNote={(index, note) => updateChecklistItem.mutate({ reportId: report.id, index, note })}
                          />
                        )}
                        {report.comment && <div style={{ fontSize: '0.9rem', marginBottom: '0.4rem' }}><Linkify text={report.comment} /></div>}

                        {report.feedback && report.feedback.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                            {report.feedback.map((f) => (
                              <div key={f.id} style={{ fontSize: '0.85rem' }}>
                                <span style={{ fontWeight: 600 }}>{f.author?.fullName ?? 'Admin'}</span>
                                <span style={{ color: 'var(--text-muted)' }}> · {new Date(f.createdAt).toLocaleString()}</span>
                                <div><Linkify text={f.message} /></div>
                              </div>
                            ))}
                          </div>
                        )}

                        {canGiveFeedback && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if ((feedbackDrafts[report.id] ?? '').trim()) addFeedback.mutate(report.id);
                            }}
                            style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}
                          >
                            <input
                              value={feedbackDrafts[report.id] ?? ''}
                              onChange={(e) => setFeedbackDrafts((prev) => ({ ...prev, [report.id]: e.target.value }))}
                              placeholder="Give feedback on this report…"
                              style={{ flex: 1 }}
                            />
                            <button type="submit" className="btn btn-secondary" disabled={addFeedback.isPending}>
                              {addFeedback.isPending ? 'Sending…' : 'Send'}
                            </button>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {canControl && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem' }}>New report</div>
                  <form onSubmit={handleReportSubmit}>
                    <div className="field">
                      <label htmlFor="dpd-report-title">Title</label>
                      <input
                        id="dpd-report-title"
                        required
                        value={reportForm.title}
                        onChange={(e) => setReportForm({ ...reportForm, title: e.target.value })}
                        placeholder="e.g., Weekly progress update"
                      />
                    </div>
                    <div className="field">
                      <label>Checklist</label>
                      {checklistItems.map((item, i) => (
                        <label key={i} className="checklist-item">
                          <input type="checkbox" checked={item.done} onChange={() => toggleDraftItem(i)} />
                          <span style={{ flex: 1, textDecoration: item.done ? 'line-through' : 'none' }}>{item.label}</span>
                          <button type="button" className="btn btn-secondary" style={{ padding: '0.1rem 0.5rem', fontSize: '0.75rem' }} onClick={() => removeDraftItem(i)}>
                            Remove
                          </button>
                        </label>
                      ))}
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                        <input
                          value={checklistInput}
                          onChange={(e) => setChecklistInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddChecklistItem();
                            }
                          }}
                          placeholder="Add a checklist item…"
                          style={{ flex: 1 }}
                        />
                        <button type="button" className="btn btn-secondary" onClick={handleAddChecklistItem}>
                          Add
                        </button>
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor="dpd-report-comment">Comment (optional)</label>
                      <textarea
                        id="dpd-report-comment"
                        rows={2}
                        value={reportForm.comment}
                        onChange={(e) => setReportForm({ ...reportForm, comment: e.target.value })}
                        placeholder="Notes for the reviewer…"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="dpd-report-tag">Tag admin to review (optional)</label>
                      <select
                        id="dpd-report-tag"
                        value={reportForm.taggedAdminId}
                        onChange={(e) => setReportForm({ ...reportForm, taggedAdminId: e.target.value })}
                      >
                        <option value="">No tag</option>
                        {reviewersQuery.data?.map((r) => (
                          <option key={r.id} value={r.id}>{r.fullName} ({r.role.replace(/_/g, ' ')})</option>
                        ))}
                      </select>
                    </div>
                    {addReport.isError && <p className="error-text">Failed to post report. Try again.</p>}
                    <button type="submit" className="btn btn-primary" disabled={addReport.isPending || !reportForm.title.trim()}>
                      {addReport.isPending ? 'Posting…' : 'Post report'}
                    </button>
                  </form>
                </div>
              )}
            </section>
```

- [ ] **Step 3: Type-check**

Run: `cd admin-web && npm run build`
Expected: builds successfully.

- [ ] **Step 4: Manual verification**

On `/dev-projects/<id>` for a project you own: post a new report with a checklist item, confirm it appears in the Reports list; tick the checklist item and add a note, confirm the ✓ timestamp and note appear. As an admin viewing the same project (or a different one with a tagged report), confirm the feedback textbox appears and posting feedback shows up under the report.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/pages/DevProjectDetailPage.tsx
git commit -m "feat(admin-web): render session history, reports and checklist on dev project full page"
```

---

### Task 6: "Open full page" link in both existing dialogs

**Files:**
- Modify: `admin-web/src/pages/DevProjectsPage.tsx`

**Interfaces:**
- No new interfaces — this only adds navigation from existing dialogs to the route added in Task 3.

- [ ] **Step 1: Import `useNavigate` and get a navigate function**

```ts
// before:
import { type FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

// after:
import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
```

```ts
// before:
export function DevProjectsPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

// after:
export function DevProjectsPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const navigate = useNavigate();
```

- [ ] **Step 2: Add the link to the admin "View Progress" dialog**

```tsx
// before:
      <Dialog isOpen={!!viewProgressId} onClose={() => setViewProgressId(null)} title={viewProject?.name ?? 'Project Progress'} maxWidth={1000}>
        {viewProgressQuery.isLoading && <p>Loading…</p>}
        {viewProject && (
          <div className="dp-detail-grid">

// after:
      <Dialog isOpen={!!viewProgressId} onClose={() => setViewProgressId(null)} title={viewProject?.name ?? 'Project Progress'} maxWidth={1000}>
        {viewProgressQuery.isLoading && <p>Loading…</p>}
        {viewProject && (
          <>
          <div style={{ marginBottom: '1rem', textAlign: 'right' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
              onClick={() => { navigate(`/dev-projects/${viewProject.id}`); setViewProgressId(null); }}
            >
              Open full page ↗
            </button>
          </div>
          <div className="dp-detail-grid">
```

Then close the added fragment right before that dialog ends:

```tsx
// before:
            </section>
          </div>
        )}
      </Dialog>

      <Dialog isOpen={!!selectedId} onClose={closeDetail} title={selectedProject?.name ?? ''} maxWidth={1100}>

// after:
            </section>
          </div>
          </>
        )}
      </Dialog>

      <Dialog isOpen={!!selectedId} onClose={closeDetail} title={selectedProject?.name ?? ''} maxWidth={1100}>
```

- [ ] **Step 3: Add the link to the developer/owner dialog**

```tsx
// before:
      <Dialog isOpen={!!selectedId} onClose={closeDetail} title={selectedProject?.name ?? ''} maxWidth={1100}>
        {detailQuery.isLoading && <p>Loading…</p>}
        {selectedProject && (
          <div className="dp-detail-grid">

// after:
      <Dialog isOpen={!!selectedId} onClose={closeDetail} title={selectedProject?.name ?? ''} maxWidth={1100}>
        {detailQuery.isLoading && <p>Loading…</p>}
        {selectedProject && (
          <>
          <div style={{ marginBottom: '1rem', textAlign: 'right' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
              onClick={() => { navigate(`/dev-projects/${selectedProject.id}`); closeDetail(); }}
            >
              Open full page ↗
            </button>
          </div>
          <div className="dp-detail-grid">
```

Then close the fragment at the end of that dialog's content:

```tsx
// before:
                  {addReport.isError && <p className="error-text">Failed to post report. Try again.</p>}
                  <button type="submit" className="btn btn-primary" disabled={addReport.isPending || !reportForm.title.trim()}>
                    {addReport.isPending ? 'Posting…' : 'Post report'}
                  </button>
                </form>
              </div>
            )}
            </section>
          </div>
        )}
      </Dialog>
    </div>
  );
}

// after:
                  {addReport.isError && <p className="error-text">Failed to post report. Try again.</p>}
                  <button type="submit" className="btn btn-primary" disabled={addReport.isPending || !reportForm.title.trim()}>
                    {addReport.isPending ? 'Posting…' : 'Post report'}
                  </button>
                </form>
              </div>
            )}
            </section>
          </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `cd admin-web && npm run build`
Expected: builds successfully.

- [ ] **Step 5: Manual verification**

Open the admin "View Progress" dialog on any project, click "Open full page ↗": confirm the dialog closes and the browser navigates to `/dev-projects/<id>` showing the same project. Repeat for the developer/owner "Open" dialog on a project you own.

- [ ] **Step 6: Commit**

```bash
git add admin-web/src/pages/DevProjectsPage.tsx
git commit -m "feat(admin-web): link from dev project dialogs to the new full page"
```

---

### Task 7: Print stylesheet, printable block, Print/Download PDF buttons

**Files:**
- Create: `admin-web/src/components/print/dev-project-print-styles.ts`
- Modify: `admin-web/src/pages/DevProjectDetailPage.tsx`

**Interfaces:**
- Consumes (from Task 2): `buildDevProjectReportFilename(name, id)`.
- Consumes (from Task 1, via `./DevProjectsPage`): `formatTrackedVsTarget`.

- [ ] **Step 1: Create the print stylesheet**

Create `admin-web/src/components/print/dev-project-print-styles.ts`:

```ts
export const DEV_PROJECT_PRINT_STYLE = `
@media print {
  body * { visibility: hidden; }
  #dev-project-print, #dev-project-print * { visibility: visible; }
  #dev-project-print {
    display: block !important;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    background: #fff;
    color: #000;
    z-index: 99999;
  }
  @page { margin: 15mm; }
}
`;
```

- [ ] **Step 2: Add imports and print-style injection to the page**

In `admin-web/src/pages/DevProjectDetailPage.tsx`, update the import block:

```ts
// before:
import { type FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Linkify } from '../components/Linkify';

// after:
import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import html2pdf from 'html2pdf.js';
import { api } from '../lib/api';
import { Linkify } from '../components/Linkify';
import { DEV_PROJECT_PRINT_STYLE } from '../components/print/dev-project-print-styles';
import { buildDevProjectReportFilename } from '../components/print/dev-project-report-filename.util';
```

Also add `formatTrackedVsTarget` to the existing `from './DevProjectsPage'` import list (alongside `formatMinutes`, etc.).

- [ ] **Step 3: Inject the stylesheet and add the print/download handlers**

Right after the `const [editingTimeframe, setEditingTimeframe] = useState(false);` line, add:

```tsx
  useEffect(() => {
    if (document.getElementById('dev-project-print-style')) return;
    const style = document.createElement('style');
    style.id = 'dev-project-print-style';
    style.textContent = DEV_PROJECT_PRINT_STYLE;
    document.head.appendChild(style);
    return () => {
      document.getElementById('dev-project-print-style')?.remove();
    };
  }, []);

  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    const element = document.getElementById('dev-project-print');
    if (!element || !project) return;
    setIsDownloading(true);
    const filename = buildDevProjectReportFilename(project.name, project.id);
    element.style.display = 'block';
    try {
      await html2pdf()
        .set({
          margin: [10, 10] as [number, number],
          filename,
          image: { type: 'jpeg' as const, quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
        })
        .from(element)
        .save();
    } finally {
      element.style.display = 'none';
      setIsDownloading(false);
    }
  };
```

- [ ] **Step 4: Add the Print/Download buttons to the header**

```tsx
// before:
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <h1 style={{ margin: 0 }}>{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>

// after:
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <h1 style={{ margin: 0 }}>{project.name}</h1>
            <StatusBadge status={project.status} />
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                onClick={() => window.print()}
              >
                Print
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                disabled={isDownloading}
                onClick={handleDownload}
              >
                {isDownloading ? 'Downloading…' : 'Download PDF'}
              </button>
            </div>
          </div>
```

- [ ] **Step 5: Add the printable block**

Add this right after the closing `</div>` of the header row from Step 4 (i.e. as the next sibling, before the `<div className="dp-detail-grid">`):

```tsx
          <div id="dev-project-print" style={{ display: 'none', padding: '1.5rem', fontFamily: 'Arial, sans-serif' }}>
            <h1 style={{ margin: '0 0 0.25rem' }}>{project.name}</h1>
            <p style={{ margin: '0 0 1rem', color: '#444' }}>
              Status: {project.status.replace(/_/g, ' ')} · Progress: {computeProgress(project)}% ({progressBasis(project)})
            </p>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '0.25rem 0', fontWeight: 700, width: '30%' }}>Developer</td>
                  <td style={{ padding: '0.25rem 0' }}>{project.developer?.fullName ?? '—'}</td>
                </tr>
                <tr>
                  <td style={{ padding: '0.25rem 0', fontWeight: 700 }}>Time tracked</td>
                  <td style={{ padding: '0.25rem 0' }}>{formatTrackedVsTarget(project)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '0.25rem 0', fontWeight: 700 }}>Start date</td>
                  <td style={{ padding: '0.25rem 0' }}>{project.projectStart ? new Date(project.projectStart).toLocaleDateString() : 'Not set'}</td>
                </tr>
                <tr>
                  <td style={{ padding: '0.25rem 0', fontWeight: 700 }}>Deadline</td>
                  <td style={{ padding: '0.25rem 0' }}>{project.projectDeadline ? new Date(project.projectDeadline).toLocaleDateString() : 'Not set'}</td>
                </tr>
              </tbody>
            </table>

            {project.description && (
              <p style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>{project.description}</p>
            )}

            {project.sessions && project.sessions.length > 0 && (
              <>
                <h2 style={{ fontSize: '1rem', margin: '1rem 0 0.5rem' }}>Session History</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '0.25rem' }}>Started</th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '0.25rem' }}>Ended</th>
                      <th style={{ textAlign: 'right', borderBottom: '1px solid #000', padding: '0.25rem' }}>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.sessions.map((s) => (
                      <tr key={s.id}>
                        <td style={{ padding: '0.25rem' }}>{new Date(s.startedAt).toLocaleString()}</td>
                        <td style={{ padding: '0.25rem' }}>{s.endedAt ? new Date(s.endedAt).toLocaleString() : 'In progress'}</td>
                        <td style={{ padding: '0.25rem', textAlign: 'right' }}>{s.endedAt ? formatMinutes(s.minutes ?? 0) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {project.reports && project.reports.length > 0 && (
              <>
                <h2 style={{ fontSize: '1rem', margin: '1rem 0 0.5rem' }}>Reports</h2>
                {project.reports.map((report) => (
                  <div key={report.id} style={{ marginBottom: '0.75rem', pageBreakInside: 'avoid' }}>
                    <div style={{ fontWeight: 700 }}>{report.title} — {report.status}</div>
                    <div style={{ fontSize: '0.8rem', color: '#444', marginBottom: '0.25rem' }}>
                      {report.author?.fullName ?? 'Unknown'} · {new Date(report.createdAt).toLocaleString()}
                    </div>
                    {report.checklist.length > 0 && (
                      <ul style={{ margin: '0 0 0.25rem', paddingLeft: '1.25rem' }}>
                        {report.checklist.map((item, i) => (
                          <li key={i}>
                            {item.done ? '☑' : '☐'} {item.label}
                            {item.done && item.doneAt && ` — ${new Date(item.doneAt).toLocaleString()}${item.doneBy ? ` (${item.doneBy})` : ''}`}
                            {item.note && ` — "${item.note}"`}
                          </li>
                        ))}
                      </ul>
                    )}
                    {report.comment && <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>{report.comment}</div>}
                    {report.feedback && report.feedback.length > 0 && (
                      <div style={{ paddingLeft: '1rem', borderLeft: '2px solid #ccc' }}>
                        {report.feedback.map((f) => (
                          <div key={f.id} style={{ fontSize: '0.8rem', marginBottom: '0.15rem' }}>
                            <strong>{f.author?.fullName ?? 'Admin'}</strong> ({new Date(f.createdAt).toLocaleString()}): {f.message}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
```

- [ ] **Step 6: Type-check**

Run: `cd admin-web && npm run build`
Expected: builds successfully.

- [ ] **Step 7: Manual verification**

On `/dev-projects/<id>`, click **Print**: confirm the browser print preview shows only the report content (no header buttons, no sidebar/nav chrome, no interactive checkboxes) with checklist items as ☑/☐ marks. Click **Download PDF**: confirm a PDF file named `dev-project-<slug>-<ID>.pdf` downloads and its content matches the print preview.

- [ ] **Step 8: Commit**

```bash
git add admin-web/src/components/print/dev-project-print-styles.ts admin-web/src/pages/DevProjectDetailPage.tsx
git commit -m "feat(admin-web): add print and PDF export to dev project full page"
```

---

## Self-Review Notes

- **Spec coverage:** Route + page (Task 3-5), navigation links (Task 6), print + PDF (Task 7), shared-helper reuse without touching dialog behavior (Task 1), non-goals respected (no new analytics anywhere, dialogs otherwise untouched) — all covered.
- **Type consistency:** `progressDraft`/`editingTimeframe`/mutation shapes introduced in Task 4 are consumed unchanged in Tasks 5 and 7; `id`, `qc`, `invalidate`, `isSuperAdmin`, `isAdminStaff`, `canTagAdmins`, `user`, `canControl` from Task 4 are reused as-is in Task 5; `project`, `computeProgress`, `progressBasis`, `formatMinutes`, `formatTrackedVsTarget` from Tasks 3-5 are reused as-is in Task 7's print block.
- **No placeholders:** every step has complete code; manual-verification steps name concrete UI actions rather than "test as needed".
