import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireRole } from '@/lib/api-auth';
import { getAllSettings, setSetting } from '@/lib/db/settings';

export async function GET(request: NextRequest) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin']);
  if (roleErr) return roleErr;

  const settings = await getAllSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(request: NextRequest) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin']);
  if (roleErr) return roleErr;

  const data = await request.json();
  for (const [key, value] of Object.entries(data)) {
    await setSetting(key, String(value));
  }

  const settings = await getAllSettings();
  return NextResponse.json({ settings });
}
