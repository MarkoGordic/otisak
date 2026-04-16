import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireRole } from '@/lib/api-auth';
import { startExamTimer, getOtisakExamById } from '@/lib/db/otisak';

export async function POST(
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
  if (exam.status !== 'active') {
    return NextResponse.json({ error: 'Exam must be active to start' }, { status: 400 });
  }
  if (exam.exam_started_at) {
    return NextResponse.json({ error: 'Exam already started' }, { status: 400 });
  }

  const updated = await startExamTimer(params.examId);
  return NextResponse.json({ exam: updated });
}
