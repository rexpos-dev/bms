import type { Client, DocumentType, JobOrderStatus, SoftwareProduct, WarrantyTier } from '../../lib/types';
import { DOC_META } from './doc-types';

export interface LineItem {
  _key: string; // local only
  inventoryItemId?: string | null; // links to InventoryItem (used for stock deduction in Phase 2)
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  warrantyTier: WarrantyTier;
}

// ─── Print template (only visible when printing) ─────────────────────────────

interface PrintTemplateProps {
  docType: DocumentType;
  jobId: string;
  joNumber: string;
  client?: Client;
  product?: SoftwareProduct;
  salePrice: number;
  subtotal: number;
  discountAmt: number;
  materialsTotal: number;
  grandTotal: number;
  items: LineItem[];
  remarks: string;
  status: JobOrderStatus;
  createdAt?: string;
  companyName?: string;
  companyLogoUrl?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyWebsite?: string;
  companyTin?: string;
}

export function PrintTemplate({
  docType, jobId, joNumber, client, product,
  salePrice, subtotal, discountAmt, materialsTotal, grandTotal,
  items, remarks, status, createdAt, companyName, companyLogoUrl,
  companyAddress, companyPhone, companyEmail, companyWebsite, companyTin,
}: PrintTemplateProps) {
  const p = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const meta = DOC_META[docType];
  const isReceipt = docType === 'RECEIPT';
  const totalLabel = isReceipt ? 'AMOUNT PAID' : 'GRAND TOTAL';

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', color: '#000', fontSize: '12pt', lineHeight: 1.5 }}>
      {/* Header — logo + company (left), document meta (right) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16pt', borderBottom: '2px solid #000', paddingBottom: '10pt', marginBottom: '14pt' }}>
        <div style={{ display: 'flex', gap: '12pt', alignItems: 'center' }}>
          {companyLogoUrl && (
            <img
              src={companyLogoUrl}
              alt="Company logo"
              style={{ height: '58pt', width: '58pt', objectFit: 'contain', flexShrink: 0 }}
            />
          )}
          <div style={{ lineHeight: 1.35 }}>
            <div style={{ fontSize: '15pt', fontWeight: 'bold' }}>
              {companyName ?? 'SOFTWARE DEPLOYMENT & LICENSE MANAGEMENT'}
            </div>
            {companyAddress && <div style={{ fontSize: '8.5pt', color: '#333' }}>{companyAddress}</div>}
            {(companyPhone || companyEmail) && (
              <div style={{ fontSize: '8.5pt', color: '#333' }}>
                {[companyPhone && `Tel: ${companyPhone}`, companyEmail].filter(Boolean).join('  •  ')}
              </div>
            )}
            {companyWebsite && <div style={{ fontSize: '8.5pt', color: '#333' }}>{companyWebsite}</div>}
            {companyTin && <div style={{ fontSize: '8.5pt', color: '#333' }}>TIN: {companyTin}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: '150pt', flexShrink: 0 }}>
          <div style={{ fontSize: '13pt', fontWeight: 'bold' }}>{meta.label} — {meta.filePrefix}-{joNumber}</div>
          <div style={{ fontSize: '8.5pt', color: '#555', marginTop: '4pt' }}>Job ID: {jobId.slice(0, 8).toUpperCase()}</div>
          <div style={{ fontSize: '8.5pt', color: '#555' }}>Status: {status}</div>
          <div style={{ fontSize: '8.5pt', color: '#555' }}>Date: {createdAt ? new Date(createdAt).toLocaleDateString() : new Date().toLocaleDateString()}</div>
          <div style={{ fontSize: '8.5pt', color: '#555' }}>Printed: {new Date().toLocaleString()}</div>
        </div>
      </div>

      {/* Client info */}
      <div style={{ border: '1px solid #ccc', borderRadius: '4pt', padding: '6pt 8pt', marginBottom: '8pt', lineHeight: 1.25, fontSize: '10pt' }}>
        <strong>Client Information</strong>
        <div style={{ marginTop: '3pt', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2pt' }}>
          <div><strong>Business Name:</strong> {client?.businessName ?? '—'}</div>
          <div><strong>Client Code:</strong> {client?.clientCode ?? '—'}</div>
          <div><strong>Owner:</strong> {client?.ownerName ?? '—'}</div>
          <div><strong>Contact:</strong> {client?.contactNo ?? '—'}</div>
          {client?.address && <div style={{ gridColumn: '1/-1' }}><strong>Address:</strong> {client.address}</div>}
        </div>
      </div>

      {/* Software Main Item */}
      <div style={{ border: '1px solid #ccc', borderRadius: '4pt', padding: '10pt', marginBottom: '16pt' }}>
        <strong>System / Software</strong>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8pt', fontSize: '11pt' }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              <th style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'left' }}>Item</th>
              <th style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'left' }}>Details</th>
              <th style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'right' }}>Price</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #ccc', padding: '6pt' }}>
                {product?.productName ?? '—'}
              </td>
              <td style={{ border: '1px solid #ccc', padding: '6pt' }}>
                v{product?.version ?? '—'}
              </td>
              <td style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'right', fontWeight: 'bold' }}>{p(salePrice)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Materials */}
      {items.length > 0 && (
        <div style={{ border: '1px solid #ccc', borderRadius: '4pt', padding: '10pt', marginBottom: '16pt' }}>
          <strong>Materials / Hardware Package</strong>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8pt', fontSize: '11pt' }}>
            <thead>
              <tr style={{ background: '#f0f0f0' }}>
                <th style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'left' }}>Item</th>
                <th style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'left' }}>Description</th>
                <th style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'center' }}>Qty</th>
                <th style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'right' }}>Unit Price</th>
                <th style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td style={{ border: '1px solid #ccc', padding: '6pt' }}>{item.name}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6pt', color: '#555' }}>{item.description || '—'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'right' }}>{p(item.unitPrice)}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'right', fontWeight: 'bold' }}>{p(item.quantity * item.unitPrice)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'right', fontWeight: 'bold' }}>Materials Total</td>
                <td style={{ border: '1px solid #ccc', padding: '6pt', textAlign: 'right', fontWeight: 'bold' }}>{p(materialsTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16pt' }}>
        <div style={{ border: '2px solid #000', borderRadius: '4pt', padding: '10pt 20pt', textAlign: 'right', minWidth: '160pt' }}>
          {discountAmt > 0 && (
            <>
              <div style={{ fontSize: '10pt', color: '#555', display: 'flex', justifyContent: 'space-between', gap: '16pt' }}>
                <span>Subtotal</span><span>{p(subtotal)}</span>
              </div>
              <div style={{ fontSize: '10pt', color: '#16a34a', display: 'flex', justifyContent: 'space-between', gap: '16pt', borderBottom: '1px solid #ccc', paddingBottom: '4pt', marginBottom: '4pt' }}>
                <span>Discount</span><span>−{p(discountAmt)}</span>
              </div>
            </>
          )}
          <div style={{ fontSize: '10pt', color: '#555' }}>{totalLabel}</div>
          <div style={{ fontSize: '18pt', fontWeight: 'bold' }}>{p(grandTotal)}</div>
        </div>
      </div>

      {isReceipt && (
        <div style={{ border: '1px solid #ccc', borderRadius: '4pt', padding: '10pt', marginBottom: '16pt', fontSize: '11pt' }}>
          Received from <strong>{client?.businessName ?? 'the client'}</strong> the sum of
          {' '}<strong>{p(grandTotal)}</strong> in full/partial payment for the items listed above.
        </div>
      )}

      {remarks && (
        <div style={{ border: '1px solid #ccc', borderRadius: '4pt', padding: '10pt', marginBottom: '16pt' }}>
          <strong>Remarks / Notes</strong>
          <div style={{ marginTop: '6pt' }}>{remarks}</div>
        </div>
      )}

      {/* Signature block */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40pt', marginTop: '48pt' }}>
        <div style={{ borderTop: '1px solid #000', paddingTop: '6pt', textAlign: 'center', fontSize: '10pt' }}>
          {isReceipt ? 'Received payment by / Cashier' : 'Prepared by / Admin Staff'}
        </div>
        <div style={{ borderTop: '1px solid #000', paddingTop: '6pt', textAlign: 'center', fontSize: '10pt' }}>
          {docType === 'QUOTATION' ? 'Conforme / Client Representative' : 'Received by / Client Representative'}
        </div>
      </div>
    </div>
  );
}
