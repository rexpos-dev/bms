import type { DocumentType } from '../../lib/types';

export const DOC_TYPES: { value: DocumentType; label: string; subtitle: string; filePrefix: string }[] = [
  { value: 'JOB_ORDER', label: 'Job Order', subtitle: 'Job Order / Delivery Receipt', filePrefix: 'JO' },
  { value: 'QUOTATION', label: 'Quotation', subtitle: 'Quotation / Price Estimate', filePrefix: 'QUO' },
  { value: 'INVOICE', label: 'Sales Invoice', subtitle: 'Sales Invoice', filePrefix: 'INV' },
  { value: 'RECEIPT', label: 'Official Receipt', subtitle: 'Official Receipt', filePrefix: 'OR' },
];

export const DOC_META = Object.fromEntries(DOC_TYPES.map((d) => [d.value, d])) as Record<
  DocumentType,
  (typeof DOC_TYPES)[number]
>;
