import { NextRequest, NextResponse } from 'next/server';
import { joinExamByIndex } from '@/lib/db/otisak';
import { createSessionCookie, SESSION_COOKIE, DEFAULT_TTL_MS } from '@/lib/session';
import { findUserById } from '@/lib/db/users';

export async function POST(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  try {
    const { index_number } = await request.json();
    if (!index_number?.trim()) {
      return NextResponse.json({ error: 'Index number is required' }, { status: 400 });
    }

    const result = await joinExamByIndex(params.examId, index_number);
    if (!result.user) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Create a session for this student so they can access the exam
    const fullUser = await findUserById(result.user.id);
    if (!fullUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 400 });
    }

    const cookie = createSessionCookie({
      id: fullUser.id,
      email: fullUser.email,
      name: fullUser.name || undefined,
      role: fullUser.role,
      index_number: fullUser.index_number || undefined,
    });

    const response = NextResponse.json({
      user: {
        id: result.user.id,
        name: result.user.name,
        index_number: result.user.index_number,
      },
      exam_id: params.examId,
    });

    response.cookies.set(SESSION_COOKIE, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: Math.floor(DEFAULT_TTL_MS / 1000),
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Join error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
