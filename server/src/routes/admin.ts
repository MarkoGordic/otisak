import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getAllUsers, updateUser } from '../db/users';
import { getAllSettings, setSetting } from '../db/settings';
import { requireAuth, requireRole } from '../middleware';
import { query } from '../db/client';

const router = Router();

// All admin routes require auth + admin role
router.use(requireAuth, requireRole(['admin']));

// GET /admin/users
router.get('/users', async (_req: Request, res: Response) => {
  try {
    const users = await getAllUsers();
    const sanitized = users.map(({ password_hash, ...rest }) => rest);
    return res.json({ users: sanitized });
  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /admin/users
router.patch('/users', async (req: Request, res: Response) => {
  try {
    const { id, name, role, index_number, is_active } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'User id is required' });
    }

    const updated = await updateUser(id, { name, role, index_number, is_active });
    if (!updated) {
      return res.status(404).json({ error: 'User not found or no changes' });
    }

    const { password_hash, ...rest } = updated;
    return res.json({ user: rest });
  } catch (error) {
    console.error('Update user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /admin/users/import-csv
// Body: { csv: "id,ime,prezime,indeks\n..." }
// Default password for every imported user: "ftn".
// Email is synthesised from the index (e.g. ra1-2025@ftn.uns.ac.rs) so
// it stays unique and the row can be re-found later.
router.post('/users/import-csv', async (req: Request, res: Response) => {
  try {
    const csv = typeof req.body?.csv === 'string' ? req.body.csv : null;
    if (!csv) return res.status(400).json({ error: 'csv (string) is required in body' });

    const parsed = parseStudentCsv(csv);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    const rows = parsed.rows;

    const passwordHash = await bcrypt.hash('ftn', 10);
    const created: Array<{ index_number: string; email: string }> = [];
    const skipped: Array<{ index_number: string; reason: string }> = [];

    for (const row of rows) {
      try {
        const indexRaw = row.indeks.trim();
        const indexNorm = indexRaw.toLowerCase().replace(/\s+/g, '');
        if (!indexNorm) { skipped.push({ index_number: indexRaw, reason: 'empty index' }); continue; }
        const email = `${indexNorm}@ftn.uns.ac.rs`;
        const name = `${row.ime.trim()} ${row.prezime.trim()}`.trim() || null;

        // Skip if same index or email already exists.
        const existing = await query<{ id: string }>(
          `SELECT id FROM users
           WHERE LOWER(REPLACE(index_number, ' ', '')) = $1 OR email = $2
           LIMIT 1`,
          [indexNorm, email]
        );
        if (existing.rows[0]) { skipped.push({ index_number: indexRaw, reason: 'already exists' }); continue; }

        await query(
          `INSERT INTO users (email, password_hash, name, role, index_number)
           VALUES ($1, $2, $3, 'student', $4)`,
          [email, passwordHash, name, indexNorm]
        );
        created.push({ index_number: indexNorm, email });
      } catch (e) {
        skipped.push({ index_number: row.indeks || '?', reason: (e as Error).message || 'insert failed' });
      }
    }

    return res.json({ created: created.length, skipped: skipped.length, total: rows.length, items: { created, skipped } });
  } catch (error) {
    console.error('Import CSV error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Header-less CSV parser. Each row is positional:
//   col 0 = id, col 1 = ime (first name), col 2 = prezime (last name), col 3 = indeks.
// Extra columns after position 3 are ignored. Empty rows are skipped.
// Quoted fields with doubled-quote escapes are supported.
function parseStudentCsv(csv: string): { rows: Array<{ id: string; ime: string; prezime: string; indeks: string }> } | { error: string } {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { error: 'CSV is empty' };

  const splitRow = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else cur += c;
      } else {
        if (c === ',') { out.push(cur); cur = ''; }
        else if (c === '"' && cur.length === 0) inQuotes = true;
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  };

  const rows: Array<{ id: string; ime: string; prezime: string; indeks: string }> = [];
  for (const line of lines) {
    const cells = splitRow(line);
    if (cells.length < 4) continue; // not enough columns — skip
    rows.push({
      id: (cells[0] || '').trim(),
      ime: (cells[1] || '').trim(),
      prezime: (cells[2] || '').trim(),
      indeks: (cells[3] || '').trim(),
    });
  }
  if (rows.length === 0) return { error: 'No valid rows (each row needs at least id, firstname, lastname, indeks)' };
  return { rows };
}

// GET /admin/settings
router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const settings = await getAllSettings();
    return res.json({ settings });
  } catch (error) {
    console.error('Get settings error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /admin/settings
router.patch('/settings', async (req: Request, res: Response) => {
  try {
    const entries = req.body;
    if (!entries || typeof entries !== 'object') {
      return res.status(400).json({ error: 'Settings object is required' });
    }

    for (const [key, value] of Object.entries(entries)) {
      await setSetting(key, String(value));
    }

    const settings = await getAllSettings();
    return res.json({ settings });
  } catch (error) {
    console.error('Update settings error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
