import { randomBytes } from 'node:crypto';

// Ambiguity-free alphabet (no I, O, 0, 1) so keys are easy to read/dictate.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function segment(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Generate a trial license key like `TRIAL-A2B3-C4D5`. */
export function generateTrialKey(): string {
  return `TRIAL-${segment(4)}-${segment(4)}`;
}
