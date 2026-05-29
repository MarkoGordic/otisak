// OTISAK Database Operations
// ========================================

import { query, transaction } from './client';
import type {
  OtisakSubject,
  OtisakExam,
  OtisakExamWithSubject,
  OtisakQuestion,
  OtisakAnswer,
  OtisakQuestionWithAnswers,
  OtisakAttempt,
  OtisakAttemptAnswer,
  OtisakAttemptWithExam,
  OtisakEnrollment,
  CreateOtisakExamInput,
  CreateOtisakQuestionInput,
  UpdateOtisakQuestionInput,
  SubmitAttemptAnswerInput,
  OtisakExamResults,
  OtisakExamTagRule,
  CreateOtisakExamTagRuleInput,
  OtisakExamAiSettings,
} from './otisak-types';

// ========================================
// SUBJECTS
// ========================================

export async function getOtisakSubjects(): Promise<OtisakSubject[]> {
  const result = await query<OtisakSubject>(
    'SELECT * FROM otisak_subjects ORDER BY name ASC'
  );
  return result.rows;
}

export async function createOtisakSubject(
  data: { name: string; code?: string; description?: string },
  createdBy: string
): Promise<OtisakSubject> {
  const result = await query<OtisakSubject>(
    `INSERT INTO otisak_subjects (name, code, description, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [data.name, data.code || null, data.description || null, createdBy]
  );
  return result.rows[0];
}

export async function updateOtisakSubject(
  id: string,
  data: { name?: string; code?: string; description?: string }
): Promise<OtisakSubject | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
  if (data.code !== undefined) { fields.push(`code = $${idx++}`); values.push(data.code || null); }
  if (data.description !== undefined) { fields.push(`description = $${idx++}`); values.push(data.description || null); }

  if (fields.length === 0) return null;
  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query<OtisakSubject>(
    `UPDATE otisak_subjects SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

export async function deleteOtisakSubject(id: string): Promise<void> {
  await query('DELETE FROM otisak_subjects WHERE id = $1', [id]);
}

// ========================================
// EXAMS
// ========================================

export async function getOtisakExams(
  filters?: {
    status?: string;
    statuses?: string[];
    subject_id?: string;
    exam_mode?: string;
    subject_ids?: string[];
    tags?: string[];
    scheduled_from?: string;
    scheduled_to?: string;
  }
): Promise<OtisakExamWithSubject[]> {
  let sql = `
    SELECT e.*, s.name as subject_name, s.code as subject_code,
           (SELECT COUNT(*)::int FROM otisak_questions q WHERE q.exam_id = e.id) as question_count
    FROM otisak_exams e
    LEFT JOIN otisak_subjects s ON e.subject_id = s.id
  `;
  const conditions: string[] = ['e.parent_exam_id IS NULL'];
  const params: unknown[] = [];

  if (filters?.status) {
    conditions.push(`e.status = $${params.length + 1}`);
    params.push(filters.status);
  }
  // `statuses` is the multi-value variant — used by the manage page tabs
  // (Aktivni = draft|scheduled|active in one query). When both `status` and
  // `statuses` are set, `status` wins (the caller probably narrowed inside
  // a tab) and `statuses` is ignored.
  if (filters?.statuses && filters.statuses.length > 0 && !filters?.status) {
    conditions.push(`e.status = ANY($${params.length + 1}::text[])`);
    params.push(filters.statuses);
  }
  if (filters?.subject_id) {
    conditions.push(`e.subject_id = $${params.length + 1}`);
    params.push(filters.subject_id);
  }
  if (filters?.exam_mode) {
    conditions.push(`e.exam_mode = $${params.length + 1}`);
    params.push(filters.exam_mode);
  }
  // Array-overlap on the GIN-indexed tags column. Caller passes already-
  // normalised lowercase tags; we don't re-normalise here.
  if (filters?.tags && filters.tags.length > 0) {
    conditions.push(`e.tags && $${params.length + 1}::text[]`);
    params.push(filters.tags);
  }
  if (filters?.scheduled_from) {
    conditions.push(`e.scheduled_at >= $${params.length + 1}`);
    params.push(filters.scheduled_from);
  }
  if (filters?.scheduled_to) {
    conditions.push(`e.scheduled_at <= $${params.length + 1}`);
    params.push(filters.scheduled_to);
  }
  // Hard filter for assistants: only exams belonging to subjects the user
  // is assigned to. Empty array → no exams (the route layer is responsible
  // for short-circuiting when an assistant has zero assignments, but we
  // still guard here so a programmer error doesn't leak the whole table).
  if (filters?.subject_ids) {
    if (filters.subject_ids.length === 0) {
      conditions.push('FALSE');
    } else {
      conditions.push(`e.subject_id = ANY($${params.length + 1}::uuid[])`);
      params.push(filters.subject_ids);
    }
  }

  sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY e.created_at DESC';

  const result = await query<OtisakExamWithSubject>(sql, params);
  return result.rows;
}

export async function getOtisakExamById(id: string): Promise<OtisakExamWithSubject | null> {
  const result = await query<OtisakExamWithSubject>(
    `SELECT e.*, s.name as subject_name, s.code as subject_code,
            (SELECT COUNT(*)::int FROM otisak_questions q WHERE q.exam_id = e.id) as question_count
     FROM otisak_exams e
     LEFT JOIN otisak_subjects s ON e.subject_id = s.id
     WHERE e.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function createOtisakExam(
  data: CreateOtisakExamInput,
  createdBy: string
): Promise<OtisakExam> {
  // Tags get normalised once on the way in: lowercased, trimmed, deduped,
  // empties dropped. Saves us from re-doing it on every read.
  const tags = normaliseTags(data.tags);
  const result = await query<OtisakExam>(
    `INSERT INTO otisak_exams (title, subject_id, description, duration_minutes, scheduled_at,
       allow_review, shuffle_questions, shuffle_answers, pass_threshold, has_pass_threshold, created_by,
       exam_mode, self_service, repeat_interval_minutes, auto_activate, uses_question_bank, is_public,
       negative_points_enabled, negative_points_value, negative_points_threshold, partial_scoring, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22) RETURNING *`,
    [
      data.title,
      data.subject_id || null,
      data.description || null,
      data.duration_minutes,
      data.scheduled_at || null,
      data.allow_review ?? false,
      data.shuffle_questions ?? false,
      data.shuffle_answers ?? false,
      data.pass_threshold ?? 50,
      data.has_pass_threshold ?? true,
      createdBy,
      data.exam_mode || 'real',
      data.self_service ?? false,
      data.repeat_interval_minutes || null,
      data.auto_activate ?? false,
      data.uses_question_bank ?? false,
      data.is_public ?? false,
      data.negative_points_enabled ?? false,
      data.negative_points_value ?? 0,
      data.negative_points_threshold ?? 1,
      data.partial_scoring ?? false,
      tags,
    ]
  );
  return result.rows[0];
}

// Lowercase + trim + dedupe + drop empties. Public so the API layer can call it
// when accepting `?tags=foo,Bar,foo` query params and emit the same canonical
// form for filtering as we store on the row.
export function normaliseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== 'string') continue;
    const v = t.trim().toLowerCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

// Title of the seeded demo exam (see server/src/bootstrap.ts:ensureDemoExam).
// Used to pin the demo: it must stay 'active' and undeletable so first-time
// students always have something to try, regardless of what an admin clicks
// in the room view. Identification is by title because the seed itself is
// the only thing that creates that exact string.
export const DEMO_EXAM_TITLE = 'Šaljivi test: crtani junaci';

// Sentinel thrown when a mutation touches the seeded demo exam. The route
// layer catches by message and returns a 409 with a friendly translation.
export class DemoExamLockedError extends Error {
  constructor() { super('DEMO_EXAM_LOCKED'); }
}

export async function isDemoExamId(examId: string): Promise<boolean> {
  const r = await query<{ title: string }>('SELECT title FROM otisak_exams WHERE id = $1 LIMIT 1', [examId]);
  return r.rows[0]?.title === DEMO_EXAM_TITLE;
}

export async function updateOtisakExamStatus(
  examId: string,
  status: OtisakExam['status']
): Promise<OtisakExam | null> {
  // A finished exam stays finished. We block flips OUT of completed/archived
  // here at the DB layer so no UI button (or stray API call) can reopen them.
  // Allowed transitions: anything -> draft/scheduled/active/completed/archived
  // EXCEPT (completed|archived) -> active.
  //
  // Demo exam: pinned to 'active'. Any move to completed/archived throws so
  // the demo can't be accidentally retired by clicking "Završi" in the room.
  const cur = await query<{ status: string; title: string }>(
    'SELECT status, title FROM otisak_exams WHERE id = $1',
    [examId],
  );
  const row = cur.rows[0];
  if (!row) return null;

  if (row.title === DEMO_EXAM_TITLE && (status === 'completed' || status === 'archived')) {
    throw new DemoExamLockedError();
  }
  if (status === 'active' && (row.status === 'completed' || row.status === 'archived')) {
    return null;
  }
  const result = await query<OtisakExam>(
    `UPDATE otisak_exams SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [examId, status]
  );
  return result.rows[0] || null;
}

export async function updateOtisakExam(
  examId: string,
  data: Partial<Pick<OtisakExam, 'title' | 'description' | 'duration_minutes' | 'pass_threshold' | 'has_pass_threshold' | 'allow_review' | 'shuffle_questions' | 'shuffle_answers' | 'is_public' | 'self_service' | 'repeat_interval_minutes' | 'auto_activate' | 'negative_points_enabled' | 'negative_points_value' | 'negative_points_threshold' | 'partial_scoring' | 'exam_mode' | 'subject_id' | 'tags'>>
): Promise<OtisakExam | null> {
  // Block edits that would break the demo lock. The demo is identified by
  // its title, so renaming it would orphan the lock and let the demo be
  // finished or deleted. Moving it to a different subject would also break
  // the Demo subject scoping. Other fields stay editable so admins can tune
  // duration / pass-threshold / etc on the demo.
  if (data.title !== undefined || data.subject_id !== undefined) {
    if (await isDemoExamId(examId)) {
      throw new DemoExamLockedError();
    }
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.title !== undefined) { updates.push(`title = $${idx++}`); values.push(data.title); }
  if (data.description !== undefined) { updates.push(`description = $${idx++}`); values.push(data.description); }
  if (data.duration_minutes !== undefined) { updates.push(`duration_minutes = $${idx++}`); values.push(data.duration_minutes); }
  if (data.pass_threshold !== undefined) { updates.push(`pass_threshold = $${idx++}`); values.push(data.pass_threshold); }
  if (data.has_pass_threshold !== undefined) { updates.push(`has_pass_threshold = $${idx++}`); values.push(data.has_pass_threshold); }
  if (data.allow_review !== undefined) { updates.push(`allow_review = $${idx++}`); values.push(data.allow_review); }
  if (data.shuffle_questions !== undefined) { updates.push(`shuffle_questions = $${idx++}`); values.push(data.shuffle_questions); }
  if (data.shuffle_answers !== undefined) { updates.push(`shuffle_answers = $${idx++}`); values.push(data.shuffle_answers); }
  if (data.is_public !== undefined) { updates.push(`is_public = $${idx++}`); values.push(data.is_public); }
  if (data.self_service !== undefined) { updates.push(`self_service = $${idx++}`); values.push(data.self_service); }
  if (data.repeat_interval_minutes !== undefined) { updates.push(`repeat_interval_minutes = $${idx++}`); values.push(data.repeat_interval_minutes); }
  if (data.auto_activate !== undefined) { updates.push(`auto_activate = $${idx++}`); values.push(data.auto_activate); }
  if (data.negative_points_enabled !== undefined) { updates.push(`negative_points_enabled = $${idx++}`); values.push(data.negative_points_enabled); }
  if (data.negative_points_value !== undefined) { updates.push(`negative_points_value = $${idx++}`); values.push(data.negative_points_value); }
  if (data.negative_points_threshold !== undefined) { updates.push(`negative_points_threshold = $${idx++}`); values.push(data.negative_points_threshold); }
  if (data.partial_scoring !== undefined) { updates.push(`partial_scoring = $${idx++}`); values.push(data.partial_scoring); }
  if (data.tags !== undefined) { updates.push(`tags = $${idx++}`); values.push(normaliseTags(data.tags)); }
  if (data.exam_mode !== undefined) {
    // Only allow the two known modes; don't trust the client to send anything else.
    const mode = data.exam_mode === 'practice' ? 'practice' : 'real';
    updates.push(`exam_mode = $${idx++}`); values.push(mode);
    // Keep the practice-side flags in sync — practice exams are self-service + public,
    // real exams are not. Skips when the caller explicitly set those fields above.
    if (data.self_service === undefined) {
      updates.push(`self_service = $${idx++}`); values.push(mode === 'practice');
    }
    if (data.is_public === undefined) {
      updates.push(`is_public = $${idx++}`); values.push(mode === 'practice');
    }
  }
  if (data.subject_id !== undefined) { updates.push(`subject_id = $${idx++}`); values.push(data.subject_id); }

  if (updates.length === 0) return null;
  values.push(examId);
  const result = await query<OtisakExam>(
    `UPDATE otisak_exams SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

// deleteOtisakExam used to live here. It was removed alongside the DELETE
// /api/otisak/exams route — exams are no longer deletable. Use the
// 'archived' status to take an exam out of the main listing.

// ========================================
// QUESTIONS
// ========================================

export async function getOtisakQuestions(examId: string): Promise<OtisakQuestionWithAnswers[]> {
  const questionsResult = await query<OtisakQuestion>(
    'SELECT * FROM otisak_questions WHERE exam_id = $1 ORDER BY position ASC',
    [examId]
  );
  const questions = questionsResult.rows;
  if (questions.length === 0) return [];

  const questionIds = questions.map((q) => q.id);
  const answersResult = await query<OtisakAnswer>(
    `SELECT * FROM otisak_answers WHERE question_id = ANY($1) ORDER BY position ASC`,
    [questionIds]
  );

  const answersByQuestion = new Map<string, OtisakAnswer[]>();
  for (const a of answersResult.rows) {
    const existing = answersByQuestion.get(a.question_id) || [];
    existing.push(a);
    answersByQuestion.set(a.question_id, existing);
  }

  // multi_answer is read straight off the row now. Authoring (createOtisakQuestion +
  // JSON import) is responsible for setting it correctly — single source of truth in
  // the DB, not derived at read time.
  return questions.map((q) => ({
    ...q,
    answers: answersByQuestion.get(q.id) || [],
  }));
}

// Field length caps. Picked to be generous for legitimate use (a long open-text
// rubric, a verbose code question) but firm enough that a runaway client can't
// bloat the questions table or break read paths that render the text.
const MAX_QUESTION_TEXT_LEN = 8000;
const MAX_QUESTION_CONTENT_LEN = 16000;
const MAX_EXPLANATION_LEN = 4000;
const MAX_AI_INSTRUCTIONS_LEN = 4000;

export async function createOtisakQuestion(
  examId: string,
  data: CreateOtisakQuestionInput
): Promise<OtisakQuestionWithAnswers> {
  if (!data.text || typeof data.text !== 'string' || data.text.length === 0) {
    throw new Error('Question text is required');
  }
  if (data.text.length > MAX_QUESTION_TEXT_LEN) {
    throw new Error(`Question text exceeds ${MAX_QUESTION_TEXT_LEN} characters`);
  }
  if (data.content && data.content.length > MAX_QUESTION_CONTENT_LEN) {
    throw new Error(`Question content exceeds ${MAX_QUESTION_CONTENT_LEN} characters`);
  }
  if (data.explanation && data.explanation.length > MAX_EXPLANATION_LEN) {
    throw new Error(`Explanation exceeds ${MAX_EXPLANATION_LEN} characters`);
  }
  if (data.ai_grading_instructions && data.ai_grading_instructions.length > MAX_AI_INSTRUCTIONS_LEN) {
    throw new Error(`AI grading instructions exceed ${MAX_AI_INSTRUCTIONS_LEN} characters`);
  }

  const posResult = await query<{ max_pos: number }>(
    'SELECT COALESCE(MAX(position), -1)::int as max_pos FROM otisak_questions WHERE exam_id = $1',
    [examId]
  );
  const nextPos = data.position ?? (posResult.rows[0].max_pos + 1);

  // multi_answer resolution: caller's explicit value wins. If omitted, fall back
  // to "any question with 2+ correct answers is multi-select" — matches the
  // pre-column behaviour and the docs for legacy JSON imports.
  const multiAnswer = typeof data.multi_answer === 'boolean'
    ? data.multi_answer
    : (data.answers.filter((a) => a.is_correct).length > 1);

  const qResult = await query<OtisakQuestion>(
    `INSERT INTO otisak_questions (exam_id, type, text, content, points, position, explanation, ai_grading_instructions, multi_answer)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [examId, data.type, data.text, data.content || null, data.points ?? 2, nextPos, data.explanation || null, data.ai_grading_instructions || null, multiAnswer]
  );
  const question = qResult.rows[0];

  const answers: OtisakAnswer[] = [];
  for (let i = 0; i < data.answers.length; i++) {
    const ans = data.answers[i];
    const aResult = await query<OtisakAnswer>(
      `INSERT INTO otisak_answers (question_id, text, is_correct, position)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [question.id, ans.text, ans.is_correct, ans.position ?? i]
    );
    answers.push(aResult.rows[0]);
  }

  return { ...question, answers };
}

// Patch a question in place. Validates the same length caps as create. When
// `answers` is supplied the existing answer rows for the question are wiped
// and reinserted from the patch — keeping diffs of answer ids would force
// callers to track which existing rows to keep, which the inline editor
// doesn't need. Runs in a transaction so a half-applied write can't leave
// the question with mismatched answers.
export async function updateOtisakQuestion(
  questionId: string,
  data: UpdateOtisakQuestionInput
): Promise<OtisakQuestionWithAnswers | null> {
  if (data.text !== undefined) {
    if (!data.text || data.text.length === 0) {
      throw new Error('Question text is required');
    }
    if (data.text.length > MAX_QUESTION_TEXT_LEN) {
      throw new Error(`Question text exceeds ${MAX_QUESTION_TEXT_LEN} characters`);
    }
  }
  if (data.content !== undefined && data.content !== null && data.content.length > MAX_QUESTION_CONTENT_LEN) {
    throw new Error(`Question content exceeds ${MAX_QUESTION_CONTENT_LEN} characters`);
  }
  if (data.explanation !== undefined && data.explanation !== null && data.explanation.length > MAX_EXPLANATION_LEN) {
    throw new Error(`Explanation exceeds ${MAX_EXPLANATION_LEN} characters`);
  }
  if (data.ai_grading_instructions !== undefined && data.ai_grading_instructions !== null && data.ai_grading_instructions.length > MAX_AI_INSTRUCTIONS_LEN) {
    throw new Error(`AI grading instructions exceed ${MAX_AI_INSTRUCTIONS_LEN} characters`);
  }

  return transaction(async (client) => {
    // Build the SET clause dynamically from whatever fields the patch carries.
    // Each entry: column name + value. updated_at is appended unconditionally so
    // the row's mtime moves on every successful patch.
    const setColumns: string[] = [];
    const values: unknown[] = [];
    const push = (col: string, val: unknown) => {
      setColumns.push(`${col} = $${values.length + 1}`);
      values.push(val);
    };
    if (data.text !== undefined) push('text', data.text);
    if (data.content !== undefined) push('content', data.content);
    if (data.points !== undefined) push('points', data.points);
    if (data.position !== undefined) push('position', data.position);
    if (data.explanation !== undefined) push('explanation', data.explanation);
    if (data.ai_grading_instructions !== undefined) push('ai_grading_instructions', data.ai_grading_instructions);
    if (data.multi_answer !== undefined) push('multi_answer', data.multi_answer);

    let question: OtisakQuestion;
    if (setColumns.length > 0) {
      setColumns.push('updated_at = NOW()');
      values.push(questionId);
      const upd = await client.query<OtisakQuestion>(
        `UPDATE otisak_questions SET ${setColumns.join(', ')} WHERE id = $${values.length} RETURNING *`,
        values
      );
      if (upd.rows.length === 0) return null;
      question = upd.rows[0];
    } else {
      const cur = await client.query<OtisakQuestion>('SELECT * FROM otisak_questions WHERE id = $1', [questionId]);
      if (cur.rows.length === 0) return null;
      question = cur.rows[0];
    }

    let answers: OtisakAnswer[];
    if (data.answers !== undefined) {
      // Replace the answer set. Saved attempts reference answers by id via
      // otisak_attempt_answers.selected_answer_id(s); deleting answers here will
      // null those refs (ON DELETE SET NULL) — fine for edits while the exam is
      // a draft, and explicitly the caller's responsibility past that point.
      await client.query('DELETE FROM otisak_answers WHERE question_id = $1', [questionId]);
      answers = [];
      for (let i = 0; i < data.answers.length; i++) {
        const ans = data.answers[i];
        const ins = await client.query<OtisakAnswer>(
          `INSERT INTO otisak_answers (question_id, text, is_correct, position)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [questionId, ans.text, ans.is_correct, ans.position ?? i]
        );
        answers.push(ins.rows[0]);
      }
    } else {
      const a = await client.query<OtisakAnswer>(
        'SELECT * FROM otisak_answers WHERE question_id = $1 ORDER BY position ASC',
        [questionId]
      );
      answers = a.rows;
    }

    return { ...question, answers };
  });
}

