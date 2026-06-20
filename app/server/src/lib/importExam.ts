import { query } from '../db/client';
import { createOtisakExam, createOtisakQuestion, updateOtisakExamStatus } from '../db/otisak';
import type { OtisakExam } from '../db/otisak-types';

// Shape of the JSON dump produced by GET /api/otisak/exams/:id/export-json,
// and consumed by both POST /api/otisak/exams/import-json and the demo
// seed in bootstrap.ts. We deliberately keep this loose: the route layer
// is responsible for choosing what subject to attach, and the caller
// supplies createdBy (the bootstrap admin or the requesting user).
export type ExamImportInput = {
  exam: Record<string, unknown>;
  questions: Array<Record<string, unknown>>;
};

export type ExamImportResult = {
  exam: OtisakExam;
  questions: number;
};

export type ExamImportOverrides = Partial<Pick<
  OtisakExam,
  'exam_mode' | 'self_service' | 'is_public' | 'subject_id'
>> & { status?: OtisakExam['status'] };

// Build a single exam + its questions + answers from a JSON dump.
// Returns the new exam and the number of questions actually created.
//
// Validation here is intentionally minimal - title is required, the rest
// falls back to sensible defaults so legacy fixtures keep importing.
// The route layer should reject malformed payloads before calling in.
export async function importExamFromJson(
  body: ExamImportInput,
  createdBy: string,
  overrides: ExamImportOverrides = {}
): Promise<ExamImportResult> {
  const examIn = body.exam || {};
  const title = typeof examIn.title === 'string' ? examIn.title.trim() : '';
  if (!title) throw new Error('exam.title is required');

  const exam = await createOtisakExam({
    title,
    description: typeof examIn.description === 'string' ? examIn.description : null,
    duration_minutes: Number(examIn.duration_minutes) || 60,
    pass_threshold: Number(examIn.pass_threshold) || 50,
    // Default TRUE so legacy exports (pre-flag) round-trip with the historical
    // pass/fail rendering preserved.
    has_pass_threshold: typeof examIn.has_pass_threshold === 'boolean' ? examIn.has_pass_threshold : true,
    exam_mode: overrides.exam_mode ?? (examIn.exam_mode === 'practice' ? 'practice' : 'real'),
    allow_review: !!examIn.allow_review,
    shuffle_questions: !!examIn.shuffle_questions,
    shuffle_answers: !!examIn.shuffle_answers,
    partial_scoring: !!examIn.partial_scoring,
    negative_points_enabled: !!examIn.negative_points_enabled,
    negative_points_value: Number(examIn.negative_points_value) || 0,
    negative_points_threshold: Number(examIn.negative_points_threshold) || 0,
    subject_id: overrides.subject_id ?? null,
    self_service: overrides.self_service,
    is_public: overrides.is_public,
  } as never, createdBy);

  let createdQuestions = 0;
  for (const q of body.questions || []) {
    if (!q || typeof q.type !== 'string' || typeof q.text !== 'string') continue;
    const multiAnswer = typeof q.multi_answer === 'boolean' ? q.multi_answer : undefined;
    await createOtisakQuestion(exam.id, {
      type: q.type,
      text: q.text,
      content: (q.content as string | null | undefined) ?? null,
      points: Number(q.points) || 0,
      position: typeof q.position === 'number' ? q.position : undefined,
      explanation: (q.explanation as string | null | undefined) ?? null,
      ai_grading_instructions: (q.ai_grading_instructions as string | null | undefined) ?? null,
      multi_answer: multiAnswer,
      answers: Array.isArray(q.answers)
        ? q.answers
            .filter((a: unknown): a is { text: string; is_correct?: boolean; position?: number } =>
              typeof a === 'object' && a !== null && typeof (a as { text?: unknown }).text === 'string')
            .map((a: { text: string; is_correct?: boolean; position?: number }, i: number) => ({
              text: a.text,
              is_correct: !!a.is_correct,
              position: typeof a.position === 'number' ? a.position : i,
            }))
        : [],
    } as never);
    createdQuestions++;
  }

  // Status override happens after creation because createOtisakExam always
  // starts an exam as 'draft'. For the demo seed we want it 'active'
  // immediately so students can take it on first run.
  if (overrides.status) {
    await updateOtisakExamStatus(exam.id, overrides.status);
  }

  return { exam, questions: createdQuestions };
}

// Resolve a subject by case-insensitive name lookup, used by the JSON
// import route when the payload includes a subject_name hint.
export async function resolveSubjectIdByName(name: string | undefined | null): Promise<string | null> {
  if (typeof name !== 'string' || !name.trim()) return null;
  const result = await query<{ id: string }>(
    'SELECT id FROM otisak_subjects WHERE LOWER(name) = LOWER($1) LIMIT 1',
    [name.trim()]
  );
  return result.rows[0]?.id ?? null;
}
