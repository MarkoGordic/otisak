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

export type ExamImportOverrides = Partial<
  Pick<OtisakExam, 'exam_mode' | 'self_service' | 'is_public' | 'subject_id'>
> & { status?: OtisakExam['status'] };

// Booleans from a hand-written (often AI-written) file. `!!value` turned the
// string "false" into true; only the spellings below count as true.
export function fileBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'da'].includes(v)) return true;
    if (['false', '0', 'no', 'ne', ''].includes(v)) return false;
  }
  return value == null ? fallback : !!value;
}

function fileNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(typeof value === 'string' ? value.trim().replace(',', '.') : value);
  return Number.isFinite(n) ? n : null;
}

// negative_points_threshold is an INTEGER column: a fraction used to abort the
// whole import. negative_points_value is NUMERIC with a >= 0 check.
export function negativeThreshold(value: unknown): number {
  return Math.max(0, Math.round(fileNumber(value) ?? 0));
}
export function negativeValue(value: unknown): number {
  return Math.max(0, fileNumber(value) ?? 0);
}

// Build a single exam + its questions + answers from a JSON dump.
// Returns the new exam and the number of questions actually created.
//
// Validation here is intentionally minimal - title is required, the rest
// falls back to sensible defaults so legacy fixtures keep importing.
// The route layer should reject malformed payloads before calling in.
//
// exam_mode comes from the CALLER, never from the file. Whether a file
// becomes a real exam or a practice exam is a placement decision owned by
// the page doing the import (like subject_id), not a property of the
// content. Legacy files that still carry exam.exam_mode import fine; the
// field is ignored and the import dialog warns about it.
export async function importExamFromJson(
  body: ExamImportInput,
  createdBy: string,
  overrides: ExamImportOverrides = {},
): Promise<ExamImportResult> {
  const examIn = body.exam || {};
  const title = typeof examIn.title === 'string' ? examIn.title.trim() : '';
  if (!title) throw new Error('exam.title is required');

  // duration is an INTEGER column, so round instead of failing on 45.5.
  const duration = Math.round(fileNumber(examIn.duration_minutes) ?? 0);
  // 0% is a legal pass threshold (the editor allows it); only a missing or
  // unreadable value falls back to 50.
  const passThreshold = fileNumber(examIn.pass_threshold);

  const exam = await createOtisakExam(
    {
      title,
      description: typeof examIn.description === 'string' ? examIn.description : null,
      duration_minutes: duration > 0 ? duration : 60,
      pass_threshold: passThreshold === null ? 50 : Math.min(100, Math.max(0, passThreshold)),
      // Default TRUE so legacy exports (pre-flag) round-trip with the historical
      // pass/fail rendering preserved.
      has_pass_threshold: fileBool(examIn.has_pass_threshold, true),
      exam_mode: overrides.exam_mode ?? 'real',
      allow_review: fileBool(examIn.allow_review),
      shuffle_questions: fileBool(examIn.shuffle_questions),
      shuffle_answers: fileBool(examIn.shuffle_answers),
      partial_scoring: fileBool(examIn.partial_scoring),
      negative_points_enabled: fileBool(examIn.negative_points_enabled),
      negative_points_value: negativeValue(examIn.negative_points_value),
      negative_points_threshold: negativeThreshold(examIn.negative_points_threshold),
      subject_id: overrides.subject_id ?? null,
      self_service: overrides.self_service,
      is_public: overrides.is_public,
    } as never,
    createdBy,
  );

  let createdQuestions = 0;
  for (const q of body.questions || []) {
    if (!q || typeof q.type !== 'string' || typeof q.text !== 'string') continue;
    const multiAnswer =
      q.multi_answer === undefined || q.multi_answer === null
        ? undefined
        : fileBool(q.multi_answer);
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
            .filter(
              (a: unknown): a is { text: string; is_correct?: unknown; position?: number } =>
                typeof a === 'object' &&
                a !== null &&
                typeof (a as { text?: unknown }).text === 'string',
            )
            .map((a: { text: string; is_correct?: unknown; position?: number }, i: number) => ({
              text: a.text,
              is_correct: fileBool(a.is_correct),
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
