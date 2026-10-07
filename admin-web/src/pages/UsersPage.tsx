import { type FormEvent, useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { Dialog } from '../components/Dialog';
import { Pagination, usePagination } from '../components/Pagination';
import { TableToolbar, matchesSearch } from '../components/TableToolbar';
import type { PayrollEmployee, TeamMember, UserRole } from '../lib/types';

const ALL_ROLES: UserRole[] = [
  'SUPER_ADMIN', 'ADMIN_STAFF', 'SALES_STAFF', 'INSTALLER', 'DEVELOPER',
  'DESIGNER', 'LIAISON', 'ENCODER',
];

const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN:      'Super Admin',
  ADMIN_STAFF:      'Admin Staff',
  SALES_STAFF:      'Sales Staff',
  INSTALLER:        'Installer',
  DEVELOPER:        'Developer',
  DESIGNER:         'Designer',
  LIAISON:          'Liaison',
  ENCODER:          'Encoder',
};

const ROLE_COLOR: Record<UserRole, string> = {
  SUPER_ADMIN:      '#7c3aed',
  ADMIN_STAFF:      '#0369a1',
  SALES_STAFF:      '#059669',
  INSTALLER:        '#0891b2',
  DEVELOPER:        '#16a34a',
  DESIGNER:         '#d97706',
  LIAISON:          '#db2777',
  ENCODER:          '#6366f1',
};

const EMPTY_FORM = {
  fullName: '',
  email: '',
  password: '',
  phone: '',
  role: 'INSTALLER' as UserRole,
  additionalRoles: [] as UserRole[],
  baseBonus: '10000',
};

