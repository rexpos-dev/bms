import { type FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Dialog } from '../components/Dialog';
import { Pagination, usePagination } from '../components/Pagination';
import { ProgressBar } from '../components/ProgressBar';
import { StatusBadge } from '../components/StatusBadge';
import { useAuthStore } from '../lib/auth-store';
import type { ChecklistItem, DevProject } from '../lib/types';

const EMPTY_CREATE_FORM = { name: '', description: '', developerId: '', targetHours: '' };

/** Progress priority: targetHours (work budget) → date range → manual */
function computeProgress(project: DevProject): number {
  if (project.targetHours && project.targetHours > 0) {
    const trackedHours = project.totalMinutes / 60;
    return Math.min(100, Math.round((trackedHours / project.targetHours) * 100));
  }
  if (project.projectStart && project.projectDeadline) {
    const start = new Date(project.projectStart).getTime();
    const end = new Date(project.projectDeadline).getTime();
    const now = Date.now();
    const total = end - start;
    if (total > 0) return Math.min(100, Math.max(0, Math.round(((now - start) / total) * 100)));
  }
  return project.progressPercent;
}

function progressBasis(project: DevProject): string {
  if (project.targetHours) return 'hours-based';
  if (project.projectStart && project.projectDeadline) return 'date-based';
  return 'manual';
}

