import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireAuth } from '@/lib/api-auth';
import { getSelfServicePracticeExams } from '@/lib/db/otisak';

export async function GET(request: NextRequest) {
  const user = await getUserFromSession(request);
  const authErr = requireAuth(user);
  if (authErr) return authErr;

  const { searchParams } = new URL(request.url);
  const subjectId = searchParams.get('subject_id') || undefined;

  const exams = await getSelfServicePracticeExams(user!.id, subjectId);
  return NextResponse.json({ exams });
}
