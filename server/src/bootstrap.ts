import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from './db/client';
import { importExamFromJson, type ExamImportInput } from './lib/importExam';
import saljiviTest from './seeds/saljivi-test.json';

// Alphanumeric, no easily-confused characters (no 0/O, 1/l/I).
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function generateAdminPassword(length = 10): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[randomInt(0, PASSWORD_ALPHABET.length)];
  }
  return out;
}

// Ensure that exactly one bootstrap admin account exists. If no admin row is
// found we create `admin@otisak.local` with a fresh random password and print
// the credentials to stdout once. The DB seed no longer ships an admin so this
// is the only path that creates it.
//
// Idempotent: subsequent boots find the existing admin and do nothing.
export async function ensureBootstrapAdmin(): Promise<void> {
  try {
    const existing = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'`,
    );
    if ((existing.rows[0]?.count ?? 0) > 0) return;

    const password = generateAdminPassword(10);
    const hash = await bcrypt.hash(password, 10);
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@otisak.local';

    await query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO NOTHING`,
      [email, hash, 'Administrator'],
    );

    // Big banner so it's hard to miss in container logs.
    const line = '='.repeat(72);
    console.log(`\n${line}`);
    console.log('OTISAK · admin account bootstrapped');
    console.log(`  email:    ${email}`);
    console.log(`  password: ${password}`);
    console.log('  Save this password now — it is not stored in plaintext anywhere.');
    console.log(`${line}\n`);
  } catch (err) {
    // Never let bootstrap failure crash the server — log and continue.
    console.error('Bootstrap admin failed:', err);
  }
}

// Seed the built-in demo exam (the "Šaljivi test" fixture) so a fresh
// install always has one practice exam students can try without anything
// being imported by hand. Idempotent: matched by exact title.
//
// The demo is created as a practice/self-service/public exam in 'active'
// status, attributed to the bootstrap admin (or whichever admin happens
// to be first in the table). Failures are logged but do not crash boot.
export async function ensureDemoExam(): Promise<void> {
  try {
    const demoTitle = (saljiviTest as ExamImportInput).exam?.title;
    if (typeof demoTitle !== 'string' || !demoTitle.trim()) return;

    const existing = await query<{ id: string }>(
      'SELECT id FROM otisak_exams WHERE title = $1 LIMIT 1',
      [demoTitle]
    );
    if (existing.rows[0]) return;

    const admin = await query<{ id: string }>(
      `SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1`
    );
    const adminId = admin.rows[0]?.id;
    if (!adminId) {
      console.warn('ensureDemoExam: no admin user found yet, skipping');
      return;
    }

    // Practice flow (createPracticeInstance) requires a subject on the
    // template exam. We seed a dedicated "Demo" subject the first time so
    // the demo doesn't pollute any real course's subject list.
    const DEMO_SUBJECT_NAME = 'Demo';
    let subject = await query<{ id: string }>(
      'SELECT id FROM otisak_subjects WHERE name = $1 LIMIT 1',
      [DEMO_SUBJECT_NAME]
    );
    let subjectId = subject.rows[0]?.id;
    if (!subjectId) {
      const inserted = await query<{ id: string }>(
        `INSERT INTO otisak_subjects (name, code, description, created_by)
         VALUES ($1, 'DEMO', 'Built-in demo subject', $2) RETURNING id`,
        [DEMO_SUBJECT_NAME, adminId]
      );
      subjectId = inserted.rows[0].id;
    }

    const result = await importExamFromJson(saljiviTest as ExamImportInput, adminId, {
      exam_mode: 'practice',
      self_service: true,
      is_public: true,
      status: 'active',
      subject_id: subjectId,
    });
    console.log(`OTISAK · demo exam seeded ("${demoTitle}", ${result.questions} questions)`);
  } catch (err) {
    console.error('ensureDemoExam failed:', err);
  }
}
