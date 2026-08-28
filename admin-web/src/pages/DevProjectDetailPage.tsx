import { type FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Linkify } from '../components/Linkify';
import { ProgressBar } from '../components/ProgressBar';
import { StatusBadge } from '../components/StatusBadge';
import { useAuthStore } from '../lib/auth-store';
import type { ChecklistItem, DevProject, DevProjectReport } from '../lib/types';
import {
  computeProgress,
  daysRemaining,
  fieldLabel,
  formatLiveDuration,
  formatMinutes,
  progressBasis,
  ReportChecklist,
  TargetHoursEditor,
  TimeframeEditor,
  useTick,
} from './DevProjectsPage';

const EMPTY_REPORT_FORM = { title: '', comment: '', taggedAdminId: '' };

export function DevProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ['dev-projects', id],
    queryFn: async () => (await api.get<DevProject>(`/dev-projects/${id}`)).data,
    enabled: !!id,
  });

  const project = detailQuery.data ?? null;

  useTick(1000, project?.status === 'IN_PROGRESS');

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdminStaff = user?.role === 'ADMIN_STAFF';
  const isAdminRole = isSuperAdmin || isAdminStaff;
  const isOwner = !!project && project.developerId === user?.id;
  const canControl = isOwner;
  const canTagAdmins = user?.role === 'DEVELOPER' || isSuperAdmin;
  const reviewersQuery = useQuery({
    queryKey: ['dev-projects', 'reviewers'],
    queryFn: async () => (await api.get<{ id: string; fullName: string; role: string }[]>('/dev-projects/reviewers')).data,
    enabled: canTagAdmins,
  });

  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [reportForm, setReportForm] = useState(EMPTY_REPORT_FORM);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistInput, setChecklistInput] = useState('');

  const updateChecklistItem = useMutation({
    mutationFn: ({ reportId, index, done, note }: { reportId: string; index: number; done?: boolean; note?: string }) =>
      api.patch<DevProject>(`/dev-projects/reports/${reportId}/checklist`, { index, done, note }),
    onSuccess: (res) => {
      if (id) qc.setQueryData(['dev-projects', id], res.data);
      invalidate();
    },
  });

  const addFeedback = useMutation({
    mutationFn: (reportId: string) =>
      api.post<DevProject>(`/dev-projects/reports/${reportId}/feedback`, { message: (feedbackDrafts[reportId] ?? '').trim() }),
    onSuccess: (res, reportId) => {
      if (id) qc.setQueryData(['dev-projects', id], res.data);
      invalidate();
      setFeedbackDrafts((prev) => ({ ...prev, [reportId]: '' }));
    },
  });

  const addReport = useMutation({
    mutationFn: () =>
      api.post<DevProject>(`/dev-projects/${id}/reports`, {
        title: reportForm.title.trim(),
        comment: reportForm.comment.trim() || undefined,
        checklist: checklistItems.map((item) => ({ label: item.label, done: item.done })),
        taggedAdminId: reportForm.taggedAdminId || undefined,
      }),
    onSuccess: (res) => {
      if (id) qc.setQueryData(['dev-projects', id], res.data);
      invalidate();
      setReportForm(EMPTY_REPORT_FORM);
      setChecklistItems([]);
      setChecklistInput('');
    },
  });

  const canEditChecklist = (report: DevProjectReport) => isSuperAdmin || report.authorId === user?.id;

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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['dev-projects'] });
    qc.invalidateQueries({ queryKey: ['dev-active'] });
  };

  const startProject = useMutation({
    mutationFn: (projectId: string) => api.post(`/dev-projects/${projectId}/start`),
    onSuccess: invalidate,
  });

  const stopProject = useMutation({
    mutationFn: (projectId: string) => api.post(`/dev-projects/${projectId}/stop`),
    onSuccess: invalidate,
  });

  const updateProgress = useMutation({
    mutationFn: ({ projectId, progressPercent }: { projectId: string; progressPercent: number }) =>
      api.patch(`/dev-projects/${projectId}/progress`, { progressPercent }),
    onSuccess: invalidate,
  });

  const updateTargetHours = useMutation({
    mutationFn: ({ projectId, targetHours }: { projectId: string; targetHours: number | null }) =>
      api.patch(`/dev-projects/${projectId}`, { targetHours }),
    onSuccess: invalidate,
  });

  const updateTimeframe = useMutation({
    mutationFn: ({ projectId, projectStart, projectDeadline }: { projectId: string; projectStart: string | null; projectDeadline: string | null }) =>
      api.patch(`/dev-projects/${projectId}`, { projectStart, projectDeadline }),
    onSuccess: invalidate,
  });

  const [progressDraft, setProgressDraft] = useState('');
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (project && project.id !== loadedId) {
    setLoadedId(project.id);
    setProgressDraft(String(project.progressPercent));
  }

  const [editingTimeframe, setEditingTimeframe] = useState(false);

  const handleProgressSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!project) return;
    const value = Number(progressDraft);
    if (!Number.isNaN(value) && value >= 0 && value <= 100) {
      updateProgress.mutate({ projectId: project.id, progressPercent: value });
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}
        onClick={() => navigate('/dev-projects')}
      >
        ← Back to Software Development
      </button>

      {detailQuery.isLoading && <p>Loading…</p>}
      {detailQuery.isError && <p className="error-text">Failed to load this project.</p>}

      {project && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <h1 style={{ margin: 0 }}>{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>

          <div className="dp-detail-grid">
            <section className="dp-detail-col" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="card" style={{ padding: '1rem' }}>
                  {fieldLabel('Status')}
                  <div style={{ marginTop: '0.25rem' }}><StatusBadge status={project.status} /></div>
                </div>
                <div className="card" style={{ padding: '1rem' }}>
                  {fieldLabel('Progress')}
                  <div style={{ fontWeight: 700, fontSize: '1.5rem', marginBottom: '0.35rem' }}>{computeProgress(project)}%</div>
                  <ProgressBar percent={computeProgress(project)} />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    {progressBasis(project)}
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
                <div>
                  {fieldLabel('Developer')}
                  <div style={{ fontWeight: 600 }}>{project.developer?.fullName ?? '—'}</div>
                </div>
                <div>
                  {fieldLabel('Time tracked')}
                  <div style={{ fontWeight: 600 }}>{formatLiveDuration(project)}</div>
                  {project.targetHours && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {Math.max(0, project.targetHours - project.totalMinutes / 60).toFixed(1)}h remaining
                    </div>
                  )}
                </div>
                <div>
                  {fieldLabel('Progress basis')}
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent)' }}>{progressBasis(project)}</div>
                </div>
              </div>

              {isAdminRole && (
                <div className="card" style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Project Timeframe</div>
                    {!editingTimeframe && (
                      <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
                        onClick={() => setEditingTimeframe(true)}>
                        Edit Timeframe
                      </button>
                    )}
                  </div>

                  {editingTimeframe ? (
                    <TimeframeEditor
                      project={project}
                      onSave={({ projectStart, projectDeadline }) => {
                        updateTimeframe.mutate({ projectId: project.id, projectStart, projectDeadline });
                        setEditingTimeframe(false);
                      }}
                      onCancel={() => setEditingTimeframe(false)}
                      isPending={updateTimeframe.isPending}
                    />
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        {fieldLabel('Start date')}
                        <div style={{ fontWeight: 600 }}>
                          {project.projectStart ? new Date(project.projectStart).toLocaleDateString() : <span style={{ color: 'var(--text-muted)' }}>Not set</span>}
                        </div>
                      </div>
                      <div>
                        {fieldLabel('Deadline')}
                        <div style={{ fontWeight: 600 }}>
                          {project.projectDeadline ? (
                            <>
                              {new Date(project.projectDeadline).toLocaleDateString()}
                              {daysRemaining(project) !== null && (
                                <span style={{
                                  marginLeft: '0.5rem', fontSize: '0.75rem', fontWeight: 700,
                                  color: (daysRemaining(project) ?? 0) < 0 ? 'var(--danger)' : (daysRemaining(project) ?? 0) <= 7 ? 'var(--warning)' : 'var(--success)',
                                }}>
                                  {(daysRemaining(project) ?? 0) < 0
                                    ? `${Math.abs(daysRemaining(project)!)}d overdue`
                                    : `${daysRemaining(project)}d left`}
                                </span>
                              )}
                            </>
                          ) : <span style={{ color: 'var(--text-muted)' }}>Not set</span>}
                        </div>
                      </div>
                      {project.projectStart && project.projectDeadline && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          {fieldLabel('Duration')}
                          <div style={{ fontWeight: 600 }}>
                            {Math.round((new Date(project.projectDeadline).getTime() - new Date(project.projectStart).getTime()) / (1000 * 60 * 60 * 24))} days total
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {canControl && (
                <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Timeframe</div>
                  <TargetHoursEditor
                    current={project.targetHours}
                    onSave={(h) => updateTargetHours.mutate({ projectId: project.id, targetHours: h })}
                    isPending={updateTargetHours.isPending}
                  />
                  {!project.targetHours && (
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
                  {project.status !== 'COMPLETED' && (
                    project.status === 'IN_PROGRESS' ? (
                      <button type="button" className="btn btn-secondary" disabled={stopProject.isPending} onClick={() => stopProject.mutate(project.id)}>
                        {stopProject.isPending ? 'Stopping…' : 'Stop development'}
                      </button>
                    ) : (
                      <button type="button" className="btn btn-primary" disabled={startProject.isPending} onClick={() => startProject.mutate(project.id)}>
                        {startProject.isPending ? 'Starting…' : 'Start development'}
                      </button>
                    )
                  )}
                </div>
              )}

              {project.description && (
                <div>
                  {fieldLabel('Description')}
                  <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
                    {project.description}
                  </p>
                </div>
              )}
            </section>

            <section className="dp-detail-col" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {project.sessions && project.sessions.length > 0 && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem' }}>Session History</div>
                  <div className="card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 260, overflowY: 'auto' }}>
                    {project.sessions.map((s, i) => (
                      <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.75rem', fontSize: '0.85rem', padding: '0.4rem 0', borderBottom: i < (project.sessions?.length ?? 0) - 1 ? '1px solid var(--border)' : 'none' }}>
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

              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem' }}>Reports</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 380, overflowY: 'auto' }}>
                  {(!project.reports || project.reports.length === 0) && (
                    <p style={{ color: 'var(--text-muted)', margin: 0 }}>No reports yet.</p>
                  )}
                  {project.reports?.map((report) => {
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
                          <ReportChecklist
                            key={report.id}
                            items={report.checklist}
                            editable={canEditChecklist(report)}
                            isPending={updateChecklistItem.isPending}
                            onToggle={(index, done) => updateChecklistItem.mutate({ reportId: report.id, index, done })}
                            onSaveNote={(index, note) => updateChecklistItem.mutate({ reportId: report.id, index, note })}
                          />
                        )}
                        {report.comment && <div style={{ fontSize: '0.9rem', marginBottom: '0.4rem' }}><Linkify text={report.comment} /></div>}

                        {report.feedback && report.feedback.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                            {report.feedback.map((f) => (
                              <div key={f.id} style={{ fontSize: '0.85rem' }}>
                                <span style={{ fontWeight: 600 }}>{f.author?.fullName ?? 'Admin'}</span>
                                <span style={{ color: 'var(--text-muted)' }}> · {new Date(f.createdAt).toLocaleString()}</span>
                                <div><Linkify text={f.message} /></div>
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

              {canControl && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem' }}>New report</div>
                  <form onSubmit={handleReportSubmit}>
                    <div className="field">
                      <label htmlFor="dpd-report-title">Title</label>
                      <input
                        id="dpd-report-title"
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
                      <label htmlFor="dpd-report-comment">Comment (optional)</label>
                      <textarea
                        id="dpd-report-comment"
                        rows={2}
                        value={reportForm.comment}
                        onChange={(e) => setReportForm({ ...reportForm, comment: e.target.value })}
                        placeholder="Notes for the reviewer…"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="dpd-report-tag">Tag admin to review (optional)</label>
                      <select
                        id="dpd-report-tag"
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
            </section>
          </div>
        </>
      )}
    </div>
  );
}
