import { query } from './client';

// Persistent error store (Postgres `app_error_log`). The swappable error sink
// in lib/reportError.ts writes here for serious failures, and the admin viewer
// reads from here. Keeping it in the same database means no extra infra and no
// data leaving the server.

export interface ErrorLogEntry {
  errorId: string;
  requestId?: string;
  source: string; // http | job | ws | process | db | client
  statusCode?: number;
  code?: string;
  name?: string;
  message?: string;
  stack?: string;
  route?: string;
  userId?: string;
  context?: Record<string, unknown>;
}

export async function insertErrorLog(entry: ErrorLogEntry): Promise<void> {
  await query(
    `INSERT INTO app_error_log
       (id, request_id, source, status_code, code, name, message, stack, route, user_id, context)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      entry.errorId,
      entry.requestId ?? null,
      entry.source,
      entry.statusCode ?? null,
      entry.code ?? null,
      entry.name ?? null,
      entry.message ?? null,
      entry.stack ?? null,
      entry.route ?? null,
      entry.userId ?? null,
      JSON.stringify(entry.context ?? {}),
    ],
  );
}

export interface ListErrorsOptions {
  limit?: number;
  before?: string; // ISO timestamp cursor for keyset pagination
  requestId?: string;
  source?: string;
}

export async function listRecentErrors(opts: ListErrorsOptions = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts.before) {
    params.push(opts.before);
    conditions.push(`created_at < $${params.length}`);
  }
  if (opts.requestId) {
    params.push(opts.requestId);
    conditions.push(`request_id = $${params.length}`);
  }
  if (opts.source) {
    params.push(opts.source);
    conditions.push(`source = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);
  const r = await query(
    `SELECT id, request_id, source, status_code, code, name, message, route, user_id, context, created_at
       FROM app_error_log ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return r.rows;
}

export async function getErrorById(id: string) {
  const r = await query(`SELECT * FROM app_error_log WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

// Retention: drop rows older than `days` so the table stays bounded on a
// long-running server. Called periodically from the boot sequence.
export async function pruneOldErrorLogs(days = 30): Promise<number> {
  const r = await query(
    `DELETE FROM app_error_log WHERE created_at < NOW() - make_interval(days => $1::int)`,
    [days],
  );
  return r.rowCount ?? 0;
}
