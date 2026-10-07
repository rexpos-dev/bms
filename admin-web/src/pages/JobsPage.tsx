import { type ChangeEvent, type FormEvent, useState } from 'react';
import { Eye, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fileUrl } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { Dialog } from '../components/Dialog';
import { Pagination, usePagination } from '../components/Pagination';
import { TableToolbar, matchesSearch, inDateRange } from '../components/TableToolbar';
import { SearchableClientSelect } from '../components/SearchableClientSelect';
import { useAuthStore } from '../lib/auth-store';
import type { AuthenticatedUser, Client, Job, JobStatus } from '../lib/types';

const EMPTY_FORM = { clientId: '', installerIds: [] as string[], scheduleDate: '', remarks: '' };
const JOB_STATUSES: JobStatus[] = ['ASSIGNED', 'ON_GOING', 'WAITING_ACTIVATION', 'COMPLETED', 'CANCELLED'];

function InstallerCheckboxList({
  installers,
  selectedIds,
  onChange,
  idPrefix,
}: {
  installers: AuthenticatedUser[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  idPrefix: string;
}) {
  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem' }}>
      {installers.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No installers found.</span>}
      {installers.map((installer) => (
        <label key={installer.id} htmlFor={`${idPrefix}-${installer.id}`} className="checklist-item">
          <input
            id={`${idPrefix}-${installer.id}`}
            type="checkbox"
            checked={selectedIds.includes(installer.id)}
            onChange={() => toggle(installer.id)}
          />
          {installer.fullName}
        </label>
      ))}
    </div>
  );
}