export async function deleteOtisakQuestion(questionId: string): Promise<boolean> {
  const result = await query('DELETE FROM otisak_questions WHERE id = $1', [questionId]);
  return (result.rowCount ?? 0) > 0;
}

// ========================================
// ENROLLMENTS
// ========================================

export async function enrollUserInExam(examId: string, userId: string): Promise<OtisakEnrollment> {
  const result = await query<OtisakEnrollment>(
    `INSERT INTO otisak_enrollments (exam_id, user_id)
     VALUES ($1, $2) ON CONFLICT (exam_id, user_id) DO NOTHING RETURNING *`,
    [examId, userId]
  );
  if (!result.rows[0]) {
    const existing = await query<OtisakEnrollment>(
      'SELECT * FROM otisak_enrollments WHERE exam_id = $1 AND user_id = $2',
      [examId, userId]
    );
    return existing.rows[0];
  }
  return result.rows[0];
}

export async function getExamsForUser(userId: string): Promise<OtisakExamWithSubject[]> {
  const result = await query<OtisakExamWithSubject>(
    `SELECT e.*, s.name as subject_name, s.code as subject_code,
            (SELECT COUNT(*)::int FROM otisak_questions q WHERE q.exam_id = e.id) as question_count
     FROM otisak_exams e
     LEFT JOIN otisak_subjects s ON e.subject_id = s.id
     INNER JOIN otisak_enrollments en ON en.exam_id = e.id
     WHERE en.user_id = $1 AND e.status IN ('scheduled', 'active', 'completed')
       AND e.parent_exam_id IS NULL
       AND e.exam_mode = 'real'
     ORDER BY e.scheduled_at DESC NULLS LAST, e.created_at DESC`,
    [userId]
  );
  return result.rows;
}

