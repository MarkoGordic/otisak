import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireRole } from '@/lib/api-auth';
import { getAllUsers, updateUser } from '@/lib/db/users';

export async function GET(request: NextRequest) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin']);
  if (roleErr) return roleErr;

  const users = await getAllUsers();
  // Strip password hashes
  const safe = users.map(({ password_hash, ...rest }) => rest);
  return NextResponse.json({ users: safe });
}

export async function PATCH(request: NextRequest) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin']);
  if (roleErr) return roleErr;

  const data = await request.json();
  if (!data.id) return NextResponse.json({ error: 'User ID required' }, { status: 400 });

  const updated = await updateUser(data.id, data);
  if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { password_hash, ...safe } = updated;
  return NextResponse.json({ user: safe });
}
