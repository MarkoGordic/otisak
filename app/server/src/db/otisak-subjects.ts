// OTISAK Database Operations
// ========================================

import { query } from './client';
import type {
  OtisakSubject,
} from './otisak-types';

// ========================================
// SUBJECTS
// ========================================

export async function getOtisakSubjects(): Promise<OtisakSubject[]> {
  const result = await query<OtisakSubject>(
    'SELECT * FROM otisak_subjects ORDER BY name ASC'
  );
  return result.rows;
}

export async function createOtisakSubject(
  data: { name: string; code?: string; description?: string },
  createdBy: string
): Promise<OtisakSubject> {
  const result = await query<OtisakSubject>(
    `INSERT INTO otisak_subjects (name, code, description, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [data.name, data.code || null, data.description || null, createdBy]
  );
  return result.rows[0];
}

export async function updateOtisakSubject(
  id: string,
  data: { name?: string; code?: string; description?: string }
): Promise<OtisakSubject | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
  if (data.code !== undefined) { fields.push(`code = $${idx++}`); values.push(data.code || null); }
  if (data.description !== undefined) { fields.push(`description = $${idx++}`); values.push(data.description || null); }

  if (fields.length === 0) return null;
  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query<OtisakSubject>(
    `UPDATE otisak_subjects SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

export async function deleteOtisakSubject(id: string): Promise<void> {
  await query('DELETE FROM otisak_subjects WHERE id = $1', [id]);
}
