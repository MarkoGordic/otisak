import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { logger } from '../lib/logger';
import { getRequestId } from '../lib/requestContext';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    pool.on('error', (err: Error) => {
      logger.error({ err }, 'unexpected error on idle postgres client');
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const client = getPool();
  try {
    return await client.query<T>(text, params);
  } catch (error) {
    // Log with the correlated requestId, then rethrow. The HTTP error handler
    // persists the resulting 5xx once, so we do not persist here (avoids
    // duplicate rows for one user-visible failure).
    logger.error({ err: error, requestId: getRequestId() }, 'database query error');
    throw error;
  }
}

export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Drain the pool so a graceful shutdown doesn't sever live queries mid-flight.
// Safe to call when no pool has been created yet (no-op).
export async function closePool(): Promise<void> {
  if (!pool) return;
  const p = pool;
  pool = null;
  await p.end();
}
