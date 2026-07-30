import Constants from 'expo-constants';
import { api, fileUrl } from './api';

export interface UpdateInfo {
  latest: string;
  notes: string | null;
  /** Absolute URL of the APK on the active backend. */
  apkUrl: string;
}

interface AppVersionResponse {
  latest: string | null;
  versionCode: number | null;
  notes: string | null;
  apkUrl: string;
  updateAvailable: boolean;
}

/** The version baked into this build from app.json. */
export function installedVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

/**
 * Ask the backend whether a newer APK is published. The server does the
 * comparison, so this stays a dumb fetch. Any failure (offline, old backend
 * without the endpoint) resolves to null — never surface a network error for
 * a background check.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const { data } = await api.get<AppVersionResponse>('/app-version', {
      params: { installed: installedVersion() },
      timeout: 8000,
    });
    if (!data.updateAvailable || !data.latest) return null;
    return {
      latest: data.latest,
      notes: data.notes,
      apkUrl: fileUrl(data.apkUrl),
    };
  } catch {
    return null;
  }
}
