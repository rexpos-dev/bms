# Finara Leads Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Finara Leads" tab to the admin-web Download Leads page, showing inquiry leads proxied live from the external Finara ERP `/api/leads/export` API.

**Architecture:** A new guarded backend endpoint `GET /download-leads/finara` proxies the Finara API with a server-side `X-API-Key` (env `FINARA_API_KEY`), mirroring the existing TMS KPI proxy pattern in `src/kpis.service.ts`. The frontend page becomes a two-tab layout reusing the `TabButton` pattern from `LicensesPage.tsx`, with a client-side status filter and the shared `Pagination` component.

**Tech Stack:** NestJS (backend, Jest for tests), React + TanStack Query + Vite (admin-web).

**Spec:** `docs/superpowers/specs/2026-07-15-finara-leads-tab-design.md`

## Global Constraints

- Env vars: `FINARA_API_URL` (optional, default `https://finara.up.railway.app`), `FINARA_API_KEY` (required at request time — endpoint throws a friendly error if missing). The key must never be sent to or bundled into the frontend.
- Roles for the new endpoint: `SUPER_ADMIN`, `ADMIN_STAFF` (same as existing `GET /download-leads`).
- No database changes; the Finara data is never stored locally.
- Backend tests run from repo root: `npm test -- download-leads.service.spec`.
- Frontend has no unit tests; verify with `npx tsc -b --noEmit` inside `admin-web` (or `npm run build --prefix admin-web`).

---

### Task 1: Backend — `fetchFinaraLeads` service method + `GET /download-leads/finara` endpoint

**Files:**
- Test (create): `src/download-leads.service.spec.ts`
- Modify: `src/download-leads.service.ts` (add `FinaraLead` interface + `fetchFinaraLeads` method)
- Modify: `src/download-leads.controller.ts` (add guarded `@Get('finara')` route)

**Interfaces:**
- Consumes: `DownloadLeadsService` (existing, no constructor deps), `JwtAuthGuard`/`RolesGuard`/`Roles` already imported in the controller.
- Produces: `GET /download-leads/finara` returning `FinaraLead[]` JSON:
  ```ts
  export interface FinaraLead {
    id: number;
    name: string;
    company: string | null;
    email: string;
    phone: string | null;
    message: string | null;
    source: string | null;
    status: 'NEW' | 'CONTACTED' | 'CLOSED';
    createdAt: string;
  }
  ```
  Task 2's frontend type must match this shape.

- [ ] **Step 1: Write the failing tests**

Create `src/download-leads.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { DownloadLeadsService } from './download-leads.service';

describe('DownloadLeadsService.fetchFinaraLeads', () => {
  let service: DownloadLeadsService;
  const realFetch = global.fetch;
  const savedKey = process.env.FINARA_API_KEY;
  const savedUrl = process.env.FINARA_API_URL;

  beforeEach(() => {
    service = new DownloadLeadsService();
    delete process.env.FINARA_API_KEY;
    delete process.env.FINARA_API_URL;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  afterAll(() => {
    if (savedKey !== undefined) process.env.FINARA_API_KEY = savedKey;
    if (savedUrl !== undefined) process.env.FINARA_API_URL = savedUrl;
  });

  it('throws when FINARA_API_KEY is not configured', async () => {
    await expect(service.fetchFinaraLeads()).rejects.toThrow(
      'FINARA_API_KEY is not configured on the server.',
    );
  });

  it('returns the parsed lead array on success', async () => {
    process.env.FINARA_API_KEY = 'test-key';
    const leads = [
      {
        id: 7,
        name: 'Rex Domingo',
        company: 'ABC Trading',
        email: 'rextechpos@gmail.com',
        phone: '09357117604',
        message: 'Interested in the Professional plan.',
        source: 'pricing:professional',
        status: 'NEW',
        createdAt: '2026-07-15T03:16:10.569Z',
      },
    ];
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => leads,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(service.fetchFinaraLeads()).resolves.toEqual(leads);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toBe('https://finara.up.railway.app/api/leads/export');
    expect(calledInit.headers['X-API-Key']).toBe('test-key');
  });

  it('honors FINARA_API_URL override', async () => {
    process.env.FINARA_API_KEY = 'test-key';
    process.env.FINARA_API_URL = 'https://finara.example.com';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => [],
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(service.fetchFinaraLeads()).resolves.toEqual([]);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://finara.example.com/api/leads/export');
  });

  it('throws a friendly error on 401', async () => {
    process.env.FINARA_API_KEY = 'bad-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
    }) as unknown as typeof fetch;

    await expect(service.fetchFinaraLeads()).rejects.toThrow(
      'Finara API rejected the key (401 Unauthorized).',
    );
  });

  it('throws when the response is not JSON', async () => {
    process.env.FINARA_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
    }) as unknown as typeof fetch;

    await expect(service.fetchFinaraLeads()).rejects.toThrow(BadRequestException);
  });

  it('throws when the host is unreachable', async () => {
    process.env.FINARA_API_KEY = 'test-key';
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    await expect(service.fetchFinaraLeads()).rejects.toThrow('Could not reach the Finara API.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- download-leads.service.spec`
Expected: FAIL — `service.fetchFinaraLeads is not a function` (all 6 tests fail).

