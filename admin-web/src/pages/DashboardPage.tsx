import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';
import { ChartCard } from '../components/ChartCard';
import { SimpleBarChart, SimplePieChart } from '../components/SimpleChart';
import { Calendar } from '../components/Calendar';
import { Dialog } from '../components/Dialog';
import { StatusBadge } from '../components/StatusBadge';
import { Stagger, MotionItem, AnimatedNumber } from '../lib/motion';
import type { AuthenticatedUser, Client, DevProject, Earning, FinancialSummary, Job, JobOrder, KpiDashboard, License, UserRole, Withdrawal } from '../lib/types';

function useList<T>(key: string, url: string) {
  return useQuery({
    queryKey: [key],
    queryFn: async () => (await api.get<T[]>(url)).data,
  });
}

interface SummaryCard {
  label: string;
  value: string | number;
  total?: number;
  subtext?: string;
  color?: string;
}

function CardGrid({ cards }: { cards: SummaryCard[] }) {
  return (
    <Stagger
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '1.5rem',
        marginTop: '2rem',
      }}
    >
      {cards.map((card) => (
        <MotionItem key={card.label} className="card card--static">
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.4rem' }}>{card.label}</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: card.color }}>
            {typeof card.value === 'number' ? <AnimatedNumber value={card.value} /> : card.value}
          </div>
          {card.total !== undefined && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>of {card.total} total</div>
          )}
          {card.subtext && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{card.subtext}</div>
          )}
        </MotionItem>
      ))}
    </Stagger>
  );
}

