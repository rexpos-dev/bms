import { type FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ProgressBar } from '../components/ProgressBar';
import { StatusBadge } from '../components/StatusBadge';
import { useAuthStore } from '../lib/auth-store';
import type { DevProject } from '../lib/types';
import {
  computeProgress,
  daysRemaining,
  fieldLabel,
  formatLiveDuration,
  progressBasis,
  TargetHoursEditor,
  TimeframeEditor,
  useTick,
} from './DevProjectsPage';

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
  void canTagAdmins; // used starting Task 5

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
              {/* Session history + reports added in Task 5 */}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
