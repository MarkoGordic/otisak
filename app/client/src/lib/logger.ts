// Client logging + error reporting.
//
// - logger.*: thin console wrapper. Debug/info are silenced in production
//   builds so the console stays clean; warn/error always pass through.
// - reportError(): ships a compact report to the server's /api/_log endpoint so
//   client failures land in the same store as server failures, joinable by
//   requestId. Best effort: uses navigator.sendBeacon when available so a
//   report survives a hard navigation or crash. Never throws.

const isDev = import.meta.env.DEV;

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};

export interface ReportContext {
  // Where the error originated: 'api' | 'network' | 'react-boundary' | ...
  source?: string;
  // Server requestId, captured from a failed response so client and server
  // rows correlate.
  requestId?: string;
  status?: number;
  code?: string;
  url?: string;
  componentStack?: string;
}

export function reportError(err: unknown, ctx: ReportContext = {}): void {
  const e =
    err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Unknown client error');

  if (isDev) console.error('[reportError]', e, ctx);

  // Fold the React component stack into the stack field so it persists.
  const stack = [e.stack, ctx.componentStack].filter(Boolean).join('\n\n');

  const payload = {
    name: e.name,
    message: e.message,
    stack,
    source: ctx.source ?? 'client',
    requestId: ctx.requestId,
    status: ctx.status,
    code: ctx.code,
    url: ctx.url ?? (typeof location !== 'undefined' ? location.pathname : undefined),
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  };

  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/_log', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/_log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
        credentials: 'include',
      });
    }
  } catch {
    // The reporter must never break the app.
  }
}
