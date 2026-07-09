import { Request, Response, NextFunction } from 'express';
import type { Logger } from 'pino';
import { parseSessionCookie, SESSION_COOKIE } from './session';
import { findUserById } from './db/users';
import type { User } from './db/types';
import { markSessionActive } from './session-tracker';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      // Set by the requestContext middleware (runs first), so every handler can
      // rely on them being present.
      id: string;
      log: Logger;
      // Raw request bytes, captured by the express.json verify hook in index.ts.
      // Needed by the /integration/events webhook receiver, whose HMAC signature
      // covers the exact bytes on the wire (re-serialising req.body would break it).
      rawBody?: Buffer;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const cookieValue = req.cookies?.[SESSION_COOKIE];
    if (!cookieValue) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const session = parseSessionCookie(cookieValue);
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const user = await findUserById(session.user.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Remote revocation (ELPIS ID "log out everywhere" / user disabled / app
    // access blocked): the cookie signature is still valid, but any session
    // minted before the per-user cutoff is refused.
    if (user.sessions_revoked_at && session.createdAt < new Date(user.sessions_revoked_at).getTime()) {
      return res.status(401).json({ error: 'Session revoked' });
    }

    req.user = user;
    // Keep the per-user session tracker warm so /join can detect another
    // device trying to take over while this user is mid-exam.
    markSessionActive(user.id, session.id);
    next();
  } catch (error) {
    // Unexpected failure (e.g. DB down): forward to the centralized error
    // handler so it is logged, persisted, and returned with a requestId.
    return next(error);
  }
}

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
