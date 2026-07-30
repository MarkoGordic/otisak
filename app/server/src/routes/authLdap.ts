import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateLdap, ldapEnabled, LdapUnavailableError } from '../lib/ldap';
import { findOrCreateLdapUser, updateLastLogin } from '../db/users';
import { createSessionCookie, SESSION_COOKIE, DEFAULT_TTL_MS } from '../session';

// LDAP / FreeIPA login. Mounted at /api/auth/ldap. When enabled it is the primary login on the
// SPA (see LoginPage): staff and students sign in with their IPA username/index + password, and an
// OTISAK account is provisioned/linked on first login. Local email+password login stays available
// as a fallback (break-glass admins, non-IPA accounts).

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// GET /api/auth/ldap/status  -> drives whether the SPA shows LDAP as the default login
router.get('/status', (_req: Request, res: Response) => {
  return res.json({ enabled: ldapEnabled() });
});

// POST /api/auth/ldap/login  { username, password }
router.post('/login', loginLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!ldapEnabled()) {
      return res.status(404).json({ error: 'LDAP login is not enabled' });
    }
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    let profile;
    try {
      profile = await authenticateLdap(String(username), String(password));
    } catch (err) {
      if (err instanceof LdapUnavailableError) {
        return res.status(502).json({ error: 'Directory service unavailable' });
      }
      throw err;
    }
    if (!profile) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = await findOrCreateLdapUser(profile);
    await updateLastLogin(user.id);

    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie(
      SESSION_COOKIE,
      createSessionCookie({
        id: user.id,
        email: user.email,
        name: user.name || undefined,
        role: user.role,
        avatar_url: user.avatar_url || undefined,
        index_number: user.index_number || undefined,
      }),
      {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        maxAge: DEFAULT_TTL_MS,
        path: '/',
      },
    );

    return res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
