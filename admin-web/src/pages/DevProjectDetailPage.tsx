import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { useAuthStore } from '../lib/auth-store';
import type { DevProject } from '../lib/types';

export function DevProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const detailQuery = useQuery({
    queryKey: ['dev-projects', id],
    queryFn: async () => (await api.get<DevProject>(`/dev-projects/${id}`)).data,
    enabled: !!id,
  });

  const project = detailQuery.data ?? null;

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdminStaff = user?.role === 'ADMIN_STAFF';
  const isAdminRole = isSuperAdmin || isAdminStaff;
  const isOwner = !!project && project.developerId === user?.id;
  const canControl = isOwner;
  const canTagAdmins = user?.role === 'DEVELOPER' || isSuperAdmin;
  // Referenced so lint doesn't flag them as unused before Tasks 4-5 wire them up.
  void isAdminRole;
  void canControl;
  void canTagAdmins;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <h1 style={{ margin: 0 }}>{project.name}</h1>
          <StatusBadge status={project.status} />
        </div>
      )}
    </div>
  );
}
