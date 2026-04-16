import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireRole } from '@/lib/api-auth';
import {
  enrollUserInExam,
  enrollUsersByPattern,
  enrollByCourseAndYear,
  getExamEnrollments,
} from '@/lib/db/otisak';

export async function GET(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin', 'assistant']);
  if (roleErr) return roleErr;

  const enrollments = await getExamEnrollments(params.examId);
  return NextResponse.json({ enrollments });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin', 'assistant']);
  if (roleErr) return roleErr;

  const body = await request.json();

  // Single user enrollment
  if (body.user_id) {
    const enrollment = await enrollUserInExam(params.examId, body.user_id);
    return NextResponse.json({ enrollment });
  }

  // Bulk by pattern
  if (body.pattern) {
    const count = await enrollUsersByPattern(params.examId, body.pattern);
    return NextResponse.json({ enrolled: count });
  }

  // Bulk by course/year
  if (body.course_code && body.year) {
    const count = await enrollByCourseAndYear(
      params.examId,
      body.course_code,
      body.year,
      body.from_number,
      body.to_number
    );
    return NextResponse.json({ enrolled: count });
  }

  return NextResponse.json({ error: 'Provide user_id, pattern, or course_code+year' }, { status: 400 });
}
