import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireRole } from '@/lib/api-auth';
import {
  getOtisakQuestionBankQuestions,
  createOtisakQuestionBankQuestion,
  deleteOtisakQuestionBankQuestion,
} from '@/lib/db/otisak-question-bank';

export async function GET(request: NextRequest) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin', 'assistant']);
  if (roleErr) return roleErr;

  const { searchParams } = new URL(request.url);
  const subjectId = searchParams.get('subject_id');
  if (!subjectId) return NextResponse.json({ error: 'subject_id required' }, { status: 400 });

  const search = searchParams.get('search') || undefined;
  const type = searchParams.get('type') as 'text' | 'code' | 'image' | 'open_text' | undefined;
  const tag = searchParams.get('tag') || undefined;
  const limit = parseInt(searchParams.get('limit') || '100');
  const offset = parseInt(searchParams.get('offset') || '0');

  const result = await getOtisakQuestionBankQuestions({ subjectId, search, type, tag, limit, offset });
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin', 'assistant']);
  if (roleErr) return roleErr;

  const data = await request.json();
  if (!data.subject_id || !data.text || !data.type) {
    return NextResponse.json({ error: 'subject_id, text, and type are required' }, { status: 400 });
  }

  const question = await createOtisakQuestionBankQuestion(data, user!.id);
  return NextResponse.json({ question }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin', 'assistant']);
  if (roleErr) return roleErr;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await deleteOtisakQuestionBankQuestion(id);
  return NextResponse.json({ ok: true });
}
