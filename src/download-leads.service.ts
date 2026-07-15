import { BadRequestException, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';

interface PendingCode {
  code: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
}

export interface FinaraLead {
  id: number;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  message: string | null;
  source: string | null;
  status: 'NEW' | 'CONTACTED' | 'CLOSED';
  createdAt: string;
}

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

/**
 * Email OTP for the landing-page lead form, delivered through Resend.
 * Codes are held in memory — they are short-lived, and losing them on a
 * server restart only means the visitor requests a fresh one.
 */
@Injectable()
export class DownloadLeadsService {
  private readonly pending = new Map<string, PendingCode>();

  /**
   * Returns true when a code was emailed. Returns false when delivery is not
   * possible (no API key, or the provider rejected the send — e.g. Resend
   * sandbox can only reach the account owner) so the caller can fall back to
   * accepting the lead with an unverified email.
   */
  async sendCode(rawEmail: string): Promise<boolean> {
    const email = rawEmail.trim().toLowerCase();
    const now = Date.now();
    const existing = this.pending.get(email);
    if (existing && now - existing.lastSentAt < RESEND_COOLDOWN_MS) {
      throw new BadRequestException('Please wait a minute before requesting another code.');
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return false;
    }

    const code = String(randomInt(100000, 1000000));
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? 'Orbit Console <onboarding@resend.dev>',
        to: [email],
        subject: `${code} is your Orbit Console verification code`,
        html: [
          '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px">',
          '<h2 style="margin:0 0 8px">Orbit Console</h2>',
          '<p style="color:#555">Use this code to verify your email on the download form:</p>',
          `<div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 0">${code}</div>`,
          '<p style="color:#888;font-size:13px">The code expires in 10 minutes. If you did not request it, you can ignore this email.</p>',
          '</div>',
        ].join(''),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`Resend send failed (${res.status}): ${detail}`);
      return false;
    }

    this.pending.set(email, { code, expiresAt: now + CODE_TTL_MS, attempts: 0, lastSentAt: now });
    return true;
  }

  /** Throws unless `code` matches the one sent to `email`; consumes it on success. */
  verifyAndConsume(rawEmail: string, code: string): void {
    const email = rawEmail.trim().toLowerCase();
    const entry = this.pending.get(email);
    if (!entry || Date.now() > entry.expiresAt) {
      this.pending.delete(email);
      throw new BadRequestException('Verification code expired — request a new one.');
    }
    if (entry.attempts >= MAX_ATTEMPTS) {
      this.pending.delete(email);
      throw new BadRequestException('Too many attempts — request a new code.');
    }
    entry.attempts += 1;
    if (entry.code !== code.trim()) {
      throw new BadRequestException('Incorrect verification code.');
    }
    this.pending.delete(email);
  }

  // ── Finara Leads: external ERP integration ─────────────────────────────────

  /** Live proxy to the Finara ERP leads export — nothing is stored locally. */
  async fetchFinaraLeads(): Promise<FinaraLead[]> {
    const apiKey = process.env.FINARA_API_KEY;
    if (!apiKey) throw new BadRequestException('FINARA_API_KEY is not configured on the server.');

    const base = process.env.FINARA_API_URL ?? 'https://finara.up.railway.app';
    const url = new URL('/api/leads/export', base);

    const res = await fetch(url, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    }).catch(() => {
      throw new BadRequestException('Could not reach the Finara API.');
    });
    if (res.status === 401) throw new BadRequestException('Finara API rejected the key (401 Unauthorized).');
    if (!res.ok) throw new BadRequestException(`Finara API returned HTTP ${res.status}.`);

    // An invalid key could be redirected to an HTML page rather than a JSON
    // error, so guard against a non-JSON body.
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw new BadRequestException('Finara API did not return JSON — the API key may be invalid.');
    }

    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as FinaraLead[]) : [];
  }
}
