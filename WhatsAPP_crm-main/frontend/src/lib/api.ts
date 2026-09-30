/** Thin fetch wrapper: cookies, CSRF header, JSON, one automatic token refresh on 401. */

export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '';

const EXTRA_HEADERS: Record<string, string> =
  import.meta.env.VITE_NGROK === '1' ? { 'ngrok-skip-browser-warning': 'true' } : {};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

function readCookie(name: string): string {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

let refreshing: Promise<boolean> | null = null;
let onUnauthorized: (() => void) | null = null;

/** Called once when the session cannot be refreshed, so the app can send the user to /login. */
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-csrf-token': readCookie('csrf_token'), ...EXTRA_HEADERS }
    })
      .then(r => r.ok)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => (refreshing = null), 0);
      });
  }
  return refreshing;
}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  form?: FormData;
  /** Internal: avoid refresh loops. */
  retried?: boolean;
};

export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin);
  for (const [k, v] of Object.entries(opts.query || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const method = opts.method || 'GET';
  const headers: Record<string, string> = { ...EXTRA_HEADERS };
  if (method !== 'GET') headers['x-csrf-token'] = readCookie('csrf_token');
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'network_error', 'Cannot reach the server. Check your connection.');
  }

  if (res.status === 401 && !opts.retried && !path.startsWith('/api/auth/login')) {
    if (await refreshSession()) return api<T>(path, { ...opts, retried: true });
    onUnauthorized?.();
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error || `http_${res.status}`,
      data?.message || res.statusText || 'Request failed',
      data?.details
    );
  }
  return data as T;
}

/** Human-readable message for any thrown error. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiError) {
    if (err.code === 'validation_error' && Array.isArray(err.details) && err.details.length > 0) {
      const d = err.details[0] as { path?: string; message?: string };
      return d.path ? `${d.path}: ${d.message}` : d.message || err.message;
    }
    return err.message || fallback;
  }
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}
