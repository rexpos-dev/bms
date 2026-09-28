/** Thrown when the server could not be reached at all (offline, DNS, timeout, refused). */
export class SyncNetworkError extends Error {}

/** Thrown when the server answered with a non-2xx status. */
export class SyncHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** `https://host`, `https://host/` and `https://host/api` all resolve to the same API root. */
export function apiRoot(serverUrl: string): string {
  return `${serverUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/, '')}/api`;
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

/** Minimal JSON-over-fetch helper that separates "unreachable" from "server said no". */
export async function requestJson<T>(
  serverUrl: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiRoot(serverUrl)}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(opts.body !== undefined
          ? { 'content-type': 'application/json' }
          : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    });
  } catch (err) {
    throw new SyncNetworkError(
      err instanceof Error ? err.message : String(err),
    );
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const message =
      (json as { message?: string | string[] } | null)?.message ??
      res.statusText;
    throw new SyncHttpError(
      res.status,
      Array.isArray(message) ? message.join('; ') : String(message),
    );
  }
  return json as T;
}
