import type { License } from './types';

export type Tone = 'normal' | 'muted' | 'danger';

export interface LicenseDatesView {
  installed: string;
  installedTone: Tone;
  expires: string;
  expiresTone: Tone;
  expiresNote: string | null;
  expiresNoteTone: Tone;
}

const DAY_MS = 86_400_000;

/**
 * Display strings for a license's install (= activation) and expiry dates.
 * A trial's clock only starts at activation, so a PENDING trial has no expiry
 * date yet — it shows the rule ("30 days after install") instead of a blank.
 * Mirrors the copy used by admin-web's LicensesPage.
 */
export function licenseDates(license: License): LicenseDatesView {
  const installed = license.activationDate
    ? new Date(license.activationDate).toLocaleDateString()
    : 'Not yet installed';
  const installedTone: Tone = license.activationDate ? 'normal' : 'muted';

  if (license.expirationDate) {
    const daysLeft = Math.ceil((new Date(license.expirationDate).getTime() - Date.now()) / DAY_MS);
    return {
      installed,
      installedTone,
      expires: new Date(license.expirationDate).toLocaleDateString(),
      expiresTone: 'normal',
      expiresNote: daysLeft <= 0 ? 'Expired' : daysLeft === 1 ? '1 day left' : `${daysLeft} days left`,
      expiresNoteTone: daysLeft <= 7 ? 'danger' : 'muted',
    };
  }

  return {
    installed,
    installedTone,
    expires: license.isTrial ? `${license.trialDays ?? 30} days after install` : 'No expiry',
    expiresTone: 'muted',
    expiresNote: null,
    expiresNoteTone: 'muted',
  };
}
