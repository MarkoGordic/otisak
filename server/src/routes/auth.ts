import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { findUserByEmail, updateLastLogin, createUser } from '../db/users';
import { createSessionCookie, parseSessionCookie, SESSION_COOKIE, DEFAULT_TTL_MS } from '../session';
import { requireAuth, requireRole } from '../middleware';

const router = Router();

// Brute-force / credential-stuffing guard. 10 attempts per IP per 15 min is
// generous for typo cases (a fast-typing admin) and strict enough that a
// remote attacker can't grind through a dictionary without obvious noise.
// Successful logins don't count toward the bucket so a legitimate user
// re-logging in after a typo isn't penalised.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// Dummy bcrypt hash used for timing-equalised "user not found" responses.
// Computed once at module load. Any bcrypt.compare against this will fail but
// take roughly the same wall-clock as a real comparison would, so the response
// time doesn't leak whether an email exists in the users table.
const DUMMY_HASH = bcrypt.hashSync('::dummy::', 10);

// POST /auth/login
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await findUserByEmail(email);
    // Always run bcrypt.compare, even for unknown emails, so the response time
    // doesn't reveal account existence (timing oracle for enumeration).
    const valid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
    if (!user || !valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await updateLastLogin(user.id);

    const cookie = createSessionCookie({
      id: user.id,
      email: user.email,
      name: user.name || undefined,
      role: user.role,
      avatar_url: user.avatar_url || undefined,
      index_number: user.index_number || undefined,
    });

    // Mark "Secure" only when the request was actually delivered over HTTPS
    // (directly or via a TLS-terminating proxy). Hard-coding NODE_ENV breaks
    // local prod-mode containers served on plain http://localhost.
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie(SESSION_COOKIE, cookie, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: DEFAULT_TTL_MS,
      path: '/',
    });

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/logout
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  return res.json({ success: true });
});

// GET /auth/session
router.get('/session', async (req: Request, res: Response) => {
  try {
    const cookieValue = req.cookies?.[SESSION_COOKIE];
    if (!cookieValue) {
      return res.json({ authenticated: false });
    }

    const session = parseSessionCookie(cookieValue);
    if (!session) {
      return res.json({ authenticated: false });
    }

    return res.json({
      authenticated: true,
      user: session.user,
    });
  } catch (error) {
    console.error('Session error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/register - admin only
router.post('/register', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { email, password, name, role, index_number } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const user = await createUser({
      email,
      password_hash,
      name,
      role: role || 'student',
      index_number,
    });

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        index_number: user.index_number,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
