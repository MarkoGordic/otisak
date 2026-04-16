import { Request, Response, NextFunction } from 'express';
import { parseSessionCookie, SESSION_COOKIE } from './session';
import { findUserById } from './db/users';
import type { User } from './db/types';

declare global {
  namespace Express {
    interface Request {
      user?: User;
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

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
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
