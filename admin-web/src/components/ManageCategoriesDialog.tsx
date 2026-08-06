import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Dialog } from './Dialog';
import type { ItemCategory, JobOrderType } from '../lib/types';

const JOB_ORDER_TYPES: JobOrderType[] = ['SOFTWARE', 'CCTV', 'SIGNAGE'];

const JOB_ORDER_TYPE_LABEL: Record<JobOrderType, string> = {
  SOFTWARE: 'Software',
  CCTV: 'CCTV',
  SIGNAGE: 'Signage',
};

interface CategoryFormState {
  name: string;
  jobOrderType: JobOrderType | '';
}

const EMPTY_FORM: CategoryFormState = { name: '', jobOrderType: '' };

function apiErrorMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return msg ?? fallback;
}

export interface ManageCategoriesDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ManageCategoriesDialog({ isOpen, onClose }: ManageCategoriesDialogProps) {
  const qc = useQueryClient();
  const [addForm, setAddForm] = useState<CategoryFormState>(EMPTY_FORM);
  const [addError, setAddError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CategoryFormState>(EMPTY_FORM);
  const [editError, setEditError] = useState('');
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['item-categories', 'all'],
    queryFn: async () => (await api.get<ItemCategory[]>('/item-categories', { params: { all: true } })).data,
    enabled: isOpen,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['item-categories'] });

  const createMutation = useMutation({
    mutationFn: async () =>
      api.post('/item-categories', {
        name: addForm.name.trim(),
        jobOrderType: addForm.jobOrderType || null,
      }),
    onSuccess: () => {
      invalidate();
      setAddForm(EMPTY_FORM);
      setAddError('');
    },
    onError: (err) => setAddError(apiErrorMessage(err, 'Failed to create category.')),
  });

  const updateMutation = useMutation({
    mutationFn: async (vars: { id: string; data: Partial<{ name: string; jobOrderType: JobOrderType | null; active: boolean }> }) =>
      api.patch(`/item-categories/${vars.id}`, vars.data),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setEditError('');
    },
    onError: (err) => setEditError(apiErrorMessage(err, 'Failed to save category.')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/item-categories/${id}`),
    onSuccess: () => {
      invalidate();
      setDeleteError(null);
    },
    onError: (err, id) => setDeleteError({ id, message: apiErrorMessage(err, 'Failed to delete category.') }),
  });

  const submitAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim()) {
      setAddError('Name is required.');
      return;
    }
    createMutation.mutate();
  };

  const startEdit = (c: ItemCategory) => {
    setEditingId(c.id);
    setEditForm({ name: c.name, jobOrderType: c.jobOrderType ?? '' });
    setEditError('');
  };

  const submitEdit = (e: FormEvent) => {
    e.preventDefault();
    if (!editForm.name.trim()) {
      setEditError('Name is required.');
      return;
    }
    if (!editingId) return;
    updateMutation.mutate({
      id: editingId,
      data: { name: editForm.name.trim(), jobOrderType: editForm.jobOrderType || null },
    });
  };

  const toggleActive = (c: ItemCategory) => {
    setDeleteError(null);
    updateMutation.mutate({ id: c.id, data: { active: !c.active } });
  };

  const categories = categoriesQuery.data ?? [];

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Manage categories" maxWidth={640}>
      <form onSubmit={submitAdd} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
          <label htmlFor="cat-name">New category name</label>
          <input
            id="cat-name"
            value={addForm.name}
            onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Others"
          />
        </div>
        <div className="field" style={{ minWidth: 160, marginBottom: 0 }}>
          <label htmlFor="cat-type">Job order type</label>
          <select
            id="cat-type"
            value={addForm.jobOrderType}
            onChange={(e) => setAddForm((f) => ({ ...f, jobOrderType: e.target.value as JobOrderType | '' }))}
          >
            <option value="">All types</option>
            {JOB_ORDER_TYPES.map((t) => (
              <option key={t} value={t}>{JOB_ORDER_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Adding…' : '+ Add category'}
        </button>
      </form>
      {addError && <p className="error-text" style={{ marginTop: 0, marginBottom: '1rem' }}>{addError}</p>}

      {categoriesQuery.isLoading && <p>Loading categories…</p>}
      {categoriesQuery.isError && <p className="error-text">Failed to load categories.</p>}
      {!categoriesQuery.isLoading && categories.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No categories yet — add the first one above.</p>
      )}

      {categories.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Job order type</th>
                <th style={{ textAlign: 'center' }}>Items</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ width: 220 }}></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} style={{ opacity: c.active ? 1 : 0.55 }}>
                  {editingId === c.id ? (
                    <td colSpan={5} style={{ padding: '0.6rem 0' }}>
                      <form onSubmit={submitEdit} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div className="field" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
                          <label htmlFor={`edit-name-${c.id}`}>Name</label>
                          <input
                            id={`edit-name-${c.id}`}
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                            autoFocus
                          />
                        </div>
                        <div className="field" style={{ minWidth: 140, marginBottom: 0 }}>
                          <label htmlFor={`edit-type-${c.id}`}>Job order type</label>
                          <select
                            id={`edit-type-${c.id}`}
                            value={editForm.jobOrderType}
                            onChange={(e) => setEditForm((f) => ({ ...f, jobOrderType: e.target.value as JobOrderType | '' }))}
                          >
                            <option value="">All types</option>
                            {JOB_ORDER_TYPES.map((t) => (
                              <option key={t} value={t}>{JOB_ORDER_TYPE_LABEL[t]}</option>
                            ))}
                          </select>
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ fontSize: '0.8rem' }} disabled={updateMutation.isPending}>
                          Save
                        </button>
                        <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </form>
                      {editError && <p className="error-text" style={{ marginTop: '0.5rem' }}>{editError}</p>}
                    </td>
                  ) : (
                    <>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {c.jobOrderType ? JOB_ORDER_TYPE_LABEL[c.jobOrderType] : 'All types'}
                      </td>
                      <td style={{ textAlign: 'center' }}>{c._count?.items ?? 0}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${c.active ? 'badge-active' : 'badge-draft'}`} style={{ fontSize: '0.72rem' }}>
                          {c.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
                            disabled={updateMutation.isPending}
                            onClick={() => toggleActive(c)}
                          >
                            {c.active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
                            onClick={() => startEdit(c)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              setDeleteError(null);
                              if (confirm(`Delete "${c.name}"? This cannot be undone.`)) deleteMutation.mutate(c.id);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                        {deleteError?.id === c.id && (
                          <p className="error-text" style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', textAlign: 'right' }}>
                            {deleteError.message}
                          </p>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
