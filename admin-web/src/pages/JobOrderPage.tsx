import { PRINT_STYLE } from '../components/print/print-styles';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import html2pdf from 'html2pdf.js';

// Convert every <img> inside `root` to an embedded base64 data URL and wait for
// it to finish loading, so html2canvas reliably captures the logo in the PDF.
async function inlineImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src') ?? '';
      if (!src || src.startsWith('data:')) return;
      try {
        const path = src.replace(/^https?:\/\/[^/]+/, '').replace(/^\/api/, '');
        const res = await api.get(path, { responseType: 'blob' });
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('read failed'));
          reader.readAsDataURL(res.data as Blob);
        });
        img.setAttribute('src', dataUrl);
        await img.decode().catch(() => undefined);
      } catch {
        /* leave original src if conversion fails */
      }
    }),
  );
}

import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fileUrl } from '../lib/api';
import { Dialog } from '../components/Dialog';
import { JobOrderPayments } from '../components/JobOrderPayments';
import { useAuthStore } from '../lib/auth-store';
import type { AgreementVersion, AuthenticatedUser, Client, CompanyProfile, DiscountType, InventoryItem, Job, JobOrder, JobOrderItem, JobOrderStatus, JobOrderType, SoftwareProduct, WarrantyTier } from '../lib/types';
import { DOC_META, DOC_TYPES } from '../components/print/doc-types';
import type { DocumentType as DocType } from '../lib/types';
import { PrintTemplate, type LineItem } from '../components/print/PrintTemplate';
import { ServiceAgreement } from '../components/print/ServiceAgreement';

// Quick-add materials now come from the Inventory (Settings → Inventory Management).

// ─── Client picker with live search + quick-add ───────────────────────────────

interface ClientPickerFieldProps {
  value: string;
  onChange: (id: string) => void;
  clients: Client[];
  disabled?: boolean;
  onQuickAdd: (name: string) => void;
  onFullDetails: () => void;
  isAdding?: boolean;
}

function ClientPickerField({ value, onChange, clients, disabled, onQuickAdd, onFullDetails, isAdding }: ClientPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = clients.find((c) => c.id === value);

  const filtered = clients.filter((c) =>
    c.businessName.toLowerCase().includes(search.toLowerCase()) ||
    c.clientCode.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 12);

  const exactMatch = clients.some((c) => c.businessName.toLowerCase() === search.trim().toLowerCase());

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const select = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch('');
  };

  const itemStyle: React.CSSProperties = {
    padding: '0.6rem 0.85rem', cursor: 'pointer', fontSize: '0.875rem',
    borderBottom: '1px solid var(--border)',
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Selected display / search input */}
      {selected && !open ? (
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <div style={{ flex: 1, padding: '0.65rem 0.9rem', border: '1px solid var(--border)', borderRadius: 8, background: disabled ? 'var(--bg)' : 'var(--surface)', fontSize: '0.9rem' }}>
            <strong>{selected.businessName}</strong>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.4rem' }}>{selected.clientCode}</span>
          </div>
          {!disabled && (
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}
              onClick={() => { setOpen(true); setSearch(''); }}>
              Change
            </button>
          )}
        </div>
      ) : (
        <input
          autoFocus={open}
          disabled={disabled}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={clients.length === 0 ? 'No clients yet — type to add new…' : 'Search client name or code…'}
          style={{ width: '100%' }}
        />
      )}

      {/* Dropdown */}
      {open && !disabled && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 280, overflowY: 'auto',
        }}>
          {/* Existing client matches */}
          {filtered.length === 0 && !search && (
            <div style={{ ...itemStyle, color: 'var(--text-muted)', cursor: 'default' }}>No clients yet.</div>
          )}
          {filtered.map((c) => (
            <div key={c.id}
              style={{ ...itemStyle, background: c.id === value ? 'rgba(79,70,229,0.06)' : undefined }}
              onMouseDown={() => select(c.id)}
            >
              <div style={{ fontWeight: 600 }}>{c.businessName}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.clientCode} · {c.contactNo}</div>
            </div>
          ))}

          {/* Separator if there are results */}
          {(filtered.length > 0 || search) && (
            <div style={{ borderTop: '1px solid var(--border)' }} />
          )}

          {/* Quick add — only when search text is present and not an exact match */}
          {search.trim() && !exactMatch && (
            <div
              style={{ ...itemStyle, color: 'var(--accent)', fontWeight: 600, borderBottom: 'none' }}
              onMouseDown={() => { setOpen(false); setSearch(''); onQuickAdd(search.trim()); }}
            >
              {isAdding ? 'Adding…' : `⚡ Quick add "${search.trim()}" as new client`}
            </div>
          )}

          {/* Full details dialog */}
          <div
            style={{ ...itemStyle, color: 'var(--text-muted)', fontSize: '0.82rem', borderBottom: 'none', borderTop: search.trim() && !exactMatch ? '1px solid var(--border)' : undefined }}
            onMouseDown={() => { setOpen(false); setSearch(''); onFullDetails(); }}
          >
            + Add client with full details…
          </div>
        </div>
      )}
    </div>
  );
}

function generateClientCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'CLT-';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Wizard steps ─────────────────────────────────────────────────────────────

const WIZARD_STEPS = [
  { num: 1, label: 'Client & Project' },
  { num: 2, label: 'Materials / Package' },
  { num: 3, label: 'Payments' },
] as const;

