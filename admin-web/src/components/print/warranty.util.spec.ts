import { describe, expect, it } from 'vitest';
import { derivePackageLabel, groupByTier, itemLabel, type WarrantyItem } from './warranty.util';

const item = (name: string, warrantyTier: WarrantyItem['warrantyTier'], quantity = 1): WarrantyItem => ({
  name,
  quantity,
  warrantyTier,
});

describe('groupByTier', () => {
  it('splits items into the main set and accessory groups', () => {
    const groups = groupByTier([
      item('System Unit', 'MAIN_SET'),
      item('Barcode Scanner', 'ACCESSORY'),
      item('Monitor', 'MAIN_SET'),
    ]);

    expect(groups.mainSet.map((i) => i.name)).toEqual(['System Unit', 'Monitor']);
    expect(groups.accessory.map((i) => i.name)).toEqual(['Barcode Scanner']);
  });

  it('excludes NONE-tier items from both groups', () => {
    const groups = groupByTier([item('Thermal Paper', 'NONE'), item('Monitor', 'MAIN_SET')]);

    expect(groups.mainSet.map((i) => i.name)).toEqual(['Monitor']);
    expect(groups.accessory).toEqual([]);
  });

  it('returns empty groups for an empty item list', () => {
    expect(groupByTier([])).toEqual({ mainSet: [], accessory: [] });
  });
});

describe('itemLabel', () => {
  it('returns the bare name at quantity one', () => {
    expect(itemLabel(item('Monitor', 'MAIN_SET'))).toBe('Monitor');
  });

  it('appends the count above one', () => {
    expect(itemLabel(item('Monitor', 'MAIN_SET', 3))).toBe('Monitor (3)');
  });
});

describe('derivePackageLabel', () => {
  it('spells out a single main set', () => {
    expect(derivePackageLabel([item('System Unit', 'MAIN_SET')])).toBe('ONE (1) POS Complete Set');
  });

  it('appends "with accessories" when an accessory item is present', () => {
    expect(derivePackageLabel([item('System Unit', 'MAIN_SET'), item('Cash Drawer', 'ACCESSORY')])).toBe(
      'ONE (1) POS Complete Set with accessories',
    );
  });

  it('sums quantity across main set rows', () => {
    expect(derivePackageLabel([item('System Unit', 'MAIN_SET', 2), item('Monitor', 'MAIN_SET', 1)])).toBe(
      'THREE (3) POS Complete Set',
    );
  });

  it('falls back to digits above ten', () => {
    expect(derivePackageLabel([item('System Unit', 'MAIN_SET', 11)])).toBe('11 (11) POS Complete Set');
  });

  it('drops the count when there is no main set item', () => {
    expect(derivePackageLabel([item('Cash Drawer', 'ACCESSORY')])).toBe('POS Package with accessories');
  });

  it('returns the bare package label for an empty item list', () => {
    expect(derivePackageLabel([])).toBe('POS Package');
  });

  it('ignores NONE-tier items when counting', () => {
    expect(derivePackageLabel([item('System Unit', 'MAIN_SET'), item('Thermal Paper', 'NONE')])).toBe(
      'ONE (1) POS Complete Set',
    );
  });
});
