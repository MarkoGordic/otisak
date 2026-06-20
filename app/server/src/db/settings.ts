import { query, transaction } from './client';

export async function getSetting(key: string): Promise<string | null> {
  const result = await query<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = $1',
    [key]
  );
  return result.rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value]
  );
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const result = await query<{ key: string; value: string }>(
    'SELECT key, value FROM app_settings ORDER BY key'
  );
  const settings: Record<string, string> = {};
  for (const row of result.rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

// Lockdown
export async function createLockdown(examId: string, userId: string, message?: string): Promise<void> {
  // Atomically: close any existing active lockdowns, then create exactly one new active lockdown.
  // FOR UPDATE serializes concurrent createLockdown calls so we don't end up with two active rows.
  await transaction(async (client) => {
    await client.query(
      'SELECT 1 FROM exam_lockdowns WHERE exam_id = $1 AND is_active = TRUE FOR UPDATE',
      [examId]
    );
    await client.query(
      'UPDATE exam_lockdowns SET is_active = FALSE, ended_at = NOW() WHERE exam_id = $1 AND is_active = TRUE',
      [examId]
    );
    await client.query(
      'INSERT INTO exam_lockdowns (exam_id, is_active, message, started_by) VALUES ($1, TRUE, $2, $3)',
      [examId, message || null, userId]
    );
  });
}

export async function endLockdown(examId: string): Promise<void> {
  await query(
    'UPDATE exam_lockdowns SET is_active = FALSE, ended_at = NOW() WHERE exam_id = $1 AND is_active = TRUE',
    [examId]
  );
}

export async function getActiveLockdown(examId: string): Promise<{ is_active: boolean; message: string | null } | null> {
  const result = await query<{ is_active: boolean; message: string | null }>(
    'SELECT is_active, message FROM exam_lockdowns WHERE exam_id = $1 AND is_active = TRUE ORDER BY started_at DESC LIMIT 1',
    [examId]
  );
  return result.rows[0] || null;
}

// Total seconds the exam has been paused due to lockdowns (closed + currently active).
export async function getTotalLockdownPauseSeconds(examId: string): Promise<number> {
  const result = await query<{ paused_seconds: string }>(
    `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at))), 0)::numeric AS paused_seconds
     FROM exam_lockdowns
     WHERE exam_id = $1`,
    [examId]
  );
  return Number(result.rows[0]?.paused_seconds ?? 0);
}
