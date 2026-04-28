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

export async function findUserByIndexNumber(indexNumber: string): Promise<User | null> {
  const result = await query<User>(
    'SELECT * FROM users WHERE index_number = $1 AND is_active = TRUE LIMIT 1',
    [indexNumber]
  );
  return result.rows[0] || null;
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
}): Promise<User> {
  const result = await query<User>(
    `INSERT INTO users (email, password_hash, name, role, index_number)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.email, data.password_hash, data.name || null, data.role || 'student', data.index_number || null]
  );
  return result.rows[0];
}

export async function updateUser(
  userId: string,
  data: { name?: string; role?: string; index_number?: string; is_active?: boolean }
): Promise<User | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
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