// ========================================
// ATTEMPTS
// ========================================

export async function startExamAttempt(
  examId: string,
  userId: string,
  meta?: { ip_address?: string; user_agent?: string },
  isPractice?: boolean
): Promise<OtisakAttempt> {
  const shuffleSeed = Math.floor(Math.random() * 2147483647);
  const result = await query<OtisakAttempt>(
    `INSERT INTO otisak_attempts (exam_id, user_id, ip_address, user_agent, is_practice, shuffle_seed)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [examId, userId, meta?.ip_address || null, meta?.user_agent || null, isPractice ?? false, shuffleSeed]
  );
  return result.rows[0];
}

export async function getActiveAttempt(
  examId: string,
  userId: string
): Promise<OtisakAttempt | null> {
  const result = await query<OtisakAttempt>(
    `SELECT * FROM otisak_attempts
     WHERE exam_id = $1 AND user_id = $2 AND submitted = FALSE
     ORDER BY started_at DESC LIMIT 1`,
    [examId, userId]
  );
  return result.rows[0] || null;
}

export async function autoFinishIfExpired(
  attempt: OtisakAttempt
): Promise<OtisakAttempt | null> {
  if (attempt.submitted) return null;
  const exam = await getOtisakExamById(attempt.exam_id);
  if (!exam) return null;

  // Use admin-controlled exam_started_at as the timer reference when present, otherwise fall back to attempt start
  const startMs = exam.exam_started_at
    ? new Date(exam.exam_started_at).getTime()
    : new Date(attempt.started_at).getTime();
  const extraSec = Number(exam.extra_seconds ?? 0);
  const durationMs = (exam.duration_minutes * 60 + extraSec) * 1000;
  const now = Date.now();

  // Discount any time the exam has spent in lockdown (paused)
  const { getTotalLockdownPauseSeconds } = await import('./settings');
  const pauseMs = (await getTotalLockdownPauseSeconds(exam.id)) * 1000;

  if (now - pauseMs >= startMs + durationMs) {
    return finishAttempt(attempt.id, exam.duration_minutes * 60 + extraSec);
  }
  return null;
}

export async function getSavedAnswers(
  attemptId: string
): Promise<Array<{ question_id: string; selected_answer_ids: string[]; text_answer: string | null }>> {
  const result = await query<{ question_id: string; selected_answer_id: string | null; selected_answer_ids: string[] | null; text_answer: string | null }>(
    'SELECT question_id, selected_answer_id, selected_answer_ids, text_answer FROM otisak_attempt_answers WHERE attempt_id = $1',
    [attemptId]
  );
  return result.rows.map((row) => ({
    question_id: row.question_id,
    selected_answer_ids: row.selected_answer_ids?.length
      ? row.selected_answer_ids
      : row.selected_answer_id
        ? [row.selected_answer_id]
        : [],
    text_answer: row.text_answer,
  }));
}

export async function submitAttemptAnswers(
  attemptId: string,
  answers: SubmitAttemptAnswerInput[]
): Promise<void> {
  const examCheck = await query<{ partial_scoring: boolean; exam_id: string }>(
    `SELECT e.partial_scoring, a.exam_id
     FROM otisak_attempts a
     JOIN otisak_exams e ON e.id = a.exam_id
     WHERE a.id = $1`,
    [attemptId]
  );
  const partialScoring = examCheck.rows[0]?.partial_scoring ?? false;
  const attemptExamId = examCheck.rows[0]?.exam_id;
  if (!attemptExamId) return;

  // Drop any answer whose question_id does not belong to this attempt's exam.
  // Without this, a student could POST answers referencing a question_id from
  // a different exam — the row would still get inserted and counted toward
  // their score.
  let safeAnswers = answers;
  if (answers.length > 0) {
    const ids = answers.map((a) => a.question_id).filter(Boolean);
    if (ids.length > 0) {
      const valid = await query<{ id: string }>(
        `SELECT id FROM otisak_questions WHERE exam_id = $1 AND id = ANY($2::uuid[])`,
        [attemptExamId, ids],
      );
      const validSet = new Set(valid.rows.map((r) => r.id));
      safeAnswers = answers.filter((a) => validSet.has(a.question_id));
      if (safeAnswers.length === 0) return;
    }
  }

  for (const ans of safeAnswers) {
    if (ans.text_answer !== undefined && ans.text_answer !== null) {
      const qInfo = await query<{ type: string; content: string | null; points: number }>(
        `SELECT type, content, points FROM otisak_questions WHERE id = $1`,
        [ans.question_id]
      );
      const qType = qInfo.rows[0]?.type;
      const qContent = qInfo.rows[0]?.content;
      const qPoints = qInfo.rows[0]?.points ?? 0;

      if (qType === 'ordering' && qContent) {
        // Strict all-or-nothing: any item out of place → 0. partial_scoring no
        // longer relaxes this for compound types (per the "any wrong = 0" rule).
        let pointsAwarded = 0;
        try {
          const correctData = JSON.parse(qContent);
          const correctOrder: string[] = correctData.items || [];
          const studentOrder: string[] = JSON.parse(ans.text_answer || '[]');
          if (JSON.stringify(studentOrder) === JSON.stringify(correctOrder)) {
            pointsAwarded = qPoints;
          }
        } catch { /* invalid JSON */ }
        await query(
          `INSERT INTO otisak_attempt_answers (attempt_id, question_id, text_answer, points_awarded)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (attempt_id, question_id)
           DO UPDATE SET text_answer = $3, points_awarded = $4, answered_at = NOW()`,
          [attemptId, ans.question_id, ans.text_answer, pointsAwarded]
        );
        continue;
      }

      if (qType === 'matching' && qContent) {
        // Strict all-or-nothing: any mismatch → 0.
        let pointsAwarded = 0;
        try {
          const correctData = JSON.parse(qContent);
          const leftArr: string[] = correctData.left || [];
          const rightArr: string[] = correctData.right || [];
          const studentMatches: Record<string, string> = JSON.parse(ans.text_answer || '{}');
          const totalPairs = leftArr.length;
          let correctCount = 0;
          for (let i = 0; i < leftArr.length; i++) {
            if (studentMatches[leftArr[i]] === rightArr[i]) correctCount++;
          }
          if (totalPairs > 0 && correctCount === totalPairs) {
            pointsAwarded = qPoints;
          }
        } catch { /* invalid JSON */ }
        await query(
          `INSERT INTO otisak_attempt_answers (attempt_id, question_id, text_answer, points_awarded)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (attempt_id, question_id)
           DO UPDATE SET text_answer = $3, points_awarded = $4, answered_at = NOW()`,
          [attemptId, ans.question_id, ans.text_answer, pointsAwarded]
        );
        continue;
      }

      if (qType === 'fill_blank' && qContent) {
        // Strict all-or-nothing: any blank wrong or empty → 0.
        let pointsAwarded = 0;
        try {
          const correctData = JSON.parse(qContent);
          const blanks: Array<{ id: string; correct: string }> = correctData.blanks || [];
          const studentFills: Record<string, string> = JSON.parse(ans.text_answer || '{}');
          const totalBlanks = blanks.length;
          let correctCount = 0;
          for (const blank of blanks) {
            const studentVal = (studentFills[blank.id] || '').trim().toLowerCase();
            const correctVal = (blank.correct || '').trim().toLowerCase();
            if (studentVal === correctVal) correctCount++;
          }
          if (totalBlanks > 0 && correctCount === totalBlanks) {
            pointsAwarded = qPoints;
          }
        } catch { /* invalid JSON */ }
        await query(
          `INSERT INTO otisak_attempt_answers (attempt_id, question_id, text_answer, points_awarded)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (attempt_id, question_id)
           DO UPDATE SET text_answer = $3, points_awarded = $4, answered_at = NOW()`,
          [attemptId, ans.question_id, ans.text_answer, pointsAwarded]
        );
        continue;
      }

      // open_text: AI graded
      await query(
        `INSERT INTO otisak_attempt_answers (attempt_id, question_id, text_answer, points_awarded, ai_grading_status)
         VALUES ($1, $2, $3, 0, 'pending')
         ON CONFLICT (attempt_id, question_id)
         DO UPDATE SET text_answer = $3, points_awarded = 0, ai_grading_status = 'pending', answered_at = NOW()`,
        [attemptId, ans.question_id, ans.text_answer]
      );
      continue;
    }

    const selectedIds: string[] = ans.selected_answer_ids && ans.selected_answer_ids.length > 0
      ? ans.selected_answer_ids
      : ans.selected_answer_id
        ? [ans.selected_answer_id]
        : [];

    let pointsAwarded = 0;

    if (selectedIds.length > 0) {
      const allAnswers = await query<{ id: string; is_correct: boolean; points: number }>(
        `SELECT a.id, a.is_correct, q.points
         FROM otisak_answers a
         JOIN otisak_questions q ON a.question_id = q.id
         WHERE a.question_id = $1`,
        [ans.question_id]
      );

      if (allAnswers.rows.length > 0) {
        const questionPoints = allAnswers.rows[0].points;
        const correctIds = new Set(allAnswers.rows.filter((a) => a.is_correct).map((a) => a.id));
        const totalCorrect = correctIds.size;
        const selectedSet = new Set(selectedIds);

        if (totalCorrect <= 1) {
          if (selectedIds.length === 1 && correctIds.has(selectedIds[0])) {
            pointsAwarded = questionPoints;
          }
        } else {
          // Multi-correct rule: any wrong selection → 0, full stop. Picking all
          // correct (and only correct) → full points. Picking a strict subset
          // of correct with no wrong → proportional credit IFF partial_scoring
          // is on; without the flag the question is all-or-nothing.
          const correctSelected = [...selectedSet].filter((id) => correctIds.has(id)).length;
          const wrongSelected = [...selectedSet].filter((id) => !correctIds.has(id)).length;
          if (wrongSelected === 0) {
            if (correctSelected === totalCorrect) {
              pointsAwarded = questionPoints;
            } else if (partialScoring && correctSelected > 0) {
              pointsAwarded = Math.round((correctSelected / totalCorrect) * questionPoints * 100) / 100;
            }
          }
        }
      }
    }

    const primarySelectedId = selectedIds.length > 0 ? selectedIds[0] : null;

    await query(
      `INSERT INTO otisak_attempt_answers (attempt_id, question_id, selected_answer_id, selected_answer_ids, points_awarded)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (attempt_id, question_id)
       DO UPDATE SET selected_answer_id = $3, selected_answer_ids = $4, points_awarded = $5, answered_at = NOW()`,
      [attemptId, ans.question_id, primarySelectedId, selectedIds, pointsAwarded]
    );
  }
}

// Replay scoring for every stored attempt of an exam against the *current*
// question shape (points, correct flags, type-specific content). Used after
// an admin edits questions on a completed exam — the historical record of
// what each student picked / typed stays the same, but `points_awarded`
// and the attempt totals are recomputed from scratch using the new scale.
//
// Notes:
//   - Open-text answers carry their existing `points_awarded` and AI status
//     through unchanged. Admin can re-run AI grading separately.
//   - Negative-points logic mirrors finishAttempt() so totals stay consistent
//     whether they were produced by a normal submit or a rescore.
//   - Whole exam runs in one transaction so a partial failure rolls back.
//
// Returns the number of attempts whose totals were updated.
export async function rescoreExam(examId: string): Promise<number> {
  return transaction(async (client) => {
    const examRes = await client.query<{
      partial_scoring: boolean;
      negative_points_enabled: boolean;
      negative_points_value: number;
      negative_points_threshold: number;
    }>(
      `SELECT partial_scoring, negative_points_enabled,
              negative_points_value, negative_points_threshold
       FROM otisak_exams WHERE id = $1`,
      [examId]
    );
    const exam = examRes.rows[0];
    if (!exam) return 0;
    const partialScoring = !!exam.partial_scoring;

    // Snapshot of all questions for this exam plus their canonical answer rows.
    // Keyed for O(1) lookup inside the per-attempt loop.
    const qRows = await client.query<{ id: string; type: string; content: string | null; points: number }>(
      `SELECT id, type, content, points FROM otisak_questions WHERE exam_id = $1`,
      [examId]
    );
    const questions = new Map(qRows.rows.map((q) => [q.id, q] as const));
    const maxPoints = qRows.rows.reduce((s, q) => s + Number(q.points || 0), 0);

    const aRows = await client.query<{ question_id: string; id: string; is_correct: boolean }>(
      `SELECT a.question_id, a.id, a.is_correct
       FROM otisak_answers a
       JOIN otisak_questions q ON q.id = a.question_id
       WHERE q.exam_id = $1`,
      [examId]
    );
    const answersByQuestion = new Map<string, Array<{ id: string; is_correct: boolean }>>();
    for (const a of aRows.rows) {
      const list = answersByQuestion.get(a.question_id) ?? [];
      list.push({ id: a.id, is_correct: a.is_correct });
      answersByQuestion.set(a.question_id, list);
    }

    // All submitted attempts. Live (not yet submitted) attempts are excluded —
    // a rescore on an in-progress student wouldn't be meaningful and they'll
    // be re-scored normally at submit.
    const attemptRes = await client.query<{ id: string }>(
      `SELECT id FROM otisak_attempts WHERE exam_id = $1 AND submitted = TRUE`,
      [examId]
    );

    let rescored = 0;
    for (const { id: attemptId } of attemptRes.rows) {
      const aaRes = await client.query<{
        question_id: string;
        selected_answer_id: string | null;
        selected_answer_ids: string[];
        text_answer: string | null;
        points_awarded: number;
        ai_grading_status: string | null;
      }>(
        `SELECT question_id, selected_answer_id, selected_answer_ids, text_answer,
                points_awarded, ai_grading_status
         FROM otisak_attempt_answers WHERE attempt_id = $1`,
        [attemptId]
      );

      for (const aa of aaRes.rows) {
        const q = questions.get(aa.question_id);
        if (!q) continue; // question was deleted; row stays but contributes 0
        let pointsAwarded = 0;

        if (q.type === 'ordering' && q.content) {
          try {
            const correctData = JSON.parse(q.content);
            const correctOrder: string[] = correctData.items || [];
            const studentOrder: string[] = JSON.parse(aa.text_answer || '[]');
            if (correctOrder.length > 0 && JSON.stringify(studentOrder) === JSON.stringify(correctOrder)) {
              pointsAwarded = Number(q.points || 0);
            }
          } catch { /* invalid JSON → 0 */ }
        } else if (q.type === 'matching' && q.content) {
          try {
            const correctData = JSON.parse(q.content);
            const leftArr: string[] = correctData.left || [];
            const rightArr: string[] = correctData.right || [];
            const studentMatches: Record<string, string> = JSON.parse(aa.text_answer || '{}');
            const totalPairs = leftArr.length;
            let correctCount = 0;
            for (let i = 0; i < leftArr.length; i++) {
              if (studentMatches[leftArr[i]] === rightArr[i]) correctCount++;
            }
            if (totalPairs > 0 && correctCount === totalPairs) {
              pointsAwarded = Number(q.points || 0);
            }
          } catch { /* invalid JSON → 0 */ }
        } else if (q.type === 'fill_blank' && q.content) {
          try {
            const correctData = JSON.parse(q.content);
            const blanks: Array<{ id: string; correct: string }> = correctData.blanks || [];
            const studentFills: Record<string, string> = JSON.parse(aa.text_answer || '{}');
            const totalBlanks = blanks.length;
            let correctCount = 0;
            for (const blank of blanks) {
              const studentVal = (studentFills[blank.id] || '').trim().toLowerCase();
              const correctVal = (blank.correct || '').trim().toLowerCase();
              if (studentVal === correctVal) correctCount++;
            }
            if (totalBlanks > 0 && correctCount === totalBlanks) {
              pointsAwarded = Number(q.points || 0);
            }
          } catch { /* invalid JSON → 0 */ }
        } else if (q.type === 'open_text') {
          // Carry over the AI-graded score (or 0 if still pending). Rescoring
          // shouldn't overwrite what the grader produced; admin can re-run AI
          // grading separately if they want a fresh pass.
          pointsAwarded = Number(aa.points_awarded || 0);
        } else {
          // Multi-choice (text/code/image). Same rules as submitAttemptAnswers:
          // any wrong pick → 0. All correct → full. Subset of correct with no
          // wrong → proportional iff partial_scoring.
          const selectedIds = (aa.selected_answer_ids && aa.selected_answer_ids.length > 0)
            ? aa.selected_answer_ids
            : (aa.selected_answer_id ? [aa.selected_answer_id] : []);
          const allAnswers = answersByQuestion.get(q.id) ?? [];
          if (selectedIds.length > 0 && allAnswers.length > 0) {
            const questionPoints = Number(q.points || 0);
            const correctIds = new Set(allAnswers.filter((a) => a.is_correct).map((a) => a.id));
            const totalCorrect = correctIds.size;
            const selectedSet = new Set(selectedIds);

            if (totalCorrect <= 1) {
              if (selectedIds.length === 1 && correctIds.has(selectedIds[0])) {
                pointsAwarded = questionPoints;
              }
            } else {
              const correctSelected = [...selectedSet].filter((id) => correctIds.has(id)).length;
              const wrongSelected = [...selectedSet].filter((id) => !correctIds.has(id)).length;
              if (wrongSelected === 0) {
                if (correctSelected === totalCorrect) {
                  pointsAwarded = questionPoints;
                } else if (partialScoring && correctSelected > 0) {
                  pointsAwarded = Math.round((correctSelected / totalCorrect) * questionPoints * 100) / 100;
                }
              }
            }
          }
        }

        await client.query(
          `UPDATE otisak_attempt_answers SET points_awarded = $3
           WHERE attempt_id = $1 AND question_id = $2`,
          [attemptId, aa.question_id, pointsAwarded]
        );
      }

      // Recompute total with the same negative-points logic finishAttempt uses.
      const totalRes = await client.query<{ total: number }>(
        `SELECT COALESCE(SUM(points_awarded), 0)::numeric AS total
         FROM otisak_attempt_answers WHERE attempt_id = $1`,
        [attemptId]
      );
      let total = Number(totalRes.rows[0]?.total ?? 0);
      if (exam.negative_points_enabled && Number(exam.negative_points_value) > 0) {
        const penaltyValue = Number(exam.negative_points_value);
        const threshold = Number(exam.negative_points_threshold) || 1;
        const wrongRes = await client.query<{ wrong_count: number }>(
          `SELECT COUNT(*)::int AS wrong_count
           FROM otisak_attempt_answers aa
           WHERE aa.attempt_id = $1 AND aa.points_awarded = 0
             AND (aa.selected_answer_id IS NOT NULL
                  OR array_length(aa.selected_answer_ids, 1) > 0
                  OR aa.text_answer IS NOT NULL)`,
          [attemptId]
        );
        const wrongCount = wrongRes.rows[0]?.wrong_count ?? 0;
        const penalizable = Math.max(0, wrongCount - (threshold - 1));
        if (penalizable > 0) total = Math.max(0, total - penalizable * penaltyValue);
      }

      await client.query(
        `UPDATE otisak_attempts SET total_points = $2, max_points = $3 WHERE id = $1`,
        [attemptId, total, maxPoints]
      );
      rescored++;
    }

    return rescored;
  });
}

export async function finishAttempt(
  attemptId: string,
  timeSpentSeconds: number
): Promise<OtisakAttempt> {
  // Atomic finish. Race conditions we are guarding against:
  //   (1) Manual submit + timer expiry firing within the same tick.
  //   (2) The expiry watcher background job + a slow user submit.
  //   (3) Two browser tabs racing each other.
  //
  // The previous design read scores OUTSIDE the UPDATE and relied on the
  // `WHERE submitted = FALSE` guard to make the UPDATE a no-op for the loser.
  // That's enough to prevent double-submit, but not to prevent the loser from
  // computing scores against stale rows and overwriting nothing — which still
  // wastes a transaction-worth of work and could trigger the live-stats
  // broadcast twice. Wrapping everything in one transaction with SELECT FOR
  // UPDATE serialises the work and lets the loser early-out cheaply.
  return transaction(async (client) => {
    const lock = await client.query<{ id: string; submitted: boolean }>(
      `SELECT id, submitted FROM otisak_attempts WHERE id = $1 FOR UPDATE`,
      [attemptId]
    );
    const row = lock.rows[0];
    if (!row) {
      // No such attempt: surface the same error a caller would get if they
      // passed a bogus id. Throwing inside transaction() triggers ROLLBACK.
      throw new Error(`Attempt ${attemptId} not found`);
    }
    if (row.submitted) {
      const existing = await client.query<OtisakAttempt>(
        'SELECT * FROM otisak_attempts WHERE id = $1',
        [attemptId]
      );
      return existing.rows[0];
    }

    const totalResult = await client.query<{ total: number; max: number }>(
      `SELECT
         COALESCE(SUM(aa.points_awarded), 0)::numeric as total,
         COALESCE((SELECT SUM(q.points) FROM otisak_questions q
                   WHERE q.exam_id = a.exam_id), 0)::numeric as max
       FROM otisak_attempts a
       LEFT JOIN otisak_attempt_answers aa ON aa.attempt_id = a.id
       WHERE a.id = $1
       GROUP BY a.exam_id`,
      [attemptId]
    );

    let total = Number(totalResult.rows[0]?.total ?? 0);
    const max = Number(totalResult.rows[0]?.max ?? 0);

    const negCheck = await client.query<{
      negative_points_enabled: boolean;
      negative_points_value: number;
      negative_points_threshold: number;
    }>(
      `SELECT e.negative_points_enabled, e.negative_points_value, e.negative_points_threshold
       FROM otisak_attempts a
       JOIN otisak_exams e ON e.id = a.exam_id
       WHERE a.id = $1`,
      [attemptId]
    );

    if (negCheck.rows[0]?.negative_points_enabled && negCheck.rows[0]?.negative_points_value > 0) {
      const penaltyValue = Number(negCheck.rows[0].negative_points_value);
      const threshold = negCheck.rows[0].negative_points_threshold || 1;
      const wrongResult = await client.query<{ wrong_count: number }>(
        `SELECT COUNT(*)::int as wrong_count
         FROM otisak_attempt_answers aa
         WHERE aa.attempt_id = $1 AND aa.points_awarded = 0
           AND (aa.selected_answer_id IS NOT NULL OR array_length(aa.selected_answer_ids, 1) > 0)`,
        [attemptId]
      );
      const wrongCount = wrongResult.rows[0]?.wrong_count ?? 0;
      const penalizableCount = Math.max(0, wrongCount - (threshold - 1));
      if (penalizableCount > 0) {
        total = Math.max(0, total - penalizableCount * penaltyValue);
      }
    }

    const pendingAiCheck = await client.query<{ pending_count: number }>(
      `SELECT COUNT(*)::int as pending_count FROM otisak_attempt_answers
       WHERE attempt_id = $1 AND ai_grading_status = 'pending'`,
      [attemptId]
    );
    const hasAiPending = (pendingAiCheck.rows[0]?.pending_count ?? 0) > 0;

    const result = await client.query<OtisakAttempt>(
      `UPDATE otisak_attempts
       SET submitted = TRUE, finished_at = NOW(),
           total_points = $2, max_points = $3, time_spent_seconds = $4, xp_earned = 0,
           ai_grading_status = $5
       WHERE id = $1 RETURNING *`,
      [attemptId, total, max, timeSpentSeconds, hasAiPending ? 'pending' : null]
    );
    return result.rows[0];
  });
}

export async function forceFinishAttemptById(attemptId: string): Promise<OtisakAttempt | null> {
  const attemptCheck = await query<OtisakAttempt>(
    'SELECT * FROM otisak_attempts WHERE id = $1 AND submitted = FALSE',
    [attemptId]
  );
  if (!attemptCheck.rows[0]) return null;
  const timeSpent = Math.floor((Date.now() - new Date(attemptCheck.rows[0].started_at).getTime()) / 1000);
  return finishAttempt(attemptId, timeSpent);
}

// Seeded PRNG (mulberry32)
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Exported so the student-facing `GET /exams/:id` route can produce the same
// per-student ordering that `getAttemptResults` uses below. Single source of
// truth for the algorithm keeps the student's view and the admin's results
// view (and the per-student PDF) in lockstep.
export function shuffleArray<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  const rand = seededRandom(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function getAttemptResults(attemptId: string): Promise<OtisakExamResults | null> {
  const attemptResult = await query<OtisakAttempt>(
    'SELECT * FROM otisak_attempts WHERE id = $1',
    [attemptId]
  );
  if (!attemptResult.rows[0]) return null;
  const attempt = attemptResult.rows[0];

  const examResult = await query<OtisakExam>(
    'SELECT * FROM otisak_exams WHERE id = $1',
    [attempt.exam_id]
  );
  if (!examResult.rows[0]) return null;
  const exam = examResult.rows[0];

  let questions = await getOtisakQuestions(exam.id);

  const seed = attempt.shuffle_seed;
  if (seed) {
    questions = shuffleArray(questions, seed);
    questions = questions.map((q, idx) => ({
      ...q,
      answers: shuffleArray(q.answers, seed + idx + 1),
    }));
  }

  const attemptAnswersResult = await query<OtisakAttemptAnswer>(
    'SELECT * FROM otisak_attempt_answers WHERE attempt_id = $1',
    [attemptId]
  );
  const attemptAnswersMap = new Map<string, OtisakAttemptAnswer>();
  for (const aa of attemptAnswersResult.rows) {
    attemptAnswersMap.set(aa.question_id, aa);
  }

  return {
    attempt,
    exam,
    questions: questions.map((q) => {
      const aa = attemptAnswersMap.get(q.id);
      const correctAnswers = q.answers.filter((a) => a.is_correct);
      const correctAnswerIds = correctAnswers.map((a) => a.id);
      const selectedAnswerIds: string[] = aa?.selected_answer_ids?.length
        ? aa.selected_answer_ids
        : aa?.selected_answer_id
          ? [aa.selected_answer_id]
          : [];
      return {
        question: q,
        answers: q.answers,
        selected_answer_id: aa?.selected_answer_id || null,
        selected_answer_ids: selectedAnswerIds,
        points_awarded: Number(aa?.points_awarded ?? 0),
        correct_answer_id: correctAnswerIds[0] || null,
        correct_answer_ids: correctAnswerIds,
        text_answer: aa?.text_answer || null,
        ai_grading_status: aa?.ai_grading_status || null,
        ai_feedback: aa?.ai_feedback || null,
      };
    }),
  };
}

export async function getUserAttempts(userId: string, mode?: string | null): Promise<OtisakAttemptWithExam[]> {
  let sql = `SELECT a.*, e.title as exam_title, e.pass_threshold, e.has_pass_threshold, s.name as subject_name
     FROM otisak_attempts a
     JOIN otisak_exams e ON a.exam_id = e.id
     LEFT JOIN otisak_subjects s ON e.subject_id = s.id
     WHERE a.user_id = $1`;
  const params: unknown[] = [userId];

  if (mode === 'practice') {
    sql += ' AND a.is_practice = TRUE';
  } else if (mode === 'real') {
    sql += ' AND a.is_practice = FALSE';
  }

  sql += ' ORDER BY a.started_at DESC';
  const result = await query<OtisakAttemptWithExam>(sql, params);
  return result.rows;
}

// ========================================
// BULK ENROLLMENT
// ========================================

export async function enrollUsersByPattern(examId: string, pattern: string): Promise<number> {
  const result = await query(
    `INSERT INTO otisak_enrollments (exam_id, user_id)
     SELECT $1, u.id FROM users u
     WHERE u.index_number IS NOT NULL AND u.index_number ILIKE $2
     ON CONFLICT (exam_id, user_id) DO NOTHING`,
    [examId, `%${pattern}%`]
  );
  return result.rowCount ?? 0;
}

// Hard cap on how many index_number patterns we generate per call. A real
// student cohort is at most a few hundred per course/year; anything larger
// is almost certainly a typo'd range. The cap also keeps the patterns array
// (and ANY($2::text[]) Postgres parameter) from blowing up in pathological
// inputs like fromNumber=1, toNumber=999999.
const MAX_ENROLLMENT_RANGE = 2000;

export async function enrollByCourseAndYear(
  examId: string,
  courseCode: string,
  year: number,
  fromNumber?: number,
  toNumber?: number,
): Promise<number> {
  // courseCode is interpolated into LIKE / equality patterns below. It comes
  // from admin input and is parameterised, but we still constrain its shape
  // to avoid pattern-matching surprises (e.g. accidental wildcard chars).
  if (!/^[a-z0-9]{1,10}$/i.test(courseCode)) {
    throw new Error('Invalid course code (1-10 alphanumeric chars expected)');
  }
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error('Invalid year');
  }
  if (fromNumber !== undefined && toNumber !== undefined) {
    if (!Number.isInteger(fromNumber) || !Number.isInteger(toNumber)) {
      throw new Error('Range bounds must be integers');
    }
    if (fromNumber < 1 || toNumber < fromNumber) {
      throw new Error('Invalid range');
    }
    if (toNumber - fromNumber + 1 > MAX_ENROLLMENT_RANGE) {
      throw new Error(`Range exceeds maximum of ${MAX_ENROLLMENT_RANGE} students`);
    }
    const patterns: string[] = [];
    for (let i = fromNumber; i <= toNumber; i++) {
      patterns.push(`${courseCode.toUpperCase()} ${i}/${year}`);
    }
    if (patterns.length === 0) return 0;
    const result = await query(
      `INSERT INTO otisak_enrollments (exam_id, user_id)
       SELECT $1, u.id FROM users u
       WHERE u.index_number IS NOT NULL AND u.index_number = ANY($2::text[])
       ON CONFLICT (exam_id, user_id) DO NOTHING`,
      [examId, patterns]
    );
    return result.rowCount ?? 0;
  }

  const pattern = `${courseCode.toUpperCase()} %/${year}`;
  const result = await query(
    `INSERT INTO otisak_enrollments (exam_id, user_id)
     SELECT $1, u.id FROM users u
     WHERE u.index_number IS NOT NULL AND u.index_number LIKE $2
     ON CONFLICT (exam_id, user_id) DO NOTHING`,
    [examId, pattern]
  );
  return result.rowCount ?? 0;
}

export async function getExamEnrollments(
  examId: string
): Promise<Array<{ user_id: string; name: string | null; email: string; index_number: string | null; enrolled_at: Date }>> {
  const result = await query(
    `SELECT en.user_id, u.name, u.email, u.index_number, en.enrolled_at
     FROM otisak_enrollments en
     JOIN users u ON en.user_id = u.id
     WHERE en.exam_id = $1
     ORDER BY u.name ASC`,
    [examId]
  );
  return result.rows as Array<{ user_id: string; name: string | null; email: string; index_number: string | null; enrolled_at: Date }>;
}

// ========================================
// TAG RULES
// ========================================

export async function getExamTagRules(examId: string): Promise<OtisakExamTagRule[]> {
  const result = await query<OtisakExamTagRule>(
    'SELECT * FROM otisak_exam_tag_rules WHERE exam_id = $1 ORDER BY position ASC',
    [examId]
  );
  return result.rows;
}

export async function setExamTagRules(
  examId: string,
  rules: CreateOtisakExamTagRuleInput[]
): Promise<OtisakExamTagRule[]> {
  await query('DELETE FROM otisak_exam_tag_rules WHERE exam_id = $1', [examId]);
  const results: OtisakExamTagRule[] = [];
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const result = await query<OtisakExamTagRule>(
      `INSERT INTO otisak_exam_tag_rules (exam_id, tag, question_count, points_per_question, position)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [examId, rule.tag, rule.question_count, rule.points_per_question ?? 2, i]
    );
    results.push(result.rows[0]);
  }
  return results;
}

