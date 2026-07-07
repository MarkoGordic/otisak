import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { base64Url } from '../crypto';
import { query } from '../db/client';
import { getElpisConfig } from '../elpisId';
import { createUser } from '../db/users';
import type { UserRole } from '../db/types';
import { verifyServiceToken } from '../lib/elpisServiceToken';

// ---------------------------------------------------------------------------
// Cross-app "Person 360" federation endpoints — the write side lets the ELPIS
// main platform provision / link / unlink otisak accounts by ELPIS ID; the read
// side exposes a metadata-only summary for the 360 aggregator. All are guarded
// by an ELPIS ID `client_credentials` SERVICE token (scope=client), never a
// user session. The target user is always the `:elpisId` path / body value (the
// OIDC `sub`) — never the token `sub` (which is the caller's client_id).
//
// This router is only mounted when isElpisConfigured() is true.
// ---------------------------------------------------------------------------

const router = Router();

const VALID_ROLES: UserRole[] = ['admin', 'assistant', 'student'];

// Service-token guard. `requireAllowedClient` additionally enforces the optional
// ELPIS_ID_INTEGRATION_ALLOWED_CLIENTS allowlist on the sensitive write routes.
function requireServiceToken(opts: { requireAllowedClient?: boolean } = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const cfg = getElpisConfig();
    if (!cfg) return res.status(404).json({ error: 'Not found' });

    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Missing bearer service token' });
    }
    try {
      const claims = await verifyServiceToken(token);
      if (opts.requireAllowedClient && cfg.allowedClients.length > 0) {
        if (typeof claims.sub !== 'string' || !cfg.allowedClients.includes(claims.sub)) {
          return res.status(403).json({ error: 'Calling client is not allowed' });
        }
      }
      (req as Request & { serviceClient?: string }).serviceClient =
        typeof claims.sub === 'string' ? claims.sub : undefined;
      return next();
    } catch (e) {
      req.log?.warn({ err: (e as Error).message }, 'integration: service token verification failed');
      return res.status(401).json({ error: 'Invalid service token' });
    }
  };
}

type LinkRow = { id: string; email: string; role: string; is_active: boolean };

// POST /integration/users
// Create-or-link an otisak account for an ELPIS ID (`sub`). Idempotent on
// elpis_id. Order: (1) sub already linked → no-op; (2) email matches an existing
// unlinked otisak user → link it; (3) otherwise create a new OAuth-only account
// (random unusable password). This is provisioning by a trusted admin platform,
// NOT login — so linking an existing account by email here is intentional.
router.post('/users', requireServiceToken({ requireAllowedClient: true }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { elpisId, email, name, role, indexNumber } = req.body || {};
    if (typeof elpisId !== 'string' || !elpisId.trim()) {
      return res.status(400).json({ error: 'elpisId is required' });
    }
    const sub = elpisId.trim();
    const roleVal: UserRole = VALID_ROLES.includes(role) ? role : 'student';
    const normEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;

    // (1) Idempotent on the sub (regardless of active state).
    const existing = await query<LinkRow>(
      'SELECT id, email, role, is_active FROM users WHERE elpis_id = $1 LIMIT 1',
      [sub],
    );
    if (existing.rows[0]) {
      return res.json({ ok: true, created: false, linked: true, user: existing.rows[0] });
    }

    // (2) Link an existing otisak account matched by email, if it has no link yet.
    if (normEmail) {
      const match = await query<{ id: string; elpis_id: string | null }>(
        'SELECT id, elpis_id FROM users WHERE email = $1 LIMIT 1',
        [normEmail],
      );
      const row = match.rows[0];
      if (row) {
        if (row.elpis_id && row.elpis_id !== sub) {
          return res.status(409).json({ error: 'That otisak account is already linked to a different ELPIS ID' });
        }
        await query('UPDATE users SET elpis_id = $1, updated_at = NOW() WHERE id = $2', [sub, row.id]);
        return res.json({ ok: true, created: false, linked: true, user: { id: row.id, email: normEmail } });
      }
    }

    // (3) Create a new pre-linked, OAuth-only account. password_hash is NOT NULL,
    // so we store a random unusable hash — these accounts sign in via ELPIS ID.
    const emailToUse = normEmail || `${sub}@elpis.local`;
    const password_hash = await bcrypt.hash(base64Url(randomBytes(24)), 10);
    try {
      const user = await createUser({
        email: emailToUse,
        password_hash,
        name: typeof name === 'string' ? name : undefined,
        role: roleVal,
        index_number: typeof indexNumber === 'string' ? indexNumber : undefined,
        elpis_id: sub,
      });
      return res.status(201).json({
        ok: true, created: true, linked: true,
        user: { id: user.id, email: user.email, role: user.role },
      });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        return res.status(409).json({ error: 'Email already in use by another account' });
      }
      throw e;
    }
  } catch (error) {
    return next(error);
  }
});

// DELETE /integration/users/:elpisId/link — detach the ELPIS ID from whichever
// otisak account holds it (the local account itself is left intact).
router.delete('/users/:elpisId/link', requireServiceToken({ requireAllowedClient: true }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sub = req.params.elpisId;
    const result = await query(
      'UPDATE users SET elpis_id = NULL, updated_at = NOW() WHERE elpis_id = $1',
      [sub],
    );
    return res.json({ ok: true, unlinked: (result.rowCount ?? 0) > 0 });
  } catch (error) {
    return next(error);
  }
});

// GET /integration/users/:elpisId/summary — Person 360 metadata (counts only,
// NEVER exam content). Shape matches the morava/elpis-stage federation contract
// so it drops straight into the elpis aggregator.
router.get('/users/:elpisId/summary', requireServiceToken(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sub = req.params.elpisId;
    const u = await query<{ id: string; role: string; is_active: boolean; last_login_at: Date | null }>(
      'SELECT id, role, is_active, last_login_at FROM users WHERE elpis_id = $1 LIMIT 1',
      [sub],
    );
    const user = u.rows[0];
    if (!user) return res.json({ app: 'otisak', ok: true, notLinked: true });

    const [attempts, enrollments] = await Promise.all([
      query<{ c: number }>('SELECT COUNT(*)::int AS c FROM otisak_attempts WHERE user_id = $1', [user.id]),
      query<{ c: number }>('SELECT COUNT(*)::int AS c FROM otisak_enrollments WHERE user_id = $1', [user.id]),
    ]);

    return res.json({
      app: 'otisak',
      ok: true,
      lastActive: user.last_login_at,
      counts: {
        examAttempts: attempts.rows[0]?.c ?? 0,
        enrollments: enrollments.rows[0]?.c ?? 0,
      },
      security: [],
      role: user.role,
      active: user.is_active,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
