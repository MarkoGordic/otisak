import { NextRequest, NextResponse } from 'next/server';
import { getOtisakExamById } from '@/lib/db/otisak';

export async function GET(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  const exam = await getOtisakExamById(params.examId);
  if (!exam) {
    return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
  }

  return NextResponse.json({
    status: exam.status,
    exam_started_at: exam.exam_started_at,
    title: exam.title,
    duration_minutes: exam.duration_minutes,
    subject_name: exam.subject_name,
  });
}
