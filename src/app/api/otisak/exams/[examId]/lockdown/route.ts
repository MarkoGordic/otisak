import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireRole } from '@/lib/api-auth';
import { createLockdown, endLockdown, getActiveLockdown } from '@/lib/db/settings';

export async function GET(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  // Public endpoint - students need to check lockdown status
  const lockdown = await getActiveLockdown(params.examId);
  return NextResponse.json({ lockdown });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin', 'assistant']);
  if (roleErr) return roleErr;

  const body = await request.json();
  const { action, message } = body;

  if (action === 'lock') {
    await createLockdown(params.examId, user!.id, message);
    return NextResponse.json({ ok: true, locked: true });
  }

  if (action === 'unlock') {
    await endLockdown(params.examId);
    return NextResponse.json({ ok: true, locked: false });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
