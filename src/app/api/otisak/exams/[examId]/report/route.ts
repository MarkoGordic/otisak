import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireRole } from '@/lib/api-auth';
import { getExamAttemptsSummary, getOtisakExamById } from '@/lib/db/otisak';

export async function GET(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin', 'assistant']);
  if (roleErr) return roleErr;

  const exam = await getOtisakExamById(params.examId);
  if (!exam) {
    return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
  }

  const attempts = await getExamAttemptsSummary(params.examId);
  return NextResponse.json({ exam, attempts });
}