// ========================================
// QUESTION BANK GENERATION
// ========================================

export async function generateQuestionsFromBank(
  examId: string,
  subjectId: string,
  tagRules: OtisakExamTagRule[]
): Promise<OtisakQuestionWithAnswers[]> {
  const generatedQuestions: OtisakQuestionWithAnswers[] = [];
  const usedBankQuestionIds = new Set<string>();
  const usedQuestionTexts = new Set<string>();

  for (const rule of tagRules) {
    const extraFactor = Math.min(rule.question_count * 3, rule.question_count + 50);
    const excludeIds = Array.from(usedBankQuestionIds);
    const isWildcard = rule.tag === '*';

    const bankQuestions = await query<{
      id: string; type: string; text: string;
      code_snippet: string | null; code_language: string | null; image_url: string | null;
    }>(
      `SELECT id, type, text, code_snippet, code_language, image_url
       FROM otisak_question_bank
       WHERE subject_id = $1
         ${isWildcard ? '' : `AND $2 = ANY(tags)`}
         ${excludeIds.length > 0 ? `AND id != ALL($${isWildcard ? 3 : 4}::uuid[])` : ''}
       ORDER BY RANDOM()
       LIMIT $${isWildcard ? 2 : 3}`,
      isWildcard
        ? (excludeIds.length > 0 ? [subjectId, extraFactor, excludeIds] : [subjectId, extraFactor])
        : (excludeIds.length > 0 ? [subjectId, rule.tag, extraFactor, excludeIds] : [subjectId, rule.tag, extraFactor])
    );

    let picked = 0;
    for (const bq of bankQuestions.rows) {
      if (picked >= rule.question_count) break;
      if (usedBankQuestionIds.has(bq.id)) continue;
      const normalizedText = bq.text.trim().toLowerCase();
      if (usedQuestionTexts.has(normalizedText)) continue;

      usedBankQuestionIds.add(bq.id);
      usedQuestionTexts.add(normalizedText);
      picked++;

      const position = generatedQuestions.length;
      const content = bq.code_snippet || bq.image_url || null;

      const qResult = await query<OtisakQuestion>(
        `INSERT INTO otisak_questions (exam_id, type, text, content, points, position, bank_question_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [examId, bq.type, bq.text, content, rule.points_per_question, position, bq.id]
      );
      const question = qResult.rows[0];

      const bankAnswers = await query<{ text: string; is_correct: boolean; position: number }>(
        `SELECT text, is_correct, position FROM otisak_question_bank_answers
         WHERE question_id = $1 ORDER BY position ASC`,
        [bq.id]
      );

      const answers: OtisakAnswer[] = [];
      for (const ba of bankAnswers.rows) {
        const aResult = await query<OtisakAnswer>(
          `INSERT INTO otisak_answers (question_id, text, is_correct, position)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [question.id, ba.text, ba.is_correct, ba.position]
        );
        answers.push(aResult.rows[0]);
      }
      generatedQuestions.push({ ...question, answers });
    }
  }
  return generatedQuestions;
}

