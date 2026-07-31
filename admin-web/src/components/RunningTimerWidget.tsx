import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

// Document Picture-in-Picture is Chromium-only and missing from TS lib.
interface DocumentPictureInPictureApi {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}
declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPictureApi;
  }
}

/** Clone the app's stylesheets + theme class into the PiP window document. */
function copyStylesTo(pip: Window) {
  pip.document.documentElement.className = document.documentElement.className;
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n');
      const style = pip.document.createElement('style');
      style.textContent = css;
      pip.document.head.appendChild(style);
    } catch {
      // Cross-origin sheet: re-link instead of inlining.
      if (sheet.href) {
        const link = pip.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        pip.document.head.appendChild(link);
      }
    }
  }
  pip.document.body.style.margin = '0';
  pip.document.body.style.background = 'var(--surface)';
  pip.document.body.style.color = 'var(--text)';
}

interface ActiveTimer {
  id: string;
  name: string;
  /** null while the project is paused (session banked, timer not running). */
  startedAt: string | null;
  totalMinutes: number;
  /** Seconds banked by pauses within the current run (resets on start/stop). */
  runSeconds: number;
}

interface Pos {
  x: number;
  y: number;
}

const POS_KEY = 'dev-timer-pos';
const MIN_KEY = 'dev-timer-min';
const SCALE_KEY = 'dev-timer-scale';
const MIN_SCALE = 0.6;
const MAX_SCALE = 2;

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

function loadScale(): number {
  const s = Number(localStorage.getItem(SCALE_KEY));
  return Number.isFinite(s) && s >= MIN_SCALE && s <= MAX_SCALE ? s : 1;
}

/** Clock for the current run: paused seconds banked so far + live session. */
function formatElapsed(timer: { startedAt: string | null; runSeconds: number }): string {
  const live = timer.startedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(timer.startedAt).getTime()) / 1000))
    : 0;
  const sec = timer.runSeconds + live;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;
}

