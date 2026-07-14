import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { PageTransition } from '../lib/motion';
import { useAuthStore } from '../lib/auth-store';
import { logout as apiLogout } from '../lib/api';
import { ThemeToggle } from '../components/ThemeToggle';
import { NotificationBell } from '../components/NotificationBell';
import { RunningTimerWidget } from '../components/RunningTimerWidget';
import { useServerEvents } from '../lib/useServerEvents';
import { useNotificationStore } from '../lib/notification-store';
import type { UserRole } from '../lib/types';
import {
  LayoutDashboard,
  Users,
  FolderGit2,
  FileCode,
  Package,
  Key,
  Wrench,
  PhilippinePeso,
  CreditCard,
  Inbox,
  BarChart3,
  Receipt,
  Settings,
  ClipboardList,
  UserCog,
  LogOut,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
  type LucideIcon,
} from 'lucide-react';

type NavLinkItem = { to: string; label: string; end?: boolean; indent?: boolean };
type NavSection = { section: true; label: string };
type NavItem = NavLinkItem | NavSection;

const NAV_ICONS: Record<string, LucideIcon> = {
  '/': LayoutDashboard,
  '/clients': Users,
  '/dev-projects': FolderGit2,
  '/job-orders/software': FileCode,
  '/products': Package,
  '/licenses': Key,
  '/jobs': Wrench,
  '/earnings': PhilippinePeso,
  '/withdrawals': CreditCard,
  '/analytics': BarChart3,
  '/financial-reports': Receipt,
  '/settings': Settings,
  '/audit-logs': ClipboardList,
  '/download-leads': Inbox,
  '/profile': UserCog,
};

const NAV_ITEMS_BY_ROLE: Record<UserRole, NavItem[]> = {
  SUPER_ADMIN: [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/clients', label: 'Clients' },
    { section: true, label: 'Dev' },
    { to: '/job-orders/software', label: 'Software JO', indent: true },
    { to: '/dev-projects', label: 'Dev Projects', indent: true },
    { to: '/products', label: 'Software Products', indent: true },
    { to: '/licenses', label: 'Licenses', indent: true },
    { section: true, label: 'Operations' },
    { to: '/jobs', label: 'Installations', indent: true },
    { to: '/earnings', label: 'Earnings', indent: true },
    { to: '/withdrawals', label: 'Withdrawals', indent: true },
    { section: true, label: 'Finance' },
    { to: '/financial-reports', label: 'Financial Reports', indent: true },
    { to: '/download-leads', label: 'Download Leads' },
    { to: '/analytics', label: 'Analytics' },
    { to: '/settings', label: 'Settings' },
  ],
  INSTALLER: [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/jobs', label: 'My Jobs' },
    { to: '/earnings', label: 'My Earnings' },
    { to: '/withdrawals', label: 'Withdrawals' },
  ],
  DEVELOPER: [
    { to: '/', label: 'Dashboard', end: true },
    { section: true, label: 'Dev' },
    { to: '/dev-projects', label: 'Dev Projects', indent: true },
    { to: '/licenses', label: 'Licenses', indent: true },
    { section: true, label: 'Payroll' },
    { to: '/earnings', label: 'My Earnings', indent: true },
    { to: '/withdrawals', label: 'Withdrawals', indent: true },
  ],
  DESIGNER: [
    { to: '/', label: 'Dashboard', end: true },
    { section: true, label: 'Payroll' },
    { to: '/earnings', label: 'My Earnings', indent: true },
    { to: '/withdrawals', label: 'Withdrawals', indent: true },
  ],
  LIAISON: [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/clients', label: 'Clients' },
    { section: true, label: 'Job Orders' },
    { to: '/job-orders/software', label: 'Software JO', indent: true },
    { to: '/jobs', label: 'Installations' },
    { section: true, label: 'Payroll' },
    { to: '/earnings', label: 'My Earnings', indent: true },
    { to: '/withdrawals', label: 'Withdrawals', indent: true },
  ],
  ADMIN_STAFF: [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/clients', label: 'Clients' },
    { section: true, label: 'Dev' },
    { to: '/job-orders/software', label: 'Software JO', indent: true },
    { to: '/dev-projects', label: 'Dev Projects', indent: true },
    { to: '/products', label: 'Software Products', indent: true },
    { section: true, label: 'Operations' },
    { to: '/jobs', label: 'Installations', indent: true },
    { to: '/earnings', label: 'Earnings', indent: true },
    { to: '/withdrawals', label: 'Withdrawals', indent: true },
    { section: true, label: 'Finance' },
    { to: '/financial-reports', label: 'Financial Reports', indent: true },
    { to: '/download-leads', label: 'Download Leads' },
    { to: '/audit-logs', label: 'Audit Logs' },
  ],
  SALES_STAFF: [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/clients', label: 'Clients' },
    { section: true, label: 'Job Orders' },
    { to: '/job-orders/software', label: 'Software JO', indent: true },
    { to: '/jobs', label: 'Installations' },
    { section: true, label: 'Payroll' },
    { to: '/earnings', label: 'My Earnings', indent: true },
    { to: '/withdrawals', label: 'Withdrawals', indent: true },
    { section: true, label: 'Finance' },
    { to: '/financial-reports', label: 'Financial Reports', indent: true },
  ],
};

