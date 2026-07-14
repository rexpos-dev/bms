import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fileUrl } from '../lib/api';
import type { JobOrderPayments as JobOrderPaymentsData, PaymentMethod } from '../lib/types';

const METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'GCASH', 'CHECK'];
const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export function JobOrderPayments({ jobOrderId, canVoid }: { jobOrderId: string; canVoid: boolean }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [referenceNo, setReferenceNo] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const paymentsQuery = useQuery({
    queryKey: ['job-order-payments', jobOrderId],
    queryFn: async () => (await api.get<JobOrderPaymentsData>(`/job-orders/${jobOrderId}/payments`)).data,
  });

  const recordMutation = useMutation({
    mutationFn: async () => {
      let proofPhotoUrl: string | undefined;
      if (photoFile) {
        const fd = new FormData();
        fd.append('files', photoFile);
        const res = await api.post<{ urls: string[] }>('/uploads/images', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        proofPhotoUrl = res.data.urls[0];
      }
      await api.post(`/job-orders/${jobOrderId}/payments`, {
        amount: Number(amount),
        method,
        referenceNo: referenceNo || undefined,
        proofPhotoUrl,
        paidAt: new Date(paidAt).toISOString(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-order-payments', jobOrderId] });
      setShowForm(false);
      setAmount('');
      setReferenceNo('');
      setPhotoFile(null);
    },
  });

  const voidMutation = useMutation({
    mutationFn: (paymentId: string) => api.post(`/payments/${paymentId}/void`, { reason: voidReason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-order-payments', jobOrderId] });
      setVoidingId(null);
      setVoidReason('');
    },
  });

  if (paymentsQuery.isLoading) return <p style={{ color: 'var(--text-muted)' }}>Loading payments…</p>;
  if (!paymentsQuery.data) return null;
  const { grandTotal, totalPaid, balance, payments } = paymentsQuery.data;

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontWeight: 700 }}>Payments</div>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'Record Payment'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1rem', fontSize: '0.85rem' }}>
        <div>Grand Total: <strong>{peso(grandTotal)}</strong></div>
        <div>Total Paid: <strong>{peso(totalPaid)}</strong></div>
        <div style={{ color: balance > 0 ? 'var(--danger)' : 'var(--success)' }}>
          Balance: <strong>{peso(balance)}</strong>
        </div>
      </div>

      {showForm && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          <input className="input" type="number" min="0.01" step="0.01" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
          <input className="input" placeholder="Reference # (optional)" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
          <input className="input" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          <input className="input" type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!amount || Number(amount) <= 0 || recordMutation.isPending}
            onClick={() => recordMutation.mutate()}
          >
            {recordMutation.isPending ? 'Saving…' : 'Save Payment'}
          </button>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)' }}>
            <th style={{ textAlign: 'left', padding: '0.3rem 0' }}>Date</th>
            <th style={{ textAlign: 'left', padding: '0.3rem 0' }}>Method</th>
            <th style={{ textAlign: 'right', padding: '0.3rem 0' }}>Amount</th>
            <th style={{ textAlign: 'left', padding: '0.3rem 0' }}>Reference</th>
            <th style={{ textAlign: 'left', padding: '0.3rem 0' }}>Proof</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} style={{ borderTop: '1px solid var(--border)', opacity: p.voidedAt ? 0.5 : 1 }}>
              <td style={{ padding: '0.3rem 0' }}>{new Date(p.paidAt).toLocaleDateString()}</td>
              <td>{p.method.replace('_', ' ')}</td>
              <td style={{ textAlign: 'right' }}>{p.voidedAt ? <s>{peso(Number(p.amount))}</s> : peso(Number(p.amount))}</td>
              <td>{p.referenceNo ?? '—'}</td>
              <td>{p.proofPhotoUrl ? <a href={fileUrl(p.proofPhotoUrl)} target="_blank" rel="noreferrer">View</a> : '—'}</td>
              <td style={{ textAlign: 'right' }}>
                {p.voidedAt ? (
                  <span style={{ color: 'var(--text-muted)' }}>Voided: {p.voidReason}</span>
                ) : canVoid ? (
                  voidingId === p.id ? (
                    <span style={{ display: 'flex', gap: '0.4rem' }}>
                      <input className="input" placeholder="Reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} style={{ fontSize: '0.78rem', padding: '0.2rem 0.4rem' }} />
                      <button type="button" className="btn btn-secondary" disabled={!voidReason || voidMutation.isPending} onClick={() => voidMutation.mutate(p.id)}>
                        Confirm
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.78rem' }} onClick={() => setVoidingId(p.id)}>
                      Void
                    </button>
                  )
                ) : null}
              </td>
            </tr>
          ))}
          {payments.length === 0 && (
            <tr><td colSpan={6} style={{ padding: '1rem 0', color: 'var(--text-muted)', textAlign: 'center' }}>No payments recorded yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
