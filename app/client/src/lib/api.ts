import { reportError } from './logger';

// Central API client. Every request to the server should funnel through here so
// that credentials, JSON encoding, error shape, 401 handling, and error
// reporting are consistent in one place instead of spread across ~88 raw fetch
// calls. Pages catch the typed ApiError and render a Toast via handleApiError.

export interface ApiErrorBody {
  error?: string;
  code?: string;
  requestId?: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly details?: unknown;
  readonly isNetworkError: boolean;

  constructor(
    message: string,
    opts: {
      status?: number;
      code?: string;
      requestId?: string;
      details?: unknown;
      isNetworkError?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status ?? 0;
    this.code = opts.code;
    this.requestId = opts.requestId;
    this.details = opts.details;
    this.isNetworkError = opts.isNetworkError ?? false;
  }
}

export interface ApiOptions extends RequestInit {
  // When false, a 401 will NOT auto-redirect to the login screen. For endpoints
  // that tolerate anonymous access (e.g. the public join/lookup flow).
  redirectOn401?: boolean;
}

// Guard so a burst of concurrent 401s triggers a single redirect.
let redirecting = false;

function isIdempotent(method: string): boolean {
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD';
}

export async function apiFetch<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { redirectOn401 = true, headers, body, method = 'GET', ...rest } = opts;
  const finalHeaders = new Headers(headers);
  if (typeof body === 'string' && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json');
  }

  const doFetch = () =>
    fetch(path, { method, body, headers: finalHeaders, credentials: 'include', ...rest });

  let res: Response;
  try {
    res = await doFetch();
  } catch (netErr) {
    // One retry for idempotent GETs before giving up on a transient network hiccup.
    if (isIdempotent(method)) {
      try {
        res = await doFetch();
      } catch {
        const e = new ApiError('Network request failed', { isNetworkError: true });
        reportError(e, { source: 'network', url: path });
        throw e;
      }
    } else {
      reportError(netErr, { source: 'network', url: path });
      throw new ApiError('Network request failed', { isNetworkError: true });
    }
  }

  const headerRequestId = res.headers.get('X-Request-Id') ?? undefined;

  if (!res.ok) {
    let parsed: ApiErrorBody = {};
    try {
      parsed = (await res.json()) as ApiErrorBody;
    } catch {
      // Non-JSON error body (e.g. a proxy error page). Keep defaults.
    }
    const apiErr = new ApiError(parsed.error || res.statusText || 'Request failed', {
      status: res.status,
      code: parsed.code,
      requestId: parsed.requestId ?? headerRequestId,
      details: parsed.details,
    });

    // Session expired or not logged in: bounce to the login screen unless the
    // caller opted out (anonymous-tolerant endpoint).
    if (res.status === 401 && redirectOn401 && !redirecting && typeof window !== 'undefined') {
      redirecting = true;
      window.location.href = '/';
    }

    // Report server-side failures; routine 4xx (validation, auth, conflict) are
    // expected and surfaced to the user via Toast, so they are not reported.
    if (res.status >= 500) {
      reportError(apiErr, {
        source: 'api',
        status: res.status,
        code: apiErr.code,
        requestId: apiErr.requestId,
        url: path,
      });
    }
    throw apiErr;
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

function withJsonBody(opts: ApiOptions | undefined, data: unknown): ApiOptions {
  if (data === undefined) return opts ?? {};
  return { ...opts, body: JSON.stringify(data) };
}

// Convenience helpers. Object bodies are JSON-encoded automatically.
export const api = {
  get: <T = unknown>(path: string, opts?: ApiOptions) =>
    apiFetch<T>(path, { ...opts, method: 'GET' }),
  post: <T = unknown>(path: string, data?: unknown, opts?: ApiOptions) =>
    apiFetch<T>(path, { ...withJsonBody(opts, data), method: 'POST' }),
  patch: <T = unknown>(path: string, data?: unknown, opts?: ApiOptions) =>
    apiFetch<T>(path, { ...withJsonBody(opts, data), method: 'PATCH' }),
  put: <T = unknown>(path: string, data?: unknown, opts?: ApiOptions) =>
    apiFetch<T>(path, { ...withJsonBody(opts, data), method: 'PUT' }),
  del: <T = unknown>(path: string, opts?: ApiOptions) =>
    apiFetch<T>(path, { ...opts, method: 'DELETE' }),
};

// Map any thrown value to a user-facing message. Server-exposed 4xx messages
// pass through; 5xx and network failures get a localized generic message so we
// never leak internals. For server-side failures the trace/request id is
// appended so the user can quote it to an admin, who can look the exact error
// up in /admin/errors by that id. Reporting already happened inside apiFetch.
export function apiErrorMessage(err: unknown, t: (key: string) => string): string {
  if (err instanceof ApiError) {
    if (err.isNetworkError) return t('error.network');
    if (err.status >= 500) {
      const base = t('error.server');
      return err.requestId ? `${base} (${t('error.traceCode')} ${err.requestId})` : base;
    }
    return err.message || t('error.unknown');
  }
  return t('error.unknown');
}

// Single helper components call in a catch block: shows a Toast with the right
// message. Typed structurally so this module does not depend on the Toast
// component.
export function handleApiError(
  err: unknown,
  toast: { error: (msg: string) => unknown },
  t: (key: string) => string,
): void {
  toast.error(apiErrorMessage(err, t));
}
