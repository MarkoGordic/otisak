import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireAuth } from '@/lib/api-auth';
import { getAttemptResults, getUserAttempts } from '@/lib/db/otisak';

export async function GET(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  const user = await getUserFromSession(request);
  const authErr = requireAuth(user);
  if (authErr) return authErr;

  // Find the user's latest attempt for this exam
  const attempts = await getUserAttempts(user!.id);
  const examAttempt = attempts.find((a) => a.exam_id === params.examId && a.submitted);

  if (!examAttempt) {
    return NextResponse.json({ error: 'No completed attempt found' }, { status: 404 });
  }

  const results = await getAttemptResults(examAttempt.id);
  if (!results) {
    return NextResponse.json({ error: 'Results not found' }, { status: 404 });
  }

  return NextResponse.json({ results });
}