export async function copyQuestionsFromTemplate(
  templateExamId: string,
  childExamId: string
): Promise<OtisakQuestionWithAnswers[]> {
  const templateQuestions = await getOtisakQuestions(templateExamId);
  const copiedQuestions: OtisakQuestionWithAnswers[] = [];

  for (const tq of templateQuestions) {
    const qResult = await query<OtisakQuestion>(
      `INSERT INTO otisak_questions (exam_id, type, text, content, points, position)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [childExamId, tq.type, tq.text, tq.content, tq.points, tq.position]
    );
    const question = qResult.rows[0];

    const answers: OtisakAnswer[] = [];
    for (const ta of tq.answers) {
      const aResult = await query<OtisakAnswer>(
        `INSERT INTO otisak_answers (question_id, text, is_correct, position)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [question.id, ta.text, ta.is_correct, ta.position]
      );
      answers.push(aResult.rows[0]);
    }
    copiedQuestions.push({ ...question, answers });
  }
  return copiedQuestions;
}

// ========================================
// PRACTICE INSTANCES
// ========================================

export async function createPracticeInstance(
  templateExamId: string,
  userId: string,
  meta?: { ip_address?: string; user_agent?: string }
): Promise<{ exam: OtisakExam; attempt: OtisakAttempt; questions: OtisakQuestionWithAnswers[] }> {
  const template = await getOtisakExamById(templateExamId);
  if (!template) throw new Error('Template exam not found');
  if (!template.subject_id) throw new Error('Template exam has no subject');

  const childResult = await query<OtisakExam>(
    `INSERT INTO otisak_exams (
      title, subject_id, description, duration_minutes,
      allow_review, shuffle_questions, shuffle_answers, pass_threshold,
      created_by, exam_mode, status, parent_exam_id, uses_question_bank, self_service,
      negative_points_enabled, negative_points_value, negative_points_threshold
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'practice', 'active', $10, TRUE, FALSE, $11, $12, $13)
    RETURNING *`,
    [
      template.title, template.subject_id, template.description, template.duration_minutes,
      true, template.shuffle_questions, template.shuffle_answers, template.pass_threshold,
      template.created_by, templateExamId,
      template.negative_points_enabled, template.negative_points_value, template.negative_points_threshold,
    ]
  );
  const childExam = childResult.rows[0];

  let questions: OtisakQuestionWithAnswers[];
  if (template.uses_question_bank) {
    const tagRules = await getExamTagRules(templateExamId);
    if (tagRules.length > 0) {
      questions = await generateQuestionsFromBank(childExam.id, template.subject_id, tagRules);
    } else {
      questions = await copyQuestionsFromTemplate(templateExamId, childExam.id);
    }
  } else {
    questions = await copyQuestionsFromTemplate(templateExamId, childExam.id);
  }

  await enrollUserInExam(childExam.id, userId);
  const attempt = await startExamAttempt(childExam.id, userId, meta, true);

  return { exam: childExam, attempt, questions };
}

