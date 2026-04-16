import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireAuth } from '@/lib/api-auth';
import {
  getOtisakExamById,
  getOtisakQuestions,
  getActiveAttempt,
  startExamAttempt,
  autoFinishIfExpired,
  getSavedAnswers,
} from '@/lib/db/otisak';

export async function GET(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  const user = await getUserFromSession(request);
  const authErr = requireAuth(user);
  if (authErr) return authErr;

  const exam = await getOtisakExamById(params.examId);
  if (!exam) {
    return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
  }

  // Get or create attempt
  let attempt = await getActiveAttempt(params.examId, user!.id);

  if (attempt) {
    // Check if expired
    const expired = await autoFinishIfExpired(attempt);
    if (expired) {
      return NextResponse.json({ exam, finished: true, attempt: expired });
    }
  }

  if (!attempt && (exam.status === 'active' || exam.exam_mode === 'practice')) {
    attempt = await startExamAttempt(params.examId, user!.id, {
      ip_address: request.headers.get('x-forwarded-for') || undefined,
      user_agent: request.headers.get('user-agent') || undefined,
    }, exam.exam_mode === 'practice');
  }

  if (!attempt) {
    return NextResponse.json({ exam, error: 'Cannot start attempt' }, { status: 400 });
  }

  let questions = await getOtisakQuestions(params.examId);
  const savedAnswers = await getSavedAnswers(attempt.id);

  // Shuffle if needed
  const seed = attempt.shuffle_seed;
  if (seed && exam.shuffle_questions) {
    questions = shuffleArray(questions, seed);
  }
  if (seed && exam.shuffle_answers) {
    questions = questions.map((q, idx) => ({
      ...q,
      answers: shuffleArray(q.answers, seed + idx + 1),
    }));
  }

  // Strip correct answers for students
  const isStaff = user!.role === 'admin' || user!.role === 'assistant';
  const sanitizedQuestions = questions.map((q) => ({
    ...q,
    answers: q.answers.map((a) => ({
      id: a.id,
      text: a.text,
      position: a.position,
      ...(isStaff ? { is_correct: a.is_correct } : {}),
    })),
    explanation: isStaff ? q.explanation : undefined,
    multi_answer: q.answers.filter(a => a.is_correct).length > 1,
  }));

  return NextResponse.json({
    exam,
    attempt,
    questions: sanitizedQuestions,
    savedAnswers,
  });
}

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleArray<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  const rand = seededRandom(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
