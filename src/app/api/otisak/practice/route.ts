import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireAuth } from '@/lib/api-auth';
import { getSelfServicePracticeExams } from '@/lib/db/otisak';
import { getSetting } from '@/lib/db/settings';

export async function GET(request: NextRequest) {
  const user = await getUserFromSession(request);
  const authErr = requireAuth(user);
  if (authErr) return authErr;

  // Check if practice mode is enabled (admin/assistant always see them)
  if (user!.role === 'student') {
    const enabled = await getSetting('practice_mode_enabled');
    if (enabled !== 'true') {
      return NextResponse.json({ exams: [], practice_disabled: true });
    }
  }

  const { searchParams } = new URL(request.url);
  const subjectId = searchParams.get('subject_id') || undefined;

  const exams = await getSelfServicePracticeExams(user!.id, subjectId);
  return NextResponse.json({ exams });
}
