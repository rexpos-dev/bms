import { create } from 'zustand';

export type AppNotification = {
  id: string;
  message: string;
  actor?: string;
  actorRole?: string;
  timestamp: number;
  routes: string[];
  read: boolean;
};

export type IncomingEvent = {
  resource: string;
  module?: string;
  action?: string;
  actor?: string;
  actorRole?: string;
};

// Maps SSE event type keywords → affected nav routes + human label
const EVENT_MAP: Array<{ keywords: string[]; routes: string[]; label: string }> = [
  {
    keywords: ['job_order', 'joborder', 'job-order'],
    routes: ['/job-orders/software'],
    label: 'Job order updated',
  },
  {
    keywords: ['dev_project', 'devproject', 'dev-project'],
    routes: ['/dev-projects'],
    label: 'Dev project updated',
  },
  { keywords: ['audit'], routes: ['/audit-logs'], label: 'Audit log updated' },
  { keywords: ['earning'], routes: ['/earnings'], label: 'Earnings updated' },
  { keywords: ['withdrawal'], routes: ['/withdrawals'], label: 'Withdrawals updated' },
  { keywords: ['client'], routes: ['/clients'], label: 'Client data updated' },
  { keywords: ['product'], routes: ['/products'], label: 'Product updated' },
  { keywords: ['license'], routes: ['/licenses'], label: 'License updated' },
  { keywords: ['job', 'install'], routes: ['/jobs'], label: 'Installation updated' },
];

function resolveEvent(type: string): { routes: string[]; label: string } {
  const normalized = type.toLowerCase().replace(/[\s-]/g, '_');
  for (const entry of EVENT_MAP) {
    if (entry.keywords.some((kw) => normalized.includes(kw))) {
      return { routes: entry.routes, label: entry.label };
    }
  }
  const label = type.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { routes: [], label };
}

function actionVerb(action?: string): string {
  switch ((action ?? '').toLowerCase()) {
    case 'created': return 'created';
    case 'deleted': return 'deleted';
    default: return 'updated';
  }
}

function formatRole(role?: string): string | undefined {
  if (!role) return undefined;
  return role.replace(/[_-]/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

type NotificationStore = {
  notifications: AppNotification[];
  unreadRoutes: string[];
  addEvent: (event: IncomingEvent) => void;
  markRouteRead: (route: string) => void;
  markAllRead: () => void;
  clear: () => void;
};

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  unreadRoutes: [],

  addEvent: (event) => {
    const { routes, label } = resolveEvent(event.resource);
    // Prefer the backend-supplied module name + action ("License updated");
    // fall back to the keyword-resolved label for older/unknown events.
    const message = event.module
      ? `${event.module} ${actionVerb(event.action)}`
      : label;
    const notification: AppNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      message,
      actor: event.actor,
      actorRole: formatRole(event.actorRole),
      timestamp: Date.now(),
      routes,
      read: false,
    };
    set((s) => ({
      notifications: [notification, ...s.notifications].slice(0, 50),
      unreadRoutes: Array.from(new Set([...s.unreadRoutes, ...routes])),
    }));
  },

  markRouteRead: (route) =>
    set((s) => ({ unreadRoutes: s.unreadRoutes.filter((r) => r !== route) })),

  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unreadRoutes: [],
    })),

  clear: () => set({ notifications: [], unreadRoutes: [] }),
}));
