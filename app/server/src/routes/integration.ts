import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { createHmac, randomBytes } from 'crypto';
import { base64Url, timingSafeEqual } from '../crypto';
import { query } from '../db/client';
import { getElpisConfig } from '../elpisId';
import { createUser, revokeElpisSessions, syncProfileFromElpis } from '../db/users';
import type { UserRole } from '../db/types';
import { verifyServiceToken } from '../lib/elpisServiceToken';
import { terminateUserSockets } from '../ws/events';

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

const VALID_ROLES: UserRole[] = ['admin', 'professor', 'assistant', 'student'];

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

// --- Push webhooks from ELPIS ID ----------------------------------------------
// POST /integration/events — HMAC-signed events (NOT service-token guarded; the
// signature over the raw request bytes IS the authentication). Dormant (404)
// unless ELPIS_ID_WEBHOOK_SECRET is set. Handlers are idempotent, do their small
// DB write inline, and always 2xx on unknown users/events so the sender's retry
// queue drains. is_active is never flipped from here: local-password logins
// coexist with ELPIS ID state by design — revocation is a session cutoff only.

const WEBHOOK_MAX_SKEW_S = 300; // reject deliveries older/newer than 5 min

type WebhookEvent = {
  id?: string;
  type?: string;
  createdAt?: string;
  data?: {
    sub?: string;
    email?: string;
    name?: string;
    username?: string;
    picture?: string;
    status?: string;
    clientId?: string;
  };
};

router.post('/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cfg = getElpisConfig();
    if (!cfg || !cfg.webhookSecret) return res.status(404).json({ error: 'Not found' });

    // Freshness: the timestamp is part of the signed input, so replaying an old
    // (captured) delivery outside the window is rejected before any HMAC work.
    const ts = String(req.headers['x-elpis-timestamp'] || '');
    const now = Math.floor(Date.now() / 1000);
    if (!/^\d+$/.test(ts) || Math.abs(now - Number(ts)) > WEBHOOK_MAX_SKEW_S) {
      return res.status(401).json({ error: 'stale' });
    }

    // Signature: v1=<hex HMAC-SHA256(secret, timestamp + "." + rawBody)> over
    // the EXACT wire bytes (req.rawBody from the express.json verify hook).
    const sigHeader = String(req.headers['x-elpis-signature'] || '');
    const raw = req.rawBody;
    if (!raw || !sigHeader.startsWith('v1=')) {
      return res.status(401).json({ error: 'bad signature' });
    }
    const expected = createHmac('sha256', cfg.webhookSecret)
      .update(`${ts}.`)
      .update(raw)
      .digest('hex');
    if (!timingSafeEqual(sigHeader.slice('v1='.length), expected)) {
      return res.status(401).json({ error: 'bad signature' });
    }

    const event = (req.body || {}) as WebhookEvent;
    const data = event.data || {};
    const sub = typeof data.sub === 'string' ? data.sub : '';

    // Ordering/idempotency anchor. Delivery is at-least-once and unordered, so
    // every state change below is keyed on WHEN THE EVENT HAPPENED, not when
    // the delivery arrived: the event's own createdAt is part of the signed
    // body and stays fixed across sender retries (the delivery timestamp does
    // not - each retry is re-signed with a fresh one, which is only the
    // fallback when createdAt is missing).
    const createdAtMs = Date.parse(event.createdAt || '');
    const eventAt = new Date(Number.isNaN(createdAtMs) ? Number(ts) * 1000 : createdAtMs);

    // Session revocation = stamp the cutoff (monotonic, so retries/replays are
    // no-ops), then drop any WebSockets the revoked users still hold open.
    const revokeSessionsAndSockets = async (): Promise<boolean> => {
      const userIds = await revokeElpisSessions(sub, eventAt);
      for (const userId of userIds) terminateUserSockets(userId);
      return userIds.length > 0;
    };

    switch (event.type) {
      case 'profile.updated': {
        const user = await syncProfileFromElpis(sub, {
          name: data.name,
          email: data.email,
          avatarUrl: data.picture,
        }, eventAt);
        return res.json(user ? { ok: true } : { ok: true, ignored: true });
      }
      case 'user.disabled':
      case 'user.logout_all': {
        const revoked = await revokeSessionsAndSockets();
        return res.json(revoked ? { ok: true } : { ok: true, ignored: true });
      }
      case 'app_access.blocked': {
        // Only OUR app being blocked kills sessions here; blocks aimed at other
        // clients are acknowledged and ignored.
        if (data.clientId !== cfg.clientId) return res.json({ ok: true, ignored: true });
        const revoked = await revokeSessionsAndSockets();
        return res.json(revoked ? { ok: true } : { ok: true, ignored: true });
      }
      case 'user.deleted': {
        // Deletion at the IdP is at least as strong a signal as a disable:
        // revoke all sessions, then detach the now-dangling link. The local
        // account itself is kept (is_active is never flipped from here).
        const revoked = await revokeSessionsAndSockets();
        if (revoked) {
          await query('UPDATE users SET elpis_id = NULL, updated_at = NOW() WHERE elpis_id = $1', [sub]);
        }
        return res.json(revoked ? { ok: true } : { ok: true, ignored: true });
      }
      case 'webhook.ping':
        return res.json({ ok: true });
      default:
        // user.enabled / app_access.granted / grant.revoked / future events:
        // no local action in otisak — acknowledge so the sender does not retry.
        return res.json({ ok: true, ignored: true });
    }
  } catch (error) {
    return next(error);
  }
});

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
