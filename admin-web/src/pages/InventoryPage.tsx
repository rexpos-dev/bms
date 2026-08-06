import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { InventoryItem, ItemCategory, StockMovement, StockMovementReason } from '../lib/types';
import { Dialog } from '../components/Dialog';
import { TableToolbar, matchesSearch, inDateRange } from '../components/TableToolbar';

const REASON_LABEL: Record<StockMovementReason, string> = {
  MANUAL_ADJUST: 'Manual adjust',
  JOB_ORDER_DEDUCTION: 'Job order — used',
  JOB_ORDER_RESTORE: 'Job order — restored',
};

interface ItemForm {
  name: string;
  description: string;
  barcode: string;
  unitPrice: string;
  stockQty: string;
  lowStockAlert: string;
  active: boolean;
  categoryId: string;
}

const emptyForm: ItemForm = {
  name: '',
  description: '',
  barcode: '',
  unitPrice: '',
  stockQty: '',
  lowStockAlert: '',
  active: true,
  categoryId: '',
};

function isLow(item: InventoryItem): boolean {
  return item.lowStockAlert > 0 && item.stockQty <= item.lowStockAlert;
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return msg ?? fallback;
}

export interface InventoryPageProps {
  /** Omit for the full catalog (Settings). Pass a scope to render one Products tab. */
  scope?: { categoryId: string } | { uncategorised: true };
}