const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: 'Admin',
  INSTALLER: 'Installer',
  DEVELOPER: 'Developer',
  DESIGNER: 'Designer',
  LIAISON: 'Liaison',
  ADMIN_STAFF: 'Staff',
  SALES_STAFF: 'Sales',
};

function buildMergedNav(primaryRole: UserRole, allRoles: UserRole[]): NavItem[] {
  const primaryNav = NAV_ITEMS_BY_ROLE[primaryRole] ?? [];
  const seenPaths = new Set(
    primaryNav.filter((item): item is NavLinkItem => 'to' in item).map((item) => item.to),
  );
  const result: NavItem[] = [...primaryNav];

  for (const role of allRoles) {
    if (role === primaryRole) continue;
    const roleNav = NAV_ITEMS_BY_ROLE[role] ?? [];
    const uniqueLinks = roleNav.filter(
      (item): item is NavLinkItem => 'to' in item && !seenPaths.has(item.to),
    );
    if (uniqueLinks.length > 0) {
      result.push({ section: true, label: ROLE_LABEL[role] });
      for (const link of uniqueLinks) {
        seenPaths.add(link.to);
        result.push({ ...link, indent: true });
      }
    }
  }
  return result;
}

function getInitials(name: string | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/* ── Sidebar nav link with hover state and update badge ── */
function SidebarLink({ item, hasUpdate, collapsed }: { item: NavLinkItem; hasUpdate: boolean; collapsed: boolean }) {
  const [hovered, setHovered] = useState(false);
  const Icon = NAV_ICONS[item.to];
  const markRouteRead = useNotificationStore((s) => s.markRouteRead);
  const { pathname } = useLocation();

  const isActive = item.end
    ? pathname === item.to
    : pathname === item.to || pathname.startsWith(item.to + '/');

  useEffect(() => {
    if (isActive && hasUpdate) markRouteRead(item.to);
  }, [isActive, hasUpdate, item.to, markRouteRead]);

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={collapsed ? item.label : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : undefined,
        position: 'relative',
        gap: '0.6rem',
        padding: '0.55rem 0.75rem',
        paddingLeft: collapsed ? '0.75rem' : item.indent ? '1rem' : '0.75rem',
        borderRadius: 9,
        textDecoration: 'none',
        fontSize: '0.875rem',
        fontWeight: isActive ? 600 : 500,
        color: isActive ? '#ffffff' : hovered ? '#c8d4e8' : '#8fa3bf',
        background: isActive
          ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
          : hovered
          ? 'rgba(255, 255, 255, 0.055)'
          : 'transparent',
        boxShadow: isActive ? '0 4px 14px rgba(79, 70, 229, 0.45)' : 'none',
        transition: 'all 0.15s ease',
        letterSpacing: '0.01em',
      }}
    >
      {Icon && (
        <Icon
          size={15}
          style={{ flexShrink: 0, opacity: 0.85 }}
          strokeWidth={2}
        />
      )}
      {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
      {hasUpdate && !isActive && (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#ef4444',
            flexShrink: 0,
            boxShadow: '0 0 0 2px rgba(239, 68, 68, 0.3)',
            ...(collapsed ? { position: 'absolute' as const, top: 7, right: 7 } : {}),
          }}
        />
      )}
    </NavLink>
  );
}

