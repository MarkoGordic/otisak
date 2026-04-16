import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireRole } from '@/lib/api-auth';
import { getOtisakExamById, getAttemptResults, getUserAttempts } from '@/lib/db/otisak';
import { getActivityLog, getActivityStats } from '@/lib/db/activity-log';
import { findUserById } from '@/lib/db/users';

export async function GET(
  request: NextRequest,
  { params }: { params: { examId: string; userId: string } }
) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin', 'assistant']);
  if (roleErr) return roleErr;

  const exam = await getOtisakExamById(params.examId);
  if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 });

  const student = await findUserById(params.userId);
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  // Find the student's attempt for this exam
  const attempts = await getUserAttempts(params.userId);
  const attempt = attempts.find(a => a.exam_id === params.examId && a.submitted);
  if (!attempt) return NextResponse.json({ error: 'No completed attempt found' }, { status: 404 });

  // Get results
  const results = await getAttemptResults(attempt.id);

  // Get activity log
  const activityLog = await getActivityLog(attempt.id);
  const stats = await getActivityStats(attempt.id);

  // Build timeline
  const timeline = activityLog.map(e => ({
    time: e.timestamp,
    type: e.event_type,
    data: e.event_data,
  }));

  return NextResponse.json({
    exam: {
      id: exam.id,
      title: exam.title,
      subject_name: exam.subject_name,
      duration_minutes: exam.duration_minutes,
      pass_threshold: exam.pass_threshold,
    },
    student: {
      id: student.id,
      name: student.name,
      email: student.email,
      index_number: student.index_number,
    },
    attempt: {
      id: attempt.id,
      started_at: attempt.started_at,
      finished_at: attempt.finished_at,
      total_points: attempt.total_points,
      max_points: attempt.max_points,
      time_spent_seconds: attempt.time_spent_seconds,
      submitted: attempt.submitted,
    },
    results: results ? {
      questions: results.questions.map((q, idx) => ({
        index: idx + 1,
        text: q.question.text,
        type: q.question.type,
        points: q.question.points,
        points_awarded: q.points_awarded,
        selected_answer_ids: q.selected_answer_ids,
        correct_answer_ids: q.correct_answer_ids,
        text_answer: q.text_answer,
        answers: q.answers.map(a => ({
          id: a.id,
          text: a.text,
          is_correct: a.is_correct,
        })),
      })),
    } : null,
    activity: {
      stats,
      timeline,
    },
  });
}
