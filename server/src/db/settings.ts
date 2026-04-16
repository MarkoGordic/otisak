import { query } from './client';

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
  // Deactivate any existing lockdown first
  await query('UPDATE exam_lockdowns SET is_active = FALSE, ended_at = NOW() WHERE exam_id = $1 AND is_active = TRUE', [examId]);
  await query(
    'INSERT INTO exam_lockdowns (exam_id, is_active, message, started_by) VALUES ($1, TRUE, $2, $3)',
    [examId, message || null, userId]
  );
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
