import { randomUUID } from 'crypto';
import { logger } from './logger';
import { getRequestContext } from './requestContext';
import { insertErrorLog, type ErrorLogEntry } from '../db/error-log';

// Single funnel for every error worth recording: HTTP 5xx, background-job and
// websocket failures, and process-level crashes. It fans out to a list of
// sinks. The sink list is the only thing to change to add Sentry/GlitchTip
// later: register one more sink, no call sites move.

export type ErrorSource = 'http' | 'job' | 'ws' | 'process' | 'db' | 'client';

export interface ReportContext {
  requestId?: string;
  userId?: string;
  route?: string;
  statusCode?: number;
  source?: ErrorSource;
  errorId?: string;
  context?: Record<string, unknown>;
}

type Sink = (entry: ErrorLogEntry) => void;

// Always log to stdout via pino. Synchronous, so it survives crash/exit paths
// where an async DB write would not flush.
const stdoutSink: Sink = (entry) => {
  const level = (entry.statusCode ?? 500) >= 500 ? 'error' : 'warn';
  logger[level](
    {
      errorId: entry.errorId,
      requestId: entry.requestId,
      source: entry.source,
      code: entry.code,
      statusCode: entry.statusCode,
      route: entry.route,
      userId: entry.userId,
      err: { name: entry.name, message: entry.message, stack: entry.stack },
      ...entry.context,
    },
    entry.message || 'error',
  );
};

// Persist serious errors to Postgres. Skip expected 4xx HTTP noise (validation,
// auth) so the table holds real failures. Fire and forget, never throws.
const pgSink: Sink = (entry) => {
  const status = entry.statusCode ?? 500;
  if (entry.source === 'http' && status < 500) return;
  insertErrorLog(entry).catch((e) => {
    logger.error({ err: e }, 'failed to persist error log row');
  });
};

const sinks: Sink[] = [stdoutSink, pgSink];

export function reportError(err: unknown, ctx: ReportContext = {}): string {
  const e =
    err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Unknown error');
  const code = (e as { code?: string }).code;
  const store = getRequestContext();
  const entry: ErrorLogEntry = {
    errorId: ctx.errorId ?? randomUUID(),
    requestId: ctx.requestId ?? store?.requestId,
    source: ctx.source ?? 'http',
    statusCode: ctx.statusCode,
    code,
    name: e.name,
    message: e.message,
    stack: e.stack,
    route: ctx.route,
    userId: ctx.userId ?? store?.userId,
    context: ctx.context,
  };
  for (const sink of sinks) {
    try {
      sink(entry);
    } catch {
      // A sink must never break the caller.
    }
  }
  return entry.errorId;
}
