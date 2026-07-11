import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api, fileUrl } from '../lib/api';
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
    <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 1000 }}>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        This information appears on printed Job Orders and other official documents.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(260px, 1fr))', columnGap: '1.5rem' }}>
        <div>
          <div className="field">
            <label>Company Logo</label>
            {form.logoUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)' }}>
                <img
                  src={fileUrl(form.logoUrl)}
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

          <div className="field">
            <label htmlFor="cp-name">Business name</label>
            <input id="cp-name" required value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
          </div>

          <div className="field">
            <label htmlFor="cp-address">Address</label>
            <textarea id="cp-address" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        </div>

        <div>
          <div className="field">
            <label htmlFor="cp-phone">Phone</label>
            <input id="cp-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>

          <div className="field">
            <label htmlFor="cp-email">Email</label>
            <input id="cp-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>

          <div className="field">
            <label htmlFor="cp-tin">TIN / Tax ID</label>
            <input id="cp-tin" value={form.tin} onChange={(e) => setForm({ ...form, tin: e.target.value })} />
          </div>

          <div className="field">
            <label htmlFor="cp-website">Website</label>
            <input id="cp-website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" />
          </div>
        </div>
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
    onError: (err) => {
      const serverMessage = (err as AxiosError<{ message?: string }>).response?.data?.message;
      setError(serverMessage || 'Failed to create backup. Make sure mysqldump is installed and accessible on the server.');
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadBackup = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post<BackupFile>('/backups/upload', form);
    },
    onSuccess: () => {
      setError('');
      qc.invalidateQueries({ queryKey: ['backups'] });
    },
    onError: (err) => {
      const msg = (err as AxiosError<{ message?: string }>).response?.data?.message;
      setError(msg || 'Upload failed. Make sure the file is a .sql backup.');
    },
  });

  const deleteBackup = useMutation({
    mutationFn: (filename: string) => api.delete(`/backups/${filename}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backups'] }),
  });

  const RESTORE_WORD = 'RESTORE';
  const [restoreTarget, setRestoreTarget] = useState<BackupFile | null>(null);
  const [restoreScope, setRestoreScope] = useState<'full' | 'modules'>('full');
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [restoreResult, setRestoreResult] = useState<string | null>(null);

  const restoreModulesQuery = useQuery({
    queryKey: ['reset-modules'],
    queryFn: async () => (await api.get<ResetModuleInfo[]>('/backups/reset/modules')).data,
  });

  const closeRestore = () => {
    setRestoreTarget(null);
    setRestoreScope('full');
    setSelectedModules([]);
    setRestorePassword('');
    setRestoreConfirm('');
  };

  const restoreMutation = useMutation({
    mutationFn: () =>
      api.post<{ scope: string; tables: string[] }>(
        `/backups/${encodeURIComponent(restoreTarget!.filename)}/restore`,
        { password: restorePassword, full: restoreScope === 'full', modules: selectedModules },
      ),
    onSuccess: (res) => {
      setError('');
      setRestoreResult(
        res.data.scope === 'full' ? 'Full database restored.' : `Restored: ${res.data.tables.join(', ')}`,
      );
      closeRestore();
      qc.invalidateQueries();
    },
    onError: (err) => {
      const status = (err as AxiosError)?.response?.status;
      const msg = (err as AxiosError<{ message?: string }>).response?.data?.message;
      setError(status === 401 ? 'Incorrect password — nothing was restored.' : msg || 'Restore failed.');
    },
  });

  const toggleModule = (id: string) =>
    setSelectedModules((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));

  const canRestore =
    restorePassword.length > 0 &&
    restoreConfirm === RESTORE_WORD &&
    (restoreScope === 'full' || selectedModules.length > 0) &&
    !restoreMutation.isPending;

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>
          Create and download full snapshots of the database for safekeeping.
        </p>
        <span style={{ display: 'inline-flex', gap: '0.5rem' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".sql"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadBackup.mutate(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={uploadBackup.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadBackup.isPending ? 'Uploading…' : 'Upload backup'}
          </button>
          <button type="button" className="btn btn-primary" disabled={createBackup.isPending} onClick={() => createBackup.mutate()}>
            {createBackup.isPending ? 'Creating…' : 'Create backup'}
          </button>
        </span>
      </div>

      {error && <p className="error-text">{error}</p>}
      {restoreResult && (
        <p style={{ color: 'var(--success)', fontSize: '0.9rem' }}>✓ {restoreResult}</p>
      )}

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
                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', color: 'var(--warning)', borderColor: 'var(--warning)' }}
                        onClick={() => {
                          setRestoreResult(null);
                          setRestoreTarget(b);
                        }}
                      >
                        Restore
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

      <Dialog isOpen={!!restoreTarget} onClose={closeRestore} title="Restore from backup" maxWidth={480}>
        {restoreTarget && (
          <div>
            <div className="card" style={{ borderColor: 'var(--danger)', background: 'var(--warning-light)', marginBottom: '1rem' }}>
              <strong style={{ color: 'var(--danger)' }}>⚠ Destructive</strong>
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem' }}>
                Restoring overwrites live data and cannot be undone from the app. Consider creating a
                backup first. A <strong>full</strong> restore replaces the entire database including users —
                you may need to log in again. A <strong>module</strong> restore replaces those tables and can
                leave references from other modules inconsistent.
              </p>
            </div>

            <p style={{ marginTop: 0, fontSize: '0.85rem', fontFamily: 'monospace' }}>{restoreTarget.filename}</p>

            <div className="field">
              <label>What to restore</label>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
                <label style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center', fontWeight: 400 }}>
                  <input type="radio" name="restore-scope" checked={restoreScope === 'full'} onChange={() => setRestoreScope('full')} />
                  Full database
                </label>
                <label style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center', fontWeight: 400 }}>
                  <input type="radio" name="restore-scope" checked={restoreScope === 'modules'} onChange={() => setRestoreScope('modules')} />
                  Selected modules
                </label>
              </div>
            </div>

            {restoreScope === 'modules' && (
              <div className="field">
                <label>Modules</label>
                <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.25rem' }}>
                  {restoreModulesQuery.data?.map((m) => (
                    <label key={m.id} style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', fontWeight: 400, fontSize: '0.88rem' }}>
                      <input type="checkbox" checked={selectedModules.includes(m.id)} onChange={() => toggleModule(m.id)} />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="field">
              <label>Confirm with your login password</label>
              <input
                type="password"
                value={restorePassword}
                onChange={(e) => setRestorePassword(e.target.value)}
                placeholder="Your login password"
                autoComplete="current-password"
              />
            </div>

            <div className="field">
              <label>Type <strong>{RESTORE_WORD}</strong> to confirm</label>
              <input value={restoreConfirm} onChange={(e) => setRestoreConfirm(e.target.value)} placeholder={RESTORE_WORD} />
            </div>

            {error && <p className="error-text">{error}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="button" className="btn btn-danger" style={{ flex: 1 }} disabled={!canRestore} onClick={() => restoreMutation.mutate()}>
                {restoreMutation.isPending ? 'Restoring…' : 'Restore now'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={closeRestore}>Cancel</button>
            </div>
          </div>
        )}
      </Dialog>
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
