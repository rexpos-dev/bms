import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { Dialog } from '../components/Dialog';
import { Pagination, usePagination } from '../components/Pagination';
import type { Job, JobOrder } from '../lib/types';

export function JobOrdersPage() {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);

  const jobOrdersQuery = useQuery({
    queryKey: ['job-orders'],
    queryFn: async () => (await api.get<JobOrder[]>('/job-orders')).data,
  });

  const pg = usePagination(jobOrdersQuery.data ?? []);

  const jobsQuery = useQuery({
    queryKey: ['jobs', 'without-orders'],
    queryFn: async () => {
      const allJobs = (await api.get<Job[]>('/jobs')).data;
      const orders = jobOrdersQuery.data ?? [];
      const jobsWithOrders = new Set(orders.map(o => o.jobId));
      return allJobs.filter(j => !jobsWithOrders.has(j.id));
    },
    enabled: showCreate && jobOrdersQuery.isSuccess,
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>Software JO</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
            List of all software deployment and hardware package job orders.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowCreate(true)}
        >
          Create Software JO
        </button>
      </div>

      <Dialog
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Select Installation Job"
        maxWidth={640}
      >
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
          Choose an installation that doesn't have a job order yet to start creating one.
        </p>

        {jobsQuery.isLoading && <p>Loading available jobs…</p>}
        {jobsQuery.data && jobsQuery.data.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--bg)', borderRadius: 8 }}>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>No pending installations available for new orders.</p>
          </div>
        )}
        {jobsQuery.data && jobsQuery.data.length > 0 && (
          <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Schedule</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {jobsQuery.data.map(job => (
                  <tr key={job.id}>
                    <td style={{ fontSize: '0.85rem' }}>
                      <strong>{job.client?.businessName}</strong>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {new Date(job.scheduleDate).toLocaleDateString()}
                    </td>
                    <td>
                      <StatusBadge status={job.jobStatus} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                        onClick={() => navigate(`/job-orders/${job.id}`)}
                      >
                        Create JO
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
            Close
          </button>
        </div>
      </Dialog>

      <div className="card">
        {jobOrdersQuery.isLoading && <p>Loading job orders…</p>}
        {jobOrdersQuery.isError && <p className="error-text">Failed to load job orders.</p>}
        {jobOrdersQuery.data && jobOrdersQuery.data.length === 0 && <p>No job orders yet.</p>}
        {jobOrdersQuery.data && jobOrdersQuery.data.length > 0 && (
          <>
          <table>
            <thead>
              <tr>
                <th>JO No.</th>
                <th>Client</th>
                <th>Product</th>
                <th>Sale Price</th>
                <th>Total</th>
                <th>Status</th>
                <th>Created At</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pg.paginated.map((jo) => {
                const materialsTotal = (jo.items || []).reduce((s, i) => s + i.quantity * Number(i.unitPrice), 0);
                const discountAmt = jo.discountType === 'PERCENTAGE'
                  ? (Number(jo.salePrice) * Number(jo.discount)) / 100
                  : Number(jo.discount);
                const grandTotal = Number(jo.salePrice) - discountAmt + materialsTotal;

                return (
                  <tr key={jo.id}>
                    <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                      JO-{jo.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td style={{ fontWeight: 500 }}>{jo.client?.businessName ?? jo.clientId}</td>
                    <td>{jo.product?.productName ?? jo.productId}</td>
                    <td>₱{Number(jo.salePrice).toLocaleString()}</td>
                    <td style={{ fontWeight: 600 }}>₱{grandTotal.toLocaleString()}</td>
                    <td>
                      <StatusBadge status={jo.status.toLowerCase()} />
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {new Date(jo.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                        onClick={() => navigate(`/job-orders/${jo.jobId}`)}
                      >
                        View / Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={pg.page} pageSize={pg.pageSize} totalPages={pg.totalPages} total={pg.total} start={pg.start} onPage={pg.changePage} onPageSize={pg.changePageSize} />
          </>
        )}
      </div>
    </div>
  );
}
