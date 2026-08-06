import { type FormEvent, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Dialog } from '../components/Dialog';
import { Pagination, usePagination } from '../components/Pagination';
import { TableToolbar, matchesSearch } from '../components/TableToolbar';
import { ManageCategoriesDialog } from '../components/ManageCategoriesDialog';
import type { LicenseType, SoftwareProduct, InventoryItem, ItemCategory } from '../lib/types';
import { InventoryPage } from './InventoryPage';

const LICENSE_TYPES: LicenseType[] = ['SUBSCRIPTION_MONTHLY', 'SUBSCRIPTION_ANNUAL', 'LIFETIME'];

const EMPTY_FORM = {
  productName: '',
  version: '',
  licenseType: LICENSE_TYPES[0],
  price: '',
  maintenanceFee: '',
};

export function InventoryManagementPage() {
  const [tab, setTab] = useState<string>('software');
  const [showCategories, setShowCategories] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ['item-categories'],
    queryFn: async () => (await api.get<ItemCategory[]>('/item-categories')).data,
  });

  const itemsQuery = useQuery({
    queryKey: ['inventory', 'all'],
    queryFn: async () => (await api.get<InventoryItem[]>('/inventory', { params: { all: true } })).data,
  });

  const categories = categoriesQuery.data ?? [];
  // Only offer the uncategorised tab when something is actually stranded there,
  // so a clean catalog does not carry a permanently empty tab.
  const hasUncategorised = (itemsQuery.data ?? []).some((i) => i.categoryId === null);

  const active = categories.find((c) => c.id === tab);

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ marginBottom: '0.25rem' }}>Inventory Management</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          Licensable software systems and the hardware catalog, grouped by category.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <TabButton active={tab === 'software'} onClick={() => setTab('software')}>
          Software
        </TabButton>
        {categories.map((c) => (
          <TabButton key={c.id} active={tab === c.id} onClick={() => setTab(c.id)}>
            {c.name}
          </TabButton>
        ))}
        {hasUncategorised && (
          <TabButton active={tab === 'uncategorised'} onClick={() => setTab('uncategorised')}>
            Uncategorised
          </TabButton>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          style={{ fontSize: '0.85rem', marginLeft: 'auto' }}
          onClick={() => setShowCategories(true)}
        >
          ⚙ Manage categories
        </button>
      </div>

      <ManageCategoriesDialog isOpen={showCategories} onClose={() => setShowCategories(false)} />

      {tab === 'software' && <SoftwareTab />}
      {tab === 'uncategorised' && <InventoryPage scope={{ uncategorised: true }} />}
      {active && <InventoryPage key={active.id} scope={{ categoryId: active.id }} />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn ${active ? 'btn-primary' : 'btn-secondary'}`}
      style={{ fontSize: '0.85rem' }}
    >
      {children}
    </button>
  );
}

function SoftwareTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<SoftwareProduct[]>('/software-products')).data,
  });

  const createProduct = useMutation({
    mutationFn: async () =>
      (
        await api.post<SoftwareProduct>('/software-products', {
          productName: form.productName,
          version: form.version,
          licenseType: form.licenseType,
          price: Number(form.price),
          maintenanceFee: form.maintenanceFee ? Number(form.maintenanceFee) : undefined,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setForm(EMPTY_FORM);
      setShowForm(false);
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    createProduct.mutate();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
          New product
        </button>
      </div>

      <Dialog
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="New Product"
        maxWidth={480}
      >
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="productName">Product name</label>
            <input
              id="productName"
              required
              placeholder="POS Ultimate"
              value={form.productName}
              onChange={(e) => setForm({ ...form, productName: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="version">Version</label>
            <input
              id="version"
              required
              placeholder="1.0.0"
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="licenseType">License type</label>
            <select
              id="licenseType"
              value={form.licenseType}
              onChange={(e) => setForm({ ...form, licenseType: e.target.value as LicenseType })}
            >
              {LICENSE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="price">Price (₱)</label>
            <input
              id="price"
              type="number"
              min={0}
              step="0.01"
              required
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="maintenanceFee">Maintenance fee (₱, optional)</label>
            <input
              id="maintenanceFee"
              type="number"
              min={0}
              step="0.01"
              value={form.maintenanceFee}
              onChange={(e) => setForm({ ...form, maintenanceFee: e.target.value })}
            />
          </div>
          {createProduct.isError && <p className="error-text">Could not save the product. Check the fields and try again.</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={createProduct.isPending} style={{ flex: 1 }}>
              {createProduct.isPending ? 'Saving…' : 'Save product'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      </Dialog>

      <ProductsTable data={productsQuery.data ?? []} isLoading={productsQuery.isLoading} isError={productsQuery.isError} />
    </div>
  );
}

function ProductsTable({ data, isLoading, isError }: { data: SoftwareProduct[]; isLoading: boolean; isError: boolean }) {
  const [search, setSearch] = useState('');
  const filtered = data.filter((p) => matchesSearch(search, p.productName, p.version, p.licenseType.replace(/_/g, ' ')));
  const pg = usePagination(filtered);
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ padding: '1.75rem' }}>
          {isLoading && <p>Loading products…</p>}
          {isError && <p className="error-text">Failed to load products.</p>}
          {!isLoading && data.length === 0 && <p>No products yet — add the first one above.</p>}
          {data.length > 0 && (
            <>
            <TableToolbar search={search} onSearch={setSearch} placeholder="Search name, version, license type…" />
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Version</th>
                  <th>License type</th>
                  <th>Price</th>
                  <th>Maintenance fee</th>
                </tr>
              </thead>
              <tbody>
                {pg.paginated.map((product) => (
                  <tr key={product.id}>
                    <td style={{ fontWeight: 500 }}>{product.productName}</td>
                    <td>{product.version}</td>
                    <td>{product.licenseType.replace(/_/g, ' ')}</td>
                    <td>₱{Number(product.price).toLocaleString()}</td>
                    <td>{product.maintenanceFee ? `₱${Number(product.maintenanceFee).toLocaleString()}` : '—'}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '1rem 0', color: 'var(--text-muted)', textAlign: 'center' }}>No matches.</td></tr>
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
