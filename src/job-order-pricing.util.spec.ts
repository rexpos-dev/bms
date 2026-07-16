import { computeGrandTotal, computeBalance, computeLaborIncentive } from './job-order-pricing.util';

describe('computeLaborIncentive', () => {
  it('returns 0 for SOFTWARE regardless of inputs', () => {
    expect(computeLaborIncentive('SOFTWARE', 50000, 8, 500, 20)).toBe(0);
  });

  it('CCTV: cameraCount × cameraRate', () => {
    expect(computeLaborIncentive('CCTV', 120000, 8, 500, null)).toBe(4000);
  });

  it('CCTV: missing count or rate yields 0', () => {
    expect(computeLaborIncentive('CCTV', 120000, null, 500, null)).toBe(0);
    expect(computeLaborIncentive('CCTV', 120000, 8, null, null)).toBe(0);
  });

  it('SIGNAGE: salePrice × laborPct / 100', () => {
    expect(computeLaborIncentive('SIGNAGE', 35000, null, null, 25)).toBe(8750);
  });

  it('SIGNAGE: laborPct defaults to 20 when missing', () => {
    expect(computeLaborIncentive('SIGNAGE', 35000, null, null, null)).toBe(7000);
  });
});

describe('computeGrandTotal', () => {
  it('applies a FIXED discount to the whole order (software + materials)', () => {
    expect(computeGrandTotal(10000, 1000, 'FIXED', [{ quantity: 2, unitPrice: 500 }])).toBe(10000);
  });

  it('applies a PERCENTAGE discount on the subtotal including materials', () => {
    expect(computeGrandTotal(10000, 10, 'PERCENTAGE', [{ quantity: 2, unitPrice: 500 }])).toBe(9900);
  });

  it('applies a PERCENTAGE discount with no materials', () => {
    expect(computeGrandTotal(10000, 10, 'PERCENTAGE', [])).toBe(9000);
  });

  it('treats zero discount as no discount', () => {
    expect(computeGrandTotal(5000, 0, 'FIXED', [])).toBe(5000);
  });

  it('never lets the grand total go negative', () => {
    expect(computeGrandTotal(100, 500, 'FIXED', [{ quantity: 1, unitPrice: 200 }])).toBe(0);
  });

  it('sums multiple line items', () => {
    expect(
      computeGrandTotal(0, 0, 'FIXED', [
        { quantity: 3, unitPrice: 100 },
        { quantity: 1, unitPrice: 50 },
      ]),
    ).toBe(350);
  });
});

describe('computeBalance', () => {
  it('subtracts active payments from the grand total', () => {
    expect(computeBalance(1000, [{ amount: 400, voidedAt: null }])).toBe(600);
  });

  it('excludes voided payments from the sum', () => {
    expect(
      computeBalance(1000, [
        { amount: 400, voidedAt: null },
        { amount: 300, voidedAt: new Date() },
      ]),
    ).toBe(600);
  });

  it('allows a negative balance on overpayment', () => {
    expect(computeBalance(1000, [{ amount: 1500, voidedAt: null }])).toBe(-500);
  });

  it('returns the full grand total when there are no payments', () => {
    expect(computeBalance(750, [])).toBe(750);
  });
});