function fmtPeso(val: string | number | null | undefined) {
  const n = Number(val ?? 0);
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ── Role chips (read-only) ────────────────────────────────────────────────────

function RoleChip({ role, onRemove }: { role: UserRole; onRemove?: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
      padding: '0.2rem 0.5rem', borderRadius: 999,
      background: ROLE_COLOR[role] + '22',
      color: ROLE_COLOR[role],
      fontSize: '0.75rem', fontWeight: 700,
      border: `1px solid ${ROLE_COLOR[role]}55`,
    }}>
      {ROLE_LABEL[role]}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1, fontSize: '0.85rem' }}
          title={`Remove ${ROLE_LABEL[role]}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

// ── Password field with show/hide toggle ──────────────────────────────────────

function PasswordField({ id, label, value, onChange, autoComplete }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={show ? 'text' : 'password'}
          required
          minLength={8}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ paddingRight: '2.4rem' }}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          tabIndex={-1}
          style={{
            position: 'absolute',
            right: '0.6rem',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            background: 'none',
            border: 'none',
            padding: 0,
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

// ── Edit Dialog Component ─────────────────────────────────────────────────────

function EditUserDialog({ user, onClose }: { user: TeamMember | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('INSTALLER');
  const [additionalRoles, setAdditionalRoles] = useState<UserRole[]>([]);
  const [baseBonus, setBaseBonus] = useState('10000');
  const [payrollEmployeeId, setPayrollEmployeeId] = useState('');

  const employeesQuery = useQuery({
    queryKey: ['payroll-employees'],
    queryFn: async () => (await api.get<PayrollEmployee[]>('/users/payroll-employees')).data,
    enabled: !!user,
    retry: false,
  });
  const linkedEmployee = employeesQuery.data?.find((e) => String(e.id) === payrollEmployeeId);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setEmail(user.email);
      setPhone(user.phone ?? '');
      setRole(user.role);
      setAdditionalRoles((user.additionalRoles ?? []).map(r => r.role));
      setBaseBonus(user.baseBonus != null ? String(Number(user.baseBonus)) : '10000');
      setPayrollEmployeeId(user.payrollEmployeeId != null ? String(user.payrollEmployeeId) : '');
    }
  }, [user]);

  const save = useMutation({
    mutationFn: () => api.patch(`/users/${user?.id}`, {
      fullName: fullName.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      role,
      additionalRoles,
      baseBonus: baseBonus !== '' ? Number(baseBonus) : undefined,
      // Only send the link when it changed, so saving never depends on the payroll API being up.
      ...(payrollEmployeeId !== (user?.payrollEmployeeId != null ? String(user.payrollEmployeeId) : '')
        ? { payrollEmployeeId: payrollEmployeeId ? Number(payrollEmployeeId) : null }
        : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users', 'team'] });
      onClose();
    },
  });

  const toggleAdditionalRole = (r: UserRole) => {
    setAdditionalRoles(prev => 
      prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]
    );
  };

  if (!user) return null;

  return (
    <Dialog isOpen={!!user} onClose={onClose} title={`Edit ${user.fullName}`} maxWidth={480}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="field">
          <label htmlFor="edit-fullName">Full name</label>
          <input id="edit-fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="edit-email">Email</label>
          <input id="edit-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="edit-phone">Phone (optional)</label>
          <input id="edit-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="edit-payroll">Payroll employee</label>
          <select
            id="edit-payroll"
            value={payrollEmployeeId}
            disabled={employeesQuery.isLoading || employeesQuery.isError}
            onChange={(e) => {
              setPayrollEmployeeId(e.target.value);
              const picked = employeesQuery.data?.find((emp) => String(emp.id) === e.target.value);
              if (picked && picked.dailyRate > 0) setBaseBonus(String(picked.dailyRate));
            }}
          >
            <option value="">{employeesQuery.isLoading ? 'Loading payroll…' : '— Not linked —'}</option>
            {(employeesQuery.data ?? []).map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}{emp.employeeNumber ? ` · ${emp.employeeNumber}` : ''} · ₱{emp.dailyRate.toLocaleString()}/day{emp.isActive ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
          {employeesQuery.isError && (
            <p className="error-text" style={{ margin: '0.35rem 0 0' }}>
              {(employeesQuery.error as { response?: { data?: { message?: string } } })?.response?.data?.message
                ?? 'Could not load payroll employees.'}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="edit-baseBonus">Salary grade — base bonus (₱)</label>
          <input id="edit-baseBonus" type="number" min={0} step="any" value={baseBonus}
            disabled={!!linkedEmployee}
            onChange={(e) => setBaseBonus(e.target.value)} />
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {linkedEmployee
              ? "Pulled from payroll: this employee's daily rate. Unlink to edit manually."
              : 'Basis for KPI incentive computation (incentive = base × score %).'}
          </p>
        </div>
        <div className="field">
          <label htmlFor="edit-role">Primary role</label>
          <select
            id="edit-role"
            value={role}
            onChange={(e) => {
              const newRole = e.target.value as UserRole;
              setRole(newRole);
              setAdditionalRoles(prev => prev.filter(x => x !== newRole));
            }}
          >
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Additional Roles</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
            {ALL_ROLES.filter(r => r !== 'SUPER_ADMIN' && r !== role).map(r => (
              <label key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={additionalRoles.includes(r)}
                  onChange={() => toggleAdditionalRole(r)}
                />
                {ROLE_LABEL[r]}
              </label>
            ))}
          </div>
        </div>
        {save.isError && <p className="error-text">Failed — email may be taken.</p>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button type="submit" className="btn btn-primary" disabled={save.isPending} style={{ flex: 1 }}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Reset Password Dialog ───────────────────────────────────────────────────────

function ResetPasswordDialog({ user, onClose }: { user: TeamMember | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (user) setNewPassword('');
  }, [user]);

  const reset = useMutation({
    mutationFn: () => api.patch(`/users/${user?.id}/reset-password`, { newPassword }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users', 'team'] });
      onClose();
    },
  });

  if (!user) return null;

  return (
    <Dialog isOpen={!!user} onClose={onClose} title={`Reset Password — ${user.fullName}`} maxWidth={420}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); reset.mutate(); }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0 }}>
          Sets a new temporary password for <strong>{user.email}</strong>. Share it with them directly —
          they can change it themselves afterward from Profile Settings.
        </p>
        <PasswordField
          id="reset-password"
          label="New temporary password"
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
        />
        {reset.isError && <p className="error-text">Could not reset the password. Try again.</p>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button type="submit" className="btn btn-primary" disabled={reset.isPending} style={{ flex: 1 }}>
            {reset.isPending ? 'Resetting…' : 'Reset password'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function UsersPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<TeamMember | null>(null);
  const [resettingUser, setResettingUser] = useState<TeamMember | null>(null);

  const usersQuery = useQuery({
    queryKey: ['users', 'team'],
    queryFn: async () => (await api.get<TeamMember[]>('/users')).data,
  });

  const createUser = useMutation({
    mutationFn: async () =>
      (await api.post<TeamMember>('/users', {
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
        role: form.role,
        additionalRoles: form.additionalRoles,
        baseBonus: form.baseBonus !== '' ? Number(form.baseBonus) : undefined,
      })).data,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); setForm(EMPTY_FORM); setShowForm(false); },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      (await api.patch<TeamMember>(`/users/${id}/${isActive ? 'deactivate' : 'activate'}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', 'team'] }),
  });

  const syncPayroll = useMutation({
    mutationFn: async () =>
      (await api.post<{ linked: number; updated: number; skipped: number; unmatched: string[] }>('/users/sync-payroll')).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const toggleFormRole = (role: UserRole) => {
    setForm(prev => {
      if (prev.additionalRoles.includes(role)) {
        return { ...prev, additionalRoles: prev.additionalRoles.filter(r => r !== role) };
      } else {
        return { ...prev, additionalRoles: [...prev.additionalRoles, role] };
      }
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>Team</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
            Manage team member accounts. Each member has one <strong>primary role</strong> (their dashboard &amp; portal) plus any <strong>extra access</strong> you grant. Set both from <strong>Edit</strong>.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" disabled={syncPayroll.isPending} onClick={() => syncPayroll.mutate()}>
            {syncPayroll.isPending ? 'Syncing…' : 'Sync base bonus from payroll'}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
            Add member
          </button>
        </div>
      </div>

      {syncPayroll.isSuccess && (
        <p style={{ color: 'var(--success)', fontSize: '0.85rem', marginTop: 0 }}>
          ✓ Base bonus updated for {syncPayroll.data.updated} member{syncPayroll.data.updated !== 1 ? 's' : ''}
          {syncPayroll.data.linked > 0 ? ` (${syncPayroll.data.linked} newly linked by name)` : ''}.
          {syncPayroll.data.unmatched.length > 0 && (
            <span style={{ color: 'var(--text-muted)' }}>
              {' '}Not in payroll (link manually via Edit if needed): {syncPayroll.data.unmatched.join(', ')}.
            </span>
          )}
        </p>
      )}
      {syncPayroll.isError && (
        <p className="error-text" style={{ marginTop: 0 }}>
          {(syncPayroll.error as { response?: { data?: { message?: string } } })?.response?.data?.message
            ?? 'Could not sync from payroll.'}
        </p>
      )}

      <Dialog
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Add Team Member"
        maxWidth={480}
      >
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); createUser.mutate(); }}>
          <div className="field">
            <label htmlFor="fullName">Full name</label>
            <input id="fullName" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <PasswordField
            id="password"
            label="Temporary password"
            value={form.password}
            onChange={(password) => setForm({ ...form, password })}
            autoComplete="new-password"
          />
          <div className="field">
            <label htmlFor="phone">Phone (optional)</label>
            <input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="baseBonus">Salary grade — base bonus (₱)</label>
            <input id="baseBonus" type="number" min={0} step="any" value={form.baseBonus}
              onChange={(e) => setForm({ ...form, baseBonus: e.target.value })} />
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Used as the basis for KPI incentive computation (incentive = base × score %).
            </p>
          </div>
          <div className="field">
            <label htmlFor="role">Primary role</label>
            <select
              id="role"
              value={form.role}
              onChange={(e) => {
                const newRole = e.target.value as UserRole;
                setForm({
                  ...form,
                  role: newRole,
                  additionalRoles: form.additionalRoles.filter(r => r !== newRole)
                });
              }}
            >
              {ALL_ROLES.filter((r) => r !== 'SUPER_ADMIN').map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Additional Roles</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
              {ALL_ROLES.filter(r => r !== 'SUPER_ADMIN' && r !== form.role).map(r => (
                <label key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.additionalRoles.includes(r)}
                    onChange={() => toggleFormRole(r)}
                  />
                  {ROLE_LABEL[r]}
                </label>
              ))}
            </div>
          </div>

          {createUser.isError && <p className="error-text">Could not create account. Email may already be in use.</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={createUser.isPending} style={{ flex: 1 }}>
              {createUser.isPending ? 'Creating…' : 'Create account'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      </Dialog>

      <EditUserDialog user={editingUser} onClose={() => setEditingUser(null)} />
      <ResetPasswordDialog user={resettingUser} onClose={() => setResettingUser(null)} />

      <UsersTable data={usersQuery.data ?? []} isLoading={usersQuery.isLoading} isError={usersQuery.isError} onEdit={setEditingUser} onResetPassword={setResettingUser} onToggleActive={(u) => toggleActive.mutate({ id: u.id, isActive: u.isActive })} toggleIsPending={toggleActive.isPending} />
    </div>
  );
}

function UsersTable({ data, isLoading, isError, onEdit, onResetPassword, onToggleActive, toggleIsPending }: {
  data: TeamMember[];
  isLoading: boolean;
  isError: boolean;
  onEdit: (u: TeamMember) => void;
  onResetPassword: (u: TeamMember) => void;
  onToggleActive: (u: TeamMember) => void;
  toggleIsPending: boolean;
}) {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const filtered = data.filter((u) =>
    matchesSearch(search, u.fullName, u.email, u.phone)
    && (!role || u.role === role || (u.additionalRoles ?? []).some((ra) => ra.role === role)),
  );
  const pg = usePagination(filtered);
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ padding: '1.75rem' }}>
          {isLoading && <p>Loading team…</p>}
          {isError && <p className="error-text">Failed to load the team.</p>}
          {!isLoading && data.length === 0 && <p>No team members yet.</p>}
          {data.length > 0 && (
            <>
            <TableToolbar
              search={search}
              onSearch={setSearch}
              placeholder="Search name, email, phone…"
              selects={[{
                value: role,
                onChange: setRole,
                ariaLabel: 'Filter by role',
                options: [{ value: '', label: 'All roles' }, ...ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))],
              }]}
            />
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Roles</th>
                  <th>Phone</th>
                  <th>Base Bonus</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pg.paginated.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.fullName}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{u.email}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
                        <RoleChip role={u.role} />
                        {(u.additionalRoles ?? []).map((ra) => (
                          <RoleChip key={ra.role} role={ra.role} />
                        ))}
                      </div>
                    </td>
                    <td>{u.phone ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtPeso(u.baseBonus)}</td>
                    <td><StatusBadge status={u.isActive ? 'active' : 'suspended'} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ display: 'inline-flex', gap: '0.4rem' }}>
                        <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }} onClick={() => onEdit(u)}>Edit</button>
                        <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }} onClick={() => onResetPassword(u)}>Reset Password</button>
                        <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }} disabled={toggleIsPending} onClick={() => onToggleActive(u)}>
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: '1rem 0', color: 'var(--text-muted)', textAlign: 'center' }}>No matches.</td></tr>
                )}
              </tbody>
            </table>
            </>
          )}
        </div>
      </div>
      {data.length > 0 && (
        <div style={{ padding: '0 1.75rem 1.75rem' }}>
          <Pagination
            page={pg.page}
            pageSize={pg.pageSize}
            totalPages={pg.totalPages}
            total={pg.total}
            start={pg.start}
            onPage={pg.changePage}
            onPageSize={pg.changePageSize}
          />
        </div>
      )}
    </div>
  );
}
