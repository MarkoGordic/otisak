import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireAuth } from '@/lib/api-auth';
import { logEvents } from '@/lib/db/activity-log';

export async function POST(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  const user = await getUserFromSession(request);
  const authErr = requireAuth(user);
  if (authErr) return authErr;

  try {
    const body = await request.json();
    const { attempt_id, events } = body;

    if (!attempt_id || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ ok: true }); // silent no-op
    }

    await logEvents(attempt_id, user!.id, params.examId, events);
    return NextResponse.json({ ok: true, logged: events.length });
  } catch (error) {
    console.error('Event logging error:', error);
    return NextResponse.json({ ok: true }); // never fail the student
  }
}