function daysRemaining(project: DevProject): number | null {
  if (!project.projectDeadline) return null;
  const diff = new Date(project.projectDeadline).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatTrackedVsTarget(project: DevProject) {
  const trackedH = (project.totalMinutes / 60).toFixed(1);
  if (project.targetHours) {
    return `${trackedH}h / ${project.targetHours}h`;
  }
  return formatMinutes(project.totalMinutes);
}
const EMPTY_REPORT_FORM = { title: '', comment: '', taggedAdminId: '' };

function fieldLabel(text: string) {
  return <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{text}</div>;
}

function formatMinutes(totalMinutes: number) {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatLiveDuration(project: DevProject) {
  if (project.status !== 'IN_PROGRESS' || !project.startedAt) {
    return formatMinutes(project.totalMinutes);
  }
  const elapsedSec = Math.max(0, Math.floor((Date.now() - new Date(project.startedAt).getTime()) / 1000));
  const totalSec = project.totalMinutes * 60 + elapsedSec;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function useTick(intervalMs: number, enabled: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}

export function DevProjectsPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewProgressId, setViewProgressId] = useState<string | null>(null);
  const [editingTimeframeId, setEditingTimeframeId] = useState<string | null>(null);
  const [progressDraft, setProgressDraft] = useState('');
  const [reportForm, setReportForm] = useState(EMPTY_REPORT_FORM);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistInput, setChecklistInput] = useState('');
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdminStaff = user?.role === 'ADMIN_STAFF';
  const isAdminRole = isSuperAdmin || isAdminStaff;
  const canCreate = user?.role === 'DEVELOPER' || isSuperAdmin;
  const canTagAdmins = user?.role === 'DEVELOPER' || isSuperAdmin;

  const projectsQuery = useQuery({
    queryKey: ['dev-projects'],
    queryFn: async () => (await api.get<DevProject[]>('/dev-projects')).data,
  });

  const developersQuery = useQuery({
    queryKey: ['dev-projects', 'developers'],
    queryFn: async () => (await api.get<{ id: string; fullName: string }[]>('/dev-projects/developers')).data,
    enabled: isSuperAdmin,
  });

  const reviewersQuery = useQuery({
    queryKey: ['dev-projects', 'reviewers'],
    queryFn: async () => (await api.get<{ id: string; fullName: string; role: string }[]>('/dev-projects/reviewers')).data,
    enabled: canTagAdmins,
  });

  const detailQuery = useQuery({
    queryKey: ['dev-projects', selectedId],
    queryFn: async () => (await api.get<DevProject>(`/dev-projects/${selectedId}`)).data,
    enabled: !!selectedId,
  });

  const viewProgressQuery = useQuery({
    queryKey: ['dev-projects', viewProgressId],
    queryFn: async () => (await api.get<DevProject>(`/dev-projects/${viewProgressId}`)).data,
    enabled: !!viewProgressId,
  });

  const hasRunning = !!projectsQuery.data?.some((p) => p.status === 'IN_PROGRESS');
  useTick(1000, hasRunning);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['dev-projects'] });
    qc.invalidateQueries({ queryKey: ['dev-active'] });
  };

  const createProject = useMutation({
    mutationFn: () =>
      api.post('/dev-projects', {
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        developerId: createForm.developerId || undefined,
        targetHours: createForm.targetHours ? Number(createForm.targetHours) : undefined,
      }),
    onSuccess: () => {
      invalidate();
      setCreateForm(EMPTY_CREATE_FORM);
      setShowCreate(false);
    },
  });

  const startProject = useMutation({
    mutationFn: (id: string) => api.post(`/dev-projects/${id}/start`),
    onSuccess: invalidate,
  });

  const stopProject = useMutation({
    mutationFn: (id: string) => api.post(`/dev-projects/${id}/stop`),
    onSuccess: invalidate,
  });

  const updateProgress = useMutation({
    mutationFn: () =>
      api.patch(`/dev-projects/${selectedId}/progress`, { progressPercent: Number(progressDraft) }),
    onSuccess: invalidate,
  });

  const updateTargetHours = useMutation({
    mutationFn: ({ id, targetHours }: { id: string; targetHours: number | null }) =>
      api.patch(`/dev-projects/${id}`, { targetHours }),
    onSuccess: invalidate,
  });

  const updateTimeframe = useMutation({
    mutationFn: ({ id, projectStart, projectDeadline }: { id: string; projectStart: string | null; projectDeadline: string | null }) =>
      api.patch(`/dev-projects/${id}`, { projectStart, projectDeadline }),
    onSuccess: invalidate,
  });

  const addReport = useMutation({
    mutationFn: () =>
      api.post<DevProject>(`/dev-projects/${selectedId}/reports`, {
        title: reportForm.title.trim(),
        comment: reportForm.comment.trim() || undefined,
        checklist: checklistItems,
        taggedAdminId: reportForm.taggedAdminId || undefined,
      }),
    onSuccess: (res) => {
      // Immediately reflect the new report in the dialog without waiting for a refetch
      if (selectedId) qc.setQueryData(['dev-projects', selectedId], res.data);
      invalidate();
      setReportForm(EMPTY_REPORT_FORM);
      setChecklistItems([]);
      setChecklistInput('');
    },
  });

  const addFeedback = useMutation({
    mutationFn: (reportId: string) =>
      api.post<DevProject>(`/dev-projects/reports/${reportId}/feedback`, { message: (feedbackDrafts[reportId] ?? '').trim() }),
    onSuccess: (res, reportId) => {
      // Update whichever dialog is currently open
      if (selectedId) qc.setQueryData(['dev-projects', selectedId], res.data);
      if (viewProgressId) qc.setQueryData(['dev-projects', viewProgressId], res.data);
      invalidate();
      setFeedbackDrafts((prev) => ({ ...prev, [reportId]: '' }));
    },
  });

  const selectedProject = detailQuery.data ?? null;

  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
  if (selectedProject && selectedProject.id !== loadedProjectId) {
    setLoadedProjectId(selectedProject.id);
    setProgressDraft(String(selectedProject.progressPercent));
  }

  const isOwner = !!selectedProject && selectedProject.developerId === user?.id;
  const canControl = !!selectedProject && isOwner;

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    createProject.mutate();
  };

  const handleProgressSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = Number(progressDraft);
    if (!Number.isNaN(value) && value >= 0 && value <= 100) {
      updateProgress.mutate();
    }
  };

  const handleAddChecklistItem = () => {
    const label = checklistInput.trim();
    if (!label) return;
    setChecklistItems((items) => [...items, { label, done: false }]);
    setChecklistInput('');
  };

  const toggleDraftItem = (index: number) => {
    setChecklistItems((items) => items.map((item, i) => (i === index ? { ...item, done: !item.done } : item)));
  };

  const removeDraftItem = (index: number) => {
    setChecklistItems((items) => items.filter((_, i) => i !== index));
  };

  const handleReportSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!reportForm.title.trim()) return;
    addReport.mutate();
  };

  const closeDetail = () => {
    setSelectedId(null);
    setReportForm(EMPTY_REPORT_FORM);
    setChecklistItems([]);
    setChecklistInput('');
  };

  const viewProject = viewProgressQuery.data ?? null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <p style={{ color: 'var(--text-muted)', margin: 0, maxWidth: 560 }}>
          {user?.role === 'DEVELOPER'
            ? 'Track progress on the software you are developing. Start the timer when you begin working, stop it when you pause, and post checklist reports for admin review.'
            : 'Monitor software development progress across all developers, including time tracked, current status, and checklist reports.'}
        </p>
        {canCreate && (
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            New software project
          </button>
        )}
      </div>

      {projectsQuery.isLoading && <p>Loading projects…</p>}
      {projectsQuery.isError && <p className="error-text">Failed to load development projects.</p>}
      {projectsQuery.data?.length === 0 && <p>No software development projects yet.</p>}

      {projectsQuery.data && projectsQuery.data.length > 0 && (
        <DevProjectsTable
          data={projectsQuery.data}
          isAdminRole={isAdminRole}
          userId={user?.id}
          onViewProgress={setViewProgressId}
          onStop={(id) => stopProject.mutate(id)}
          onStart={(id) => startProject.mutate(id)}
          onOpen={setSelectedId}
          stopIsPending={stopProject.isPending}
          startIsPending={startProject.isPending}
          isDeveloperRole={user?.role === 'DEVELOPER'}
        />
      )}

      <Dialog isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Software Development Project" maxWidth={480}>
        <form onSubmit={handleCreateSubmit}>
          <div className="field">
            <label htmlFor="dp-name">Software name</label>
            <input
              id="dp-name"
              required
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="e.g., Inventory System v2"
            />
          </div>
          <div className="field">
            <label htmlFor="dp-description">Description (optional)</label>
            <textarea
              id="dp-description"
              rows={3}
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              placeholder="Scope, modules, notes, etc."
            />
          </div>
          <div className="field">
            <label htmlFor="dp-target-hours">Estimated timeframe (hours)</label>
            <input
              id="dp-target-hours"
              type="number"
              min={0.5}
              step={0.5}
              value={createForm.targetHours}
              onChange={(e) => setCreateForm({ ...createForm, targetHours: e.target.value })}
              placeholder="e.g., 40"
            />
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Progress % will be auto-calculated from time tracked ÷ this target.
            </div>
          </div>
          {isSuperAdmin && (
            <div className="field">
              <label htmlFor="dp-developer">Assign to developer</label>
              <select
                id="dp-developer"
                required
                value={createForm.developerId}
                onChange={(e) => setCreateForm({ ...createForm, developerId: e.target.value })}
              >
                <option value="">Select developer…</option>
                {developersQuery.data?.map((d) => (
                  <option key={d.id} value={d.id}>{d.fullName}</option>
                ))}
              </select>
            </div>
          )}
          {createProject.isError && <p className="error-text">Failed to create project. Try again.</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={createProject.isPending} style={{ flex: 1 }}>
              {createProject.isPending ? 'Creating…' : 'Create project'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </form>
      </Dialog>

      {/* ── View Progress Dialog (admin read-only) ── */}
      <Dialog isOpen={!!viewProgressId} onClose={() => setViewProgressId(null)} title={viewProject?.name ?? 'Project Progress'} maxWidth={600}>
        {viewProgressQuery.isLoading && <p>Loading…</p>}
        {viewProject && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Status + progress */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="card" style={{ padding: '1rem' }}>
                {fieldLabel('Status')}
                <div style={{ marginTop: '0.25rem' }}><StatusBadge status={viewProject.status} /></div>
              </div>
              <div className="card" style={{ padding: '1rem' }}>
                {fieldLabel('Progress')}
                <div style={{ fontWeight: 700, fontSize: '1.5rem', marginBottom: '0.35rem' }}>{computeProgress(viewProject)}%</div>
                <ProgressBar percent={computeProgress(viewProject)} />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                  {progressBasis(viewProject)}
                </div>
              </div>
            </div>

            {/* Developer + time */}
            <div className="card" style={{ padding: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
              <div>
                {fieldLabel('Developer')}
                <div style={{ fontWeight: 600 }}>{viewProject.developer?.fullName ?? '—'}</div>
              </div>
              <div>
                {fieldLabel('Time tracked')}
                <div style={{ fontWeight: 600 }}>{formatTrackedVsTarget(viewProject)}</div>
                {viewProject.targetHours && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {Math.max(0, viewProject.targetHours - viewProject.totalMinutes / 60).toFixed(1)}h remaining
                  </div>
                )}
              </div>
              <div>
                {fieldLabel('Progress basis')}
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent)' }}>{progressBasis(viewProject)}</div>
              </div>
            </div>

            {/* Timeframe — admin-editable */}
            <div className="card" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Project Timeframe</div>
                {editingTimeframeId !== viewProject.id ? (
                  <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
                    onClick={() => setEditingTimeframeId(viewProject.id)}>
                    Edit Timeframe
                  </button>
                ) : null}
              </div>

              {editingTimeframeId === viewProject.id ? (
                <TimeframeEditor
                  project={viewProject}
                  onSave={({ projectStart, projectDeadline }) => {
                    updateTimeframe.mutate({ id: viewProject.id, projectStart, projectDeadline });
                    setEditingTimeframeId(null);
                  }}
                  onCancel={() => setEditingTimeframeId(null)}
                  isPending={updateTimeframe.isPending}
                />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    {fieldLabel('Start date')}
                    <div style={{ fontWeight: 600 }}>
                      {viewProject.projectStart ? new Date(viewProject.projectStart).toLocaleDateString() : <span style={{ color: 'var(--text-muted)' }}>Not set</span>}
                    </div>
                  </div>
                  <div>
                    {fieldLabel('Deadline')}
                    <div style={{ fontWeight: 600 }}>
                      {viewProject.projectDeadline ? (
                        <>
                          {new Date(viewProject.projectDeadline).toLocaleDateString()}
                          {daysRemaining(viewProject) !== null && (
                            <span style={{
                              marginLeft: '0.5rem', fontSize: '0.75rem', fontWeight: 700,
                              color: (daysRemaining(viewProject) ?? 0) < 0 ? 'var(--danger)' : (daysRemaining(viewProject) ?? 0) <= 7 ? 'var(--warning)' : 'var(--success)',
                            }}>
                              {(daysRemaining(viewProject) ?? 0) < 0
                                ? `${Math.abs(daysRemaining(viewProject)!)}d overdue`
                                : `${daysRemaining(viewProject)}d left`}
                            </span>
                          )}
                        </>
                      ) : <span style={{ color: 'var(--text-muted)' }}>Not set</span>}
                    </div>
                  </div>
                  {viewProject.projectStart && viewProject.projectDeadline && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      {fieldLabel('Duration')}
                      <div style={{ fontWeight: 600 }}>
                        {Math.round((new Date(viewProject.projectDeadline).getTime() - new Date(viewProject.projectStart).getTime()) / (1000 * 60 * 60 * 24))} days total
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            {viewProject.description && (
              <div>
                {fieldLabel('Description')}
                <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
                  {viewProject.description}
                </p>
              </div>
            )}

            {/* Session history */}
            {viewProject.sessions && viewProject.sessions.length > 0 && (
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem' }}>Session History</div>
                <div className="card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 200, overflowY: 'auto' }}>
                  {viewProject.sessions.map((s, i) => (
                    <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.75rem', fontSize: '0.85rem', padding: '0.4rem 0', borderBottom: i < (viewProject.sessions?.length ?? 0) - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '0.1rem' }}>Started</div>
                        <div>{new Date(s.startedAt).toLocaleString()}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '0.1rem' }}>Ended</div>
                        <div>{s.endedAt ? new Date(s.endedAt).toLocaleString() : <span style={{ color: 'var(--warning)' }}>In progress…</span>}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '0.1rem' }}>Duration</div>
                        <div style={{ fontWeight: 600 }}>{s.endedAt ? formatMinutes(s.minutes ?? 0) : '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reports (read-only with feedback) */}
            {viewProject.reports && viewProject.reports.length > 0 && (
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem' }}>Reports</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 300, overflowY: 'auto' }}>
                  {viewProject.reports.map((report) => {
                    const canGiveFeedback = isSuperAdmin || (isAdminStaff && report.taggedAdminId === user?.id);
                    return (
                      <div key={report.id} style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{report.title}</span>
                          <StatusBadge status={report.status} />
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                          {report.author?.fullName ?? 'Unknown'} · {new Date(report.createdAt).toLocaleString()}
                          {report.taggedAdmin && <> · Tagged: {report.taggedAdmin.fullName}</>}
                        </div>
                        {report.checklist.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '0.4rem' }}>
                            {report.checklist.map((item, i) => (
                              <label key={i} className="checklist-item" style={{ color: item.done ? 'var(--text)' : 'var(--text-muted)' }}>
                                <input type="checkbox" checked={item.done} disabled readOnly />
                                <span style={{ textDecoration: item.done ? 'line-through' : 'none' }}>{item.label}</span>
                              </label>
                            ))}
                          </div>
                        )}
                        {report.comment && <div style={{ fontSize: '0.9rem', marginBottom: '0.4rem' }}>{report.comment}</div>}
                        {report.feedback && report.feedback.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                            {report.feedback.map((f) => (
                              <div key={f.id} style={{ fontSize: '0.85rem' }}>
                                <span style={{ fontWeight: 600 }}>{f.author?.fullName ?? 'Admin'}</span>
                                <span style={{ color: 'var(--text-muted)' }}> · {new Date(f.createdAt).toLocaleString()}</span>
                                <div>{f.message}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {canGiveFeedback && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if ((feedbackDrafts[report.id] ?? '').trim()) addFeedback.mutate(report.id);
                            }}
                            style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}
                          >
                            <input
                              value={feedbackDrafts[report.id] ?? ''}
                              onChange={(e) => setFeedbackDrafts((prev) => ({ ...prev, [report.id]: e.target.value }))}
                              placeholder="Give feedback on this report…"
                              style={{ flex: 1 }}
                            />
                            <button type="submit" className="btn btn-secondary" disabled={addFeedback.isPending}>
                              {addFeedback.isPending ? 'Sending…' : 'Send'}
                            </button>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>

      <Dialog isOpen={!!selectedId} onClose={closeDetail} title={selectedProject?.name ?? ''} maxWidth={680}>
        {detailQuery.isLoading && <p>Loading…</p>}
        {selectedProject && (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1rem' }}>
              <div>{fieldLabel('Status')}<StatusBadge status={selectedProject.status} /></div>
              <div>{fieldLabel('Developer')}{selectedProject.developer?.fullName ?? '—'}</div>
              <div>{fieldLabel('Time tracked')}{formatLiveDuration(selectedProject)}</div>
              {selectedProject.startedAt && selectedProject.status === 'IN_PROGRESS' && (
                <div>{fieldLabel('Started at')}{new Date(selectedProject.startedAt).toLocaleString()}</div>
              )}
            </div>

            {selectedProject.description && (
              <p style={{ color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{selectedProject.description}</p>
            )}

            <div style={{ marginBottom: '1.25rem' }}>
              {fieldLabel('Progress')}
              <ProgressBar percent={computeProgress(selectedProject)} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.3rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1rem' }}>{computeProgress(selectedProject)}%</span>
                {selectedProject.targetHours
                  ? <span>based on {formatTrackedVsTarget(selectedProject)} — {Math.max(0, selectedProject.targetHours - selectedProject.totalMinutes / 60).toFixed(1)}h remaining</span>
                  : <span>manual</span>
                }
              </div>
              {canControl && (
                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Timeframe
                  </div>
                  <TargetHoursEditor
                    current={selectedProject.targetHours}
                    onSave={(h) => updateTargetHours.mutate({ id: selectedProject.id, targetHours: h })}
                    isPending={updateTargetHours.isPending}
                  />
                  {!selectedProject.targetHours && (
                    <form onSubmit={handleProgressSubmit} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Manual %:</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={progressDraft}
                        onChange={(e) => setProgressDraft(e.target.value)}
                        style={{ width: 80 }}
                      />
                      <button type="submit" className="btn btn-secondary" disabled={updateProgress.isPending} style={{ fontSize: '0.82rem' }}>
                        {updateProgress.isPending ? 'Saving…' : 'Set %'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>

            {canControl && selectedProject.status !== 'COMPLETED' && (
              <div style={{ marginBottom: '1.25rem' }}>
                {selectedProject.status === 'IN_PROGRESS' ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={stopProject.isPending}
                    onClick={() => stopProject.mutate(selectedProject.id)}
                  >
                    {stopProject.isPending ? 'Stopping…' : 'Stop development'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={startProject.isPending}
                    onClick={() => startProject.mutate(selectedProject.id)}
                  >
                    {startProject.isPending ? 'Starting…' : 'Start development'}
                  </button>
                )}
              </div>
            )}

            {selectedProject.sessions && selectedProject.sessions.length > 0 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Session history</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 160, overflowY: 'auto' }}>
                  {selectedProject.sessions.map((s) => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      <span>{new Date(s.startedAt).toLocaleString()}</span>
                      <span>{s.endedAt ? `${new Date(s.endedAt).toLocaleString()} (${formatMinutes(s.minutes ?? 0)})` : 'In progress…'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Reports</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 320, overflowY: 'auto', marginBottom: '1.25rem' }}>
              {(!selectedProject.reports || selectedProject.reports.length === 0) && (
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>No reports yet.</p>
              )}
              {selectedProject.reports?.map((report) => {
                const canGiveFeedback = isSuperAdmin || (isAdminStaff && report.taggedAdminId === user?.id);
                return (
                  <div key={report.id} style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.6rem 0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{report.title}</span>
                      <StatusBadge status={report.status} />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                      {report.author?.fullName ?? 'Unknown'} · {new Date(report.createdAt).toLocaleString()}
                      {report.taggedAdmin && <> · Tagged: {report.taggedAdmin.fullName}</>}
                    </div>
                    {report.checklist.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.4rem' }}>
                        {report.checklist.map((item, i) => (
                          <label key={i} className="checklist-item" style={{ color: item.done ? 'var(--text)' : 'var(--text-muted)' }}>
                            <input type="checkbox" checked={item.done} disabled readOnly />
                            <span style={{ textDecoration: item.done ? 'line-through' : 'none' }}>{item.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {report.comment && <div style={{ fontSize: '0.9rem', marginBottom: '0.4rem' }}>{report.comment}</div>}

                    {report.feedback && report.feedback.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                        {report.feedback.map((f) => (
                          <div key={f.id} style={{ fontSize: '0.85rem' }}>
                            <span style={{ fontWeight: 600 }}>{f.author?.fullName ?? 'Admin'}</span>
                            <span style={{ color: 'var(--text-muted)' }}> · {new Date(f.createdAt).toLocaleString()}</span>
                            <div>{f.message}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {canGiveFeedback && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if ((feedbackDrafts[report.id] ?? '').trim()) addFeedback.mutate(report.id);
                        }}
                        style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}
                      >
                        <input
                          value={feedbackDrafts[report.id] ?? ''}
                          onChange={(e) => setFeedbackDrafts((prev) => ({ ...prev, [report.id]: e.target.value }))}
                          placeholder="Give feedback on this report…"
                          style={{ flex: 1 }}
                        />
                        <button type="submit" className="btn btn-secondary" disabled={addFeedback.isPending}>
                          {addFeedback.isPending ? 'Sending…' : 'Send'}
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>

            {canControl && (
              <div>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>New report</h3>
                <form onSubmit={handleReportSubmit}>
                  <div className="field">
                    <label htmlFor="dp-report-title">Title</label>
                    <input
                      id="dp-report-title"
                      required
                      value={reportForm.title}
                      onChange={(e) => setReportForm({ ...reportForm, title: e.target.value })}
                      placeholder="e.g., Weekly progress update"
                    />
                  </div>
                  <div className="field">
                    <label>Checklist</label>
                    {checklistItems.map((item, i) => (
                      <label key={i} className="checklist-item">
                        <input type="checkbox" checked={item.done} onChange={() => toggleDraftItem(i)} />
                        <span style={{ flex: 1, textDecoration: item.done ? 'line-through' : 'none' }}>{item.label}</span>
                        <button type="button" className="btn btn-secondary" style={{ padding: '0.1rem 0.5rem', fontSize: '0.75rem' }} onClick={() => removeDraftItem(i)}>
                          Remove
                        </button>
                      </label>
                    ))}
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                      <input
                        value={checklistInput}
                        onChange={(e) => setChecklistInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddChecklistItem();
                          }
                        }}
                        placeholder="Add a checklist item…"
                        style={{ flex: 1 }}
                      />
                      <button type="button" className="btn btn-secondary" onClick={handleAddChecklistItem}>
                        Add
                      </button>
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="dp-report-comment">Comment (optional)</label>
                    <textarea
                      id="dp-report-comment"
                      rows={2}
                      value={reportForm.comment}
                      onChange={(e) => setReportForm({ ...reportForm, comment: e.target.value })}
                      placeholder="Notes for the reviewer…"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="dp-report-tag">Tag admin to review (optional)</label>
                    <select
                      id="dp-report-tag"
                      value={reportForm.taggedAdminId}
                      onChange={(e) => setReportForm({ ...reportForm, taggedAdminId: e.target.value })}
                    >
                      <option value="">No tag</option>
                      {reviewersQuery.data?.map((r) => (
                        <option key={r.id} value={r.id}>{r.fullName} ({r.role.replace(/_/g, ' ')})</option>
                      ))}
                    </select>
                  </div>
                  {addReport.isError && <p className="error-text">Failed to post report. Try again.</p>}
                  <button type="submit" className="btn btn-primary" disabled={addReport.isPending || !reportForm.title.trim()}>
                    {addReport.isPending ? 'Posting…' : 'Post report'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}

function DevProjectsTable({ data, isAdminRole, userId, onViewProgress, onStop, onStart, onOpen, stopIsPending, startIsPending, isDeveloperRole }: {
  data: DevProject[];
  isAdminRole: boolean;
  userId?: string;
  onViewProgress: (id: string) => void;
  onStop: (id: string) => void;
  onStart: (id: string) => void;
  onOpen: (id: string) => void;
  stopIsPending: boolean;
  startIsPending: boolean;
  isDeveloperRole: boolean;
}) {
  const pg = usePagination(data);
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>Software</th>
            {!isDeveloperRole && <th>Developer</th>}
            <th>Status</th>
            <th style={{ minWidth: 180 }}>Progress</th>
            <th>Time / Target</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pg.paginated.map((project) => {
            const ownProject = project.developerId === userId;
            return (
              <tr key={project.id}>
                <td style={{ fontWeight: 600 }}>{project.name}</td>
                {!isDeveloperRole && <td>{project.developer?.fullName ?? '—'}</td>}
                <td><StatusBadge status={project.status} /></td>
                <td>
                  <ProgressBar percent={computeProgress(project)} />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    {computeProgress(project)}%
                    {project.targetHours ? ' (auto)' : ' (manual)'}
                  </div>
                </td>
                <td>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{formatTrackedVsTarget(project)}</div>
                  {project.targetHours && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {Math.max(0, project.targetHours - project.totalMinutes / 60).toFixed(1)}h remaining
                    </div>
                  )}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {isAdminRole ? (
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }} onClick={() => onViewProgress(project.id)}>View Progress</button>
                  ) : (
                    <>
                      {ownProject && project.status !== 'COMPLETED' && (
                        project.status === 'IN_PROGRESS'
                          ? <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', marginRight: '0.4rem' }} disabled={stopIsPending} onClick={() => onStop(project.id)}>Stop</button>
                          : <button type="button" className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', marginRight: '0.4rem' }} disabled={startIsPending} onClick={() => onStart(project.id)}>Start</button>
                      )}
                      <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }} onClick={() => onOpen(project.id)}>Open</button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Pagination page={pg.page} pageSize={pg.pageSize} totalPages={pg.totalPages} total={pg.total} start={pg.start} onPage={pg.changePage} onPageSize={pg.changePageSize} />
    </div>
  );
}

// ── Target hours inline editor ────────────────────────────────────────────────

function TargetHoursEditor({ current, onSave, isPending }: {
  current: number | null;
  onSave: (hours: number | null) => void;
  isPending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current !== null ? String(current) : '');

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        {current ? (
          <span style={{ fontWeight: 700 }}>
            Target: <span style={{ color: 'var(--accent)' }}>{current}h</span>
          </span>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No timeframe set — progress is manual.</span>
        )}
        <button type="button" className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.2rem 0.6rem' }}
          onClick={() => { setDraft(current !== null ? String(current) : ''); setEditing(true); }}>
          {current ? 'Edit' : 'Set timeframe'}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); const val = draft.trim() ? Number(draft) : null; onSave(val); setEditing(false); }}
      style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}
    >
      <input autoFocus type="number" min={0.5} step={0.5} value={draft}
        onChange={(e) => setDraft(e.target.value)} placeholder="e.g., 40" style={{ width: 110 }} />
      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>hours total</span>
      <button type="submit" className="btn btn-primary" disabled={isPending} style={{ fontSize: '0.82rem' }}>
        {isPending ? 'Saving…' : 'Save'}
      </button>
      <button type="button" className="btn btn-secondary" style={{ fontSize: '0.82rem' }} onClick={() => setEditing(false)}>Cancel</button>
      {current !== null && (
        <button type="button" className="btn btn-secondary"
          style={{ fontSize: '0.78rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
          onClick={() => { onSave(null); setDraft(''); setEditing(false); }}>
          Remove
        </button>
      )}
    </form>
  );
}

// ── Timeframe editor (admin — date range) ─────────────────────────────────────

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10); // 'YYYY-MM-DD'
}

function TimeframeEditor({ project, onSave, onCancel, isPending }: {
  project: DevProject;
  onSave: (dates: { projectStart: string | null; projectDeadline: string | null }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [start, setStart] = useState(toDateInput(project.projectStart));
  const [deadline, setDeadline] = useState(toDateInput(project.projectDeadline));

  const totalDays = start && deadline
    ? Math.round((new Date(deadline).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Project start date</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Deadline / end date</label>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
      </div>

      {totalDays !== null && totalDays > 0 && (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.5rem 0.75rem', background: 'var(--bg)', borderRadius: 8 }}>
          Total duration: <strong>{totalDays} days</strong>
          {deadline && (
            <>
              {' · '}
              {(() => {
                const rem = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return rem < 0
                  ? <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{Math.abs(rem)}d overdue</span>
                  : <span style={{ color: rem <= 7 ? 'var(--warning)' : 'var(--success)', fontWeight: 700 }}>{rem}d remaining</span>;
              })()}
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={isPending}
          onClick={() => onSave({ projectStart: start || null, projectDeadline: deadline || null })}
        >
          {isPending ? 'Saving…' : 'Save timeframe'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        {(project.projectStart || project.projectDeadline) && (
          <button type="button" className="btn btn-secondary"
            style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
            onClick={() => onSave({ projectStart: null, projectDeadline: null })}>
            Clear dates
          </button>
        )}
      </div>
    </div>
  );
}
