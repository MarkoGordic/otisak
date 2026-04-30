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

// Strict-but-forgiving CSV parser: comma-separated, optional quoted fields,
// header row required, columns must be id, ime, prezime, indeks (any order).
function parseStudentCsv(csv: string): { rows: Array<{ id: string; ime: string; prezime: string; indeks: string }> } | { error: string } {
  const lines = csv.split(/\r?\n/).map((l) => l).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { error: 'CSV must have a header row and at least one data row' };

  const splitRow = (line: string): string[] => {
    // Minimal CSV parser: handles "quoted, fields" with escaped "" inside.
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

  const header = splitRow(lines[0]).map((h) => h.trim().toLowerCase());
  const required = ['id', 'ime', 'prezime', 'indeks'];
  for (const col of required) {
    if (!header.includes(col)) return { error: `Missing required column: ${col}` };
  }
  const idIdx = header.indexOf('id');
  const imeIdx = header.indexOf('ime');
  const prezimeIdx = header.indexOf('prezime');
  const indeksIdx = header.indexOf('indeks');

  const rows: Array<{ id: string; ime: string; prezime: string; indeks: string }> = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    rows.push({
      id: (cells[idIdx] || '').trim(),
      ime: (cells[imeIdx] || '').trim(),
      prezime: (cells[prezimeIdx] || '').trim(),
      indeks: (cells[indeksIdx] || '').trim(),
    });
  }
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
