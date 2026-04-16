import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, parseSessionCookie } from './session';
import { findUserById } from './db/users';
import type { User } from './db/types';

export async function getUserFromSession(request: NextRequest): Promise<User | null> {
  const cookieValue = request.cookies.get(SESSION_COOKIE)?.value;
  const session = parseSessionCookie(cookieValue);
  if (!session?.user?.id) return null;
  return findUserById(session.user.id);
}

export function requireAuth(user: User | null): NextResponse | null {
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export function requireRole(user: User | null, roles: string[]): NextResponse | null {
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!roles.includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}