function AdminJobsView({ isReadOnly = false }: { isReadOnly?: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [assigningJobId, setAssigningJobId] = useState<string | null>(null);
  const [assignInstallerIds, setAssignInstallerIds] = useState<string[]>([]);

  const jobsQuery = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => (await api.get<Job[]>('/jobs')).data,
  });

  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<Client[]>('/clients')).data,
    enabled: showForm || editingJobId !== null,
  });

  const installersQuery = useQuery({
    queryKey: ['users', 'INSTALLER'],
    queryFn: async () => (await api.get<AuthenticatedUser[]>('/users', { params: { role: 'INSTALLER' } })).data,
    enabled: showForm || editingJobId !== null || assigningJobId !== null,
  });

  const createJob = useMutation({
    mutationFn: async () =>
      (
        await api.post<Job>('/jobs', {
          clientId: form.clientId,
          installerIds: form.installerIds.length > 0 ? form.installerIds : undefined,
          scheduleDate: form.scheduleDate,
          remarks: form.remarks || undefined,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setForm(EMPTY_FORM);
      setShowForm(false);
    },
  });

  const assignInstaller = useMutation({
    mutationFn: async ({ id, installerIds }: { id: string; installerIds: string[] }) =>
      (await api.patch<Job>(`/jobs/${id}/assign`, { installerIds })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setAssigningJobId(null);
      setAssignInstallerIds([]);
    },
  });

  const updateJob = useMutation({
    mutationFn: async () =>
      (await api.patch<Job>(`/jobs/${editingJobId}`, {
        clientId: editForm.clientId,
        installerIds: editForm.installerIds,
        scheduleDate: editForm.scheduleDate,
        remarks: editForm.remarks || null,
      })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setEditingJobId(null);
      setEditForm(EMPTY_FORM);
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    createJob.mutate();
  };

  const handleAssignSubmit = (event: FormEvent, id: string) => {
    event.preventDefault();
    assignInstaller.mutate({ id, installerIds: assignInstallerIds });
  };

  const openEditForm = (job: Job) => {
    setEditForm({
      clientId: job.clientId,
      // An explicit length check, not `??`: a job assigned before it had a
      // roster (e.g. via job-order conversion) has installers: [] rather than
      // undefined, and `??` would leave the form empty and silently unassign it.
      installerIds: job.installers && job.installers.length > 0
        ? job.installers.map((row) => row.user.id)
        : job.installerId
          ? [job.installerId]
          : [],
      scheduleDate: String(job.scheduleDate).slice(0, 10),
      remarks: job.remarks ?? '',
    });
    setEditingJobId(job.id);
  };

  const handleEditSubmit = (event: FormEvent) => {
    event.preventDefault();
    updateJob.mutate();
  };

  const activeJobToAssign = jobsQuery.data?.find(j => j.id === assigningJobId);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>Installations</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
            {isReadOnly
              ? 'Track the installation status of jobs linked to your clients and job orders.'
              : 'Assign field installers, then track each job from assignment through proof upload and activation hand-off to a developer.'}
          </p>
        </div>
        {!isReadOnly && (
          <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
            Schedule installation
          </button>
        )}
      </div>

      <Dialog
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Schedule Installation"
        maxWidth={480}
      >
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="clientId">Client</label>                <SearchableClientSelect
              value={form.clientId}
              onChange={(clientId) => setForm({ ...form, clientId })}
              clients={clientsQuery.data ?? []}
            />
          </div>
          <div className="field">
            <label>Installers (optional)</label>
            <InstallerCheckboxList
              installers={installersQuery.data ?? []}
              selectedIds={form.installerIds}
              onChange={(ids) => setForm({ ...form, installerIds: ids })}
              idPrefix="create-installer"
            />
          </div>
          <div className="field">
            <label htmlFor="scheduleDate">Schedule date</label>
            <input
              id="scheduleDate"
              type="date"
              required
              value={form.scheduleDate}
              onChange={(e) => setForm({ ...form, scheduleDate: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="remarks">Remarks</label>
            <textarea
              id="remarks"
              rows={2}
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            />
          </div>
          {createJob.isError && <p className="error-text">Could not schedule the installation. Try again.</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={createJob.isPending} style={{ flex: 1 }}>
              {createJob.isPending ? 'Saving…' : 'Schedule'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog
        isOpen={!!editingJobId}
        onClose={() => setEditingJobId(null)}
        title="Edit Installation"
        maxWidth={480}
      >
        <form onSubmit={handleEditSubmit}>
          <div className="field">
            <label htmlFor="edit-clientId">Client</label>                <SearchableClientSelect
              value={editForm.clientId}
              onChange={(clientId) => setEditForm({ ...editForm, clientId })}
              clients={clientsQuery.data ?? []}
            />
          </div>
          <div className="field">
            <label>Installers (optional)</label>
            <InstallerCheckboxList
              installers={installersQuery.data ?? []}
              selectedIds={editForm.installerIds}
              onChange={(ids) => setEditForm({ ...editForm, installerIds: ids })}
              idPrefix="edit-installer"
            />
          </div>
          <div className="field">
            <label htmlFor="edit-scheduleDate">Schedule date</label>
            <input
              id="edit-scheduleDate"
              type="date"
              required
              value={editForm.scheduleDate}
              onChange={(event) => setEditForm({ ...editForm, scheduleDate: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="edit-remarks">Remarks</label>
            <textarea
              id="edit-remarks"
              rows={2}
              value={editForm.remarks}
              onChange={(event) => setEditForm({ ...editForm, remarks: event.target.value })}
            />
          </div>
          {updateJob.isError && <p className="error-text">Could not update the installation. Try again.</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={updateJob.isPending} style={{ flex: 1 }}>
              {updateJob.isPending ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditingJobId(null)}>
              Cancel
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog
        isOpen={!!assigningJobId}
        onClose={() => setAssigningJobId(null)}
        title="Assign Installer"
        maxWidth={400}
      >
        {activeJobToAssign && (
          <form onSubmit={(e) => handleAssignSubmit(e, activeJobToAssign.id)}>
            <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: 8, fontSize: '0.85rem' }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Client:</div>
              <div style={{ fontWeight: 600 }}>{activeJobToAssign.client?.businessName}</div>
              <div style={{ color: 'var(--text-muted)', marginTop: '0.5rem', marginBottom: '0.15rem' }}>Scheduled:</div>
              <div style={{ fontWeight: 600 }}>{new Date(activeJobToAssign.scheduleDate).toLocaleDateString()}</div>
            </div>
            <div className="field">
              <label>Installers</label>
              <InstallerCheckboxList
                installers={installersQuery.data ?? []}
                selectedIds={assignInstallerIds}
                onChange={setAssignInstallerIds}
                idPrefix="assign-installer"
              />
            </div>
            {assignInstaller.isError && (
              <p className="error-text" style={{ marginBottom: '1rem' }}>Failed. Try again.</p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={assignInstaller.isPending || assignInstallerIds.length === 0} style={{ flex: 1 }}>
                {assignInstaller.isPending ? 'Assigning…' : 'Assign'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setAssigningJobId(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </Dialog>

      <AdminJobsTable data={jobsQuery.data ?? []} isLoading={jobsQuery.isLoading} isError={jobsQuery.isError} isReadOnly={isReadOnly} onEdit={openEditForm} onAssign={(id, installerIds) => { setAssigningJobId(id); setAssignInstallerIds(installerIds); }} />
    </div>
  );
}

function AdminJobsTable({ data, isLoading, isError, isReadOnly = false, onEdit, onAssign }: {
  data: Job[]; isLoading: boolean; isError: boolean; isReadOnly?: boolean;
  onEdit: (job: Job) => void;
  onAssign: (id: string, installerIds: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filtered = data.filter((job) =>
    matchesSearch(search, job.client?.businessName, job.installers?.map((row) => row.user.fullName).join(' '), job.remarks)
    && (!status || job.jobStatus === status)
    && inDateRange(job.scheduleDate, from, to),
  );
  const pg = usePagination(filtered);
  return (
      <div className="card">
        {isLoading && <p>Loading installations…</p>}
        {isError && <p className="error-text">Failed to load installations.</p>}
        {!isLoading && data.length === 0 && <p>No installations scheduled yet.</p>}
        {data.length > 0 && (
          <>
          <TableToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search client, installer, remarks…"
            selects={[{
              value: status,
              onChange: setStatus,
              ariaLabel: 'Filter by status',
              options: [{ value: '', label: 'All statuses' }, ...JOB_STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') }))],
            }]}
            dateRange={{ from, to, onFrom: setFrom, onTo: setTo }}
          />
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Installer</th>
                <th>Schedule</th>
                <th>Status</th>
                <th>Remarks</th>
                {!isReadOnly && <th></th>}
              </tr>
            </thead>
            <tbody className="stagger-rows">
              {pg.paginated.map((job) => (
                <tr key={job.id}>
                  <td style={{ fontWeight: 500 }}>{job.client?.businessName ?? '—'}</td>
                  <td>
                    {job.installers && job.installers.length > 0
                      ? job.installers.map((row) => row.user.fullName).join(', ')
                      : job.installer
                        ? job.installer.fullName
                        : <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>}
                  </td>
                  <td>{new Date(job.scheduleDate).toLocaleDateString()}</td>
                  <td>
                    <StatusBadge status={job.jobStatus} />
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{job.remarks ?? '—'}</td>
                  {!isReadOnly && (
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                          onClick={() => onEdit(job)}
                        >
                          Edit
                        </button>
                        {(job.jobStatus === 'ASSIGNED' || !job.installerId) && (
                          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => onAssign(job.id, job.installers?.map((row) => row.user.id) ?? [])}>Assign</button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={isReadOnly ? 5 : 6} style={{ padding: '1rem 0', color: 'var(--text-muted)', textAlign: 'center' }}>No matches.</td></tr>
              )}
            </tbody>
          </table>
          <Pagination page={pg.page} pageSize={pg.pageSize} totalPages={pg.totalPages} total={pg.total} start={pg.start} onPage={pg.changePage} onPageSize={pg.changePageSize} />
          </>
        )}
      </div>
  );
}

const EMPTY_PROOF_FORM = { gpsLatitude: '', gpsLongitude: '' };

function InstallerJobsView() {
  const queryClient = useQueryClient();
  const [proofJobId, setProofJobId] = useState<string | null>(null);
  const [viewJobId, setViewJobId] = useState<string | null>(null);
  const [viewPhotoUrl, setViewPhotoUrl] = useState<string | null>(null);
  const [proofForm, setProofForm] = useState(EMPTY_PROOF_FORM);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [statusWarning, setStatusWarning] = useState<string | null>(null);

  const resetProofForm = () => {
    setProofForm(EMPTY_PROOF_FORM);
    setSignatureFile(null);
    setSignaturePreview(null);
    setPhotoFiles([]);
    setPhotoPreviews([]);
  };

  const handleSignatureChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSignatureFile(file);
    setSignaturePreview(file ? URL.createObjectURL(file) : null);
  };

  const handlePhotosChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setPhotoFiles(files);
    setPhotoPreviews(files.map((file) => URL.createObjectURL(file)));
  };

  const jobsQuery = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => (await api.get<Job[]>('/jobs')).data,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, jobStatus }: { id: string; jobStatus: JobStatus }) =>
      (await api.patch<Job>(`/jobs/${id}/status`, { jobStatus })).data,
    onSuccess: () => {
      setStatusWarning(null);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not update this job. Please try again.';
      setStatusWarning(message);
    },
  });

  const submitProof = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      let clientSignature: string | undefined;
      if (signatureFile) {
        const form = new FormData();
        form.append('files', signatureFile);
        const { data } = await api.post<{ urls: string[] }>('/uploads/images', form);
        clientSignature = data.urls[0];
      }

      const photosForm = new FormData();
      photoFiles.forEach((file) => photosForm.append('files', file));
      const { data: photosData } = await api.post<{ urls: string[] }>('/uploads/images', photosForm);

      return (
        await api.post(`/jobs/${id}/proof`, {
          clientSignature,
          photoUrls: photosData.urls,
          gpsLatitude: proofForm.gpsLatitude ? Number(proofForm.gpsLatitude) : undefined,
          gpsLongitude: proofForm.gpsLongitude ? Number(proofForm.gpsLongitude) : undefined,
        })
      ).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setProofJobId(null);
      resetProofForm();
    },
  });

  const handleProofSubmit = (event: FormEvent, id: string) => {
    event.preventDefault();
    submitProof.mutate({ id });
  };

  const openProofForm = (id: string) => {
    setProofJobId(id);
    resetProofForm();
  };

  const activeJobToProof = jobsQuery.data?.find(j => j.id === proofJobId);
  const viewedJob = jobsQuery.data?.find(j => j.id === viewJobId);
  const viewedPhotos = Array.isArray(viewedJob?.proof?.photoUrls) ? viewedJob.proof.photoUrls : [];

  return (
    <div>
      <h1 style={{ marginBottom: '0.25rem' }}>My Jobs</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Work through your assigned installations: start the job on-site, then submit proof of
        installation (signature, photos, GPS) so a developer can activate the license.
      </p>

      <Dialog
        isOpen={!!proofJobId}
        onClose={() => setProofJobId(null)}
        title="Submit Installation Proof"
        maxWidth={480}
      >
        {activeJobToProof && (
          <form onSubmit={(e) => handleProofSubmit(e, activeJobToProof.id)}>
            <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: 8, fontSize: '0.85rem' }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Client:</div>
              <div style={{ fontWeight: 600 }}>{activeJobToProof.client?.businessName}</div>
            </div>
            <div className="field">
              <label htmlFor="signature">Client signature (photo, optional)</label>
              <input
                id="signature"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleSignatureChange}
              />
              {signaturePreview && (
                <img
                  src={signaturePreview}
                  alt="Client signature preview"
                  style={{ marginTop: '0.5rem', maxHeight: 100, borderRadius: 6, border: '1px solid var(--border)' }}
                />
              )}
            </div>
            <div className="field">
              <label htmlFor="photos">Installation photos</label>
              <input
                id="photos"
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                required
                onChange={handlePhotosChange}
              />
              {photoPreviews.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {photoPreviews.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt={`Installation photo ${i + 1}`}
                      style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
                    />
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="lat">GPS latitude (optional)</label>
                <input
                  id="lat"
                  type="number"
                  step="any"
                  value={proofForm.gpsLatitude}
                  onChange={(e) => setProofForm({ ...proofForm, gpsLatitude: e.target.value })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="lng">GPS longitude (optional)</label>
                <input
                  id="lng"
                  type="number"
                  step="any"
                  value={proofForm.gpsLongitude}
                  onChange={(e) => setProofForm({ ...proofForm, gpsLongitude: e.target.value })}
                />
              </div>
            </div>
            {submitProof.isError && (
              <p className="error-text">Could not submit proof of installation. Try again.</p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={submitProof.isPending} style={{ flex: 1 }}>
                {submitProof.isPending ? 'Uploading…' : 'Submit proof'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setProofJobId(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog
        isOpen={!!viewJobId}
        onClose={() => setViewJobId(null)}
        title="Job Details"
        maxWidth={520}
      >
        {viewedJob && (
          <div>
            <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: 8, fontSize: '0.85rem', display: 'grid', gap: '0.5rem' }}>
              <div>
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Client:</div>
                <div style={{ fontWeight: 600 }}>{viewedJob.client?.businessName ?? '—'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Address:</div>
                <div style={{ fontWeight: 600 }}>{viewedJob.client?.address ?? '—'}</div>
              </div>
              <div style={{ display: 'flex', gap: '1.5rem' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Scheduled:</div>
                  <div style={{ fontWeight: 600 }}>{new Date(viewedJob.scheduleDate).toLocaleDateString()}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Status:</div>
                  <StatusBadge status={viewedJob.jobStatus} />
                </div>
              </div>
              {viewedJob.remarks && (
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Remarks:</div>
                  <div>{viewedJob.remarks}</div>
                </div>
              )}
            </div>

            {viewedJob.proof ? (
              <div>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Submitted Proof</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                  Submitted: {new Date(viewedJob.proof.capturedAt).toLocaleString()}
                </div>
                {viewedPhotos.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {viewedPhotos.map((url) => (
                      <img
                        key={url}
                        src={fileUrl(url)}
                        alt="Installation proof"
                        onClick={() => setViewPhotoUrl(url)}
                        style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'zoom-in' }}
                      />
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No photos attached.</p>
                )}
                {viewedJob.proof.clientSignature && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.35rem' }}>Client signature:</div>
                    <img
                      src={fileUrl(viewedJob.proof.clientSignature)}
                      alt="Client signature"
                      onClick={() => setViewPhotoUrl(viewedJob.proof!.clientSignature!)}
                      style={{ maxHeight: 90, borderRadius: 8, border: '1px solid var(--border)', cursor: 'zoom-in' }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No proof submitted for this job yet.</p>
            )}
          </div>
        )}
      </Dialog>

      {/* ── Proof photo viewer ── */}
      {viewPhotoUrl && (
        <div
          onClick={() => setViewPhotoUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '1.5rem',
            cursor: 'zoom-out',
          }}
        >
          <button
            onClick={() => setViewPhotoUrl(null)}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.1rem',
            }}
          >
            <X size={16} />
          </button>
          <img
            src={fileUrl(viewPhotoUrl)}
            alt="Installation proof"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw',
              maxHeight: '85vh',
              objectFit: 'contain',
              borderRadius: 12,
              boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
              cursor: 'default',
            }}
          />
        </div>
      )}

      {statusWarning && (
        <div
          role="alert"
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: 8,
            background: 'rgba(220, 38, 38, 0.08)',
            border: '1px solid var(--danger)',
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.6rem',
            fontSize: '0.9rem',
          }}
        >
          <span style={{ fontWeight: 700 }}>⚠ Warning:</span>
          <span style={{ flex: 1 }}>{statusWarning}</span>
          <button
            type="button"
            onClick={() => setStatusWarning(null)}
            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontWeight: 700 }}
            aria-label="Dismiss warning"
          >
            ×
          </button>
        </div>
      )}

      <InstallerJobsTable data={jobsQuery.data ?? []} isLoading={jobsQuery.isLoading} isError={jobsQuery.isError} onUpdateStatus={(id, s) => updateStatus.mutate({ id, jobStatus: s })} onOpenProof={openProofForm} onView={setViewJobId} />
    </div>
  );
}

function InstallerJobsTable({ data, isLoading, isError, onUpdateStatus, onOpenProof, onView }: {
  data: Job[]; isLoading: boolean; isError: boolean;
  onUpdateStatus: (id: string, s: JobStatus) => void;
  onOpenProof: (id: string) => void;
  onView: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filtered = data.filter((job) =>
    matchesSearch(search, job.client?.businessName, job.remarks)
    && (!status || job.jobStatus === status)
    && inDateRange(job.scheduleDate, from, to),
  );
  const pg = usePagination(filtered);
  return (
      <div className="card" style={{ marginTop: '1.5rem' }}>
        {isLoading && <p>Loading your jobs…</p>}
        {isError && <p className="error-text">Failed to load your jobs.</p>}
        {!isLoading && data.length === 0 && <p>No jobs assigned to you yet.</p>}
        {data.length > 0 && (
          <>
          <TableToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search client, remarks…"
            selects={[{
              value: status,
              onChange: setStatus,
              ariaLabel: 'Filter by status',
              options: [{ value: '', label: 'All statuses' }, ...JOB_STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') }))],
            }]}
            dateRange={{ from, to, onFrom: setFrom, onTo: setTo }}
          />
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Schedule</th>
                <th>Status</th>
                <th>Remarks</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="stagger-rows">
              {pg.paginated.map((job) => (
                <tr key={job.id}>
                  <td style={{ fontWeight: 500 }}>{job.client?.businessName ?? '—'}</td>
                  <td>{new Date(job.scheduleDate).toLocaleDateString()}</td>
                  <td><StatusBadge status={job.jobStatus} /></td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{job.remarks ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                      {job.jobStatus === 'ASSIGNED' && (
                        <>
                          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => onUpdateStatus(job.id, 'ON_GOING')}>Start job</button>
                          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => onUpdateStatus(job.id, 'CANCELLED')}>Cancel</button>
                        </>
                      )}
                      {job.jobStatus === 'ON_GOING' && (
                        <button type="button" className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => onOpenProof(job.id)}>Submit proof</button>
                      )}
                      {job.jobStatus === 'WAITING_ACTIVATION' && (
                        <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => onUpdateStatus(job.id, 'COMPLETED')}>Mark complete</button>
                      )}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        title="View job details"
                        aria-label="View job details"
                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        onClick={() => onView(job.id)}
                      >
                        <Eye size={14} />
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '1rem 0', color: 'var(--text-muted)', textAlign: 'center' }}>No matches.</td></tr>
              )}
            </tbody>
          </table>
          <Pagination page={pg.page} pageSize={pg.pageSize} totalPages={pg.totalPages} total={pg.total} start={pg.start} onPage={pg.changePage} onPageSize={pg.changePageSize} />
          </>
        )}
      </div>
  );
}

const ADMIN_PRIMARY_ROLES = new Set(['SUPER_ADMIN', 'ADMIN_STAFF', 'LIAISON', 'SALES_STAFF', 'ENCODER']);
const READ_ONLY_ROLES = new Set(['SALES_STAFF']);

export function JobsPage() {
  const user = useAuthStore((s) => s.user);
  const hasInstallerRole = user?.roles?.includes('INSTALLER') ?? user?.role === 'INSTALLER';
  const isAdminPrimary = ADMIN_PRIMARY_ROLES.has(user?.role ?? '');
  const showInstallerView = hasInstallerRole && !isAdminPrimary;
  const isReadOnly = READ_ONLY_ROLES.has(user?.role ?? '');
  return showInstallerView ? <InstallerJobsView /> : <AdminJobsView isReadOnly={isReadOnly} />;
}