export function InventoryPage({ scope }: InventoryPageProps = {}) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<ItemForm>(emptyForm);
  const [formError, setFormError] = useState('');

  const [adjustTarget, setAdjustTarget] = useState<InventoryItem | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustError, setAdjustError] = useState('');

  const [historyTarget, setHistoryTarget] = useState<InventoryItem | null>(null);

  const itemsQuery = useQuery({
    queryKey: ['inventory', 'all'],
    queryFn: async () => (await api.get<InventoryItem[]>('/inventory', { params: { all: true } })).data,
  });

  const movementsQuery = useQuery({
    queryKey: ['inventory-movements', historyTarget?.id],
    queryFn: async () => (await api.get<StockMovement[]>(`/inventory/${historyTarget!.id}/movements`)).data,
    enabled: !!historyTarget,
  });

  const categoriesQuery = useQuery({
    queryKey: ['item-categories'],
    queryFn: async () => (await api.get<ItemCategory[]>('/item-categories')).data,
  });

  const scopedCategoryId = scope && 'categoryId' in scope ? scope.categoryId : null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        barcode: form.barcode.trim() || undefined,
        unitPrice: form.unitPrice === '' ? 0 : Number(form.unitPrice),
        lowStockAlert: form.lowStockAlert === '' ? 0 : Number(form.lowStockAlert),
        active: form.active,
        categoryId: form.categoryId || null,
      };
      if (editing) {
        return api.patch(`/inventory/${editing.id}`, payload);
      }
      return api.post('/inventory', { ...payload, stockQty: form.stockQty === '' ? 0 : Number(form.stockQty) });
    },
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      setFormError('');
    },
    onError: (err) => setFormError(apiErrorMessage(err, 'Failed to save item.')),
  });

  const adjustMutation = useMutation({
    mutationFn: (delta: number) => api.post(`/inventory/${adjustTarget!.id}/adjust`, { delta }),
    onSuccess: () => {
      invalidate();
      setAdjustTarget(null);
      setAdjustDelta('');
      setAdjustError('');
    },
    onError: (err) => setAdjustError(apiErrorMessage(err, 'Failed to adjust stock.')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/inventory/${id}`),
    onSuccess: invalidate,
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm, categoryId: scopedCategoryId ?? '' });
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      description: item.description ?? '',
      barcode: item.barcode ?? '',
      unitPrice: item.unitPrice,
      stockQty: String(item.stockQty),
      lowStockAlert: String(item.lowStockAlert),
      active: item.active,
      categoryId: item.categoryId ?? '',
    });
    setFormError('');
    setShowForm(true);
  };

  const submitForm = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError('Name is required.');
      return;
    }
    saveMutation.mutate();
  };

  const submitAdjust = (e: FormEvent) => {
    e.preventDefault();
    const delta = Number(adjustDelta);
    if (!Number.isInteger(delta) || delta === 0) {
      setAdjustError('Enter a non-zero whole number (use – to remove).');
      return;
    }
    adjustMutation.mutate(delta);
  };

  const set = <K extends keyof ItemForm>(key: K, value: ItemForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const [itemSearch, setItemSearch] = useState('');
  const scopedItems = (itemsQuery.data ?? []).filter((item) => {
    if (!scope) return true;
    if ('uncategorised' in scope) return item.categoryId === null;
    return item.categoryId === scope.categoryId;
  });
  const filteredItems = scopedItems.filter((item) =>
    matchesSearch(itemSearch, item.name, item.description, item.barcode),
  );

  const [movementReason, setMovementReason] = useState('');
  const [movementFrom, setMovementFrom] = useState('');
  const [movementTo, setMovementTo] = useState('');
  const filteredMovements = (movementsQuery.data ?? []).filter((m) =>
    (!movementReason || m.reason === movementReason)
    && inDateRange(m.createdAt, movementFrom, movementTo),
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
          Materials &amp; hardware catalog. These items power the Quick Add buttons on job orders.
        </p>
        <button type="button" className="btn btn-primary" onClick={openAdd}>+ Add item</button>
      </div>

      {itemsQuery.isLoading && <p>Loading inventory…</p>}
      {itemsQuery.isError && <p className="error-text">Failed to load inventory.</p>}
      {scopedItems.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No inventory items yet. Add your first one.</p>}

      {scopedItems.length > 0 && (
        <div style={{ overflowX: 'auto' }} className="card" >
          <TableToolbar
            search={itemSearch}
            onSearch={setItemSearch}
            placeholder="Search item, description, barcode…"
          />
          <table>
            <thead>
              <tr>
                <th>Item</th>
                {!scope && <th>Category</th>}
                <th>Barcode</th>
                <th style={{ textAlign: 'right' }}>Unit Price</th>
                <th style={{ textAlign: 'center' }}>Stock</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ width: 220 }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 && (
                <tr><td colSpan={scope ? 6 : 7} style={{ padding: '1rem 0', color: 'var(--text-muted)', textAlign: 'center' }}>No matches.</td></tr>
              )}
              {filteredItems.map((item) => (
                <tr key={item.id} style={{ opacity: item.active ? 1 : 0.55 }}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    {item.description && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{item.description}</div>
                    )}
                  </td>
                  {!scope && (
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      {item.category?.name ?? 'Uncategorised'}
                    </td>
                  )}
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{item.barcode || '—'}</td>
                  <td style={{ textAlign: 'right' }}>₱{Number(item.unitPrice).toLocaleString()}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span
                      style={{
                        fontWeight: 700,
                        color: isLow(item) ? 'var(--danger)' : 'var(--text)',
                      }}
                    >
                      {item.stockQty}
                    </span>
                    {isLow(item) && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--danger)', fontWeight: 600 }}>Low stock</div>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`badge ${item.active ? 'badge-success' : ''}`} style={{ fontSize: '0.72rem' }}>
                      {item.active ? 'Active' : 'Hidden'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
                        onClick={() => { setAdjustTarget(item); setAdjustDelta(''); setAdjustError(''); }}
                      >
                        Restock
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
                        onClick={() => setHistoryTarget(item)}
                      >
                        History
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
                        onClick={() => openEdit(item)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (confirm(`Delete "${item.name}"? This cannot be undone.`)) deleteMutation.mutate(item.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit item' : 'Add item'} maxWidth={480}>
        <form onSubmit={submitForm}>
          <div className="field">
            <label>Name *</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder="e.g. Thermal Printer 80mm" />
          </div>
          <div className="field">
            <label htmlFor="inv-category">Category</label>
            <select
              id="inv-category"
              value={form.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
            >
              <option value="">Uncategorised — shows in every job order type</option>
              {(categoriesQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.jobOrderType ? ` (${c.jobOrderType})` : ' (all types)'}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Description</label>
            <input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Short detail" />
          </div>
          <div className="field">
            <label>Barcode</label>
            <input value={form.barcode} onChange={(e) => set('barcode', e.target.value)} placeholder="Scan or type (optional)" />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Unit Price (₱)</label>
              <input type="number" min={0} step="0.01" value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} placeholder="0.00" />
            </div>
            {!editing && (
              <div className="field" style={{ flex: 1 }}>
                <label>Initial Stock</label>
                <input type="number" min={0} value={form.stockQty} onChange={(e) => set('stockQty', e.target.value)} placeholder="0" />
              </div>
            )}
            <div className="field" style={{ flex: 1 }}>
              <label>Low-stock alert</label>
              <input type="number" min={0} value={form.lowStockAlert} onChange={(e) => set('lowStockAlert', e.target.value)} placeholder="0 = off" />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', margin: '0.25rem 0 0.75rem' }}>
            <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
            Active (show in job-order Quick Add)
          </label>
          {formError && <p className="error-text">{formError}</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add item'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      </Dialog>

      {/* Restock / adjust dialog */}
      <Dialog isOpen={!!adjustTarget} onClose={() => setAdjustTarget(null)} title={`Restock ${adjustTarget?.name ?? ''}`} maxWidth={380}>
        {adjustTarget && (
          <form onSubmit={submitAdjust}>
            <p style={{ marginTop: 0, fontSize: '0.9rem' }}>
              Current stock: <strong>{adjustTarget.stockQty}</strong>
            </p>
            <div className="field">
              <label>Change (use – to remove)</label>
              <input
                type="number"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                placeholder="e.g. 10 or -3"
                autoFocus
              />
            </div>
            {adjustDelta !== '' && Number.isInteger(Number(adjustDelta)) && (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                New stock will be <strong>{adjustTarget.stockQty + Number(adjustDelta)}</strong>.
              </p>
            )}
            {adjustError && <p className="error-text">{adjustError}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={adjustMutation.isPending}>
                {adjustMutation.isPending ? 'Applying…' : 'Apply'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setAdjustTarget(null)}>Cancel</button>
            </div>
          </form>
        )}
      </Dialog>

      {/* Stock history dialog */}
      <Dialog isOpen={!!historyTarget} onClose={() => setHistoryTarget(null)} title={`Stock history — ${historyTarget?.name ?? ''}`} maxWidth={520}>
        {movementsQuery.isLoading && <p>Loading history…</p>}
        {movementsQuery.isError && <p className="error-text">Failed to load history.</p>}
        {movementsQuery.data?.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No stock movements yet.</p>}
        {movementsQuery.data && movementsQuery.data.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <TableToolbar
              selects={[{
                value: movementReason,
                onChange: setMovementReason,
                ariaLabel: 'Filter by reason',
                options: [
                  { value: '', label: 'All reasons' },
                  ...Object.entries(REASON_LABEL).map(([value, label]) => ({ value, label })),
                ],
              }]}
              dateRange={{ from: movementFrom, to: movementTo, onFrom: setMovementFrom, onTo: setMovementTo }}
            />
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Reason</th>
                  <th style={{ textAlign: 'right' }}>Change</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: '1rem 0', color: 'var(--text-muted)', textAlign: 'center' }}>No matches.</td></tr>
                )}
                {filteredMovements.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontSize: '0.8rem' }}>{new Date(m.createdAt).toLocaleString()}</td>
                    <td style={{ fontSize: '0.82rem' }}>{REASON_LABEL[m.reason]}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: m.delta < 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {m.delta > 0 ? `+${m.delta}` : m.delta}
                    </td>
                    <td style={{ textAlign: 'right' }}>{m.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Dialog>
    </div>
  );
}