function SuperAdminDashboard() {
  const clients = useList<Client>('dashboard-clients', '/clients');
  const licenses = useList<License>('dashboard-licenses', '/licenses');
  const jobs = useList<Job>('dashboard-jobs', '/jobs');
  const withdrawals = useList<Withdrawal>('dashboard-withdrawals', '/withdrawals');
  const financial = useQuery({
    queryKey: ['dashboard-financial'],
    queryFn: async () => (await api.get<FinancialSummary>('/kpis/financial-summary')).data,
  });

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const activeClients = clients.data?.filter((c) => c.status === 'ACTIVE').length ?? 0;
  const activatedLicenses = licenses.data?.filter((l) => l.status === 'ACTIVATED').length ?? 0;
  const pendingJobs = jobs.data?.filter((j) => j.jobStatus !== 'COMPLETED' && j.jobStatus !== 'CANCELLED').length ?? 0;
  const pendingWithdrawals = withdrawals.data?.filter((w) => w.status === 'PENDING').length ?? 0;

  const calendarEvents = jobs.data?.map((job) => ({
    date: new Date(job.scheduleDate),
    title: job.client?.businessName ?? 'Job',
    type: 'job' as const,
  })) ?? [];

  const selectedDateJobs = jobs.data?.filter(
    (j) => new Date(j.scheduleDate).toDateString() === selectedDate?.toDateString()
  ) ?? [];

  return (
    <>
      <CardGrid
        cards={[
          {
            label: 'Total Revenue',
            value: `₱${financial.data?.totalRevenue.toLocaleString() ?? '…'}`,
            subtext: 'All-time finalized sales',
            color: 'var(--success)',
          },
          {
            label: 'Monthly Growth',
            value: `${(financial.data?.growth ?? 0) >= 0 ? '+' : ''}${financial.data?.growth.toFixed(1) ?? '…'}%`,
            subtext: 'From previous month',
            color: (financial.data?.growth ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)',
          },
          { label: 'Active Clients', value: activeClients, total: clients.data?.length ?? 0 },
          { label: 'Activated Licenses', value: activatedLicenses, total: licenses.data?.length ?? 0 },
          { label: 'Open Installation Jobs', value: pendingJobs, total: jobs.data?.length ?? 0 },
          { label: 'Pending Withdrawals', value: pendingWithdrawals, total: withdrawals.data?.length ?? 0 },
        ]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '2.5rem', marginTop: '2.5rem' }}>
        <ChartCard
          title="Licenses by Status"
          subtitle="Overall license distribution"
        >
          <SimplePieChart
            data={[
              { label: 'Activated', value: licenses.data?.filter((l) => l.status === 'ACTIVATED').length ?? 0 },
              { label: 'Pending', value: licenses.data?.filter((l) => l.status === 'PENDING').length ?? 0 },
              { label: 'Expired', value: licenses.data?.filter((l) => l.status === 'EXPIRED').length ?? 0 },
            ]}
            size={300}
          />
        </ChartCard>

        <ChartCard
          title="Installation Jobs"
          subtitle="Jobs by status"
        >
          <SimpleBarChart
            data={[
              { label: 'Active', value: jobs.data?.filter((j) => j.jobStatus === 'ON_GOING' || j.jobStatus === 'ASSIGNED').length ?? 0, color: 'var(--info)' },
              { label: 'Waiting', value: jobs.data?.filter((j) => j.jobStatus === 'WAITING_ACTIVATION').length ?? 0, color: 'var(--warning)' },
              { label: 'Completed', value: jobs.data?.filter((j) => j.jobStatus === 'COMPLETED').length ?? 0, color: 'var(--success)' },
            ]}
          />
        </ChartCard>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <Calendar events={calendarEvents} onDateSelect={(d) => setSelectedDate(d)} />
      </div>

      <Dialog
        isOpen={!!selectedDate}
        onClose={() => setSelectedDate(null)}
        title={selectedDate ? selectedDate.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}
        maxWidth={640}
      >
        {selectedDateJobs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No jobs scheduled on this date.</p>
        ) : (
          <table style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Client</th>
                <th>Status</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {selectedDateJobs.map((job) => (
                <tr key={job.id}>
                  <td style={{ fontWeight: 500 }}>{job.client?.businessName ?? '—'}</td>
                  <td><StatusBadge status={job.jobStatus} /></td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{job.remarks ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setSelectedDate(null)}>Close</button>
        </div>
      </Dialog>
    </>
  );
}

function InstallerDashboard() {
  const jobs = useList<Job>('dashboard-my-jobs', '/jobs');
  const earnings = useList<Earning>('dashboard-my-earnings', '/earnings');
  const withdrawals = useList<Withdrawal>('dashboard-my-withdrawals', '/withdrawals');

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const activeJobs = jobs.data?.filter((j) => j.jobStatus === 'ASSIGNED' || j.jobStatus === 'ON_GOING').length ?? 0;
  const awaitingActivation = jobs.data?.filter((j) => j.jobStatus === 'WAITING_ACTIVATION').length ?? 0;
  const completedJobs = jobs.data?.filter((j) => j.jobStatus === 'COMPLETED').length ?? 0;
  const pendingEarnings = earnings.data?.filter((e) => e.status === 'PENDING').length ?? 0;

  const calendarEvents = jobs.data?.map((job) => ({
    date: new Date(job.scheduleDate),
    title: job.client?.businessName ?? 'Job Assignment',
    type: 'job' as const,
  })) ?? [];

  const selectedDateJobs = jobs.data?.filter(
    (j) => new Date(j.scheduleDate).toDateString() === selectedDate?.toDateString()
  ) ?? [];

  return (
    <>
      <CardGrid
        cards={[
          { label: 'Active Jobs', value: activeJobs, total: jobs.data?.length ?? 0 },
          { label: 'Awaiting Activation', value: awaitingActivation, total: jobs.data?.length ?? 0 },
          { label: 'Completed Jobs', value: completedJobs, total: jobs.data?.length ?? 0 },
          { label: 'Pending Earnings', value: pendingEarnings, total: earnings.data?.length ?? 0 },
        ]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '2.5rem', marginTop: '2.5rem' }}>
        <ChartCard
          title="Job Status Distribution"
          subtitle="Your job breakdown"
        >
          <SimplePieChart
            data={[
              { label: 'Active', value: activeJobs },
              { label: 'Awaiting Activation', value: awaitingActivation },
              { label: 'Completed', value: completedJobs },
            ]}
            size={300}
          />
        </ChartCard>

        <ChartCard
          title="Earnings Progress"
          subtitle="Pending vs approved earnings"
        >
          <SimpleBarChart
            data={[
              { label: 'Pending', value: pendingEarnings, color: 'var(--warning)' },
              { label: 'Approved', value: earnings.data?.filter((e) => e.status === 'APPROVED').length ?? 0, color: 'var(--success)' },
            ]}
          />
        </ChartCard>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <Calendar events={calendarEvents} onDateSelect={(d) => setSelectedDate(d)} />
      </div>

      <Dialog
        isOpen={!!selectedDate}
        onClose={() => setSelectedDate(null)}
        title={selectedDate ? selectedDate.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}
        maxWidth={640}
      >
        {selectedDateJobs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No jobs scheduled on this date.</p>
        ) : (
          <table style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Client</th>
                <th>Status</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {selectedDateJobs.map((job) => (
                <tr key={job.id}>
                  <td style={{ fontWeight: 500 }}>{job.client?.businessName ?? '—'}</td>
                  <td><StatusBadge status={job.jobStatus} /></td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{job.remarks ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setSelectedDate(null)}>Close</button>
        </div>
      </Dialog>

      <KpiWidget />

      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '1.5rem' }}>
        {(withdrawals.data?.filter((w) => w.status === 'PENDING').length ?? 0)} withdrawal request(s) pending review.
        Head to <strong>My Jobs</strong> to start an assignment or upload proof of installation.
      </p>
    </>
  );
}

function DeveloperDashboard() {
  const user = useAuthStore((s) => s.user) as AuthenticatedUser | null;
  const licenses = useList<License>('dashboard-licenses-dev', '/licenses');
  const earnings = useList<Earning>('dashboard-my-earnings', '/earnings');
  const withdrawals = useList<Withdrawal>('dashboard-my-withdrawals', '/withdrawals');

  const pendingActivations = licenses.data?.filter((l) => l.status === 'PENDING').length ?? 0;
  const activatedByMe = licenses.data?.filter((l) => l.activatedById === user?.id).length ?? 0;
  const pendingEarnings = earnings.data?.filter((e) => e.status === 'PENDING').length ?? 0;
  const pendingWithdrawals = withdrawals.data?.filter((w) => w.status === 'PENDING').length ?? 0;

  // Generate sample events for calendar
  const calendarEvents = licenses.data?.slice(0, 5).map((license, idx) => ({
    date: new Date(Date.now() + idx * 86400000),
    title: `License #${license.id.slice(0, 8)}`,
    type: 'deadline' as const,
  })) ?? [];

  return (
    <>
      <CardGrid
        cards={[
          { label: 'Pending Activations', value: pendingActivations, total: licenses.data?.length ?? 0 },
          { label: 'Activated by Me', value: activatedByMe, total: licenses.data?.length ?? 0 },
          { label: 'Pending Earnings', value: pendingEarnings, total: earnings.data?.length ?? 0 },
          { label: 'Pending Withdrawals', value: pendingWithdrawals, total: withdrawals.data?.length ?? 0 },
        ]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '2.5rem', marginTop: '2.5rem' }}>
        <ChartCard
          title="License Status"
          subtitle="Overall license distribution"
        >
          <SimplePieChart
            data={[
              { label: 'Pending', value: pendingActivations },
              { label: 'Activated by Me', value: activatedByMe },
              { label: 'Other', value: licenses.data?.filter((l) => l.activatedById !== user?.id && l.status !== 'PENDING').length ?? 0 },
            ]}
            size={300}
          />
        </ChartCard>

        <ChartCard
          title="Earnings & Withdrawals"
          subtitle="Financial overview"
        >
          <SimpleBarChart
            data={[
              { label: 'Pending Earnings', value: pendingEarnings, color: 'var(--warning)' },
              { label: 'Approved', value: earnings.data?.filter((e) => e.status === 'APPROVED').length ?? 0, color: 'var(--success)' },
              { label: 'Pending Withdrawals', value: pendingWithdrawals, color: 'var(--danger)' },
            ]}
          />
        </ChartCard>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <Calendar events={calendarEvents} />
      </div>

      <KpiWidget />

      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '1.5rem' }}>
        Head to <strong>Licenses</strong> to activate a license on-site by binding it to the
        device's hardware fingerprint via an RSA-4096-signed JWT token.
      </p>
    </>
  );
}

// ── KPI Widget (shared by installer/developer/designer) ─────────────────────

function KpiWidget() {
  const now = new Date();
  const kpi = useQuery({
    queryKey: ['my-kpi-dashboard', now.getMonth() + 1, now.getFullYear()],
    queryFn: async () =>
      (await api.get<KpiDashboard>(`/kpis/dashboard?month=${now.getMonth() + 1}&year=${now.getFullYear()}`)).data,
  });

  if (kpi.isPending) return <div className="card" style={{ marginTop: '2rem' }}>Loading KPI data…</div>;
  if (!kpi.data || kpi.data.kpis.length === 0) return null;

  const { kpis, totalScore, incentiveEstimate, incentiveStatus, incentiveAmount } = kpi.data;

  const scoreColor = totalScore >= 95 ? 'var(--success)' : totalScore >= 80 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className="card" style={{ marginTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>My KPI — {now.toLocaleString('default', { month: 'long' })} {now.getFullYear()}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Performance scorecard</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: scoreColor }}>{totalScore.toFixed(1)}<span style={{ fontSize: '1rem' }}>/100</span></div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Incentive: <strong style={{ color: 'var(--success)' }}>
              {incentiveStatus === 'PAID' ? `₱${Number(incentiveAmount ?? 0).toLocaleString()} (Paid)` :
               incentiveStatus === 'APPROVED' ? `₱${Number(incentiveAmount ?? 0).toLocaleString()} (Approved)` :
               `₱${incentiveEstimate.toLocaleString()} (est.)`}
            </strong>
          </div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <th style={{ textAlign: 'left', padding: '0.4rem 0', fontWeight: 600 }}>KPI</th>
            <th style={{ textAlign: 'right', padding: '0.4rem 0', fontWeight: 600 }}>Actual</th>
            <th style={{ textAlign: 'right', padding: '0.4rem 0', fontWeight: 600 }}>Target</th>
            <th style={{ textAlign: 'right', padding: '0.4rem 0', fontWeight: 600 }}>Weight</th>
            <th style={{ textAlign: 'right', padding: '0.4rem 0', fontWeight: 600 }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {kpis.map((k) => {
            const pct = k.target > 0 ? Math.min(k.actual / k.target, 1) : 0;
            const barColor = pct >= 0.95 ? 'var(--success)' : pct >= 0.8 ? 'var(--warning)' : 'var(--danger)';
            return (
              <tr key={k.name} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.5rem 0' }}>
                  <div>{k.name}</div>
                  <div style={{ background: 'var(--border)', borderRadius: 4, height: 4, marginTop: 4, width: 140 }}>
                    <div style={{ background: barColor, borderRadius: 4, height: 4, width: `${pct * 100}%` }} />
                  </div>
                </td>
                <td style={{ textAlign: 'right', padding: '0.5rem 0' }}>
                  {k.isManual ? '—' : `${k.actual}${k.unit === '%' ? '%' : ''}`}
                  {k.isManual && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}> (manual)</span>}
                </td>
                <td style={{ textAlign: 'right', padding: '0.5rem 0', color: 'var(--text-muted)' }}>{k.target}{k.unit === '%' ? '%' : ''}</td>
                <td style={{ textAlign: 'right', padding: '0.5rem 0', color: 'var(--text-muted)' }}>{k.weight}%</td>
                <td style={{ textAlign: 'right', padding: '0.5rem 0', fontWeight: 700 }}>{k.score.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Designer Dashboard ────────────────────────────────────────────────────────

function DesignerDashboard() {
  const earnings = useList<Earning>('dashboard-my-earnings', '/earnings');
  const withdrawals = useList<Withdrawal>('dashboard-my-withdrawals', '/withdrawals');

  const pendingEarnings = earnings.data?.filter((e) => e.status === 'PENDING').length ?? 0;
  const approvedEarnings = earnings.data?.filter((e) => e.status === 'APPROVED').length ?? 0;
  const pendingWithdrawals = withdrawals.data?.filter((w) => w.status === 'PENDING').length ?? 0;

  return (
    <>
      <CardGrid
        cards={[
          { label: 'Pending Earnings', value: pendingEarnings, total: earnings.data?.length ?? 0 },
          { label: 'Approved Earnings', value: approvedEarnings, total: earnings.data?.length ?? 0 },
          { label: 'Pending Withdrawals', value: pendingWithdrawals, total: withdrawals.data?.length ?? 0 },
        ]}
      />
      <KpiWidget />
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '1.5rem' }}>
        Your KPI metrics are entered by your manager each month. Head to <strong>Withdrawals</strong> to request a payout.
      </p>
    </>
  );
}

// ── Liaison Dashboard ─────────────────────────────────────────────────────────

function LiaisonDashboard() {
  const earnings = useList<Earning>('dashboard-my-earnings', '/earnings');
  const withdrawals = useList<Withdrawal>('dashboard-my-withdrawals', '/withdrawals');
  const clients = useList<Client>('dashboard-clients', '/clients');

  const pendingEarnings = earnings.data?.filter((e) => e.status === 'PENDING').length ?? 0;
  const approvedEarnings = earnings.data?.filter((e) => e.status === 'APPROVED').length ?? 0;
  const activeClients = clients.data?.filter((c) => c.status === 'ACTIVE').length ?? 0;
  const pendingWithdrawals = withdrawals.data?.filter((w) => w.status === 'PENDING').length ?? 0;

  return (
    <>
      <CardGrid
        cards={[
          { label: 'Active Clients', value: activeClients, total: clients.data?.length ?? 0 },
          { label: 'Pending Earnings', value: pendingEarnings, total: earnings.data?.length ?? 0 },
          { label: 'Approved Earnings', value: approvedEarnings, total: earnings.data?.length ?? 0 },
          { label: 'Pending Withdrawals', value: pendingWithdrawals, total: withdrawals.data?.length ?? 0 },
        ]}
      />
      <KpiWidget />
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '1.5rem' }}>
        Coordinate with clients and manage your earnings. Head to <strong>Withdrawals</strong> to request a payout.
        Your KPI metrics are entered by your manager each month.
      </p>
    </>
  );
}

// ── Admin Staff Dashboard ─────────────────────────────────────────────────────

function AdminStaffDashboard() {
  const earnings = useList<Earning>('dashboard-my-earnings', '/earnings');
  const withdrawals = useList<Withdrawal>('dashboard-my-withdrawals', '/withdrawals');
  const jobs = useList<Job>('dashboard-jobs', '/jobs');

  const totalEarnings = earnings.data?.length ?? 0;
  const pendingWithdrawals = withdrawals.data?.filter((w) => w.status === 'PENDING').length ?? 0;
  const activeJobs = jobs.data?.filter((j) => j.jobStatus === 'ASSIGNED' || j.jobStatus === 'ON_GOING').length ?? 0;

  return (
    <>
      <CardGrid
        cards={[
          { label: 'Active Jobs', value: activeJobs, total: jobs.data?.length ?? 0 },
          { label: 'Total Earnings', value: totalEarnings, total: totalEarnings },
          { label: 'Pending Withdrawals', value: pendingWithdrawals, total: withdrawals.data?.length ?? 0 },
        ]}
      />
      <KpiWidget />
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '1.5rem' }}>
        Manage administrative tasks and monitor system activities. Visit <strong>Audit Logs</strong> to review system events.
        Your KPI metrics are entered by your manager each month.
      </p>
    </>
  );
}

// ── Sales Staff Dashboard ─────────────────────────────────────────────────────

function SalesStaffDashboard() {
  const navigate = useNavigate();

  const clients    = useList<Client>('dashboard-clients', '/clients');
  const softwareJOs = useList<JobOrder>('dashboard-jo-software', '/job-orders');
  const earnings   = useList<Earning>('dashboard-my-earnings', '/earnings');
  const balanceQuery = useQuery({
    queryKey: ['dashboard-balance'],
    queryFn: async () => (await api.get<{ availableBalance: number }>('/withdrawals/balance')).data,
  });

  /* ── Derived stats ── */
  const allJOs = softwareJOs.data ?? [];

  const activeClients  = clients.data?.filter((c) => c.status === 'ACTIVE').length ?? 0;
  const totalClients   = clients.data?.length ?? 0;

  const pipelineJOs    = allJOs.filter((j) => j.status === 'FINALIZED' || j.status === 'ON_GOING' || j.status === 'COMPLETED');
  const pipelineValue  = pipelineJOs.reduce((sum, j) => sum + Number(j.salePrice), 0);

  const pendingEarningsAmt  = earnings.data?.filter((e) => e.status === 'PENDING').reduce((s, e) => s + Number(e.amount), 0) ?? 0;
  const approvedEarningsAmt = earnings.data?.filter((e) => e.status === 'APPROVED').reduce((s, e) => s + Number(e.amount), 0) ?? 0;
  const availableBalance    = balanceQuery.data?.availableBalance ?? 0;

  /* ── Chart data ── */
  const joStatusData = [
    { label: 'Draft',     value: allJOs.filter((j) => j.status === 'DRAFT').length,     color: '#64748b' },
    { label: 'Finalized', value: allJOs.filter((j) => j.status === 'FINALIZED').length, color: '#6366f1' },
    { label: 'On-Going',  value: allJOs.filter((j) => j.status === 'ON_GOING').length,  color: '#38bdf8' },
    { label: 'Completed', value: allJOs.filter((j) => j.status === 'COMPLETED').length, color: '#4ade80' },
    { label: 'Cancelled', value: allJOs.filter((j) => j.status === 'CANCELLED').length, color: '#f87171' },
  ].filter((d) => d.value > 0);

  const clientStatusData = [
    { label: 'Active',    value: clients.data?.filter((c) => c.status === 'ACTIVE').length ?? 0,    color: '#4ade80' },
    { label: 'Expired',   value: clients.data?.filter((c) => c.status === 'EXPIRED').length ?? 0,   color: '#64748b' },
    { label: 'Suspended', value: clients.data?.filter((c) => c.status === 'SUSPENDED').length ?? 0, color: '#fbbf24' },
    { label: 'Cancelled', value: clients.data?.filter((c) => c.status === 'CANCELLED').length ?? 0, color: '#f87171' },
  ].filter((d) => d.value > 0);

  /* ── Recent job orders (latest 5 across both types) ── */
  const recentJOs = [...allJOs]
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 5);

  return (
    <>
      {/* ── Stats row ── */}
      <CardGrid
        cards={[
          {
            label: 'Active Clients',
            value: activeClients,
            total: totalClients,
            color: 'var(--success)',
          },
          {
            label: 'Total Job Orders',
            value: allJOs.length,
            subtext: `${softwareJOs.data?.length ?? 0} Software`,
          },
          {
            label: 'Sales Pipeline',
            value: `₱${pipelineValue.toLocaleString()}`,
            subtext: `${pipelineJOs.length} finalized / active JOs`,
            color: 'var(--accent)',
          },
          {
            label: 'Available Balance',
            value: balanceQuery.isLoading ? '…' : `₱${availableBalance.toLocaleString()}`,
            subtext: `₱${pendingEarningsAmt.toLocaleString()} pending · ₱${approvedEarningsAmt.toLocaleString()} approved`,
            color: availableBalance > 0 ? 'var(--success)' : undefined,
          },
        ]}
      />

      {/* ── Charts row ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: '2rem',
          marginTop: '2.5rem',
        }}
      >
        <ChartCard title="Job Orders by Status" subtitle="Your full pipeline breakdown">
          {joStatusData.length > 0 ? (
            <SimpleBarChart data={joStatusData} height={240} />
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>No job orders yet.</p>
          )}
        </ChartCard>

        <ChartCard title="Client Portfolio" subtitle="Distribution by account status">
          {clientStatusData.length > 0 ? (
            <SimplePieChart data={clientStatusData} size={200} />
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>No clients yet.</p>
          )}
        </ChartCard>
      </div>

      {/* ── Recent Job Orders ── */}
      <div style={{ marginTop: '2.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.875rem',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Recent Job Orders</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
              onClick={() => navigate('/job-orders/software')}
            >
              Software JOs
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {recentJOs.length === 0 ? (
            <p style={{ padding: '1.5rem', margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No job orders yet. Create your first job order to get started.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Sale Price</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentJOs.map((jo) => (
                  <tr
                    key={jo.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      if (jo.jobId) navigate(`/job-orders/${jo.jobId}`);
                    }}
                  >
                    <td style={{ fontWeight: 600 }}>{jo.client?.businessName ?? '—'}</td>
                    <td style={{ fontWeight: 600 }}>₱{Number(jo.salePrice).toLocaleString()}</td>
                    <td>
                      <StatusBadge status={jo.status} />
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      {jo.createdAt
                        ? new Date(jo.createdAt).toLocaleDateString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── KPI scorecard ── */}
      <div style={{ marginTop: '2.5rem' }}>
        <KpiWidget />
      </div>
    </>
  );
}

// ── Quick Actions (admin roles only) ─────────────────────────────────────────

function generateClientCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'CLT-';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const EMPTY_CLIENT_FORM = { clientCode: '', businessName: '', ownerName: '', contactNo: '', email: '', address: '', clientType: 'SOFTWARE' as 'SOFTWARE' | 'ADVERTISING' };

function QuickActions() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [showClient, setShowClient] = useState(false);
  const [clientForm, setClientForm] = useState({ ...EMPTY_CLIENT_FORM, clientCode: generateClientCode() });

  const createClient = useMutation({
    mutationFn: () => api.post<Client>('/clients', clientForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      setClientForm({ ...EMPTY_CLIENT_FORM, clientCode: generateClientCode() });
      setShowClient(false);
    },
  });

  return (
    <>
      {/* Buttons — rendered inline beside the welcome heading via DashboardPage flex row */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ fontSize: '0.875rem' }}
          onClick={() => { setClientForm({ ...EMPTY_CLIENT_FORM, clientCode: generateClientCode() }); setShowClient(true); }}
        >
          + New Client
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ fontSize: '0.875rem' }}
          onClick={() => navigate('/job-orders/software')}
        >
          + Create Job Order
        </button>
      </div>

      {/* New Client dialog */}
      <Dialog isOpen={showClient} onClose={() => setShowClient(false)} title="New Client" maxWidth={520}>
        <form onSubmit={(e) => { e.preventDefault(); createClient.mutate(); }}>
          {/* Client type toggle */}
          <div className="field">
            <label>Client type</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(['SOFTWARE', 'ADVERTISING'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setClientForm({ ...clientForm, clientType: t })}
                  style={{
                    flex: 1,
                    padding: '0.6rem 1rem',
                    borderRadius: 8,
                    border: `2px solid ${clientForm.clientType === t ? 'var(--accent)' : 'var(--border)'}`,
                    background: clientForm.clientType === t ? 'rgba(79,70,229,0.08)' : 'var(--surface)',
                    color: clientForm.clientType === t ? 'var(--accent)' : 'var(--text)',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  {t === 'SOFTWARE' ? '💻 Software / POS' : '🎨 Advertising / Design'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
            <div className="field">
              <label>Client code</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input
                  required
                  value={clientForm.clientCode}
                  onChange={(e) => setClientForm({ ...clientForm, clientCode: e.target.value })}
                  style={{ flex: 1, fontFamily: 'monospace' }}
                />
                <button type="button" className="btn btn-secondary" title="Regenerate" onClick={() => setClientForm({ ...clientForm, clientCode: generateClientCode() })}>↺</button>
              </div>
            </div>
            <div className="field">
              <label>Business name</label>
              <input required value={clientForm.businessName} onChange={(e) => setClientForm({ ...clientForm, businessName: e.target.value })} />
            </div>
            <div className="field">
              <label>Owner name</label>
              <input required value={clientForm.ownerName} onChange={(e) => setClientForm({ ...clientForm, ownerName: e.target.value })} />
            </div>
            <div className="field">
              <label>Contact no.</label>
              <input required value={clientForm.contactNo} onChange={(e) => setClientForm({ ...clientForm, contactNo: e.target.value })} />
            </div>
            <div className="field">
              <label>Email (optional)</label>
              <input type="email" value={clientForm.email} onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })} />
            </div>
            <div className="field">
              <label>Address (optional)</label>
              <input value={clientForm.address} onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })} />
            </div>
          </div>
          {createClient.isError && <p className="error-text">Could not create the client. Try again.</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={createClient.isPending} style={{ flex: 1 }}>
              {createClient.isPending ? 'Saving…' : 'Save client'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowClient(false)}>Cancel</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

// ── Additional Role Tasks widget ──────────────────────────────────────────────

const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: 'Admin',
  INSTALLER: 'Installer',
  DEVELOPER: 'Developer',
  DESIGNER: 'Designer',
  LIAISON: 'Liaison',
  ADMIN_STAFF: 'Admin Staff',
  SALES_STAFF: 'Sales Staff',
};

function RoleTaskCard({ role, userId }: { role: UserRole; userId: string }) {
  const jobs     = useQuery({ queryKey: ['role-tasks-jobs', userId], queryFn: async () => (await api.get<Job[]>('/jobs')).data, enabled: role === 'INSTALLER' });
  const licenses = useQuery({ queryKey: ['role-tasks-licenses', userId], queryFn: async () => (await api.get<License[]>('/licenses')).data, enabled: role === 'DEVELOPER' });
  const devProjs = useQuery({ queryKey: ['role-tasks-dev', userId], queryFn: async () => (await api.get<DevProject[]>('/dev-projects')).data, enabled: role === 'DEVELOPER' });

  type Stat = { label: string; value: number; color?: string; to?: string };
  const stats: Stat[] = [];
  let link = '/';

  if (role === 'INSTALLER') {
    const data = jobs.data ?? [];
    const active = data.filter(j => j.jobStatus === 'ASSIGNED' || j.jobStatus === 'ON_GOING').length;
    const waiting = data.filter(j => j.jobStatus === 'WAITING_ACTIVATION').length;
    stats.push({ label: 'Active jobs', value: active, color: 'var(--info)', to: '/jobs' });
    stats.push({ label: 'Awaiting activation', value: waiting, color: 'var(--warning)', to: '/jobs' });
    link = '/jobs';
  } else if (role === 'DEVELOPER') {
    const pendingLic = (licenses.data ?? []).filter(l => l.status === 'PENDING').length;
    const activeProj = (devProjs.data ?? []).filter(p => p.status === 'IN_PROGRESS' || p.status === 'NOT_STARTED').length;
    stats.push({ label: 'Pending activations', value: pendingLic, color: 'var(--warning)', to: '/licenses' });
    stats.push({ label: 'Active projects', value: activeProj, color: 'var(--info)', to: '/dev-projects' });
    link = '/dev-projects';
  }

  if (stats.length === 0) return null;

  const isLoading = jobs.isLoading || licenses.isLoading || devProjs.isLoading;

  return (
    <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{ROLE_LABEL[role]} Tasks</div>
        <a href={link} style={{ fontSize: '0.78rem', color: 'var(--accent)', textDecoration: 'none' }}>View all →</a>
      </div>
      {isLoading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {stats.map((s) => (
            <div key={s.label}>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdditionalRoleTasks({ user }: { user: AuthenticatedUser }) {
  const additionalRoles = (user.roles ?? []).filter(r => r !== user.role);
  const SUPPORTED: UserRole[] = ['INSTALLER', 'DEVELOPER'];
  const toShow = additionalRoles.filter(r => SUPPORTED.includes(r));
  if (toShow.length === 0) return null;

  return (
    <div style={{ marginTop: '2rem' }}>
      <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        Additional Role Tasks
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
        {toShow.map(role => (
          <RoleTaskCard key={role} role={role} userId={user.id} />
        ))}
      </div>
    </div>
  );
}

const SUBTITLE: Record<string, string> = {
  SUPER_ADMIN: "Here's a snapshot of activations, installations, and payouts across the platform.",
  INSTALLER: 'Track your assigned jobs, proof submissions, and earnings.',
  DEVELOPER: 'Track license activations awaiting your action and your earnings.',
  DESIGNER: 'Track your design deliverables, earnings, and monthly KPI performance.',
  LIAISON: 'Coordinate with clients, manage communications, and track your earnings.',
  ADMIN_STAFF: 'Manage administrative tasks, monitor activities, and oversee operations.',
  SALES_STAFF: 'Manage clients, create job orders, and track your sales performance.',
};

const QUICK_ACTION_ROLES = new Set(['SUPER_ADMIN', 'ADMIN_STAFF', 'SALES_STAFF', 'LIAISON']);

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>Welcome back, {user?.fullName?.split(' ')[0]}</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem', marginBottom: 0 }}>{user ? SUBTITLE[user.role] : ''}</p>
        </div>
        {user?.role && QUICK_ACTION_ROLES.has(user.role) && <QuickActions />}
      </div>

      {user?.role === 'SUPER_ADMIN' && <SuperAdminDashboard />}
      {user?.role === 'INSTALLER' && <InstallerDashboard />}
      {user?.role === 'DEVELOPER' && <DeveloperDashboard />}
      {user?.role === 'DESIGNER' && <DesignerDashboard />}
      {user?.role === 'LIAISON' && <LiaisonDashboard />}
      {user?.role === 'ADMIN_STAFF' && <AdminStaffDashboard />}
      {user?.role === 'SALES_STAFF' && <SalesStaffDashboard />}

      {user && <AdditionalRoleTasks user={user as AuthenticatedUser} />}
    </div>
  );
}
