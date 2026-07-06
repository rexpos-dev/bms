import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface ActiveTimer {
  id: string;
  name: string;
  startedAt: string;
  totalMinutes: number;
}

interface Pos {
  x: number;
  y: number;
}

const POS_KEY = 'dev-timer-pos';
const MIN_KEY = 'dev-timer-min';

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pos;
    return typeof p.x === 'number' && typeof p.y === 'number' ? p : null;
  } catch {
    return null;
  }
}

function formatElapsed(startedAt: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;
}

function formatTotal(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  return `${Math.floor(m / 60)}h ${m % 60}m total tracked`;
}

/**
 * Floating, draggable, non-modal timer card shown on every page while the
 * current user has a running dev project. Position + minimized state persist
 * in localStorage. Never blocks interaction with the app (fixed, z-index 900,
 * below dialog overlays at 1000).
 */
export function RunningTimerWidget() {
  const qc = useQueryClient();
  const [pos, setPos] = useState<Pos | null>(loadPos);
  const [minimized, setMinimized] = useState(() => localStorage.getItem(MIN_KEY) === '1');
  const [, setNow] = useState(Date.now());
  const cardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const activeQuery = useQuery({
    queryKey: ['dev-active'],
    // A null body arrives as '' through axios — normalize all falsy to null.
    queryFn: async () => (await api.get<ActiveTimer | null>('/dev-projects/active')).data || null,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
  const active = activeQuery.data;

  // Tick every second while running so the elapsed readout stays live.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  // Keep the card inside the viewport when the window resizes.
  useEffect(() => {
    const clamp = () =>
      setPos((p) => {
        if (!p) return p;
        const rect = cardRef.current?.getBoundingClientRect();
        const w = rect?.width ?? 260;
        const h = rect?.height ?? 120;
        return {
          x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - w)),
          y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - h)),
        };
      });
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, []);

  const stopTimer = useMutation({
    mutationFn: (id: string) => api.post(`/dev-projects/${id}/stop`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dev-active'] });
      qc.invalidateQueries({ queryKey: ['dev-projects'] });
    },
  });

  if (!active?.id || !active.startedAt) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    const rect = cardRef.current!.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const rect = cardRef.current!.getBoundingClientRect();
    setPos({
      x: Math.min(Math.max(0, e.clientX - dragRef.current.dx), window.innerWidth - rect.width),
      y: Math.min(Math.max(0, e.clientY - dragRef.current.dy), window.innerHeight - rect.height),
    });
  };
  const onPointerUp = () => {
    if (dragRef.current && pos) localStorage.setItem(POS_KEY, JSON.stringify(pos));
    dragRef.current = null;
  };

  const toggleMinimized = () =>
    setMinimized((m) => {
      localStorage.setItem(MIN_KEY, m ? '0' : '1');
      return !m;
    });

  const placement = pos ? { left: pos.x, top: pos.y } : { right: 24, bottom: 24 };
  const baseStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 900,
    ...placement,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    boxShadow: 'var(--shadow-lg)',
    userSelect: 'none',
  };

  if (minimized) {
    return (
      <div
        ref={cardRef}
        style={{ ...baseStyle, padding: '0.4rem 0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        onClick={toggleMinimized}
        title={`${active.name} — click to expand`}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success, #22c55e)', display: 'inline-block' }} />
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatElapsed(active.startedAt)}</span>
      </div>
    );
  }

  return (
    <div ref={cardRef} style={{ ...baseStyle, width: 260, padding: '0.75rem 1rem' }}>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8, touchAction: 'none' }}
      >
        <span style={{ color: 'var(--text-secondary, #888)', letterSpacing: 2 }}>⠿</span>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success, #22c55e)', display: 'inline-block' }} />
        <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{active.name}</strong>
        <button
          type="button"
          onClick={toggleMinimized}
          title="Minimize"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1 }}
        >
          –
        </button>
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', margin: '0.35rem 0 0.1rem' }}>
        {formatElapsed(active.startedAt)}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #888)', marginBottom: '0.6rem' }}>
        {formatTotal(active.totalMinutes)}
      </div>
      <button
        type="button"
        className="btn btn-danger"
        style={{ width: '100%' }}
        disabled={stopTimer.isPending}
        onClick={() => stopTimer.mutate(active.id)}
      >
        {stopTimer.isPending ? 'Stopping…' : 'Stop'}
      </button>
      {stopTimer.isError && (
        <div className="error-text" style={{ fontSize: '0.75rem', marginTop: '0.4rem' }}>
          Failed to stop — try again.
        </div>
      )}
    </div>
  );
}