/** Overall tracked time: past runs (totalMinutes) + the current run, live. */
function formatTotal(timer: { startedAt: string | null; totalMinutes: number; runSeconds: number }): string {
  const live = timer.startedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(timer.startedAt).getTime()) / 1000))
    : 0;
  const m = Math.max(0, Math.floor(timer.totalMinutes + (timer.runSeconds + live) / 60));
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
  const [scale, setScale] = useState<number>(loadScale);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [, setNow] = useState(Date.now());
  const cardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dx: number; dy: number; sx: number; sy: number } | null>(null);
  const movedRef = useRef(false);
  const resizeRef = useRef<{ startX: number; startScale: number } | null>(null);

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
    if (!active?.startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active?.startedAt]);

  /**
   * Pull the card back inside the viewport. A position saved on a wider window
   * (or at a larger scale) would otherwise place it off-screen, where it stays
   * invisible forever — resize alone never fires on a fresh page load.
   */
  const clampIntoView = useCallback(() => {
    setPos((p) => {
      if (!p) return p;
      const rect = cardRef.current?.getBoundingClientRect();
      const w = rect?.width ?? 320;
      const h = rect?.height ?? 120;
      const x = Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - w));
      const y = Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - h));
      if (x === p.x && y === p.y) return p;
      localStorage.setItem(POS_KEY, JSON.stringify({ x, y }));
      return { x, y };
    });
  }, []);

  useEffect(() => {
    window.addEventListener('resize', clampIntoView);
    return () => window.removeEventListener('resize', clampIntoView);
  }, [clampIntoView]);

  // After every render that changes the card's size or brings it back on
  // screen, so the clamp measures the size actually being displayed.
  useLayoutEffect(() => {
    clampIntoView();
  }, [clampIntoView, active?.id, minimized, scale]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['dev-active'] });
    qc.invalidateQueries({ queryKey: ['dev-projects'] });
  };
  const stopTimer = useMutation({
    mutationFn: (id: string) => api.post(`/dev-projects/${id}/stop`),
    onSuccess: invalidate,
  });
  // Close the pop-out when the timer disappears (stopped) or on unmount.
  useEffect(() => {
    if (pipWindow && !active?.id) pipWindow.close();
  }, [pipWindow, active?.id]);
  useEffect(() => () => pipWindow?.close(), [pipWindow]);
  const pauseTimer = useMutation({
    mutationFn: (id: string) => api.post(`/dev-projects/${id}/pause`),
    onSuccess: invalidate,
  });
  const resumeTimer = useMutation({
    mutationFn: (id: string) => api.post(`/dev-projects/${id}/resume`),
    onSuccess: invalidate,
  });

  if (!active?.id) return null;
  const paused = !active.startedAt;
  const dotColor = paused ? 'var(--warning, #f59e0b)' : 'var(--success, #22c55e)';
  const mutationError = stopTimer.isError || pauseTimer.isError || resumeTimer.isError;

  // The whole card is a drag surface; buttons and the resize grip opt out.
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, [data-resize-handle]')) return;
    const rect = cardRef.current!.getBoundingClientRect();
    // Switch from the default right/bottom anchor to explicit coordinates so
    // dragging and top-left scaling share the same reference point.
    if (!pos) setPos({ x: rect.left, y: rect.top });
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, sx: e.clientX, sy: e.clientY };
    movedRef.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    // 5px threshold so a tap on the minimized chip still reads as a click.
    if (!movedRef.current && Math.hypot(e.clientX - dragRef.current.sx, e.clientY - dragRef.current.sy) < 5) return;
    movedRef.current = true;
    const rect = cardRef.current!.getBoundingClientRect();
    setPos({
      x: Math.min(Math.max(0, e.clientX - dragRef.current.dx), Math.max(0, window.innerWidth - rect.width)),
      y: Math.min(Math.max(0, e.clientY - dragRef.current.dy), Math.max(0, window.innerHeight - rect.height)),
    });
  };
  const onPointerUp = () => {
    if (dragRef.current && movedRef.current && pos) localStorage.setItem(POS_KEY, JSON.stringify(pos));
    dragRef.current = null;
  };

  const onResizeDown = (e: React.PointerEvent) => {
    resizeRef.current = { startX: e.clientX, startScale: scale };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const next = resizeRef.current.startScale + (e.clientX - resizeRef.current.startX) / 320;
    setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, next)));
  };
  const onResizeUp = () => {
    if (resizeRef.current) localStorage.setItem(SCALE_KEY, String(scale));
    resizeRef.current = null;
  };

  const popOut = async () => {
    if (!window.documentPictureInPicture) return;
    try {
      const pip = await window.documentPictureInPicture.requestWindow({ width: 300, height: 190 });
      copyStylesTo(pip);
      pip.addEventListener('pagehide', () => setPipWindow(null));
      setPipWindow(pip);
    } catch {
      // Blocked (no user gesture / permissions) — widget simply stays in-page.
    }
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
    transform: `scale(${scale})`,
    transformOrigin: pos ? 'top left' : 'bottom right',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    boxShadow: 'var(--shadow-lg)',
    userSelect: 'none',
    touchAction: 'none',
  };
  const dragHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };

  const actionButtons = (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      {paused ? (
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={resumeTimer.isPending}
          onClick={() => resumeTimer.mutate(active.id)}
        >
          {resumeTimer.isPending ? 'Resuming…' : 'Resume'}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ flex: 1 }}
          disabled={pauseTimer.isPending}
          onClick={() => pauseTimer.mutate(active.id)}
        >
          {pauseTimer.isPending ? 'Pausing…' : 'Pause'}
        </button>
      )}
      <button
        type="button"
        className="btn btn-danger"
        style={{ flex: 1 }}
        disabled={stopTimer.isPending}
        onClick={() => stopTimer.mutate(active.id)}
      >
        {stopTimer.isPending ? 'Stopping…' : 'Stop'}
      </button>
    </div>
  );

  if (pipWindow) {
    return createPortal(
      <div style={{ padding: '0.85rem 1rem', userSelect: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
          <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontSize: '0.9rem' }}>
            {active.name}
          </strong>
        </div>
        <div
          style={{
            fontSize: '2rem',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            margin: '0.35rem 0 0.1rem',
            color: paused ? 'var(--warning, #f59e0b)' : 'inherit',
          }}
        >
          {formatElapsed(active)}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #888)', marginBottom: '0.7rem' }}>
          {paused && <span style={{ color: 'var(--warning, #f59e0b)', fontWeight: 600 }}>⏸ Paused · </span>}
          {formatTotal(active)}
        </div>
        {actionButtons}
        {mutationError && (
          <div className="error-text" style={{ fontSize: '0.75rem', marginTop: '0.4rem' }}>
            Action failed — try again.
          </div>
        )}
      </div>,
      pipWindow.document.body,
    );
  }

  if (minimized) {
    return (
      <div
        ref={cardRef}
        {...dragHandlers}
        style={{ ...baseStyle, padding: '0.5rem 0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        onClick={() => {
          if (!movedRef.current) toggleMinimized();
        }}
        title={`${active.name} — click to expand, drag to move`}
      >
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: '1rem', color: paused ? 'var(--warning, #f59e0b)' : 'inherit' }}>
          {formatElapsed(active)}
        </span>
      </div>
    );
  }

  return (
    <div ref={cardRef} {...dragHandlers} style={{ ...baseStyle, width: 320, padding: '1rem 1.25rem', cursor: 'grab' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--text-secondary, #888)', letterSpacing: 2 }}>⠿</span>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
        <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontSize: '0.95rem' }}>{active.name}</strong>
        {'documentPictureInPicture' in window && (
          <button
            type="button"
            onClick={popOut}
            title="Pop out — floats on top of all apps"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '0.95rem', lineHeight: 1 }}
          >
            ⧉
          </button>
        )}
        <button
          type="button"
          onClick={toggleMinimized}
          title="Minimize"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1.1rem', lineHeight: 1 }}
        >
          –
        </button>
      </div>
      <div
        style={{
          fontSize: '2rem',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          margin: '0.4rem 0 0.1rem',
          color: paused ? 'var(--warning, #f59e0b)' : 'inherit',
        }}
      >
        {formatElapsed(active)}
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #888)', marginBottom: '0.75rem' }}>
        {paused && <span style={{ color: 'var(--warning, #f59e0b)', fontWeight: 600 }}>⏸ Paused · </span>}
        {formatTotal(active)}
      </div>
      {actionButtons}
      {mutationError && (
        <div className="error-text" style={{ fontSize: '0.75rem', marginTop: '0.4rem' }}>
          Action failed — try again.
        </div>
      )}
      <div
        data-resize-handle
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
        title="Drag to resize"
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'flex-end',
          padding: '0 3px 1px 0',
          cursor: 'nwse-resize',
          color: 'var(--text-secondary, #888)',
          fontSize: 11,
          lineHeight: 1,
        }}
      >
        ◢
      </div>
    </div>
  );
}
