import { computeGrandTotal, computeBalance } from './job-order-pricing.util';

describe('computeGrandTotal', () => {
  it('applies a FIXED discount and adds line items', () => {
    expect(computeGrandTotal(10000, 1000, 'FIXED', [{ quantity: 2, unitPrice: 500 }])).toBe(10000);
  });

  it('applies a PERCENTAGE discount', () => {
    expect(computeGrandTotal(10000, 10, 'PERCENTAGE', [])).toBe(9000);
  });

  it('treats zero discount as no discount', () => {
    expect(computeGrandTotal(5000, 0, 'FIXED', [])).toBe(5000);
  });

  it('never lets the discounted software total go negative', () => {
    expect(computeGrandTotal(100, 500, 'FIXED', [])).toBe(0);
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
