import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Smartphone, Monitor } from 'lucide-react';
import { api } from '../lib/api';
import { Pagination, usePagination } from '../components/Pagination';
import type { DownloadLead } from '../lib/types';

export function DownloadLeadsPage() {
  const leadsQuery = useQuery({
    queryKey: ['download-leads'],
    queryFn: async () => (await api.get<DownloadLead[]>('/download-leads')).data,
  });

  const data = leadsQuery.data ?? [];
  const pg = usePagination(data);

  return (
    <div>
      <h1 style={{ marginBottom: '0.25rem' }}>Download Leads</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Companies that filled out the landing-page form before downloading the app or installing the
        desktop console.
      </p>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        {leadsQuery.isLoading && <p>Loading leads…</p>}
        {leadsQuery.isError && <p className="error-text">Failed to load leads.</p>}
        {!leadsQuery.isLoading && data.length === 0 && <p>No leads captured yet.</p>}
        {data.length > 0 && (
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
    </div>
  );
}
