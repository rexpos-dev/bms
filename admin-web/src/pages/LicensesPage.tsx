import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { Dialog } from '../components/Dialog';
import { Pagination, usePagination } from '../components/Pagination';
import { useAuthStore } from '../lib/auth-store';
import type { Client, License, NenposClient, SoftwareProduct } from '../lib/types';

const EMPTY_FINGERPRINT_FORM = { cpu: '', disk: '', mac: '' };

// ── Shared helpers ──────────────────────────────────────────────────────────

function fmtDate(val: string | null | undefined) {
  return val ? new Date(val).toLocaleDateString() : '—';
}

function TrialBadge() {
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em',
      background: 'var(--accent)', color: '#fff',
      borderRadius: 4, padding: '0.1rem 0.35rem', marginLeft: '0.4rem',
      verticalAlign: 'middle',
    }}>
      TRIAL
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: '0.9rem', wordBreak: 'break-word' }}>{value ?? '—'}</div>
    </div>
  );
}

function SearchFilter({
  search, onSearch,
  statusOptions, status, onStatus,
  placeholder = 'Search…',
}: {
  search: string; onSearch: (v: string) => void;
  statusOptions?: string[]; status: string; onStatus: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
      <input
        type="search"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={placeholder}
        style={{ flex: 1, minWidth: 220, padding: '0.55rem 0.85rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: '0.9rem' }}
      />
      {statusOptions && statusOptions.length > 0 && (
        <select
          value={status}
          onChange={(e) => onStatus(e.target.value)}
          style={{ padding: '0.55rem 0.85rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: '0.9rem' }}
        >
          <option value="">All statuses</option>
          {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
    </div>
  );
}

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

// ── NENPOS Clients Tab ──────────────────────────────────────────────────────

function downloadTemplate() {
  const headers = ['Client ID', 'Client Name', 'Start Date', 'Expiry Date', 'License', 'Status', 'Installer', 'Notes', 'Address'];
  const example = ['NPC-ABC123', 'Juan dela Cruz Store', '2023-01-15', '2024-01-15', 'NENPOS-XXXX-XXXX', 'ACTIVE', 'John Doe', 'Annual subscription', 'Brgy. Example, Cebu City'];
  const csv = [headers.join(','), example.map((v) => `"${v}"`).join(',')].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nenpos_clients_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

const EMPTY_NENPOS_FORM = {
  clientName: '', license: '', clientId: '', startDate: '', expiryDate: '',
  status: 'ACTIVE', installer: '', address: '', notes: '',
};

function NenposClientsTab() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadResult, setUploadResult] = useState<{ imported: number } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [viewRecord, setViewRecord] = useState<NenposClient | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addForm, setAddForm] = useState(EMPTY_NENPOS_FORM);
  const [addError, setAddError] = useState('');

  const formPayload = () => ({
    clientName: addForm.clientName.trim(),
    license: addForm.license.trim() || undefined,
    clientId: addForm.clientId.trim() || undefined,
    startDate: addForm.startDate || undefined,
    expiryDate: addForm.expiryDate || undefined,
    status: addForm.status || undefined,
    installer: addForm.installer.trim() || undefined,
    address: addForm.address.trim() || undefined,
    notes: addForm.notes.trim() || undefined,
  });

  const closeForm = () => {
    setShowAddForm(false);
    setEditingId(null);
    setAddForm(EMPTY_NENPOS_FORM);
    setAddError('');
  };

  const createMutation = useMutation({
    mutationFn: async () =>
      (await api.post<NenposClient>('/nenpos-clients', formPayload())).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nenpos-clients'] });
      closeForm();
    },
    onError: (err: any) => {
      setAddError(err?.response?.data?.message ?? 'Could not add the client. Try again.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (id: string) =>
      (await api.patch<NenposClient>(`/nenpos-clients/${id}`, formPayload())).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nenpos-clients'] });
      closeForm();
    },
    onError: (err: any) => {
      setAddError(err?.response?.data?.message ?? 'Could not update the client. Try again.');
    },
  });

  const openEdit = (row: NenposClient) => {
    setEditingId(row.id);
    setAddForm({
      clientName: row.clientName ?? '',
      license: row.license ?? '',
      clientId: row.clientId ?? '',
      startDate: row.startDate ? row.startDate.slice(0, 10) : '',
      expiryDate: row.expiryDate ? row.expiryDate.slice(0, 10) : '',
      status: row.status ?? 'ACTIVE',
      installer: row.installer ?? '',
      address: row.address ?? '',
      notes: row.notes ?? '',
    });
    setAddError('');
    setShowAddForm(true);
  };

  const submitForm = () => {
    if (editingId) updateMutation.mutate(editingId);
    else createMutation.mutate();
  };
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const listQuery = useQuery({
    queryKey: ['nenpos-clients'],
    queryFn: async () => (await api.get<NenposClient[]>('/nenpos-clients')).data,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return (await api.post<{ imported: number }>('/nenpos-clients/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })).data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['nenpos-clients'] });
      setUploadResult(data);
      setUploadError('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (err: any) => {
      setUploadError(err?.response?.data?.message ?? 'Upload failed. Check the file format and try again.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  const allRecords = listQuery.data ?? [];

  const statusOptions = [...new Set(allRecords.map((r) => r.status).filter(Boolean) as string[])].sort();

  const filtered = allRecords.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = !q || [r.clientId, r.clientName, r.license, r.installer, r.address, r.notes]
      .some((v) => v?.toLowerCase().includes(q));
    const matchStatus = !statusFilter || r.status?.toUpperCase() === statusFilter.toUpperCase();
    return matchSearch && matchStatus;
  });

  const { paginated, page, pageSize, totalPages, total, start, changePage, changePageSize, reset } = usePagination(filtered);

  useEffect(() => {
    reset();
  }, [search, statusFilter]);

  return (
    <div>
      {/* Action bar */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={() => { setEditingId(null); setAddForm(EMPTY_NENPOS_FORM); setAddError(''); setShowAddForm(true); }}>
          + Add Client
        </button>
        <button type="button" className="btn btn-secondary" onClick={downloadTemplate}>
          ↓ Download Template
        </button>
        <label
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.6rem 1.25rem', borderRadius: 8, border: '1px solid transparent',
            background: 'var(--accent)', color: 'var(--accent-contrast)',
            fontWeight: 600, fontSize: '0.9rem',
            cursor: uploadMutation.isPending ? 'not-allowed' : 'pointer',
            opacity: uploadMutation.isPending ? 0.7 : 1,
          }}
        >
          {uploadMutation.isPending ? 'Uploading…' : '↑ Upload Excel / CSV'}
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploadResult(null);
              setUploadError('');
              uploadMutation.mutate(file);
            }}
            disabled={uploadMutation.isPending}
          />
        </label>
      </div>

      {uploadResult && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(22,163,74,0.1)', border: '1px solid var(--success)', borderRadius: 8, color: 'var(--success)', marginBottom: '1rem', fontWeight: 600 }}>
          ✓ Successfully imported {uploadResult.imported} record{uploadResult.imported !== 1 ? 's' : ''}.
        </div>
      )}
      {uploadError && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(220,38,38,0.08)', border: '1px solid var(--danger)', borderRadius: 8, color: 'var(--danger)', marginBottom: '1rem' }}>
          {uploadError}
        </div>
      )}

      {/* Search + filter */}
      {allRecords.length > 0 && (
        <SearchFilter
          search={search} onSearch={setSearch}
          statusOptions={statusOptions} status={statusFilter} onStatus={setStatusFilter}
          placeholder="Search by name, client ID, license, installer, address…"
        />
      )}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ padding: '1.75rem' }}>
            {listQuery.isLoading && <p style={{ margin: 0 }}>Loading records…</p>}
            {listQuery.isError && <p className="error-text" style={{ margin: 0 }}>Failed to load records.</p>}
            {!listQuery.isLoading && allRecords.length === 0 && (
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                No NENPOS client records yet. Download the template, fill it in, and upload your Excel file.
              </p>
            )}
            {allRecords.length > 0 && (
              <>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Showing {filtered.length} of {allRecords.length} record{allRecords.length !== 1 ? 's' : ''}
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Client ID</th>
                      <th>Client Name</th>
                      <th>Status</th>
                      <th>License</th>
                      <th>Start Date</th>
                      <th>Expiry Date</th>
                      <th>Installer</th>
                      <th>Address</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.length === 0 ? (
                      <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No records match your search.</td></tr>
                    ) : (
                      paginated.map((row) => (
                        <tr key={row.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{row.clientId || '—'}</td>
                          <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.clientName}</td>
                          <td>
                            <span className={`badge badge-${(row.status ?? 'active').toLowerCase()}`}>
                              {row.status ?? '—'}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{row.license ?? '—'}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(row.startDate)}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(row.expiryDate)}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{row.installer ?? '—'}</td>
                          <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.address ?? ''}>
                            {row.address ?? '—'}
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                                onClick={() => openEdit(row)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                                onClick={() => setViewRecord(row)}
                              >
                                View
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
        {allRecords.length > 0 && (
          <div style={{ padding: '0 1.75rem 1.75rem' }}>
            <Pagination
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              total={total}
              start={start}
              onPage={changePage}
              onPageSize={changePageSize}
            />
          </div>
        )}
      </div>

      {/* Add / edit client dialog */}
      <Dialog isOpen={showAddForm} onClose={closeForm} title={editingId ? 'Edit NENPOS Client' : 'Add NENPOS Client'} maxWidth={560}>
        <form onSubmit={(e) => { e.preventDefault(); submitForm(); }}>
          <div className="field">
            <label htmlFor="np-name">Client name *</label>
            <input id="np-name" type="text" required value={addForm.clientName}
              onChange={(e) => setAddForm({ ...addForm, clientName: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="np-license">License</label>
            <input id="np-license" type="text" value={addForm.license} placeholder="License key"
              style={{ fontFamily: 'monospace' }}
              onChange={(e) => setAddForm({ ...addForm, license: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="np-clientId">Client ID</label>
              <input id="np-clientId" type="text" value={addForm.clientId} placeholder="Auto-generated if blank"
                onChange={(e) => setAddForm({ ...addForm, clientId: e.target.value })} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="np-status">Status</label>
              <select id="np-status" value={addForm.status}
                onChange={(e) => setAddForm({ ...addForm, status: e.target.value })}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="EXPIRED">EXPIRED</option>
                <option value="SUSPENDED">SUSPENDED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="np-start">Start date</label>
              <input id="np-start" type="date" value={addForm.startDate}
                onChange={(e) => setAddForm({ ...addForm, startDate: e.target.value })} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="np-expiry">Expiry date</label>
              <input id="np-expiry" type="date" value={addForm.expiryDate}
                onChange={(e) => setAddForm({ ...addForm, expiryDate: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="np-installer">Installer</label>
            <input id="np-installer" type="text" value={addForm.installer}
              onChange={(e) => setAddForm({ ...addForm, installer: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="np-address">Address</label>
            <input id="np-address" type="text" value={addForm.address}
              onChange={(e) => setAddForm({ ...addForm, address: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="np-notes">Notes</label>
            <textarea id="np-notes" rows={2} value={addForm.notes}
              onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} />
          </div>
          {addError && <p className="error-text">{addError}</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ flex: 1 }}>
              {isSaving ? 'Saving…' : editingId ? 'Save changes' : 'Save client'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
          </div>
        </form>
      </Dialog>

      {/* View details dialog */}
      <Dialog isOpen={!!viewRecord} onClose={() => setViewRecord(null)} title="Client Details" maxWidth={560}>
        {viewRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <DetailRow label="Client ID" value={<span style={{ fontFamily: 'monospace' }}>{viewRecord.clientId || '—'}</span>} />
              <DetailRow label="Status" value={
                <span className={`badge badge-${(viewRecord.status ?? 'active').toLowerCase()}`}>{viewRecord.status ?? '—'}</span>
              } />
            </div>
            <DetailRow label="Client Name" value={<strong>{viewRecord.clientName}</strong>} />
            <DetailRow label="License" value={<span style={{ fontFamily: 'monospace' }}>{viewRecord.license ?? '—'}</span>} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <DetailRow label="Start Date" value={fmtDate(viewRecord.startDate)} />
              <DetailRow label="Expiry Date" value={fmtDate(viewRecord.expiryDate)} />
            </div>
            <DetailRow label="Installer" value={viewRecord.installer ?? '—'} />
            <DetailRow label="Address" value={viewRecord.address ?? '—'} />
            <DetailRow label="Notes" value={
              viewRecord.notes
                ? <span style={{ whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>{viewRecord.notes}</span>
                : '—'
            } />
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Uploaded {fmtDate(viewRecord.uploadedAt)}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function LicensesPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const isDeveloper = user?.role === 'DEVELOPER';
  const isAdminRole = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN_STAFF';

  const [activeTab, setActiveTab] = useState<'licenses' | 'nenpos'>('licenses');
  const [clientId, setClientId] = useState('');
  const [productId, setProductId] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [isTrial, setIsTrial] = useState(false);
  const [trialDays, setTrialDays] = useState(30);
  const [showForm, setShowForm] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState(EMPTY_FINGERPRINT_FORM);
  const [viewLicense, setViewLicense] = useState<License | null>(null);
  const [licSearch, setLicSearch] = useState('');
  const [licStatus, setLicStatus] = useState('');

  const licensesQuery = useQuery({
    queryKey: ['licenses'],
    queryFn: async () => (await api.get<License[]>('/licenses')).data,
  });

  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<Client[]>('/clients')).data,
    enabled: showForm,
  });

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<SoftwareProduct[]>('/software-products')).data,
    enabled: showForm,
  });

  const [generateError, setGenerateError] = useState('');

  const generateLicense = useMutation({
    mutationFn: async () => {
      const payload = isTrial
        ? { clientId, productId, isTrial: true, trialDays }
        : { clientId, productId, licenseKey: licenseKey.trim() };
      return (await api.post<License>('/licenses', payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      setClientId(''); setProductId(''); setLicenseKey('');
      setIsTrial(false); setTrialDays(30);
      setGenerateError(''); setShowForm(false);
    },
    onError: (err: any) => {
      setGenerateError(err?.response?.data?.message ?? 'Could not save the license. Try again.');
    },
  });

  const activateLicense = useMutation({
    mutationFn: async ({ id }: { id: string }) =>
      (await api.patch<License>(`/licenses/${id}/activate`, { fingerprint })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      setActivatingId(null);
      setFingerprint(EMPTY_FINGERPRINT_FORM);
    },
  });

  const suspendLicense = useMutation({
    mutationFn: async (id: string) => (await api.patch<License>(`/licenses/${id}/suspend`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['licenses'] }),
  });

  const activeLicense = licensesQuery.data?.find((l) => l.id === activatingId);
  const allLicenses = licensesQuery.data ?? [];

  const filteredLicenses = allLicenses.filter((l) => {
    const q = licSearch.toLowerCase();
    const matchSearch = !q || [l.licenseKey, l.client?.businessName, l.product?.productName]
      .some((v) => v?.toLowerCase().includes(q));
    const matchStatus = !licStatus || l.status === licStatus;
    return matchSearch && matchStatus;
  });

  const {
    paginated: paginatedLicenses,
    page: licPage,
    pageSize: licPageSize,
    totalPages: licTotalPages,
    total: licTotal,
    start: licStart,
    changePage: changeLicPage,
    changePageSize: changeLicPageSize,
    reset: resetLicPagination
  } = usePagination(filteredLicenses);

  useEffect(() => {
    resetLicPagination();
  }, [licSearch, licStatus]);

  const nenposQuery = useQuery({
    queryKey: ['nenpos-clients'],
    queryFn: async () => (await api.get<NenposClient[]>('/nenpos-clients')).data,
    enabled: isAdminRole,
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>Licenses</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
            {isDeveloper
              ? "Activate pending licenses on-site by binding them to the device's hardware fingerprint via an RSA-4096-signed JWT token."
              : "Record license keys issued by the 3rd-party provider for clients. Developers activate them on-site, binding each license to the device's hardware fingerprint via an RSA-4096-signed JWT token."}
          </p>
        </div>
      </div>

      {/* Tabs */}
      {isAdminRole && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '1.75rem' }}>
          <TabButton label="Licenses" active={activeTab === 'licenses'} count={allLicenses.length} onClick={() => setActiveTab('licenses')} />
          <TabButton label="NENPOS Clients" active={activeTab === 'nenpos'} count={nenposQuery.data?.length} onClick={() => setActiveTab('nenpos')} />
        </div>
      )}

      {/* ── Licenses Tab ── */}
      {activeTab === 'licenses' && (
        <>
          {/* Add license dialog */}
          <Dialog isOpen={showForm && !isDeveloper} onClose={() => { setShowForm(false); setGenerateError(''); setIsTrial(false); setTrialDays(30); }} title="Add License" maxWidth={480}>
            <form onSubmit={(e) => { e.preventDefault(); generateLicense.mutate(); }}>
              <div className="field">
                <label>License type</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className={`btn ${!isTrial ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => setIsTrial(false)}
                  >
                    Full
                  </button>
                  <button
                    type="button"
                    className={`btn ${isTrial ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => setIsTrial(true)}
                  >
                    Trial
                  </button>
                </div>
              </div>
              <div className="field">
                <label htmlFor="clientId">Client</label>
                <select id="clientId" required value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">Select a client…</option>
                  {clientsQuery.data?.map((c) => (
                    <option key={c.id} value={c.id}>{c.businessName} ({c.clientCode})</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="productId">Software product</label>
                <select id="productId" required value={productId} onChange={(e) => setProductId(e.target.value)}>
                  <option value="">Select a product…</option>
                  {productsQuery.data?.map((p) => (
                    <option key={p.id} value={p.id}>{p.productName} v{p.version}</option>
                  ))}
                </select>
              </div>
              {isTrial ? (
                <div className="field">
                  <label htmlFor="trialDays">Trial days</label>
                  <input
                    id="trialDays"
                    type="number"
                    min={1}
                    max={365}
                    required
                    value={trialDays}
                    onChange={(e) => setTrialDays(Number(e.target.value))}
                  />
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    A unique trial key is generated automatically. The countdown starts when the developer activates it on-site.
                  </p>
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="licenseKey">License key</label>
                  <input
                    id="licenseKey"
                    type="text"
                    required
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                    placeholder="Enter the key issued by the provider"
                    style={{ fontFamily: 'monospace' }}
                  />
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Enter the license key issued by the 3rd-party provider.
                  </p>
                </div>
              )}
              {generateError && <p className="error-text">{generateError}</p>}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                <button type="submit" className="btn btn-primary" disabled={generateLicense.isPending} style={{ flex: 1 }}>
                  {generateLicense.isPending ? 'Saving…' : 'Save license'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setGenerateError(''); setIsTrial(false); setTrialDays(30); }}>Cancel</button>
              </div>
            </form>
          </Dialog>

          {/* Activate dialog */}
          <Dialog isOpen={!!activatingId} onClose={() => setActivatingId(null)} title="Activate License" maxWidth={480}>
            {activeLicense && (
              <form onSubmit={(e) => { e.preventDefault(); activateLicense.mutate({ id: activeLicense.id }); }}>
                <div style={{ padding: '0.75rem', background: 'var(--bg)', borderRadius: 8, marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Binding for:</div>
                  <div style={{ fontWeight: 600 }}>{activeLicense.client?.businessName} — {activeLicense.product?.productName}</div>
                  <div style={{ fontFamily: 'monospace', marginTop: '0.4rem', color: 'var(--accent)' }}>{activeLicense.licenseKey}</div>
                </div>
                <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  Enter the installed device's hardware fingerprint. This binds the license to this machine and signs an activation token.
                </p>
                <div className="field">
                  <label>CPU identifier</label>
                  <input type="text" required value={fingerprint.cpu} onChange={(e) => setFingerprint({ ...fingerprint, cpu: e.target.value })} />
                </div>
                <div className="field">
                  <label>Disk serial</label>
                  <input type="text" required value={fingerprint.disk} onChange={(e) => setFingerprint({ ...fingerprint, disk: e.target.value })} />
                </div>
                <div className="field">
                  <label>MAC address</label>
                  <input type="text" required value={fingerprint.mac} onChange={(e) => setFingerprint({ ...fingerprint, mac: e.target.value })} />
                </div>
                {activateLicense.isError && <p className="error-text">Could not activate the license. Check the details and try again.</p>}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={activateLicense.isPending} style={{ flex: 1 }}>
                    {activateLicense.isPending ? 'Activating…' : 'Activate license'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setActivatingId(null)}>Cancel</button>
                </div>
              </form>
            )}
          </Dialog>

          {/* View license dialog */}
          <Dialog isOpen={!!viewLicense} onClose={() => setViewLicense(null)} title="License Details" maxWidth={520}>
            {viewLicense && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <DetailRow label="Status" value={<><StatusBadge status={viewLicense.status} />{viewLicense.isTrial && <TrialBadge />}</>} />
                  <DetailRow label="Client" value={<strong>{viewLicense.client?.businessName ?? '—'}</strong>} />
                </div>
                <DetailRow label="License Key" value={
                  <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', background: 'var(--bg)', padding: '0.35rem 0.6rem', borderRadius: 6, display: 'inline-block', wordBreak: 'break-all' }}>
                    {viewLicense.licenseKey}
                  </span>
                } />
                <DetailRow label="Software Product" value={viewLicense.product?.productName ?? '—'} />
                {viewLicense.isTrial && (
                  <DetailRow label="Trial Period" value={`${viewLicense.trialDays ?? 30} days from activation`} />
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <DetailRow label="Activation Date" value={fmtDate(viewLicense.activationDate)} />
                  <DetailRow label="Expiry Date" value={fmtDate(viewLicense.expirationDate)} />
                </div>
                {viewLicense.activatedById && (
                  <DetailRow label="Activated By (ID)" value={<span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{viewLicense.activatedById}</span>} />
                )}
              </div>
            )}
          </Dialog>

          {/* Action bar */}
          {!isDeveloper && (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
                + Add License
              </button>
            </div>
          )}

          {/* Search */}
          {allLicenses.length > 0 && (
            <SearchFilter
              search={licSearch} onSearch={setLicSearch}
              statusOptions={['PENDING', 'ACTIVATED', 'EXPIRED', 'SUSPENDED']}
              status={licStatus} onStatus={setLicStatus}
              placeholder="Search by client, license key, or product…"
            />
          )}

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ padding: '1.75rem' }}>
                {licensesQuery.isLoading && <p>Loading licenses…</p>}
                {licensesQuery.isError && <p className="error-text">Failed to load licenses.</p>}
                {!licensesQuery.isLoading && allLicenses.length === 0 && <p>No licenses yet — add the first one above.</p>}
                {allLicenses.length > 0 && (
                  <>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                      Showing {filteredLicenses.length} of {allLicenses.length} license{allLicenses.length !== 1 ? 's' : ''}
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th>Client</th>
                          <th>Product</th>
                          <th>License Key</th>
                          <th>Status</th>
                          <th>Activated</th>
                          <th>Expires</th>
                          <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedLicenses.length === 0 ? (
                          <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No licenses match your search.</td></tr>
                        ) : (
                          paginatedLicenses.map((license) => (
                            <tr key={license.id}>
                              <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{license.client?.businessName ?? '—'}</td>
                              <td style={{ whiteSpace: 'nowrap' }}>{license.product?.productName ?? '—'}</td>
                              <td style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {license.licenseKey}
                                {license.isTrial && <TrialBadge />}
                              </td>
                              <td><StatusBadge status={license.status} /></td>
                              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(license.activationDate)}</td>
                              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(license.expirationDate)}</td>
                              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                  {isDeveloper && license.status === 'PENDING' && (
                                    <button type="button" className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                                      onClick={() => setActivatingId(license.id)}>
                                      Activate
                                    </button>
                                  )}
                                  {!isDeveloper && license.status === 'ACTIVATED' && (
                                    <button type="button" className="btn btn-secondary"
                                      style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                      disabled={suspendLicense.isPending}
                                      onClick={() => suspendLicense.mutate(license.id)}>
                                      Suspend
                                    </button>
                                  )}
                                  <button type="button" className="btn btn-secondary"
                                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                                    onClick={() => setViewLicense(license)}>
                                    View
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            </div>
            {allLicenses.length > 0 && (
              <div style={{ padding: '0 1.75rem 1.75rem' }}>
                <Pagination
                  page={licPage}
                  pageSize={licPageSize}
                  totalPages={licTotalPages}
                  total={licTotal}
                  start={licStart}
                  onPage={changeLicPage}
                  onPageSize={changeLicPageSize}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* ── NENPOS Clients Tab ── */}
      {activeTab === 'nenpos' && isAdminRole && <NenposClientsTab />}
    </div>
  );
}