// ========================================
// SELF-SERVICE PRACTICE LISTING
// ========================================

export async function getSelfServicePracticeExams(
  userId: string,
  subjectId?: string
): Promise<OtisakExamWithSubject[]> {
  let sql = `
    SELECT e.*, s.name as subject_name, s.code as subject_code,
           0 as question_count
    FROM otisak_exams e
    LEFT JOIN otisak_subjects s ON e.subject_id = s.id
    WHERE e.exam_mode = 'practice'
      AND e.self_service = TRUE
      AND e.parent_exam_id IS NULL
      AND e.status IN ('active', 'scheduled')
      AND (
        (e.is_public = TRUE)
        OR EXISTS (SELECT 1 FROM otisak_enrollments en WHERE en.exam_id = e.id AND en.user_id = $1)
      )
  `;
  const params: unknown[] = [userId];

  if (subjectId) {
    params.push(subjectId);
    sql += ` AND e.subject_id = $${params.length}`;
  }

  sql += ' ORDER BY e.created_at DESC';
  const result = await query<OtisakExamWithSubject>(sql, params);
  return result.rows;
}

// ========================================
// ADMIN: Results summary
// ========================================

export async function getExamAttemptsSummary(
  examId: string
): Promise<Array<{
  user_id: string;
  user_name: string | null;
  user_email: string;
  index_number: string | null;
  total_points: number;
  max_points: number;
  submitted: boolean;
  started_at: Date;
  finished_at: Date | null;
  time_spent_seconds: number;
}>> {
  // Non-student attempts (assistant or admin opening the exam to test it,
  // for example) are excluded from the listing. They count as test traffic
  // and shouldn't appear as real results.
  const result = await query(
    `SELECT a.user_id, u.name as user_name, u.email as user_email, u.index_number,
            a.total_points, a.max_points, a.submitted, a.started_at, a.finished_at, a.time_spent_seconds
     FROM otisak_attempts a
     JOIN users u ON a.user_id = u.id
     WHERE u.role = 'student'
       AND (
         a.exam_id = $1
         OR a.exam_id IN (SELECT id FROM otisak_exams WHERE parent_exam_id = $1)
       )
     ORDER BY a.total_points DESC, a.started_at ASC`,
    [examId]
  );
  return result.rows as Array<{
    user_id: string; user_name: string | null; user_email: string; index_number: string | null;
    total_points: number; max_points: number; submitted: boolean; started_at: Date;
    finished_at: Date | null; time_spent_seconds: number;
  }>;
}

