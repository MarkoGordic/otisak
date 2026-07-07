import { query } from './client';
import type { User } from './types';

export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await query<User>(
    'SELECT * FROM users WHERE email = $1 AND is_active = TRUE LIMIT 1',
    [email]
  );
  return result.rows[0] || null;
}

export async function findUserById(id: string): Promise<User | null> {
  const result = await query<User>(
    'SELECT * FROM users WHERE id = $1 AND is_active = TRUE LIMIT 1',
    [id]
  );
  return result.rows[0] || null;
}

// Index format expected (post-migration): "ra1-2025" - letters + digits + dash + four-digit year.
// Lookup is case-insensitive and whitespace-tolerant so a student typing "RA1-2025" or " ra1 - 2025 "
// still matches a stored "ra1-2025".
export function normalizeIndexNumber(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '');
}

export async function findUserByIndexNumber(indexNumber: string): Promise<User | null> {
  const normalized = normalizeIndexNumber(indexNumber);
  if (!normalized) return null;
  const result = await query<User>(
    'SELECT * FROM users WHERE LOWER(REPLACE(index_number, \' \', \'\')) = $1 AND is_active = TRUE LIMIT 1',
    [normalized]
  );
  return result.rows[0] || null;
}

// --- ELPIS ID (OAuth/OIDC) account links -----------------------------------
// All optional: only exercised when the ELPIS ID feature is configured. `sub`
// is the OIDC subject identifier (users.elpis_id). Login is link-only, so these
// are the lookup + admin/self linking primitives.

export async function findUserByElpisId(sub: string): Promise<User | null> {
  if (!sub) return null;
  const result = await query<User>(
    'SELECT * FROM users WHERE elpis_id = $1 AND is_active = TRUE LIMIT 1',
    [sub]
  );
  return result.rows[0] || null;
}

// Which user (if any) currently owns this ELPIS ID link, regardless of active
// state — used to reject linking a `sub` that is already taken by someone else.
export async function findUserIdByElpisId(sub: string): Promise<string | null> {
  if (!sub) return null;
  const result = await query<{ id: string }>(
    'SELECT id FROM users WHERE elpis_id = $1 LIMIT 1',
    [sub]
  );
  return result.rows[0]?.id ?? null;
}

export type LinkElpisResult = 'linked' | 'already_linked_other';

export async function linkElpisId(userId: string, sub: string): Promise<LinkElpisResult> {
  const owner = await findUserIdByElpisId(sub);
  if (owner && owner !== userId) return 'already_linked_other';
  await query('UPDATE users SET elpis_id = $1, updated_at = NOW() WHERE id = $2', [sub, userId]);
  return 'linked';
}

export async function unlinkElpisId(userId: string): Promise<void> {
  await query('UPDATE users SET elpis_id = NULL, updated_at = NOW() WHERE id = $1', [userId]);
}

export async function updateLastLogin(userId: string): Promise<void> {
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [userId]);
}

export async function getAllUsers(): Promise<User[]> {
  const result = await query<User>('SELECT * FROM users ORDER BY created_at DESC');
  return result.rows;
}

export async function createUser(data: {
  email: string;
  password_hash: string;
  name?: string;
  role?: string;
  index_number?: string;
  // Optional pre-linked ELPIS ID (OIDC `sub`) — set when an account is
  // provisioned from the ELPIS main platform's federation endpoint.
  elpis_id?: string;
}): Promise<User> {
  const result = await query<User>(
    `INSERT INTO users (email, password_hash, name, role, index_number, elpis_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      data.email,
      data.password_hash,
      data.name || null,
      data.role || 'student',
      data.index_number || null,
      data.elpis_id || null,
    ]
  );
  return result.rows[0];
}

export async function updateUser(
  userId: string,
  data: { name?: string | null; email?: string; role?: string; index_number?: string | null; is_active?: boolean }
): Promise<User | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
  if (data.email !== undefined) { fields.push(`email = $${idx++}`); values.push(data.email); }
  if (data.role !== undefined) { fields.push(`role = $${idx++}`); values.push(data.role); }
  if (data.index_number !== undefined) { fields.push(`index_number = $${idx++}`); values.push(data.index_number); }
  if (data.is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(data.is_active); }

  if (fields.length === 0) return null;
  fields.push('updated_at = NOW()');
  values.push(userId);

  const result = await query<User>(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

export async function updateUserPasswordHash(userId: string, passwordHash: string): Promise<boolean> {
  const result = await query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [passwordHash, userId]
  );
  return (result.rowCount ?? 0) > 0;
}
