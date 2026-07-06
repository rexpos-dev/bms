import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { BackupFile, CompanyProfile, ResetModuleInfo } from '../lib/types';
import { Dialog } from '../components/Dialog';
import { AuditLogsPage } from './AuditLogsPage';
import { InventoryPage } from './InventoryPage';
import { KpiSettingsPage } from './KpiSettingsPage';
import { UsersPage } from './UsersPage';

type SettingsTab = 'company' | 'users' | 'kpis' | 'inventory' | 'database' | 'audit';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'company', label: 'Company Profile' },
  { id: 'users', label: 'Users & Roles' },
  { id: 'kpis', label: 'KPI Settings' },
  { id: 'inventory', label: 'Inventory Management' },
  { id: 'database', label: 'Database Management' },
  { id: 'audit', label: 'Audit Logs' },
];

// ── Company Profile ───────────────────────────────────────────────────────────

type CompanyProfileForm = {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  tin: string;
  logoUrl: string;
};

function CompanyProfileTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<CompanyProfileForm | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const profileQuery = useQuery({
    queryKey: ['company-profile'],
    queryFn: async () => (await api.get<CompanyProfile>('/company-profile')).data,
  });

  useEffect(() => {
    if (profileQuery.data && !form) {
      setForm({
        businessName: profileQuery.data.businessName ?? '',
        address: profileQuery.data.address ?? '',
        phone: profileQuery.data.phone ?? '',
        email: profileQuery.data.email ?? '',
        website: profileQuery.data.website ?? '',
        tin: profileQuery.data.tin ?? '',
        logoUrl: profileQuery.data.logoUrl ?? '',
      });
    }
  }, [profileQuery.data, form]);

  const saveMutation = useMutation({
    mutationFn: (payload: CompanyProfileForm) => api.patch<CompanyProfile>('/company-profile', payload),
    onSuccess: (res) => {
      qc.setQueryData(['company-profile'], res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaved(false);
    saveMutation.mutate(form);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !form) return;
    setUploadError('');
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append('files', file);
      const res = await api.post<{ urls: string[] }>('/uploads/images', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setForm({ ...form, logoUrl: res.data.urls[0] });
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (profileQuery.isLoading) return <p>Loading company profile…</p>;
  if (profileQuery.isError) return <p className="error-text">Failed to load company profile.</p>;
  if (!form) return null;

  return (
    <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 560 }}>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        This information appears on printed Job Orders and other official documents.
      </p>

      <div className="field">
        <label htmlFor="cp-name">Business name</label>
        <input id="cp-name" required value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
      </div>

      <div className="field">
        <label htmlFor="cp-address">Address</label>
        <textarea id="cp-address" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </div>

      <div className="field">
        <label htmlFor="cp-phone">Phone</label>
        <input id="cp-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </div>

      <div className="field">
        <label htmlFor="cp-email">Email</label>
        <input id="cp-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>

      <div className="field">
        <label htmlFor="cp-website">Website</label>
        <input id="cp-website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" />
      </div>

      <div className="field">
        <label htmlFor="cp-tin">TIN / Tax ID</label>
        <input id="cp-tin" value={form.tin} onChange={(e) => setForm({ ...form, tin: e.target.value })} />
      </div>

      <div className="field">
        <label>Company Logo</label>
        {form.logoUrl ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)' }}>
            <img
              src={form.logoUrl}
              alt="Company logo"
              style={{ maxHeight: 56, maxWidth: 160, objectFit: 'contain', borderRadius: 4 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? 'Uploading…' : 'Change logo'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                onClick={() => setForm({ ...form, logoUrl: '' })}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '0.5rem', padding: '1.5rem', border: '2px dashed var(--border)', borderRadius: 8,
              background: 'var(--bg)', cursor: 'pointer',
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <span style={{ fontSize: '2rem', lineHeight: 1 }}>🖼️</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>
              {isUploading ? 'Uploading…' : 'Click to upload logo'}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>JPEG, PNG, WEBP or GIF · max 10 MB</span>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={handleLogoUpload}
        />
        {uploadError && <p className="error-text" style={{ marginTop: '0.4rem' }}>{uploadError}</p>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending || isUploading}>
          {saveMutation.isPending ? 'Saving…' : 'Save changes'}
        </button>
        {saved && <span style={{ color: 'var(--success)', fontSize: '0.85rem' }}>✓ Saved successfully</span>}
        {saveMutation.isError && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>Failed to save.</span>}
      </div>
    </form>
  );
}

// ── Database Backups ────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function BackupsTab() {
  const qc = useQueryClient();
  const [error, setError] = useState('');

  const backupsQuery = useQuery({
    queryKey: ['backups'],
    queryFn: async () => (await api.get<BackupFile[]>('/backups')).data,
  });

  const createBackup = useMutation({
    mutationFn: () => api.post<BackupFile>('/backups'),
    onSuccess: () => {
      setError('');
      qc.invalidateQueries({ queryKey: ['backups'] });
    },
    onError: () => setError('Failed to create backup. Make sure mysqldump is installed and accessible on the server.'),
  });

  const deleteBackup = useMutation({
    mutationFn: (filename: string) => api.delete(`/backups/${filename}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backups'] }),
  });

  const downloadBackup = async (filename: string) => {
    const res = await api.get(`/backups/${encodeURIComponent(filename)}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem' }}>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>
          Create and download full snapshots of the database for safekeeping.
        </p>
        <button type="button" className="btn btn-primary" disabled={createBackup.isPending} onClick={() => createBackup.mutate()}>
          {createBackup.isPending ? 'Creating…' : 'Create backup'}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card" style={{ overflowX: 'auto' }}>
        {backupsQuery.isLoading && <p>Loading backups…</p>}
        {backupsQuery.isError && <p className="error-text">Failed to load backups.</p>}
        {backupsQuery.data?.length === 0 && <p>No backups yet.</p>}
        {backupsQuery.data && backupsQuery.data.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Size</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {backupsQuery.data.map((b) => (
                <tr key={b.filename}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{b.filename}</td>
                  <td>{formatSize(b.size)}</td>
                  <td>{new Date(b.createdAt).toLocaleString()}</td>
                  <td>
                    <span style={{ display: 'inline-flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                        onClick={() => downloadBackup(b.filename)}
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                        disabled={deleteBackup.isPending}
                        onClick={() => {
                          if (confirm(`Delete backup "${b.filename}"? This cannot be undone.`)) deleteBackup.mutate(b.filename);
                        }}
                      >
                        Delete
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Reset Data (danger zone) ─────────────────────────────────────

const CONFIRM_WORD = 'RESET';

function ResetTab() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<ResetModuleInfo | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [backupState, setBackupState] = useState<'idle' | 'downloading' | 'done'>('idle');
  const [backupFilename, setBackupFilename] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');

  const modulesQuery = useQuery({
    queryKey: ['reset-modules'],
    queryFn: async () => (await api.get<ResetModuleInfo[]>('/backups/reset/modules')).data,
  });

  const openDialog = (m: ResetModuleInfo | null) => {
    setError('');
    setConfirmText('');
    setPassword('');
    setBackupState('idle');
    setBackupFilename(null);
    setTarget(m);
  };

  // Step 1: create a full DB backup and download it to the user's computer before any wipe.
  const downloadBackup = async () => {
    setError('');
    setBackupState('downloading');
    try {
      const created = (await api.post<BackupFile>('/backups')).data;
      const res = await api.get(`/backups/${encodeURIComponent(created.filename)}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = created.filename;
      link.click();
      URL.revokeObjectURL(url);
      setBackupFilename(created.filename);
      setBackupState('done');
      qc.invalidateQueries({ queryKey: ['backups'] });
    } catch {
      setBackupState('idle');
      setError('Backup failed — make sure mysqldump is available on the server. Reset is blocked until a backup is downloaded.');
    }
  };

  const resetMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<{ label: string; deleted: number; backup: { filename: string } }>(`/backups/reset/${id}`, {
        password,
        backupFilename,
      }),
    onSuccess: (res) => {
      setResult(
        `${res.data.label}: ${res.data.deleted.toLocaleString()} record(s) deleted. Safety backup saved as ${res.data.backup.filename}.`,
      );
      setError('');
      setTarget(null);
      setConfirmText('');
      setPassword('');
      setBackupState('idle');
      setBackupFilename(null);
      qc.invalidateQueries({ queryKey: ['reset-modules'] });
      qc.invalidateQueries({ queryKey: ['backups'] });
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 401
          ? 'Incorrect password — no data was changed.'
          : 'Reset failed — no data was changed. Ensure mysqldump is available on the server.',
      );
    },
  });

  const canDelete =
    backupState === 'done' && password.length > 0 && confirmText === CONFIRM_WORD && !resetMutation.isPending;

  return (
    <div>
      <div className="card" style={{ borderColor: 'var(--warning)', background: 'var(--warning-light)', marginBottom: '1.25rem' }}>
        <strong style={{ color: 'var(--warning)' }}>⚠ Danger zone</strong>
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.88rem' }}>
          Resetting a module permanently deletes all of its records. Before it runs you must download a full
          database backup and confirm with your own login password. Master data — users, clients,
          products, machines, company profile — is never touched here.
        </p>
      </div>

      {result && <p style={{ color: 'var(--success)', fontSize: '0.9rem' }}>✓ {result}</p>}
      {modulesQuery.isLoading && <p>Loading modules…</p>}
      {modulesQuery.isError && <p className="error-text">Failed to load modules.</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        {modulesQuery.data?.map((m) => (
          <div key={m.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontWeight: 700 }}>{m.label}</span>
              <span style={{ fontSize: '1.35rem', fontWeight: 800, color: m.count > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                {m.count.toLocaleString()}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', flex: 1 }}>{m.description}</p>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ color: 'var(--danger)', borderColor: 'var(--danger)', alignSelf: 'flex-start', fontSize: '0.8rem', padding: '0.35rem 0.8rem' }}
              disabled={m.count === 0}
              onClick={() => { setResult(null); openDialog(m); }}
            >
              {m.count === 0 ? 'Empty' : 'Reset…'}
            </button>
          </div>
        ))}
      </div>

      <Dialog isOpen={!!target} onClose={() => setTarget(null)} title={`Reset ${target?.label ?? ''}?`} maxWidth={460}>
        {target && (
          <div>
            <p style={{ marginTop: 0, fontSize: '0.9rem' }}>
              This permanently deletes <strong>{target.count.toLocaleString()}</strong> {target.label} record(s).
              This cannot be undone from within the app. Complete all three steps below.
            </p>

            {/* Step 1 — download backup */}
            <div className="field">
              <label>Step 1 — Download a backup first</label>
              {backupState === 'done' ? (
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--success)' }}>
                  ✓ Backup downloaded: {backupFilename}
                </p>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginTop: '0.25rem' }}
                  disabled={backupState === 'downloading'}
                  onClick={downloadBackup}
                >
                  {backupState === 'downloading' ? 'Creating & downloading…' : 'Create & download backup'}
                </button>
              )}
            </div>

            {/* Step 2 — password */}
            <div className="field">
              <label>Step 2 — Confirm with your login password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your login password"
                autoComplete="current-password"
                disabled={backupState !== 'done'}
              />
            </div>

            {/* Step 3 — type RESET */}
            <div className="field">
              <label>Step 3 — Type <strong>{CONFIRM_WORD}</strong> to confirm</label>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_WORD}
                disabled={backupState !== 'done'}
              />
            </div>

            {error && <p className="error-text">{error}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-danger"
                style={{ flex: 1 }}
                disabled={!canDelete}
                onClick={() => resetMutation.mutate(target.id)}
              >
                {resetMutation.isPending ? 'Resetting…' : `Delete all ${target.label}`}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setTarget(null)}>Cancel</button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

// ── Database Management (backups + reset) ─────────────────────────

function DatabaseManagementTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
      <section>
        <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.85rem' }}>Database Backups</h2>
        <BackupsTab />
      </section>
      <section>
        <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.85rem' }}>Reset Data</h2>
        <ResetTab />
      </section>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('company');

  return (
    <div>
      <h1 style={{ marginBottom: '0.25rem' }}>Settings</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Manage your company profile, team roles &amp; permissions, database backups, and audit logs.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              padding: '0.6rem 0.9rem',
              fontSize: '0.9rem',
              fontWeight: 600,
              color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              marginBottom: '-1px',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'company' && <CompanyProfileTab />}
      {tab === 'users' && <UsersPage />}
      {tab === 'kpis' && <KpiSettingsPage />}
      {tab === 'inventory' && <InventoryPage />}
      {tab === 'database' && <DatabaseManagementTab />}
      {tab === 'audit' && <AuditLogsPage />}
    </div>
  );
}
