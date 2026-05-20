import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getAllUsers, updateUser, updateUserPasswordHash } from '../db/users';
import { getAllSettings, setSetting } from '../db/settings';
import { requireAuth, requireRole } from '../middleware';
import { query } from '../db/client';
import {
  listSubjectAssignments,
  assignUserToSubject,
  unassignUserFromSubject,
} from '../db/auth-helpers';

// Email format check shared by the create/update endpoints. Deliberately
// loose — the DB has a UNIQUE constraint on the actual address, this just
// stops obvious typos from reaching the insert.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    const { id, name, email, role, index_number, is_active } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'User id is required' });
    }

    // Email is the one field that can collide because of the UNIQUE
    // constraint. Pre-check so we can surface a friendly 409 instead of a
    // raw constraint violation from Postgres.
    let normalizedEmail: string | undefined;
    if (email !== undefined) {
      const trimmed = String(email).trim().toLowerCase();
      if (!EMAIL_RE.test(trimmed)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      const dup = await query<{ id: string }>(
        'SELECT id FROM users WHERE email = $1 AND id <> $2 LIMIT 1',
        [trimmed, id]
      );
      if (dup.rows[0]) {
        return res.status(409).json({ error: 'Email already exists' });
      }
      normalizedEmail = trimmed;
    }

    const updated = await updateUser(id, {
      name,
      email: normalizedEmail,
      role,
      index_number,
      is_active,
    });
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

// PATCH /admin/users/password — set a new password for any user.
// Body: { id, password }. Minimum length 6 to match the create flow.
router.patch('/users/password', async (req: Request, res: Response) => {
  try {
    const { id, password } = req.body || {};
    if (!id) return res.status(400).json({ error: 'User id is required' });
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const hash = await bcrypt.hash(password, 10);
    const ok = await updateUserPasswordHash(id, hash);
    if (!ok) return res.status(404).json({ error: 'User not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Update user password error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /admin/users/import-csv
// Body: { csv: "id,ime,prezime,indeks\n..." }
// Default password for every imported user: "ftn".
// Email is synthesised from the index (e.g. ra1-2025@example.edu) so
// it stays unique and the row can be re-found later.
router.post('/users/import-csv', async (req: Request, res: Response) => {
  try {
    const csv = typeof req.body?.csv === 'string' ? req.body.csv : null;
    if (!csv) return res.status(400).json({ error: 'csv (string) is required in body' });

    const parsed = parseStudentCsv(csv);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    const rows = parsed.rows;

    const passwordHash = await bcrypt.hash('changeme', 10);
    const created: Array<{ index_number: string; email: string }> = [];
    const skipped: Array<{ index_number: string; reason: string }> = [];

    for (const row of rows) {
      try {
        const indexRaw = row.indeks.trim();
        const indexNorm = indexRaw.toLowerCase().replace(/\s+/g, '');
        if (!indexNorm) { skipped.push({ index_number: indexRaw, reason: 'empty index' }); continue; }
        const name = `${row.ime.trim()} ${row.prezime.trim()}`.trim() || null;
        const email = synthesiseStudentEmail(row.prezime, indexNorm);

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

// Compose the student e-mail.
//
// Index format we expect: "xxNNN-YYYY" — two-letter smer + index number + dash
// + 4-digit year (e.g. "ra1-2025"). When the format matches we synthesise:
//   <prezime>.<smer><number>.<year>@example.edu   e.g. petrovic.ra1.2025@example.edu
// If the format does NOT match (or anything else goes sideways) we fall back
// to "<index>@example.edu" so the row never fails the import. Never throws.
function synthesiseStudentEmail(prezimeRaw: string, indexNorm: string): string {
  const fallback = `${indexNorm}@example.edu`;
  try {
    const m = indexNorm.match(/^([a-z]{2})(\d+)-(\d{4})$/);
    const cleanedSurname = stripDiacritics(prezimeRaw)
      .toLowerCase()
      .replace(/[^a-z]/g, '');
    if (!m || !cleanedSurname) return fallback;
    const [, smer, num, year] = m;
    return `${cleanedSurname}.${smer}${num}.${year}@example.edu`;
  } catch {
    return fallback;
  }
}

// Map common Serbian Latin diacritics to ASCII so e-mail addresses stay
// well-formed. Anything unexpected falls through unchanged and is later
// stripped to letters by the caller.
function stripDiacritics(s: string): string {
  if (!s) return '';
  const map: Record<string, string> = {
    'č': 'c', 'Č': 'C', 'ć': 'c', 'Ć': 'C',
    'š': 's', 'Š': 'S', 'ž': 'z', 'Ž': 'Z',
    'đ': 'dj', 'Đ': 'Dj', 'ǆ': 'dz',
  };
  return s
    .replace(/[čČćĆšŠžŽđĐǆ]/g, (ch) => map[ch] ?? ch)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

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

// Whitelist of writable settings keys. The settings PATCH endpoint is
// admin-only but we still constrain the keys so a typo (or a buggy client)
// can't quietly write garbage into app_settings — every legitimate key has
// a UI control somewhere that knows how to read it back.
const ALLOWED_SETTING_KEYS = new Set([
  'practice_mode_enabled',
]);

// PATCH /admin/settings
router.patch('/settings', async (req: Request, res: Response) => {
  try {
    const entries = req.body;
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
      return res.status(400).json({ error: 'Settings object is required' });
    }

    const updates = Object.entries(entries);
    for (const [key] of updates) {
      if (!ALLOWED_SETTING_KEYS.has(key)) {
        return res.status(400).json({ error: `Unknown setting key: ${key}` });
      }
    }
    for (const [key, value] of updates) {
      await setSetting(key, String(value));
    }

    const settings = await getAllSettings();
    return res.json({ settings });
  } catch (error) {
    console.error('Update settings error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ----- subject assignments -----
// These endpoints power the "Asistenti" panel on /subjects. Admin-only:
// asistents themselves can see what they're assigned to via the implicit
// filter on /api/otisak/exams (they don't get to add or remove anyone).

// GET /admin/subjects/:subjectId/assignments
router.get('/subjects/:subjectId/assignments', async (req: Request, res: Response) => {
  try {
    const { subjectId } = req.params;
    if (!subjectId) return res.status(400).json({ error: 'subjectId is required' });
    const assignments = await listSubjectAssignments(subjectId);
    return res.json({ assignments });
  } catch (error) {
    console.error('List assignments error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /admin/subjects/:subjectId/assignments — body { user_id, role? }
// Role defaults to 'assistant' (the only one wired up on the client today,
// but the schema allows 'professor' so we accept it).
router.post('/subjects/:subjectId/assignments', async (req: Request, res: Response) => {
  try {
    const { subjectId } = req.params;
    const { user_id, role } = req.body || {};
    if (!subjectId || !user_id) {
      return res.status(400).json({ error: 'subjectId and user_id are required' });
    }
    const finalRole: 'professor' | 'assistant' = role === 'professor' ? 'professor' : 'assistant';
    await assignUserToSubject(user_id, subjectId, finalRole, req.user!.id);
    return res.json({ success: true });
  } catch (error) {
    console.error('Create assignment error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /admin/subjects/:subjectId/assignments/:userId
router.delete('/subjects/:subjectId/assignments/:userId', async (req: Request, res: Response) => {
  try {
    const { subjectId, userId } = req.params;
    if (!subjectId || !userId) {
      return res.status(400).json({ error: 'subjectId and userId are required' });
    }
    await unassignUserFromSubject(userId, subjectId);
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete assignment error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