// ========================================
// AI GRADING SETTINGS
// ========================================

export async function getExamAiSettings(examId: string): Promise<OtisakExamAiSettings | null> {
  const result = await query<OtisakExamAiSettings>(
    'SELECT * FROM otisak_exam_ai_settings WHERE exam_id = $1',
    [examId]
  );
  return result.rows[0] || null;
}

export async function upsertExamAiSettings(
  examId: string,
  data: {
    ai_provider?: string;
    api_key_encrypted?: string;
    grading_mode?: string;
    allow_student_api_keys?: boolean;
    max_student_credits?: number;
  }
): Promise<OtisakExamAiSettings> {
  const result = await query<OtisakExamAiSettings>(
    `INSERT INTO otisak_exam_ai_settings (exam_id, ai_provider, api_key_encrypted, grading_mode, allow_student_api_keys, max_student_credits)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (exam_id) DO UPDATE SET
       ai_provider = COALESCE($2, otisak_exam_ai_settings.ai_provider),
       api_key_encrypted = COALESCE($3, otisak_exam_ai_settings.api_key_encrypted),
       grading_mode = COALESCE($4, otisak_exam_ai_settings.grading_mode),
       allow_student_api_keys = COALESCE($5, otisak_exam_ai_settings.allow_student_api_keys),
       max_student_credits = COALESCE($6, otisak_exam_ai_settings.max_student_credits)
     RETURNING *`,
    [
      examId,
      data.ai_provider || 'claude',
      data.api_key_encrypted || null,
      data.grading_mode || 'deferred',
      data.allow_student_api_keys ?? false,
      data.max_student_credits ?? 0,
    ]
  );
  return result.rows[0];
}

