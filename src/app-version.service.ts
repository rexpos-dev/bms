import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';

/** Where the landing page and the mobile app both expect the installer. */
const APK_URL = '/downloads/beulah-field.apk';

const VERSION_PATTERN = /^\d+(\.\d+)*$/;

export interface AppVersionManifest {
  version: string;
  versionCode: number;
  notes?: string;
}

export interface AppVersionResponse {
  latest: string | null;
  versionCode: number | null;
  notes: string | null;
  apkUrl: string;
  updateAvailable: boolean;
}

/**
 * Compare dotted-numeric versions segment by segment. Returns 1 when `a` is
 * newer, -1 when older, 0 when equal. Missing trailing segments count as zero,
 * so '1.2' and '1.2.0' are the same version.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * Serves the "is there a newer APK?" question for the mobile app. The manifest
 * is written next to the APK by scripts/publish-apk.mjs; a missing or invalid
 * file simply means "no update known" — this must never throw, because the
 * mobile app calls it on every launch.
 */
@Injectable()
export class AppVersionService {
  protected manifestPath = join(process.cwd(), 'downloads', 'app-version.json');

  async getManifest(): Promise<AppVersionManifest | null> {
    try {
      const raw = await readFile(this.manifestPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AppVersionManifest>;
      if (
        typeof parsed.version !== 'string' ||
        !VERSION_PATTERN.test(parsed.version)
      ) {
        return null;
      }
      return {
        version: parsed.version,
        versionCode:
          typeof parsed.versionCode === 'number' ? parsed.versionCode : 0,
        notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
      };
    } catch {
      return null;
    }
  }

  async check(installed?: string): Promise<AppVersionResponse> {
    const manifest = await this.getManifest();
    return {
      latest: manifest?.version ?? null,
      versionCode: manifest?.versionCode ?? null,
      notes: manifest?.notes ?? null,
      apkUrl: APK_URL,
      updateAvailable:
        !!manifest &&
        !!installed &&
        compareVersions(manifest.version, installed) > 0,
    };
  }
}
