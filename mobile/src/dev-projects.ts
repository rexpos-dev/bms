import type { DevProject, DevProjectStatus } from './types';

/**
 * Timer states the API expresses through two fields:
 *   running = IN_PROGRESS with a startedAt, paused = IN_PROGRESS without one.
 */
export function isRunning(p: DevProject): boolean {
  return p.status === 'IN_PROGRESS' && !!p.startedAt;
}

export function isPaused(p: DevProject): boolean {
  return p.status === 'IN_PROGRESS' && !p.startedAt;
}

/** Total tracked seconds including the live segment, matching the web app. */
export function liveSeconds(p: DevProject): number {
  const elapsed = p.startedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(p.startedAt).getTime()) / 1000))
    : 0;
  return p.totalMinutes * 60 + (p.runSeconds ?? 0) + elapsed;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function formatMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Progress priority: targetHours (work budget) → date range → manual. */
export function computeProgress(p: DevProject): number {
  if (p.targetHours && p.targetHours > 0) {
    return Math.min(100, Math.round((p.totalMinutes / 60 / p.targetHours) * 100));
  }
  if (p.projectStart && p.projectDeadline) {
    const start = new Date(p.projectStart).getTime();
    const end = new Date(p.projectDeadline).getTime();
    const total = end - start;
    if (total > 0) {
      return Math.min(100, Math.max(0, Math.round(((Date.now() - start) / total) * 100)));
    }
  }
  return p.progressPercent;
}

export function progressBasis(p: DevProject): string {
  if (p.targetHours) return 'hours-based';
  if (p.projectStart && p.projectDeadline) return 'date-based';
  return 'manual';
}

export function daysRemaining(p: DevProject): number | null {
  if (!p.projectDeadline) return null;
  return Math.ceil((new Date(p.projectDeadline).getTime() - Date.now()) / 86_400_000);
}

export const STATUS_COLORS: Record<DevProjectStatus, string> = {
  NOT_STARTED: '#9ca3af',
  IN_PROGRESS: '#16a34a',
  PENDING: '#d97706',
  COMPLETED: '#2563eb',
};

export function statusLabel(status: DevProjectStatus): string {
  return status.replace(/_/g, ' ');
}
