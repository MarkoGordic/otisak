import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireAuth } from '@/lib/api-auth';
import { createPracticeInstance } from '@/lib/db/otisak';

export async function POST(request: NextRequest) {
  const user = await getUserFromSession(request);
  const authErr = requireAuth(user);
  if (authErr) return authErr;

  const { exam_id } = await request.json();
  if (!exam_id) {
    return NextResponse.json({ error: 'exam_id is required' }, { status: 400 });
  }

  try {
    const result = await createPracticeInstance(exam_id, user!.id, {
      ip_address: request.headers.get('x-forwarded-for') || undefined,
      user_agent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      child_exam: result.exam,
      attempt: result.attempt,
      redirect_url: `/exam/${result.exam.id}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start practice';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
