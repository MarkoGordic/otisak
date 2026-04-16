import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireAuth } from '@/lib/api-auth';
import { submitAttemptAnswers, finishAttempt, getActiveAttempt } from '@/lib/db/otisak';

export async function POST(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  const user = await getUserFromSession(request);
  const authErr = requireAuth(user);
  if (authErr) return authErr;

  const body = await request.json();
  const { action, answers, time_spent_seconds } = body;

  const attempt = await getActiveAttempt(params.examId, user!.id);
  if (!attempt) {
    return NextResponse.json({ error: 'No active attempt found' }, { status: 404 });
  }

  if (action === 'save' && answers) {
    await submitAttemptAnswers(attempt.id, answers);
    return NextResponse.json({ ok: true });
  }

  if (action === 'submit') {
    if (answers) {
      await submitAttemptAnswers(attempt.id, answers);
    }
    const finished = await finishAttempt(attempt.id, time_spent_seconds || 0);
    return NextResponse.json({ attempt: finished });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
