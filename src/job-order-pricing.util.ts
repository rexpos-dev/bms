export type DiscountTypeLike = 'FIXED' | 'PERCENTAGE';

/**
 * Mirrors admin-web's computeTotals() in JobOrderPage.tsx exactly, so a
 * client's payment balance always matches the total on their printed invoice.
 */
export function computeGrandTotal(
  salePrice: number,
  discount: number,
  discountType: DiscountTypeLike,
  items: { quantity: number; unitPrice: number }[],
): number {
  const materialsTotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discountAmt = discountType === 'PERCENTAGE' ? (salePrice * discount) / 100 : discount;
  const softwareTotal = Math.max(0, salePrice - discountAmt);
  return softwareTotal + materialsTotal;
}

export function computeBalance(
  grandTotal: number,
  payments: { amount: number; voidedAt: Date | null }[],
): number {
  const totalPaid = payments.filter((p) => !p.voidedAt).reduce((sum, p) => sum + p.amount, 0);
  return grandTotal - totalPaid;
}

/**
 * Installer labor incentive per project type. Internal cost only — never part
 * of the client invoice / grand total.
 */
export function computeLaborIncentive(
  type: 'SOFTWARE' | 'CCTV' | 'SIGNAGE',
  salePrice: number,
  cameraCount: number | null | undefined,
  cameraRate: number | null | undefined,
  laborPct: number | null | undefined,
): number {
  if (type === 'CCTV') return (cameraCount ?? 0) * (cameraRate ?? 0);
  if (type === 'SIGNAGE') return (salePrice * (laborPct ?? 20)) / 100;
  return 0;
}