export async function getTagCountsForSubject(
  subjectId: string
): Promise<Array<{ tag: string; count: number }>> {
  const result = await query<{ tag: string; count: number }>(
    `SELECT tag, COUNT(*)::int as count
     FROM otisak_question_bank, unnest(tags) as tag
     WHERE subject_id = $1
     GROUP BY tag
     ORDER BY tag ASC`,
    [subjectId]
  );
  return result.rows;
}

// ========================================
// ROOM / LIVE EXAM CONTROL
// ========================================

export async function startExamTimer(examId: string): Promise<OtisakExam | null> {
  // Auto-activate scheduled/draft exams when the admin clicks Start. Idempotent
  // for already-active exams (COALESCE preserves an existing exam_started_at
  // so a second click doesn't reset every student's timer).
  // Completed and archived exams are intentionally NOT eligible — once an exam
  // ends it stays ended.
  const result = await query<OtisakExam>(
    `UPDATE otisak_exams
     SET status = 'active',
         exam_started_at = COALESCE(exam_started_at, NOW())
     WHERE id = $1
       AND status IN ('draft', 'scheduled', 'active')
     RETURNING *`,
    [examId]
  );
  return result.rows[0] || null;
}

export async function getExamRoomStatus(examId: string): Promise<{
  exam: OtisakExamWithSubject | null;
  participants: Array<{ user_id: string; name: string | null; email: string; index_number: string | null; enrolled_at: Date }>;
  activeAttempts: number;
}> {
  const exam = await getOtisakExamById(examId);
  const enrollments = await getExamEnrollments(examId);
  const attemptCount = await query<{ count: number }>(
    `SELECT COUNT(*)::int as count FROM otisak_attempts WHERE exam_id = $1 AND submitted = FALSE`,
    [examId]
  );
  return {
    exam,
    participants: enrollments,
    activeAttempts: attemptCount.rows[0]?.count ?? 0,
  };
}

// Aggregate live progress for every attempt on an exam. Used both for an HTTP
// snapshot (RoomPage initial load + reconnect) and for the lightweight payload
// included with exam.submitted/exam.progress broadcasts.
export async function getLiveExamStats(examId: string): Promise<{
  total_participants: number;
  finished_count: number;
  total_questions: number;
  per_student: Array<{
    user_id: string;
    user_name: string | null;
    user_email: string;
    index_number: string | null;
    submitted: boolean;
    answered_count: number;
    started_at: Date | null;
    finished_at: Date | null;
    time_spent_seconds: number;
    suspicious_count: number;
  }>;
}> {
  // Total question count for the exam (the same for everyone).
  const qCount = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM otisak_questions WHERE exam_id = $1`,
    [examId]
  );
  const total_questions = qCount.rows[0]?.count ?? 0;

  // Suspicious activity event types we count for the live UI badge.
  const SUSPICIOUS_TYPES = ['tab_switch', 'copy_attempt', 'cut_attempt', 'paste_attempt', 'page_blur', 'mouse_leave_window', 'devtools_attempt', 'print_attempt'];

  const result = await query<{
    user_id: string;
    user_name: string | null;
    user_email: string;
    index_number: string | null;
    submitted: boolean;
    answered_count: number;
    started_at: Date | null;
    finished_at: Date | null;
    time_spent_seconds: number;
    suspicious_count: number;
  }>(
    `SELECT a.user_id,
            u.name AS user_name,
            u.email AS user_email,
            u.index_number,
            a.submitted,
            a.started_at,
            a.finished_at,
            a.time_spent_seconds,
            (
              SELECT COUNT(*)::int FROM otisak_attempt_answers aa
              WHERE aa.attempt_id = a.id
                AND (
                  aa.selected_answer_id IS NOT NULL
                  OR (aa.selected_answer_ids IS NOT NULL AND array_length(aa.selected_answer_ids, 1) > 0)
                  OR (aa.text_answer IS NOT NULL AND length(trim(aa.text_answer)) > 0)
                )
            ) AS answered_count,
            (
              SELECT COUNT(*)::int FROM exam_activity_log al
              WHERE al.attempt_id = a.id
                AND al.event_type = ANY($2::text[])
            ) AS suspicious_count
     FROM otisak_attempts a
     JOIN users u ON a.user_id = u.id
     WHERE a.exam_id = $1
       AND u.role = 'student'
     ORDER BY a.started_at ASC`,
    [examId, SUSPICIOUS_TYPES]
  );

  const per_student = result.rows;
  const finished_count = per_student.filter((r) => r.submitted).length;
  return { total_participants: per_student.length, finished_count, total_questions, per_student };
}

export async function joinExamByIndex(examId: string, indexNumber: string): Promise<{
  user: { id: string; name: string | null; index_number: string | null } | null;
  error?: string;
}> {
  const normalized = indexNumber.trim().toLowerCase().replace(/\s+/g, '');
  const userResult = await query<{ id: string; name: string | null; index_number: string | null }>(
    `SELECT id, name, index_number FROM users
     WHERE LOWER(REPLACE(index_number, ' ', '')) = $1 AND is_active = TRUE LIMIT 1`,
    [normalized]
  );
  const user = userResult.rows[0];
  if (!user) return { user: null, error: 'Index number not found. Contact your administrator.' };

  const exam = await getOtisakExamById(examId);
  if (!exam) return { user: null, error: 'Exam not found.' };
  if (exam.status !== 'active') return { user: null, error: 'Exam is not active.' };

  await enrollUserInExam(examId, user.id);
  return { user };
}
