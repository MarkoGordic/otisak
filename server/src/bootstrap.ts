import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from './db/client';

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
