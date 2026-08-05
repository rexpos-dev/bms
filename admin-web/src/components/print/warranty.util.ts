import type { WarrantyTier } from '../../lib/types';

export interface WarrantyItem {
  name: string;
  quantity: number;
  warrantyTier: WarrantyTier;
}

export interface WarrantyGroups {
  mainSet: WarrantyItem[];
  accessory: WarrantyItem[];
}

/** Splits line items by warranty tier. NONE-tier items appear in neither group. */
export function groupByTier(items: WarrantyItem[]): WarrantyGroups {
  return {
    mainSet: items.filter((i) => i.warrantyTier === 'MAIN_SET'),
    accessory: items.filter((i) => i.warrantyTier === 'ACCESSORY'),
  };
}

/** One line of a printed warranty list, e.g. "Monitor" or "Monitor (3)". */
export function itemLabel(item: WarrantyItem): string {
  return item.quantity > 1 ? `${item.name} (${item.quantity})` : item.name;
}

// Index 0 is unused — counts start at one.
const NUMBER_WORDS = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];

function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/**
 * Builds the package phrase used in the WHEREAS clause and Section I(a),
 * e.g. "ONE (1) POS Complete Set with accessories".
 */
export function derivePackageLabel(items: WarrantyItem[]): string {
  const { mainSet, accessory } = groupByTier(items);
  const count = mainSet.reduce((sum, i) => sum + i.quantity, 0);
  const suffix = accessory.length > 0 ? ' with accessories' : '';

  if (count === 0) return `POS Package${suffix}`;
  return `${numberWord(count)} (${count}) POS Complete Set${suffix}`;
}
