/**
 * The same backend runs in two modes:
 * - `server` (default): MySQL, all modules, cron jobs — the office PC / Railway.
 * - `desktop`: the embedded backend of the Electron app — SQLite (DESKTOP_DATABASE_URL),
 *   only the offline-capable core modules, no cron/push/backup, synced with the server.
 */
export function isDesktopMode(): boolean {
  return process.env.APP_MODE === 'desktop';
}
