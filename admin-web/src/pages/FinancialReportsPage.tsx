import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ChartCard } from '../components/ChartCard';
import { SimpleBarChart } from '../components/SimpleChart';
import type { Client, ClientPaymentHistory, CollectionsSummary, OutstandingRow } from '../lib/types';

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
type Tab = 'collections' | 'outstanding' | 'client';

async function downloadCsv(url: string, filename: string) {
  const res = await api.get(url, { responseType: 'blob' });
  const objectUrl = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

export function FinancialReportsPage() {
  const [tab, setTab] = useState<Tab>('collections');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [clientId, setClientId] = useState('');

  const collectionsQuery = useQuery({
    queryKey: ['financial-collections', from, to],
    queryFn: async () => (await api.get<CollectionsSummary>('/reports/financial/collections', { params: { from: from || undefined, to: to || undefined } })).data,
    enabled: tab === 'collections',
  });

  const outstandingQuery = useQuery({
    queryKey: ['financial-outstanding'],
    queryFn: async () => (await api.get<OutstandingRow[]>('/reports/financial/outstanding')).data,
    enabled: tab === 'outstanding',
  });

  const clientsQuery = useQuery({
    queryKey: ['clients', 'SOFTWARE'],
    queryFn: async () => (await api.get<Client[]>('/clients', { params: { type: 'SOFTWARE' } })).data,
    enabled: tab === 'client',
  });

  const clientHistoryQuery = useQuery({
    queryKey: ['financial-client-history', clientId],
    queryFn: async () => (await api.get<ClientPaymentHistory>(`/reports/financial/client/${clientId}`)).data,
    enabled: tab === 'client' && !!clientId,
  });

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Financial Reports</h1>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {(['collections', 'outstanding', 'client'] as Tab[]).map((t) => (
          <button key={t} type="button" className={tab === t ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setTab(t)}>
            {t === 'collections' ? 'Collections' : t === 'outstanding' ? 'Outstanding' : 'Client History'}
          </button>
        ))}
      </div>

      {tab === 'collections' && (
        <ChartCard title="Collections Summary" subtitle="Total collected by payment method">
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <button type="button" className="btn btn-secondary" onClick={() => downloadCsv(`/reports/financial/export?type=collections&from=${from}&to=${to}`, 'collections.csv')}>
              Export CSV
            </button>
          </div>
          {collectionsQuery.data && (
            <>
              <div style={{ marginBottom: '1rem', fontWeight: 700 }}>Total Collected: {peso(collectionsQuery.data.totalCollected)}</div>
              <SimpleBarChart data={collectionsQuery.data.byMethod.map((m) => ({ label: m.method.replace('_', ' '), value: m.total }))} />
            </>
          )}
        </ChartCard>
      )}

      {tab === 'outstanding' && (
        <ChartCard title="Outstanding Balances" subtitle="Job Orders not yet fully paid">
          <div style={{ marginBottom: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => downloadCsv('/reports/financial/export?type=outstanding', 'outstanding.csv')}>
              Export CSV
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <th style={{ textAlign: 'left', padding: '0.3rem 0' }}>Client</th>
                <th style={{ textAlign: 'right' }}>Grand Total</th>
                <th style={{ textAlign: 'right' }}>Paid</th>
                <th style={{ textAlign: 'right' }}>Balance</th>
                <th style={{ textAlign: 'left' }}>Last Payment</th>
              </tr>
            </thead>
            <tbody>
              {(outstandingQuery.data ?? []).map((row) => (
                <tr key={row.jobOrderId} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.3rem 0' }}>{row.clientName}</td>
                  <td style={{ textAlign: 'right' }}>{peso(row.grandTotal)}</td>
                  <td style={{ textAlign: 'right' }}>{peso(row.totalPaid)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 700 }}>{peso(row.balance)}</td>
                  <td>{row.lastPaymentAt ? new Date(row.lastPaymentAt).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
              {(outstandingQuery.data ?? []).length === 0 && (
                <tr><td colSpan={5} style={{ padding: '1rem 0', color: 'var(--text-muted)', textAlign: 'center' }}>No outstanding balances.</td></tr>
              )}
            </tbody>
          </table>
        </ChartCard>
      )}

      {tab === 'client' && (
        <ChartCard title="Client Payment History">
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ marginBottom: '1rem', maxWidth: 320 }}>
            <option value="">Select a client…</option>
            {(clientsQuery.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.businessName}</option>)}
          </select>
          {clientHistoryQuery.data && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th style={{ textAlign: 'left', padding: '0.3rem 0' }}>Date</th>
                  <th style={{ textAlign: 'left' }}>Method</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ textAlign: 'left' }}>Job Order</th>
                </tr>
              </thead>
              <tbody>
                {clientHistoryQuery.data.payments.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.3rem 0' }}>{new Date(p.paidAt).toLocaleDateString()}</td>
                    <td>{p.method.replace('_', ' ')}</td>
                    <td style={{ textAlign: 'right' }}>{peso(Number(p.amount))}</td>
                    <td>JO-{p.jobOrderId.slice(0, 8).toUpperCase()}</td>
                  </tr>
                ))}
                {clientHistoryQuery.data.payments.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: '1rem 0', color: 'var(--text-muted)', textAlign: 'center' }}>No payments for this client.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </ChartCard>
      )}
    </div>
  );
}