- [ ] **Step 3: Implement `fetchFinaraLeads` in the service**

In `src/download-leads.service.ts`, add after the imports (below the `PendingCode` interface is fine, top-level):

```ts
export interface FinaraLead {
  id: number;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  message: string | null;
  source: string | null;
  status: 'NEW' | 'CONTACTED' | 'CLOSED';
  createdAt: string;
}
```

Then add this method to the `DownloadLeadsService` class (after `verifyAndConsume`):

```ts
  // ── Finara Leads: external ERP integration ─────────────────────────────────

  /** Live proxy to the Finara ERP leads export — nothing is stored locally. */
  async fetchFinaraLeads(): Promise<FinaraLead[]> {
    const apiKey = process.env.FINARA_API_KEY;
    if (!apiKey) throw new BadRequestException('FINARA_API_KEY is not configured on the server.');

    const base = process.env.FINARA_API_URL ?? 'https://finara.up.railway.app';
    const url = new URL('/api/leads/export', base);

    const res = await fetch(url, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    }).catch(() => {
      throw new BadRequestException('Could not reach the Finara API.');
    });
    if (res.status === 401) throw new BadRequestException('Finara API rejected the key (401 Unauthorized).');
    if (!res.ok) throw new BadRequestException(`Finara API returned HTTP ${res.status}.`);

    // An invalid key could be redirected to an HTML page rather than a JSON
    // error, so guard against a non-JSON body.
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw new BadRequestException('Finara API did not return JSON — the API key may be invalid.');
    }

    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as FinaraLead[]) : [];
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- download-leads.service.spec`
Expected: PASS (6 tests).

- [ ] **Step 5: Add the controller route**

In `src/download-leads.controller.ts`, add this route **above** the existing `@Get()` `findAll()` (specific path before the catch-all keeps route intent obvious, though Nest matches exact paths either way):

```ts
  /** Admin view of inquiry leads from the external Finara ERP (live proxy). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN_STAFF)
  @Get('finara')
  findFinaraLeads() {
    return this.leads.fetchFinaraLeads();
  }
```

No new imports are needed — `Get`, `UseGuards`, `Roles`, `UserRole`, and the guards are already imported in this file.

- [ ] **Step 6: Verify the backend compiles and full test suite passes**

Run: `npx tsc -p tsconfig.build.json --noEmit` then `npm test`
Expected: no type errors; all suites PASS.

- [ ] **Step 7: Commit**

```bash
git add src/download-leads.service.ts src/download-leads.controller.ts src/download-leads.service.spec.ts
git commit -m "feat: proxy Finara ERP leads via GET /download-leads/finara"
```

---

### Task 2: Frontend — two-tab Download Leads page with Finara Leads table

**Files:**
- Modify: `admin-web/src/lib/types.ts` (add `FinaraLead` interface after `DownloadLead`, around line 105)
- Modify: `admin-web/src/pages/DownloadLeadsPage.tsx` (full rewrite below)

**Interfaces:**
- Consumes: `GET /download-leads/finara` from Task 1 returning `FinaraLead[]`; existing `api` axios instance (`../lib/api`), `Pagination`/`usePagination` (`../components/Pagination`), CSS vars `--accent`, `--accent-light`, `--warning`, `--warning-light`, `--success`, `--success-light`, `--text-muted`, `--border`, `--danger`.
- Produces: nothing consumed by later tasks (final task).

- [ ] **Step 1: Add the `FinaraLead` type**

In `admin-web/src/lib/types.ts`, directly after the `DownloadLead` interface closes, add:

```ts
export interface FinaraLead {
  id: number;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  message: string | null;
  source: string | null;
  status: 'NEW' | 'CONTACTED' | 'CLOSED';
  createdAt: string;
}
```

