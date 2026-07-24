import { generateTrialKey } from './trial-key.util';

describe('generateTrialKey', () => {
  it('matches the TRIAL-XXXX-XXXX format', () => {
    expect(generateTrialKey()).toMatch(/^TRIAL-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it('produces different keys across many calls', () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateTrialKey()));
    expect(keys.size).toBeGreaterThan(1);
  });
});
