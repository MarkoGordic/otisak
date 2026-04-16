import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireRole } from '@/lib/api-auth';
import { getOtisakQuestions, createOtisakQuestion, deleteOtisakQuestion } from '@/lib/db/otisak';

export async function GET(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin', 'assistant']);
  if (roleErr) return roleErr;

  const questions = await getOtisakQuestions(params.examId);
  return NextResponse.json({ questions });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin', 'assistant']);
  if (roleErr) return roleErr;

  const data = await request.json();
  if (!data.text || !data.type) {
    return NextResponse.json({ error: 'Question text and type are required' }, { status: 400 });
  }

  const question = await createOtisakQuestion(params.examId, data);
  return NextResponse.json({ question }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin', 'assistant']);
  if (roleErr) return roleErr;

  const { searchParams } = new URL(request.url);
  const questionId = searchParams.get('questionId');
  if (!questionId) return NextResponse.json({ error: 'questionId required' }, { status: 400 });

  await deleteOtisakQuestion(questionId);
  return NextResponse.json({ ok: true });
}
