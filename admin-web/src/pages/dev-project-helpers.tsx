import { useEffect, useState } from 'react';
import type { DevProject } from '../lib/types';

/** Progress priority: targetHours (work budget) → date range → manual */
export function computeProgress(project: DevProject): number {
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

export function progressBasis(project: DevProject): string {
  if (project.targetHours) return 'hours-based';
  if (project.projectStart && project.projectDeadline) return 'date-based';
  return 'manual';
}

export function daysRemaining(project: DevProject): number | null {
  if (!project.projectDeadline) return null;
  const diff = new Date(project.projectDeadline).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function formatTrackedVsTarget(project: DevProject) {
  const trackedH = (project.totalMinutes / 60).toFixed(1);
  if (project.targetHours) {
    return `${trackedH}h / ${project.targetHours}h`;
  }
  return formatMinutes(project.totalMinutes);
}

export function fieldLabel(text: string) {
  return <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{text}</div>;
}

export function formatMinutes(totalMinutes: number) {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatLiveDuration(project: DevProject) {
  if (project.status !== 'IN_PROGRESS') {
    return formatMinutes(project.totalMinutes);
  }
  // Current run = paused seconds banked so far + live segment (if not paused).
  const elapsedSec = project.startedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(project.startedAt).getTime()) / 1000))
    : 0;
  const totalSec = project.totalMinutes * 60 + (project.runSeconds ?? 0) + elapsedSec;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function useTick(intervalMs: number, enabled: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}
