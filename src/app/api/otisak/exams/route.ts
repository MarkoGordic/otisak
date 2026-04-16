import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireAuth, requireRole } from '@/lib/api-auth';
import {
  getOtisakExams,
  getExamsForUser,
  createOtisakExam,
  updateOtisakExam,
  updateOtisakExamStatus,
  deleteOtisakExam,
} from '@/lib/db/otisak';

export async function GET(request: NextRequest) {
  const user = await getUserFromSession(request);
  const authErr = requireAuth(user);
  if (authErr) return authErr;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || undefined;
  const subject_id = searchParams.get('subject_id') || undefined;
  const exam_mode = searchParams.get('exam_mode') || undefined;

  // Admin/assistant see all exams, students see only enrolled
  if (user!.role === 'admin' || user!.role === 'assistant') {
    const exams = await getOtisakExams({ status, subject_id, exam_mode });
    return NextResponse.json({ exams });
  }

  const exams = await getExamsForUser(user!.id);
  return NextResponse.json({ exams });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin', 'assistant']);
  if (roleErr) return roleErr;

  const data = await request.json();
  if (!data.title || !data.duration_minutes) {
    return NextResponse.json({ error: 'Title and duration are required' }, { status: 400 });
  }

  const exam = await createOtisakExam(data, user!.id);
  return NextResponse.json({ exam }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin', 'assistant']);
  if (roleErr) return roleErr;

  const data = await request.json();
  if (!data.id) {
    return NextResponse.json({ error: 'Exam ID is required' }, { status: 400 });
  }

  if (data.status) {
    const exam = await updateOtisakExamStatus(data.id, data.status);
    return NextResponse.json({ exam });
  }

  const exam = await updateOtisakExam(data.id, data);
  return NextResponse.json({ exam });
}

export async function DELETE(request: NextRequest) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin', 'assistant']);
  if (roleErr) return roleErr;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  await deleteOtisakExam(id);
  return NextResponse.json({ ok: true });
}