export function AdminLayout() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const allRoles = user?.roles ?? (user?.role ? [user.role] : []);
  const navItems: NavItem[] = user ? buildMergedNav(user.role, allRoles) : [];
  const unreadRoutes = useNotificationStore((s) => s.unreadRoutes);

  const [logoutHovered, setLogoutHovered] = useState(false);

  useServerEvents();

  const handleLogout = async () => {
    try {
      await apiLogout();
    } catch {
      // ignore network errors on logout — clear local session regardless
    }
    clear();
    navigate('/login', { replace: true });
  };

  const EXPANDED_WIDTH = 256;
  const COLLAPSED_WIDTH = 74;

  // Responsive: auto-collapse the sidebar into an off-canvas drawer on mobile.
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches,
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Close the drawer whenever the route changes (mobile navigation).
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Desktop: collapse the sidebar to an icon-only rail (persisted).
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('sdlmp-sidebar-collapsed') === '1',
  );
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem('sdlmp-sidebar-collapsed', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };
  const railCollapsed = collapsed && !isMobile;
  const sidebarWidth = railCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  return (
    <div style={{ display: 'flex' }}>
      {/* Mobile drawer backdrop */}
      <AnimatePresence>
        {isMobile && mobileOpen && (
          <motion.div
            onClick={() => setMobileOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 150 }}
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar ── */}
      <aside
        style={{
          width: sidebarWidth,
          background: '#060c18',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          height: '100vh',
          overflow: 'hidden',
          overflowY: 'auto',
          zIndex: 200,
          transform: isMobile && !mobileOpen ? 'translateX(-100%)' : 'translateX(0)',
          transition: 'transform 0.28s cubic-bezier(0.22,0.61,0.36,1), width 0.24s ease',
          boxShadow: isMobile && mobileOpen ? '0 0 40px rgba(0,0,0,0.55)' : 'none',
        }}
      >
        {/* Brand */}
        <div
          style={{
            padding: '1.375rem 1.125rem 1.25rem',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: railCollapsed ? 'center' : 'flex-start',
            gap: '0.75rem',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: '#000000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.5)',
            }}
          >
            <svg width="20" height="20" viewBox="44 175 728 468" fill="none">
              <path
                fill="#ffffff"
                d="M 203.00,206.42 C 231.18,210.31 261.57,217.36 290.50,226.73 C 307.42,232.20 331.80,241.41 333.28,242.88 C 333.70,243.30 314.18,246.44 289.89,249.86 C 265.60,253.27 245.63,255.94 245.51,255.78 C 245.39,255.63 245.93,249.71 246.70,242.64 C 247.47,235.56 247.92,229.58 247.68,229.35 C 245.70,227.36 189.86,224.79 176.41,226.06 C 147.70,228.77 128.78,239.42 120.23,257.66 C 117.71,263.05 117.50,264.47 117.50,276.00 C 117.50,289.94 119.61,298.27 126.76,312.50 C 144.83,348.50 207.39,407.99 300.24,477.47 C 310.50,485.15 318.71,491.62 318.48,491.85 C 317.37,492.96 265.14,457.61 237.17,436.82 C 171.65,388.12 129.86,348.61 101.16,308.26 C 62.80,254.32 66.40,219.66 111.50,208.50 C 130.33,203.85 176.68,202.79 203.00,206.42 Z M 550.01,265.59 C 572.21,294.97 587.81,329.22 594.99,364.36 C 596.09,369.78 597.00,374.83 597.00,375.58 C 597.00,376.70 571.30,359.43 567.31,355.63 C 566.66,355.01 564.96,345.95 563.52,335.50 C 562.09,325.05 559.78,312.23 558.38,307.00 C 553.48,288.73 542.65,264.06 532.94,249.02 C 530.77,245.67 529.02,242.61 529.05,242.22 C 529.14,240.88 543.11,256.46 550.01,265.59 Z M 514.11,335.49 C 574.83,374.62 629.89,415.46 664.87,447.32 C 719.80,497.37 750.48,551.96 740.52,581.94 C 733.63,602.67 703.51,613.02 650.08,612.99 C 612.03,612.97 566.91,604.37 523.75,588.91 C 508.20,583.34 508.39,583.56 517.05,580.98 C 521.15,579.76 531.69,576.60 540.48,573.95 C 549.27,571.29 556.62,569.28 556.81,569.48 C 557.01,569.67 556.42,573.51 555.50,578.00 C 554.58,582.49 553.98,586.31 554.17,586.49 C 555.78,588.04 595.42,591.26 618.56,591.72 C 663.43,592.61 681.93,588.92 694.24,576.61 C 711.40,559.44 706.97,530.93 681.15,492.37 C 651.16,447.57 594.98,395.90 513.05,337.77 C 489.76,321.24 488.27,320.13 489.29,320.06 C 489.72,320.03 500.89,326.97 514.11,335.49 Z M 584.70,393.48 L 599.89,406.12 L 599.41,414.81 C 597.70,445.45 592.48,467.47 581.36,490.97 C 547.92,561.62 474.62,599.15 393.00,587.40 C 328.17,578.06 266.19,537.12 227.89,478.33 C 221.94,469.20 223.56,469.63 231.08,479.19 C 260.53,516.64 304.02,543.45 351.00,553.13 C 361.23,555.24 365.09,555.50 386.00,555.46 C 412.30,555.42 420.50,554.22 441.00,547.39 C 509.68,524.50 557.78,462.04 565.48,385.76 C 566.31,377.54 564.79,376.93 584.70,393.48 Z"
              />
            </svg>
          </div>
          {!railCollapsed && (
            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  color: '#f0f4ff',
                  letterSpacing: '-0.01em',
                  lineHeight: 1.2,
                }}
              >
                Orbit Console
              </div>
              <div
                style={{
                  fontSize: '0.65rem',
                  color: '#4a6080',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginTop: 2,
                }}
              >
                Every KPI orbits here
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav
          style={{
            flex: 1,
            padding: '0.875rem 0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.1rem',
          }}
        >
          {navItems.map((item, i) => {
            if ('section' in item) {
              return (
                <div
                  key={`section-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.65rem 0.5rem 0.3rem',
                    marginTop: i === 0 ? 0 : '0.3rem',
                  }}
                >
                  {!railCollapsed && (
                    <span
                      style={{
                        fontSize: '0.63rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        color: '#3a5070',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.label}
                    </span>
                  )}
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      background: 'rgba(255,255,255,0.05)',
                    }}
                  />
                </div>
              );
            }
            return (
                <SidebarLink
                  key={item.to}
                  item={item}
                  hasUpdate={unreadRoutes.includes(item.to)}
                  collapsed={railCollapsed}
                />
              );
          })}
        </nav>

        {/* User section */}
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            padding: '0.875rem 0.75rem',
          }}
        >
          {/* Avatar + name */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: railCollapsed ? 'center' : undefined,
              gap: '0.625rem',
              marginBottom: '0.625rem',
              padding: '0 0.25rem',
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.75rem',
                color: '#fff',
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(79, 70, 229, 0.4)',
                letterSpacing: '0.02em',
              }}
            >
              {getInitials(user?.fullName)}
            </div>
            {!railCollapsed && (
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: '#dce8f8',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.3,
                  }}
                >
                  {user?.fullName}
                </div>
                <div
                  style={{
                    fontSize: '0.69rem',
                    color: '#3a5070',
                    letterSpacing: '0.02em',
                  }}
                >
                  {user?.role.replace(/_/g, ' ')}
                </div>
              </div>
            )}
          </div>

          {/* Profile link */}
          <NavLink
            to="/profile"
            title={railCollapsed ? 'Profile Settings' : undefined}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              justifyContent: railCollapsed ? 'center' : undefined,
              gap: '0.5rem',
              padding: '0.48rem 0.75rem',
              borderRadius: 8,
              textDecoration: 'none',
              color: isActive ? '#ffffff' : '#8fa3bf',
              background: isActive
                ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
                : 'transparent',
              fontSize: '0.82rem',
              fontWeight: 500,
              marginBottom: '0.375rem',
              transition: 'all 0.15s ease',
              boxShadow: isActive ? '0 4px 14px rgba(79,70,229,0.4)' : 'none',
            })}
          >
            <UserCog size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
            {!railCollapsed && <span>Profile Settings</span>}
          </NavLink>

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            onMouseEnter={() => setLogoutHovered(true)}
            onMouseLeave={() => setLogoutHovered(false)}
            title={railCollapsed ? 'Log out' : undefined}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.48rem 0.75rem',
              borderRadius: 8,
              border: `1px solid ${logoutHovered ? 'rgba(248,113,113,0.45)' : 'rgba(248,113,113,0.2)'}`,
              background: logoutHovered ? 'rgba(248,113,113,0.12)' : 'rgba(248,113,113,0.06)',
              color: '#f87171',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              fontFamily: 'inherit',
            }}
          >
            <LogOut size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
            {!railCollapsed && <span>Log out</span>}
          </button>
        </div>
      </aside>

      {/* ── Content ── */}
      <div
        style={{
          marginLeft: isMobile ? 0 : sidebarWidth,
          display: 'flex',
          flexDirection: 'column',
          width: isMobile ? '100%' : `calc(100% - ${sidebarWidth}px)`,
          minHeight: '100vh',
          transition: 'margin-left 0.28s ease, width 0.28s ease',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: isMobile ? '0.7rem 1rem' : '0.875rem 2.25rem',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
            gap: '1rem',
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            zIndex: 50,
            boxShadow: '0 1px 0 var(--border)',
          }}
        >
          {isMobile ? (
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 38,
                height: 38,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--surface-secondary)',
                color: 'var(--text)',
                cursor: 'pointer',
              }}
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
              title={collapsed ? 'Expand menu' : 'Collapse menu'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 38,
                height: 38,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--surface-secondary)',
                color: 'var(--text)',
                cursor: 'pointer',
              }}
            >
              {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>

        <main
          style={{
            flex: 1,
            padding: isMobile ? '1.25rem 1rem' : '2rem 2.5rem',
            width: '100%',
            overflow: 'auto',
          }}
        >
          <AnimatePresence mode="wait">
            <PageTransition key={pathname}>
              <Outlet />
            </PageTransition>
          </AnimatePresence>
        </main>
        <RunningTimerWidget />
      </div>
    </div>
  );
}