- [ ] **Step 2: Rewrite `DownloadLeadsPage.tsx` with tabs**

Replace the entire contents of `admin-web/src/pages/DownloadLeadsPage.tsx` with:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Smartphone, Monitor } from 'lucide-react';
import { api } from '../lib/api';
import { Pagination, usePagination } from '../components/Pagination';
import type { DownloadLead, FinaraLead } from '../lib/types';

function TabButton({ label, active, count, onClick }: { label: string; active: boolean; count?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '0.6rem 1.25rem',
        fontWeight: 600,
        fontSize: '0.9rem',
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        background: 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
      }}
    >
      {label}
      {count !== undefined && (
        <span style={{ fontSize: '0.72rem', background: active ? 'var(--accent)' : 'var(--border)', color: active ? '#fff' : 'var(--text-muted)', borderRadius: 999, padding: '0.1rem 0.45rem', fontWeight: 700 }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Download Leads Tab (our landing page) ──────────────────────────────────

function DownloadLeadsTab({ leads, isLoading, isError }: { leads: DownloadLead[]; isLoading: boolean; isError: boolean }) {
  const pg = usePagination(leads);

  return (
    <div className="card">
      {isLoading && <p>Loading leads…</p>}
      {isError && <p className="error-text">Failed to load leads.</p>}
      {!isLoading && !isError && leads.length === 0 && <p>No leads captured yet.</p>}
      {leads.length > 0 && (
        <>
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Contact Person</th>
                <th>Contact No</th>
                <th>Email</th>
                <th>Platform</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody className="stagger-rows">
              {pg.paginated.map((lead) => (
                <tr key={lead.id}>
                  <td style={{ fontWeight: 600 }}>{lead.companyName}</td>
                  <td>{lead.contactPerson}</td>
                  <td>{lead.contactNo}</td>
                  <td>
                    {lead.email ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    {lead.email && lead.emailVerified && (
                      <span
                        title="Email verified via OTP"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          marginLeft: 6,
                          fontSize: '0.7rem',
                          color: 'var(--success)',
                          fontWeight: 600,
                        }}
                      >
                        <BadgeCheck size={13} /> verified
                      </span>
                    )}
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.82rem' }}>
                      {lead.platform === 'ANDROID_APK' ? <Smartphone size={14} /> : <Monitor size={14} />}
                      {lead.platform === 'ANDROID_APK' ? 'Android APK' : 'Desktop PWA'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {new Date(lead.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={pg.page}
            pageSize={pg.pageSize}
            totalPages={pg.totalPages}
            total={pg.total}
            start={pg.start}
            onPage={pg.changePage}
            onPageSize={pg.changePageSize}
          />
        </>
      )}
    </div>
  );
}

// ── Finara Leads Tab (external ERP, live proxy) ────────────────────────────

const FINARA_STATUS_STYLES: Record<FinaraLead['status'], { bg: string; fg: string }> = {
  NEW: { bg: 'var(--accent-light)', fg: 'var(--accent)' },
  CONTACTED: { bg: 'var(--warning-light)', fg: 'var(--warning)' },
  CLOSED: { bg: 'var(--border)', fg: 'var(--text-muted)' },
};

function FinaraStatusBadge({ status }: { status: FinaraLead['status'] }) {
  const style = FINARA_STATUS_STYLES[status] ?? FINARA_STATUS_STYLES.CLOSED;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.15rem 0.55rem',
        borderRadius: 999,
        fontSize: '0.72rem',
        fontWeight: 700,
        background: style.bg,
        color: style.fg,
      }}
    >
      {status}
    </span>
  );
}

function FinaraLeadsTab({ leads, isLoading, error }: { leads: FinaraLead[]; isLoading: boolean; error: unknown }) {
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = statusFilter ? leads.filter((l) => l.status === statusFilter) : leads;
  const pg = usePagination(filtered);

  const errorMessage =
    (error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message ??
    'Failed to load Finara leads.';

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All statuses</option>
          <option value="NEW">New</option>
          <option value="CONTACTED">Contacted</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      {isLoading && <p>Loading Finara leads…</p>}
      {!!error && <p className="error-text">{errorMessage}</p>}
      {!isLoading && !error && filtered.length === 0 && (
        <p>{statusFilter ? 'No leads with this status.' : 'No Finara leads yet.'}</p>
      )}
      {filtered.length > 0 && (
        <>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Message</th>
                <th>Source</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody className="stagger-rows">
              {pg.paginated.map((lead) => (
                <tr key={lead.id}>
                  <td style={{ fontWeight: 600 }}>{lead.name}</td>
                  <td>{lead.company ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td>{lead.email}</td>
                  <td>{lead.phone ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td style={{ maxWidth: 280 }}>
                    <span title={lead.message ?? undefined} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lead.message ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{lead.source ?? '—'}</td>
                  <td><FinaraStatusBadge status={lead.status} /></td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {new Date(lead.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={pg.page}
            pageSize={pg.pageSize}
            totalPages={pg.totalPages}
            total={pg.total}
            start={pg.start}
            onPage={pg.changePage}
            onPageSize={pg.changePageSize}
          />
        </>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export function DownloadLeadsPage() {
  const [activeTab, setActiveTab] = useState<'downloads' | 'finara'>('downloads');

  const leadsQuery = useQuery({
    queryKey: ['download-leads'],
    queryFn: async () => (await api.get<DownloadLead[]>('/download-leads')).data,
  });

  const finaraQuery = useQuery({
    queryKey: ['finara-leads'],
    queryFn: async () => (await api.get<FinaraLead[]>('/download-leads/finara')).data,
    enabled: activeTab === 'finara',
    retry: false,
  });

  return (
    <div>
      <h1 style={{ marginBottom: '0.25rem' }}>Download Leads</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Companies that filled out the landing-page form before downloading the app or installing the
        desktop console.
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <TabButton
          label="Download Leads"
          active={activeTab === 'downloads'}
          count={leadsQuery.data?.length}
          onClick={() => setActiveTab('downloads')}
        />
        <TabButton
          label="Finara Leads"
          active={activeTab === 'finara'}
          count={finaraQuery.data?.length}
          onClick={() => setActiveTab('finara')}
        />
      </div>

      {activeTab === 'downloads' && (
        <DownloadLeadsTab leads={leadsQuery.data ?? []} isLoading={leadsQuery.isLoading} isError={leadsQuery.isError} />
      )}
      {activeTab === 'finara' && (
        <FinaraLeadsTab leads={finaraQuery.data ?? []} isLoading={finaraQuery.isLoading} error={finaraQuery.error} />
      )}
    </div>
  );
}
```

Notes on intent (keep these behaviors):
- The Finara query has `enabled: activeTab === 'finara'` so the external API is only hit when the tab is opened, and `retry: false` so a missing-key config error shows immediately instead of retrying three times.
- The existing Download Leads table markup is unchanged, only moved into `DownloadLeadsTab`.

- [ ] **Step 3: Type-check the frontend**

Run: `npx tsc -b --noEmit` (working directory `admin-web`)
Expected: exits 0 with no output. If `-b --noEmit` is rejected by the project references setup, run `npm run build --prefix admin-web` from the repo root instead and expect a successful Vite build.

- [ ] **Step 4: Commit**

```bash
git add admin-web/src/lib/types.ts admin-web/src/pages/DownloadLeadsPage.tsx
git commit -m "feat(admin-web): add Finara Leads tab to Download Leads page"
```

---

### Task 3: Env documentation + manual verification

**Files:**
- Modify: `.env.example` if it exists (check with `ls .env.example`); otherwise skip the file edit — the design doc already documents the vars.

**Interfaces:**
- Consumes: everything from Tasks 1–2.
- Produces: nothing (final verification).

- [ ] **Step 1: Document env vars if `.env.example` exists**

If the repo has a `.env.example`, append:

```
# Finara ERP leads integration (admin "Finara Leads" tab)
FINARA_API_URL=https://finara.up.railway.app
FINARA_API_KEY=
```

- [ ] **Step 2: Manual verification**

1. Ensure `.env` has `FINARA_API_KEY` set (ask the user — the real key must not be committed).
2. Start the backend (`npm run start:dev`) and admin-web (`npm run dev --prefix admin-web`).
3. Log in as an admin, open Download Leads: first tab shows the existing table unchanged.
4. Switch to "Finara Leads": rows load from the live API, status badges render, the status dropdown filters, pagination works.
5. Temporarily unset `FINARA_API_KEY` and restart the backend: the tab shows "FINARA_API_KEY is not configured on the server." instead of spinning.

- [ ] **Step 3: Commit (if `.env.example` was changed)**

```bash
git add .env.example
git commit -m "docs: document Finara leads env vars"
```
