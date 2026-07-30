import { query } from './client';
import type { User, UserRole } from './types';
import { logger } from '../lib/logger';

// Case-insensitive on purpose: ELPIS ID profile sync stores emails lowercased,
// so an account created with a mixed-case email must still match the exact
// string its owner has always typed at login.
export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await query<User>(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE LIMIT 1',
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

// Revoke every existing session of the user linked to this ELPIS ID (`sub`).
// Sessions are stateless signed cookies, so "revocation" = stamping a per-user
// cutoff; requireAuth refuses cookies created before it. The cutoff is the
// SIGNED event time and is applied monotonically (GREATEST), so a retried or
// replayed delivery can never move it forward and kill sessions minted after
// the original event. Returns the affected user ids ([] when no otisak account
// is linked to the sub) so callers can also drop live WebSocket connections.
export async function revokeElpisSessions(sub: string, cutoff: Date): Promise<string[]> {
  if (!sub) return [];
  const result = await query<{ id: string }>(
    `UPDATE users
        SET sessions_revoked_at = GREATEST(COALESCE(sessions_revoked_at, 'epoch'::timestamptz), $2::timestamptz)
      WHERE elpis_id = $1
      RETURNING id`,
    [sub, cutoff],
  );
  return result.rows.map((row) => row.id);
}

// Refresh the local copy of an ELPIS ID user's profile (push webhook + pull on
// every ELPIS ID login). COALESCE keeps existing values when the IdP sends an
// empty field; is_active is deliberately untouched so local-password logins
// coexist with ELPIS ID state. If the new email collides with another otisak
// account (23505), the email is skipped and name/avatar still apply.
//
// `eventAt` (webhook path only) is the event's creation time: the update is
// skipped unless it is strictly newer than the row's updated_at, and on apply
// updated_at is stamped with the event time. Webhook delivery is at-least-once
// with no ordering guarantee, so this stops a retried stale event from
// overwriting a newer profile. Pull-syncs at login pass no eventAt and apply
// unconditionally.
export async function syncProfileFromElpis(
  sub: string,
  profile: { name?: string | null; email?: string | null; avatarUrl?: string | null },
  eventAt?: Date,
): Promise<User | null> {
  if (!sub) return null;
  const name = profile.name?.trim() || null;
  const email = profile.email?.trim().toLowerCase() || null;
  const avatarUrl = profile.avatarUrl?.trim() || null;
  const at = eventAt ?? null;
  try {
    const result = await query<User>(
      `UPDATE users
          SET name = COALESCE($2, name),
              email = COALESCE($3, email),
              avatar_url = COALESCE($4, avatar_url),
              updated_at = COALESCE($5::timestamptz, NOW())
        WHERE elpis_id = $1
          AND ($5::timestamptz IS NULL OR updated_at < $5::timestamptz)
        RETURNING *`,
      [sub, name, email, avatarUrl, at],
    );
    return result.rows[0] || null;
  } catch (e) {
    if ((e as { code?: string }).code !== '23505') throw e;
    logger.warn(
      { sub },
      'elpis profile sync: email already used by another account; applying name/avatar only',
    );
    const result = await query<User>(
      `UPDATE users
          SET name = COALESCE($2, name),
              avatar_url = COALESCE($3, avatar_url),
              updated_at = COALESCE($4::timestamptz, NOW())
        WHERE elpis_id = $1
          AND ($4::timestamptz IS NULL OR updated_at < $4::timestamptz)
        RETURNING *`,
      [sub, name, avatarUrl, at],
    );
    return result.rows[0] || null;
  }
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
  // Optional pre-linked FreeIPA/LDAP login (uid) — set when an account is
  // provisioned on first LDAP login.
  ldap_uid?: string;
}): Promise<User> {
  const result = await query<User>(
    `INSERT INTO users (email, password_hash, name, role, index_number, elpis_id, ldap_uid)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      data.email,
      data.password_hash,
      data.name || null,
      data.role || 'student',
      data.index_number || null,
      data.elpis_id || null,
      data.ldap_uid || null,
    ]
  );
  return result.rows[0];
}

// --- FreeIPA / LDAP account linking -----------------------------------------
// users.ldap_uid is the IPA login (uid). Unlike ELPIS ID, LDAP login auto-provisions: on first
// sign-in we create (or link, by email) an OTISAK account, so the whole IPA directory can log in.

export async function findUserByLdapUid(uid: string): Promise<User | null> {
  const result = await query<User>(
    'SELECT * FROM users WHERE ldap_uid = $1 AND is_active = TRUE LIMIT 1',
    [uid]
  );
  return result.rows[0] || null;
}

// Returns the account for an authenticated LDAP user, or null if a matching account exists but is
// deactivated (the caller must then refuse the login - we do NOT silently reactivate a blocked user).
export async function findOrCreateLdapUser(p: {
  uid: string;
  name: string | null;
  email: string;
  role: UserRole;
  indexNumber: string | null;
}): Promise<User | null> {
  // Match an existing row by ldap_uid OR email, INCLUDING inactive ones. Filtering on is_active here
  // would hide a linked-but-deactivated row and make the createUser below collide on the UNIQUE
  // ldap_uid/email (Postgres 23505 -> 500 on every login). Prefer the ldap_uid match over email.
  const existing = (
    await query<User>(
      `SELECT * FROM users WHERE ldap_uid = $1 OR LOWER(email) = LOWER($2)
       ORDER BY (ldap_uid = $1) DESC LIMIT 1`,
      [p.uid, p.email]
    )
  ).rows[0];

  if (existing) {
    if (!existing.is_active) return null; // deactivated -> caller returns 403; never reactivate here
    // LDAP is authoritative for the role, but never auto-demote a local admin (break-glass / manual
    // promotions must survive an LDAP login by an IPA account only in a lower group).
    await query(
      `UPDATE users SET ldap_uid = $2, name = COALESCE($3, name),
              index_number = COALESCE($4, index_number),
              role = CASE WHEN role = 'admin' THEN role ELSE $5 END,
              updated_at = NOW()
       WHERE id = $1`,
      [existing.id, p.uid, p.name, p.indexNumber, p.role]
    );
    return (await findUserById(existing.id)) as User;
  }

  // fresh LDAP-only account. password_hash '!' is not a valid bcrypt hash, so local email+password
  // login can never match it (LDAP is the only way in for this account).
  return createUser({
    email: p.email,
    password_hash: '!',
    name: p.name || undefined,
    role: p.role,
    index_number: p.indexNumber || undefined,
    ldap_uid: p.uid,
  });
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