function StepIndicator({ step, onStep, paymentsEnabled }: { step: number; onStep: (n: 1 | 2 | 3) => void; paymentsEnabled: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
      {WIZARD_STEPS.map((s, i) => {
        const disabled = s.num === 3 && !paymentsEnabled;
        const active = step === s.num;
        return (
          <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {i > 0 && <div style={{ width: 24, height: 1, background: 'var(--border)' }} />}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onStep(s.num as 1 | 2 | 3)}
              title={disabled ? 'Save the job order to record payments' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.45 : 1,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  background: active ? 'var(--accent)' : 'var(--border)',
                  color: active ? '#fff' : 'var(--text-muted)',
                }}
              >
                {s.num}
              </span>
              <span style={{ fontSize: '0.85rem', fontWeight: active ? 700 : 500, color: active ? 'var(--text)' : 'var(--text-muted)' }}>
                {s.label}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Line item helpers ────────────────────────────────────────────────────────

let keySeq = 0;
const newKey = () => String(++keySeq);

function fromSaved(item: JobOrderItem): LineItem {
  return {
    _key: newKey(),
    inventoryItemId: item.inventoryItemId ?? null,
    name: item.name,
    description: item.description ?? '',
    quantity: item.quantity,
    unitPrice: Number(item.unitPrice),
    warrantyTier: item.warrantyTier ?? 'ACCESSORY',
  };
}

// ─── Computed totals ──────────────────────────────────────────────────────────

function computeTotals(salePrice: number, discount: number, discountType: DiscountType, items: LineItem[]) {
  const materialsTotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const subtotal = salePrice + materialsTotal;
  const discountAmt = discountType === 'PERCENTAGE' ? (subtotal * discount) / 100 : discount;
  const grandTotal = Math.max(0, subtotal - discountAmt);
  return { materialsTotal, subtotal, discountAmt, grandTotal };
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function JobOrderPage() {
  const { jobId, joId } = useParams<{ jobId: string; joId: string }>();
  // Standalone mode: the order lives without an installation job (e.g. a
  // quotation for a prospect). Route: /job-orders/order/:joId, 'new' = blank.
  const standalone = !jobId;
  const standaloneId = standalone && joId !== 'new' ? joId : undefined;

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Inject print styles once (safe to do in useEffect, not module scope) ──
  useEffect(() => {
    if (document.getElementById('job-order-print-style')) return;
    const style = document.createElement('style');
    style.id = 'job-order-print-style';
    style.textContent = PRINT_STYLE;
    document.head.appendChild(style);
    return () => {
      document.getElementById('job-order-print-style')?.remove();
    };
  }, []);

  // ── Fetch existing job order ──
  const jobOrderQuery = useQuery({
    queryKey: ['job-order', jobId ?? standaloneId],
    queryFn: async () => {
      const endpoint = standalone ? `/job-orders/${standaloneId}` : `/job-orders/by-job/${jobId}`;
      const res = await api.get<JobOrder | null>(endpoint);
      return res.data || null;
    },
    enabled: standalone ? !!standaloneId : !!jobId,
    retry: false,
  });

  const role = useAuthStore((s) => s.user?.role);

  // ── Fetch the parent record ──
  const jobQuery = useQuery({
    queryKey: ['job', jobId],
    queryFn: async () => (await api.get<Job>(`/jobs/${jobId}`)).data,
    enabled: !!jobId,
    retry: false,
  });

  // ── Fetch clients / products / inventory ──
  const clientsQuery = useQuery({
    queryKey: ['clients', 'SOFTWARE'],
    queryFn: async () => (await api.get<Client[]>('/clients', { params: { type: 'SOFTWARE' } })).data,
  });
  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<SoftwareProduct[]>('/software-products')).data,
  });
  const inventoryQuery = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => (await api.get<InventoryItem[]>('/inventory')).data,
  });
  const companyProfileQuery = useQuery({
    queryKey: ['company-profile'],
    queryFn: async () => (await api.get<CompanyProfile>('/company-profile')).data,
  });
  const agreementTemplateQuery = useQuery({
    queryKey: ['agreement-template'],
    queryFn: async () => (await api.get<AgreementVersion | null>('/agreement-template')).data,
  });

  // Preload the company logo as a base64 data URL so it embeds reliably in the
  // downloaded PDF (html2canvas cannot capture not-yet-loaded / tainted images).
  const logoUrl = companyProfileQuery.data?.logoUrl ?? undefined;
  const logoDataQuery = useQuery({
    queryKey: ['company-logo-data', logoUrl],
    enabled: !!logoUrl,
    staleTime: Infinity,
    queryFn: async () => {
      const path = logoUrl!.replace(/^\/api/, '');
      const res = await api.get(path, { responseType: 'blob' });
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('logo read failed'));
        reader.readAsDataURL(res.data as Blob);
      });
    },
  });

  // ── Form state ──
  const [clientId, setClientId] = useState('');
  const [productId, setProductId] = useState('');
  const [salePrice, setSalePrice] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<DiscountType>('FIXED');
  const [remarks, setRemarks] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);
  const [joType, setJoType] = useState<JobOrderType>('SOFTWARE');
  const [cameraCount, setCameraCount] = useState(0);
  const [cameraRate, setCameraRate] = useState(0);
  const [laborPct, setLaborPct] = useState(20);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [customForm, setCustomForm] = useState({ name: '', description: '', quantity: 1, unitPrice: 0, warrantyTier: 'ACCESSORY' as WarrantyTier });
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [includeAgreement, setIncludeAgreement] = useState(false);

  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientForm, setNewClientForm] = useState({
    businessName: '',
    ownerName: '',
    contactNo: '',
    email: '',
    address: '',
  });

  // ── Populate from saved job order ──
  useEffect(() => {
    const jo = jobOrderQuery.data;
    if (!jo) return;
    setClientId(jo.clientId);
    setProductId(jo.productId || '');
    setSalePrice(Number(jo.salePrice));
    setDiscount(Number(jo.discount));
    setDiscountType(jo.discountType);
    setRemarks(jo.remarks ?? '');
    setItems((jo.items ?? []).map(fromSaved));
    setJoType(jo.type ?? 'SOFTWARE');
    setCameraCount(jo.cameraCount ?? 0);
    setCameraRate(jo.cameraRate != null ? Number(jo.cameraRate) : 0);
    setLaborPct(jo.laborPct != null ? Number(jo.laborPct) : 20);
    setDocType(jo.docType ?? 'JOB_ORDER');
    setIncludeAgreement(jo.includeAgreement ?? false);
  }, [jobOrderQuery.data]);

  // ── Auto-populate from parent record ──
  useEffect(() => {
    const job = jobQuery.data;
    if (!job) return;
    if (jobOrderQuery.isPending || jobOrderQuery.isFetching) return;
    if (jobOrderQuery.data) return;

    if (job.clientId) setClientId(job.clientId);
    if (job.license?.productId) setProductId(job.license.productId);
  }, [jobQuery.data, jobOrderQuery.data, jobOrderQuery.isPending, jobOrderQuery.isFetching]);

  // ── Auto-fill sale price when product changes ──
  useEffect(() => {
    if (!productId) return;
    const product = productsQuery.data?.find((p) => p.id === productId);
    if (product && !jobOrderQuery.data) {
      setSalePrice(Number(product.price));
    }
  }, [productId, productsQuery.data, jobOrderQuery.data]);

  // ── Upsert mutation ──
  const upsert = useMutation({
    mutationFn: async ({ status, doc }: { status: JobOrderStatus; doc?: DocType }) =>
      (
        await api.post<JobOrder>('/job-orders', {
          id: standalone ? (jobOrderQuery.data?.id ?? standaloneId) : undefined,
          jobId: standalone ? undefined : jobId,
          clientId,
          productId: joType === 'SOFTWARE' ? productId : undefined,
          salePrice,
          discount,
          discountType,
          remarks: remarks || undefined,
          status,
          type: joType,
          cameraCount: joType === 'CCTV' && cameraCount > 0 ? cameraCount : undefined,
          cameraRate: joType === 'CCTV' ? cameraRate : undefined,
          laborPct: joType === 'SIGNAGE' ? laborPct : undefined,
          docType: doc ?? docType,
          includeAgreement,
          items: items.map(({ name, description, quantity, unitPrice, inventoryItemId, warrantyTier }) => ({
            name,
            description: description || undefined,
            quantity,
            unitPrice,
            inventoryItemId: inventoryItemId ?? undefined,
            warrantyTier,
          })),
        })
      ).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['job-order', jobId ?? standaloneId] });
      queryClient.invalidateQueries({ queryKey: ['job-orders'] });
      // First save of a standalone order: move onto its permanent URL.
      if (standalone && !standaloneId) {
        queryClient.setQueryData(['job-order', data.id], data);
        navigate(`/job-orders/order/${data.id}`, { replace: true });
      }
    },
  });

  const unpin = useMutation({
    mutationFn: async () => api.delete(`/job-orders/${jo?.id}/pin-agreement`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['job-order', jobId ?? standaloneId] }),
  });

  // ── Convert standalone quotation → job order ──
  const [showConvert, setShowConvert] = useState(false);
  const [convertDate, setConvertDate] = useState('');
  const [convertInstallerId, setConvertInstallerId] = useState('');
  const installersQuery = useQuery({
    queryKey: ['users', 'INSTALLER'],
    queryFn: async () => (await api.get<AuthenticatedUser[]>('/users', { params: { role: 'INSTALLER' } })).data,
    enabled: showConvert,
  });
  const convert = useMutation({
    mutationFn: async () =>
      (
        await api.post<JobOrder>(`/job-orders/${jobOrderQuery.data!.id}/convert`, {
          scheduleDate: convertDate,
          installerId: convertInstallerId || undefined,
        })
      ).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['job-orders'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setShowConvert(false);
      navigate(`/job-orders/${data.jobId}`, { replace: true });
    },
  });

  const createClient = useMutation({
    mutationFn: async (details: typeof newClientForm) => {
      const code = generateClientCode();
      return (await api.post<Client>('/clients', {
        ...details,
        clientCode: code,
        ownerName: details.ownerName || 'Admin staff',
        contactNo: details.contactNo || '—',
        clientType: 'SOFTWARE',
      })).data;
    },
    onSuccess: (newClient) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setClientId(newClient.id);
      setShowNewClient(false);
      setNewClientForm({
        businessName: '',
        ownerName: '',
        contactNo: '',
        email: '',
        address: '',
      });
    },
  });

  // ── Item helpers ──
  const [scanCode, setScanCode] = useState('');
  const [scanError, setScanError] = useState('');

  const addInventoryItem = (item: InventoryItem) => {
    setItems((prev) => [
      ...prev,
      {
        _key: newKey(),
        inventoryItemId: item.id,
        name: item.name,
        description: item.description ?? '',
        quantity: 1,
        unitPrice: Number(item.unitPrice),
        warrantyTier: 'ACCESSORY',
      },
    ]);
  };

  const handleScan = async (e: FormEvent) => {
    e.preventDefault();
    const code = scanCode.trim();
    if (!code) return;
    setScanError('');
    try {
      const item = (await api.get<InventoryItem>(`/inventory/barcode/${encodeURIComponent(code)}`)).data;
      addInventoryItem(item);
      setScanCode('');
    } catch {
      setScanError(`No inventory item with barcode "${code}".`);
    }
  };

  const addCustom = (e: FormEvent) => {
    e.preventDefault();
    setItems((prev) => [...prev, { _key: newKey(), ...customForm }]);
    setCustomForm({ name: '', description: '', quantity: 1, unitPrice: 0, warrantyTier: 'ACCESSORY' });
    setShowCustomForm(false);
  };

  const updateItem = (key: string, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((i) => (i._key === key ? { ...i, ...patch } : i)));
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((i) => i._key !== key));
  };

  const { materialsTotal, subtotal, discountAmt, grandTotal } = computeTotals(salePrice, discount, discountType, items);

  const product = productsQuery.data?.find((p) => p.id === productId);
  const client = clientsQuery.data?.find((c) => c.id === clientId);
  const jo = jobOrderQuery.data;
  const parent = jobQuery.data;

  const canSave = !!clientId && (joType === 'SOFTWARE' ? !!productId : true);

  // The search box doubles as a filter: an unmatched barcode still submits on
  // Enter, so filtering the buttons costs nothing.
  const itemQuery = scanCode.trim().toLowerCase();
  const quickAddItems = (inventoryQuery.data ?? []).filter((i) =>
    itemQuery ? i.name.toLowerCase().includes(itemQuery) : true,
  );

  // A printed order reproduces the version it was pinned to; an unprinted one
  // follows the current template.
  const agreementSections =
    jo?.agreementVersion?.sections ?? agreementTemplateQuery.data?.sections ?? [];

  // Payments require a saved order; fall back to step 2 if the order vanishes.
  const effectiveStep = step === 3 && !jo?.id ? 2 : step;

  const laborIncentive =
    joType === 'CCTV' ? cameraCount * cameraRate
    : joType === 'SIGNAGE' ? (salePrice * laborPct) / 100
    : 0;
  const installerName = parent?.installer?.fullName;

  /**
   * Locks the agreement text to the current template the first time it reaches
   * paper. A failure here must not stop the print — the pin retries next time.
   */
  const pinAgreement = async (id: string | undefined) => {
    if (!includeAgreement || !id) return;
    try {
      await api.post(`/job-orders/${id}/pin-agreement`);
      queryClient.invalidateQueries({ queryKey: ['job-order', jobId ?? standaloneId] });
    } catch {
      // Ignored on purpose — see the doc comment.
    }
  };

  const handlePrint = async () => {
    if (!canSave) return;
    // Save first so the print reflects the latest state
    const saved = await upsert.mutateAsync({ status: jo?.status ?? 'DRAFT' });
    await pinAgreement(saved.id);
    window.print();
  };

  const [isDownloading, setIsDownloading] = useState(false);
  const [searchParams] = useSearchParams();
  const docParam = searchParams.get('doc');
  // New JOs inherit the document type from the list page's active tab.
  // Standalone orders default to Quotation — their usual reason to exist.
  const [docType, setDocType] = useState<DocType>(
    DOC_TYPES.some((d) => d.value === docParam) ? (docParam as DocType) : standalone ? 'QUOTATION' : 'JOB_ORDER',
  );
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [moveTarget, setMoveTarget] = useState<DocType>('JOB_ORDER');

  const handleDownload = async () => {
    const element = document.getElementById('job-order-print');
    if (!element) return;
    if (canSave) {
      const saved = await upsert.mutateAsync({ status: jo?.status ?? 'DRAFT' });
      await pinAgreement(saved.id);
    }
    setIsDownloading(true);
    const filename = `${DOC_META[docType].filePrefix}-${jo?.id.slice(0, 8).toUpperCase() ?? 'NEW'}.pdf`;
    element.style.display = 'block';
    try {
      await inlineImages(element);
      // Assigned to a variable rather than inlined so `pagebreak` (supported by
      // html2pdf.js at runtime, but missing from its shipped .d.ts) type-checks
      // structurally instead of tripping the object-literal excess-property check.
      const pdfOptions = {
        margin: [10, 10] as [number, number],
        filename,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
        pagebreak: { mode: ['css', 'legacy'] },
      };
      await html2pdf().set(pdfOptions).from(element).save();
    } finally {
      element.style.display = 'none';
      setIsDownloading(false);
    }
  };

  // Wait for BOTH critical queries before showing the form
  if (jobOrderQuery.isLoading || jobQuery.isLoading) {
    return <p style={{ padding: '2rem', color: 'var(--text)' }}>Loading job order…</p>;
  }

  if (jobOrderQuery.isError) {
    return (
      <div style={{ padding: '2rem' }}>
        <button type="button" className="btn btn-secondary" style={{ marginBottom: '1rem', fontSize: '0.8rem' }} onClick={() => navigate('/job-orders/software')}>
          ← Back to Project JO
        </button>
        <div className="card" style={{ borderColor: 'var(--danger)', maxWidth: 480 }}>
          <p style={{ color: 'var(--danger)', margin: '0 0 0.5rem' }}>
            <strong>Could not load job order.</strong>
          </p>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.85rem' }}>
            The backend may not be running or the job-orders API is not yet available.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: '1rem' }}
            onClick={() => { jobOrderQuery.refetch(); jobQuery.refetch(); }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (jobQuery.isError) {
    return (
      <div style={{ padding: '2rem' }}>
        <button type="button" className="btn btn-secondary" style={{ marginBottom: '1rem', fontSize: '0.8rem' }} onClick={() => navigate('/job-orders/software')}>
          ← Back to Project JO
        </button>
        <div className="card" style={{ borderColor: 'var(--danger)', maxWidth: 480 }}>
          <p style={{ color: 'var(--danger)', margin: '0 0 0.5rem' }}>
            <strong>Parent job not found.</strong>
          </p>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.85rem' }}>
            The job ID in the URL doesn't match any record.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Print-only template ── */}
      <div id="job-order-print" style={{ display: 'none' }}>
        <PrintTemplate
          docType={docType}
          jobId={jobId ?? jo?.id ?? ''}
          joNumber={jo?.id.slice(0, 8).toUpperCase() ?? 'NEW'}
          client={client}
          product={product}
          salePrice={salePrice}
          subtotal={subtotal}
          discountAmt={discountAmt}
          materialsTotal={materialsTotal}
          grandTotal={grandTotal}
          items={items}
          remarks={remarks}
          status={jo?.status ?? 'DRAFT'}
          createdAt={jo?.createdAt}
          companyName={companyProfileQuery.data?.businessName}
          companyLogoUrl={logoDataQuery.data ?? (companyProfileQuery.data?.logoUrl ? fileUrl(companyProfileQuery.data.logoUrl) : undefined)}
          companyAddress={companyProfileQuery.data?.address ?? undefined}
          companyPhone={companyProfileQuery.data?.phone ?? undefined}
          companyEmail={companyProfileQuery.data?.email ?? undefined}
          companyWebsite={companyProfileQuery.data?.website ?? undefined}
          companyTin={companyProfileQuery.data?.tin ?? undefined}
        />
        {includeAgreement && agreementSections.length > 0 && (
          <ServiceAgreement
            sections={agreementSections}
            values={{
              date: jo?.createdAt,
              clientName: client?.businessName,
              clientAddress: client?.address,
              clientOwner: client?.ownerName,
              companyName: companyProfileQuery.data?.businessName,
              companyAddress: companyProfileQuery.data?.address,
              items: items.map((i) => ({
                name: i.name,
                quantity: i.quantity,
                warrantyTier: i.warrantyTier,
              })),
            }}
          />
        )}
      </div>

      {/* ── Screen layout ───────────────────────────────────────────────────── */}
      <div>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}
              onClick={() => navigate('/job-orders/software')}
            >
              ← Back to Project JO
            </button>
            <h1 style={{ margin: 0 }}>Project Job Order</h1>
            <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {jo ? `JO-${jo.id.slice(0, 8).toUpperCase()} · ${jo.status}` : 'New job order'}
              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.55rem', borderRadius: 999, background: 'var(--accent-light)', color: 'var(--accent)' }}>
                {DOC_META[docType].label}
              </span>
              <button
                type="button"
                onClick={() => { setMoveTarget(docType); setShowMoveDialog(true); }}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.78rem', padding: 0, textDecoration: 'underline' }}
              >
                Change
              </button>
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {standalone && jo && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ borderColor: 'var(--success)', color: 'var(--success)' }}
                onClick={() => { setConvertDate(''); setConvertInstallerId(''); setShowConvert(true); }}
              >
                Convert to Job Order
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!canSave || upsert.isPending}
              onClick={() => upsert.mutate({ status: jo?.status ?? 'DRAFT' })}
            >
              {upsert.isPending ? 'Saving…' : 'Save Draft'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canSave || upsert.isPending}
              onClick={() => upsert.mutate({ status: 'FINALIZED' })}
            >
              Finalize
            </button>
            <label
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}
              title="Appends the Service Level Agreement pages to the printed document"
            >
              <input
                type="checkbox"
                checked={includeAgreement}
                onChange={(e) => setIncludeAgreement(e.target.checked)}
              />
              Include Service Agreement
              {includeAgreement && items.length === 0 && (
                <span style={{ color: 'var(--danger)' }}>— no materials, warranty lists will be empty</span>
              )}
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!canSave}
              onClick={handlePrint}
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              Print
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!canSave || isDownloading}
              onClick={handleDownload}
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              {isDownloading ? 'Downloading…' : 'Download PDF'}
            </button>
          </div>
        </div>

        {jo?.agreementVersion && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>
              Agreement locked to v{jo.agreementVersion.versionNo} ·{' '}
              {new Date(jo.agreementVersion.createdAt).toLocaleDateString()}
            </span>
            {role === 'SUPER_ADMIN' && (
              <button
                type="button"
                onClick={() => unpin.mutate()}
                disabled={unpin.isPending}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}
              >
                {unpin.isPending ? 'Unlocking…' : 'Unlock'}
              </button>
            )}
          </div>
        )}

        {/* Parent info banner */}
        {parent && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', gap: '2rem', fontSize: '0.85rem', flexWrap: 'wrap' }}>
            <span><span style={{ color: 'var(--text-muted)' }}>Job:</span> <strong>{parent.id.slice(0, 8).toUpperCase()}</strong></span>
            <span><span style={{ color: 'var(--text-muted)' }}>Client:</span> <strong>{parent.client?.businessName ?? parent.clientId}</strong></span>
            <span><span style={{ color: 'var(--text-muted)' }}>Scheduled:</span> <strong>{new Date(parent.scheduleDate).toLocaleDateString()}</strong></span>
            <span><span style={{ color: 'var(--text-muted)' }}>Status:</span> <strong>{parent.jobStatus?.replace('_', ' ')}</strong></span>
          </div>
        )}

        {upsert.isError && (
          <p className="error-text" style={{ marginBottom: '1rem' }}>
            {(upsert.error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
              'Could not save the job order. Check required fields and try again.'}
          </p>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 340px',
          gap: '1.5rem',
          alignItems: 'start'
        }}>
          {/* ── Left column: wizard ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>
            <StepIndicator step={effectiveStep} onStep={setStep} paymentsEnabled={!!jo?.id} />

            {/* Step 1: Client & Project */}
            {effectiveStep === 1 && (
            <section className="card">
              <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Client & Project</h2>
              <div className="field">
                <label htmlFor="jo-type">Project Type</label>
                <select id="jo-type" value={joType} onChange={(e) => setJoType(e.target.value as JobOrderType)}>
                  <option value="SOFTWARE">Software</option>
                  <option value="CCTV">CCTV Installation</option>
                  <option value="SIGNAGE">Signage Installation</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
                <div className="field">
                  <label>Client</label>
                  <ClientPickerField
                    value={clientId}
                    onChange={setClientId}
                    clients={clientsQuery.data ?? []}
                    onQuickAdd={(name) => createClient.mutate({ businessName: name, ownerName: '', contactNo: '', email: '', address: '' })}
                    onFullDetails={() => setShowNewClient(true)}
                    isAdding={createClient.isPending}
                  />
                </div>
                {joType === 'SOFTWARE' && (
                  <div className="field">
                    <label htmlFor="jo-product">System / Software</label>
                    <select id="jo-product" required value={productId} onChange={(e) => setProductId(e.target.value)}>
                      <option value="">Select product…</option>
                      {productsQuery.data?.map((p) => (
                        <option key={p.id} value={p.id}>{p.productName} v{p.version}</option>
                      ))}
                    </select>
                  </div>
                )}
                {joType === 'CCTV' && (
                  <>
                    <div className="field">
                      <label htmlFor="jo-camera-count">No. of Cameras</label>
                      <input id="jo-camera-count" type="number" min={0} value={cameraCount}
                        onChange={(e) => setCameraCount(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
                    </div>
                    <div className="field">
                      <label htmlFor="jo-camera-rate">Rate per Camera (₱)</label>
                      <input id="jo-camera-rate" type="number" min={0} step="0.01" value={cameraRate}
                        onChange={(e) => setCameraRate(Number(e.target.value) || 0)} />
                    </div>
                  </>
                )}
                {joType === 'SIGNAGE' && (
                  <div className="field">
                    <label htmlFor="jo-labor-pct">Labor %</label>
                    <input id="jo-labor-pct" type="number" min={0} max={100} step="0.01" value={laborPct}
                      onChange={(e) => setLaborPct(Number(e.target.value) || 0)} />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="jo-sale-price">
                    {joType === 'SIGNAGE' ? 'Total Signage Price (₱)' : joType === 'CCTV' ? 'Contract Price (₱)' : 'Sale Price (₱)'}
                  </label>
                  <input
                    id="jo-sale-price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={salePrice}
                    onChange={(e) => setSalePrice(Number(e.target.value))}
                  />
                  {product && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      List price: ₱{Number(product.price).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="field">
                <label htmlFor="jo-remarks">Remarks / Notes</label>
                <textarea
                  id="jo-remarks"
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Delivery instructions, special requests…"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>
                  Next →
                </button>
              </div>
            </section>
            )}

            {/* Step 2: Materials / Package */}
            {effectiveStep === 2 && (
            <section className="card">
              <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Materials / Package</h2>

              {/* Preset quick-add buttons (from Inventory) + barcode scan */}
              <div style={{ marginBottom: '1rem' }}>
                <form onSubmit={handleScan} style={{ marginBottom: '0.75rem' }}>
                  <input
                    value={scanCode}
                    placeholder="Search items, or scan a barcode and press Enter"
                    style={{ width: '100%' }}
                    onChange={(e) => { setScanCode(e.target.value); setScanError(''); }}
                  />
                </form>
                {scanError && <p className="error-text" style={{ marginTop: 0 }}>{scanError}</p>}

                {inventoryQuery.isLoading && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading items…</p>}
                {inventoryQuery.data?.length === 0 && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    No inventory items yet. Add them under Settings → Inventory Management.
                  </p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {quickAddItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                      title={item.description ?? undefined}
                      onClick={() => addInventoryItem(item)}
                    >
                      + {item.name}
                      <span style={{ color: item.lowStockAlert > 0 && item.stockQty <= item.lowStockAlert ? 'var(--danger)' : 'var(--text-muted)', marginLeft: '0.35rem' }}>
                        ({item.stockQty})
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Items table */}
              {items.length > 0 && (
                <table style={{ marginBottom: '0.75rem' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>#</th>
                      <th>Item</th>
                      <th>Description</th>
                      {includeAgreement && <th style={{ width: 130 }}>Warranty</th>}
                      <th style={{ width: 60 }}>Qty</th>
                      <th style={{ width: 120 }}>Price</th>
                      <th style={{ width: 100 }}>Total</th>
                      <th style={{ width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={item._key}>
                        <td style={{ color: 'var(--text-muted)', textAlign: 'center' }}>{index + 1}</td>
                        <td>
                          <input
                            value={item.name}
                            style={{ width: '100%', border: 'none', background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.9rem' }}
                            onChange={(e) => updateItem(item._key, { name: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            value={item.description}
                            style={{ width: '100%', border: 'none', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: '0.85rem' }}
                            onChange={(e) => updateItem(item._key, { description: e.target.value })}
                          />
                        </td>
                        {includeAgreement && (
                          <td>
                            <select
                              value={item.warrantyTier}
                              style={{ width: '100%', border: 'none', background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.85rem' }}
                              onChange={(e) => updateItem(item._key, { warrantyTier: e.target.value as WarrantyTier })}
                            >
                              <option value="MAIN_SET">Main set</option>
                              <option value="ACCESSORY">Accessory</option>
                              <option value="NONE">Not covered</option>
                            </select>
                          </td>
                        )}
                        <td>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            style={{ width: '100%', border: 'none', background: 'transparent', color: 'var(--text)', textAlign: 'center', fontFamily: 'inherit', fontSize: '0.9rem' }}
                            onChange={(e) => updateItem(item._key, { quantity: Number(e.target.value) || 1 })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.unitPrice}
                            style={{ width: '100%', border: 'none', background: 'transparent', color: 'var(--text)', textAlign: 'right', fontFamily: 'inherit', fontSize: '0.9rem' }}
                            onChange={(e) => updateItem(item._key, { unitPrice: Number(e.target.value) })}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          ₱{(item.quantity * item.unitPrice).toLocaleString()}
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => removeItem(item._key)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '1rem', padding: '0.2rem' }}
                            title="Remove"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {!showCustomForm && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}
                  onClick={() => setShowCustomForm(true)}
                >
                  + Add custom item
                </button>
              )}

              {showCustomForm && (
                <form
                  onSubmit={addCustom}
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    background: 'var(--surface-secondary)',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
                    <div className="field">
                      <label htmlFor="custom-item-name">Item name</label>
                      <input
                        id="custom-item-name"
                        required
                        value={customForm.name}
                        onChange={(e) => setCustomForm((f) => ({ ...f, name: e.target.value }))}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="custom-item-description">Description</label>
                      <input
                        id="custom-item-description"
                        value={customForm.description}
                        onChange={(e) => setCustomForm((f) => ({ ...f, description: e.target.value }))}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="custom-item-quantity">Qty</label>
                      <input
                        id="custom-item-quantity"
                        type="number"
                        min={1}
                        value={customForm.quantity}
                        onChange={(e) => setCustomForm((f) => ({ ...f, quantity: Number(e.target.value) || 1 }))}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="custom-item-unit-price">Unit Price (₱)</label>
                      <input
                        id="custom-item-unit-price"
                        type="number"
                        min={0}
                        step="0.01"
                        value={customForm.unitPrice}
                        onChange={(e) => setCustomForm((f) => ({ ...f, unitPrice: Number(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
                      Add item
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.85rem' }}
                      onClick={() => setShowCustomForm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
                  ← Back
                </button>
                {jo?.id ? (
                  <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>
                    Next →
                  </button>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Save the job order to record payments.
                  </span>
                )}
              </div>
            </section>
            )}

            {/* Step 3: Payments */}
            {effectiveStep === 3 && jo?.id && (
              <>
                <JobOrderPayments jobOrderId={jo.id} canVoid={role === 'SUPER_ADMIN' || role === 'ADMIN_STAFF'} />
                <div>
                  <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>
                    ← Back
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ── Right column: Summary ── */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="card">
              <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Order Summary</h2>
              <table style={{ fontSize: '0.9rem', tableLayout: 'fixed' }}>
                <tbody>
                  <tr>
                    <td style={{ color: 'var(--text-muted)', paddingLeft: 0, borderBottom: 'none' }}>
                      {joType === 'SOFTWARE' ? 'System / Software' : joType === 'CCTV' ? 'CCTV Contract' : 'Signage'}
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: 0, borderBottom: 'none' }}>₱{salePrice.toLocaleString()}</td>
                  </tr>
                  {items.length > 0 && (
                    <tr>
                      <td style={{ color: 'var(--text-muted)', paddingLeft: 0, borderBottom: 'none' }}>Materials ({items.length} item{items.length > 1 ? 's' : ''})</td>
                      <td style={{ textAlign: 'right', paddingRight: 0, borderBottom: 'none' }}>₱{materialsTotal.toLocaleString()}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ color: 'var(--text-muted)', paddingLeft: 0, borderBottom: 'none' }}>Subtotal</td>
                    <td style={{ textAlign: 'right', paddingRight: 0, borderBottom: 'none' }}>₱{subtotal.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td colSpan={2} style={{ paddingLeft: 0, paddingRight: 0, borderBottom: 'none' }}>
                      <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                        <label htmlFor="jo-discount" style={{ color: 'var(--success)', flexShrink: 0 }}>
                          Discount
                        </label>
                        <input
                          id="jo-discount"
                          type="number"
                          min={0}
                          step="0.01"
                          style={{ flex: 1, minWidth: 0, width: 'auto', textAlign: 'right', padding: '0.45rem 0.6rem' }}
                          value={discount}
                          onChange={(e) => setDiscount(Number(e.target.value))}
                        />
                        <select
                          value={discountType}
                          style={{ width: 68, flexShrink: 0, padding: '0.45rem 0.6rem' }}
                          onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                        >
                          <option value="FIXED">₱</option>
                          <option value="PERCENTAGE">%</option>
                        </select>
                      </div>
                      {discount > 0 && (
                        <div style={{ textAlign: 'right', color: 'var(--success)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                          −₱{discountAmt.toLocaleString()}{discountType === 'PERCENTAGE' ? ` (${discount}%)` : ''}
                        </div>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={2} style={{ borderBottom: '2px solid var(--border)', padding: 0 }} />
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700, paddingLeft: 0 }}>Grand Total</td>
                    <td style={{ fontWeight: 700, fontSize: '1.2rem', textAlign: 'right', paddingRight: 0, color: 'var(--accent)' }}>
                      ₱{grandTotal.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {joType !== 'SOFTWARE' && (
              <div className="card">
                <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Installer Labor</h2>
                <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--accent)' }}>
                  ₱{laborIncentive.toLocaleString()}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {joType === 'CCTV'
                    ? `${cameraCount} camera${cameraCount === 1 ? '' : 's'} × ₱${cameraRate.toLocaleString()}`
                    : `${laborPct}% of ₱${salePrice.toLocaleString()}`}
                </div>
                <div style={{ fontSize: '0.8rem', marginTop: '0.6rem' }}>
                  {installerName ? (
                    <>Installer: <strong>{installerName}</strong></>
                  ) : (
                    <span style={{ color: 'var(--warning)' }}>
                      ⚠ No installer assigned to this job — finalize will be blocked.
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 0 }}>
                  Internal cost — not shown on the client invoice. A pending earning is created for the installer when this JO is finalized.
                </p>
              </div>
            )}

            {jo && (
              <div className="card" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <div><strong>Status:</strong> {jo.status}</div>
                <div><strong>Created:</strong> {new Date(jo.createdAt).toLocaleString()}</div>
                <div><strong>Updated:</strong> {new Date(jo.updatedAt).toLocaleString()}</div>
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* ── Change Document Type Dialog ── */}
      <Dialog
        isOpen={showMoveDialog}
        onClose={() => setShowMoveDialog(false)}
        title="Change Document Type"
        maxWidth={380}
      >
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 0 }}>
          Moves this record to the selected tab on the Project JO list and sets the print letterhead.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {DOC_TYPES.map((d) => (
            <label key={d.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.65rem', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: moveTarget === d.value ? 'var(--accent-light)' : 'transparent' }}>
              <input
                type="radio"
                name="move-doc-type"
                checked={moveTarget === d.value}
                onChange={() => setMoveTarget(d.value)}
              />
              <span style={{ fontSize: '0.9rem', fontWeight: moveTarget === d.value ? 600 : 400 }}>{d.label}</span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1 }}
            disabled={upsert.isPending}
            onClick={() => {
              setDocType(moveTarget);
              setShowMoveDialog(false);
              // Persist immediately for saved orders; new orders persist on first save.
              if (jo && canSave) upsert.mutate({ status: jo.status, doc: moveTarget });
            }}
          >
            {upsert.isPending ? 'Saving…' : 'Apply'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setShowMoveDialog(false)}>
            Cancel
          </button>
        </div>
      </Dialog>

      {/* ── Convert to Job Order Dialog ── */}
      <Dialog
        isOpen={showConvert}
        onClose={() => setShowConvert(false)}
        title="Convert to Job Order"
        maxWidth={420}
      >
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 0 }}>
          Creates the installation job for <strong>{client?.businessName ?? 'this client'}</strong> and
          moves this record to the Job Order tab. Pricing and materials carry over as-is.
        </p>
        <div className="field">
          <label htmlFor="convert-date">Schedule date</label>
          <input
            id="convert-date"
            type="date"
            required
            value={convertDate}
            onChange={(e) => setConvertDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="convert-installer">Installer (optional)</label>
          <select
            id="convert-installer"
            value={convertInstallerId}
            onChange={(e) => setConvertInstallerId(e.target.value)}
          >
            <option value="">Assign later</option>
            {(installersQuery.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>{u.fullName}</option>
            ))}
          </select>
        </div>
        {convert.isError && (
          <p className="error-text">
            {(convert.error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
              'Could not convert this order. Try again.'}
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1 }}
            disabled={!convertDate || convert.isPending}
            onClick={() => convert.mutate()}
          >
            {convert.isPending ? 'Converting…' : 'Create job & convert'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setShowConvert(false)}>
            Cancel
          </button>
        </div>
      </Dialog>

      {/* ── New Client Dialog ── */}
      <Dialog
        isOpen={showNewClient}
        onClose={() => setShowNewClient(false)}
        title="Quick Add Client"
        maxWidth={480}
      >
        <form onSubmit={(e) => { e.preventDefault(); createClient.mutate(newClientForm); }}>
          <div className="field">
            <label htmlFor="nc-businessName">Business name</label>
            <input
              id="nc-businessName"
              required
              value={newClientForm.businessName}
              onChange={(e) => setNewClientForm({ ...newClientForm, businessName: e.target.value })}
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="nc-ownerName">Owner name</label>
            <input
              id="nc-ownerName"
              value={newClientForm.ownerName}
              onChange={(e) => setNewClientForm({ ...newClientForm, ownerName: e.target.value })}
              placeholder="Admin staff"
            />
          </div>
          <div className="field">
            <label htmlFor="nc-contactNo">Contact no.</label>
            <input
              id="nc-contactNo"
              value={newClientForm.contactNo}
              onChange={(e) => setNewClientForm({ ...newClientForm, contactNo: e.target.value })}
              placeholder="—"
            />
          </div>
          <div className="field">
            <label htmlFor="nc-email">Email (optional)</label>
            <input
              id="nc-email"
              type="email"
              value={newClientForm.email}
              onChange={(e) => setNewClientForm({ ...newClientForm, email: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="nc-address">Address (optional)</label>
            <input
              id="nc-address"
              value={newClientForm.address}
              onChange={(e) => setNewClientForm({ ...newClientForm, address: e.target.value })}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createClient.isPending}
              style={{ flex: 1 }}
            >
              {createClient.isPending ? 'Saving…' : 'Save client'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowNewClient(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

