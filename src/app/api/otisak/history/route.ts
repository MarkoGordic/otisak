import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireAuth } from '@/lib/api-auth';
import { getUserAttempts } from '@/lib/db/otisak';

export async function GET(request: NextRequest) {
  const user = await getUserFromSession(request);
  const authErr = requireAuth(user);
  if (authErr) return authErr;

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || undefined;

  const attempts = await getUserAttempts(user!.id, mode);
  return NextResponse.json({ attempts });
}
