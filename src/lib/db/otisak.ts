// OTISAK Database Operations
// ========================================

import { query } from './client';
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
  filters?: { status?: string; subject_id?: string; exam_mode?: string }
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
  if (filters?.subject_id) {
    conditions.push(`e.subject_id = $${params.length + 1}`);
    params.push(filters.subject_id);
  }
  if (filters?.exam_mode) {
    conditions.push(`e.exam_mode = $${params.length + 1}`);
    params.push(filters.exam_mode);
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
  const result = await query<OtisakExam>(
    `INSERT INTO otisak_exams (title, subject_id, description, duration_minutes, scheduled_at,
       allow_review, shuffle_questions, shuffle_answers, pass_threshold, created_by,
       exam_mode, self_service, repeat_interval_minutes, auto_activate, uses_question_bank, is_public,
       negative_points_enabled, negative_points_value, negative_points_threshold, partial_scoring)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) RETURNING *`,
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
    ]
  );
  return result.rows[0];
}

export async function updateOtisakExamStatus(
  examId: string,
  status: OtisakExam['status']
): Promise<OtisakExam | null> {
  const result = await query<OtisakExam>(
    `UPDATE otisak_exams SET status = $2 WHERE id = $1 RETURNING *`,
    [examId, status]
  );
  return result.rows[0] || null;
}

export async function updateOtisakExam(
  examId: string,
  data: Partial<Pick<OtisakExam, 'title' | 'description' | 'duration_minutes' | 'pass_threshold' | 'allow_review' | 'shuffle_questions' | 'shuffle_answers' | 'is_public' | 'self_service' | 'repeat_interval_minutes' | 'auto_activate' | 'negative_points_enabled' | 'negative_points_value' | 'negative_points_threshold' | 'partial_scoring'>>
): Promise<OtisakExam | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.title !== undefined) { updates.push(`title = $${idx++}`); values.push(data.title); }
  if (data.description !== undefined) { updates.push(`description = $${idx++}`); values.push(data.description); }
  if (data.duration_minutes !== undefined) { updates.push(`duration_minutes = $${idx++}`); values.push(data.duration_minutes); }
  if (data.pass_threshold !== undefined) { updates.push(`pass_threshold = $${idx++}`); values.push(data.pass_threshold); }
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

  if (updates.length === 0) return null;
  values.push(examId);
  const result = await query<OtisakExam>(
    `UPDATE otisak_exams SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

export async function deleteOtisakExam(examId: string): Promise<boolean> {
  const result = await query('DELETE FROM otisak_exams WHERE id = $1', [examId]);
  return (result.rowCount ?? 0) > 0;
}

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

  return questions.map((q) => ({
    ...q,
    answers: answersByQuestion.get(q.id) || [],
  }));
}

export async function createOtisakQuestion(
  examId: string,
  data: CreateOtisakQuestionInput
): Promise<OtisakQuestionWithAnswers> {
  const posResult = await query<{ max_pos: number }>(
    'SELECT COALESCE(MAX(position), -1)::int as max_pos FROM otisak_questions WHERE exam_id = $1',
    [examId]
  );
  const nextPos = data.position ?? (posResult.rows[0].max_pos + 1);

  const qResult = await query<OtisakQuestion>(
    `INSERT INTO otisak_questions (exam_id, type, text, content, points, position, explanation, ai_grading_instructions)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [examId, data.type, data.text, data.content || null, data.points ?? 2, nextPos, data.explanation || null, data.ai_grading_instructions || null]
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

  const startMs = new Date(attempt.started_at).getTime();
  const durationMs = exam.duration_minutes * 60 * 1000;
  const now = Date.now();

  if (now >= startMs + durationMs) {
    return finishAttempt(attempt.id, exam.duration_minutes * 60);
  }
  return null;
}

export async function getSavedAnswers(
  attemptId: string
): Promise<Array<{ question_id: string; selected_answer_ids: string[] }>> {
  const result = await query<{ question_id: string; selected_answer_id: string | null; selected_answer_ids: string[] | null }>(
    'SELECT question_id, selected_answer_id, selected_answer_ids FROM otisak_attempt_answers WHERE attempt_id = $1',
    [attemptId]
  );
  return result.rows.map((row) => ({
    question_id: row.question_id,
    selected_answer_ids: row.selected_answer_ids?.length
      ? row.selected_answer_ids
      : row.selected_answer_id
        ? [row.selected_answer_id]
        : [],
  }));
}

export async function submitAttemptAnswers(
  attemptId: string,
  answers: SubmitAttemptAnswerInput[]
): Promise<void> {
  const examCheck = await query<{ partial_scoring: boolean }>(
    `SELECT e.partial_scoring
     FROM otisak_attempts a
     JOIN otisak_exams e ON e.id = a.exam_id
     WHERE a.id = $1`,
    [attemptId]
  );
  const partialScoring = examCheck.rows[0]?.partial_scoring ?? false;

  for (const ans of answers) {
    if (ans.text_answer !== undefined && ans.text_answer !== null) {
      const qInfo = await query<{ type: string; content: string | null; points: number }>(
        `SELECT type, content, points FROM otisak_questions WHERE id = $1`,
        [ans.question_id]
      );
      const qType = qInfo.rows[0]?.type;
      const qContent = qInfo.rows[0]?.content;
      const qPoints = qInfo.rows[0]?.points ?? 0;

      if (qType === 'ordering' && qContent) {
        let pointsAwarded = 0;
        try {
          const correctData = JSON.parse(qContent);
          const correctOrder: string[] = correctData.items || [];
          const studentOrder: string[] = JSON.parse(ans.text_answer || '[]');
          if (JSON.stringify(studentOrder) === JSON.stringify(correctOrder)) {
            pointsAwarded = qPoints;
          } else if (partialScoring && correctOrder.length > 0) {
            let correctCount = 0;
            for (let i = 0; i < correctOrder.length; i++) {
              if (studentOrder[i] === correctOrder[i]) correctCount++;
            }
            pointsAwarded = Math.round((correctCount / correctOrder.length) * qPoints * 100) / 100;
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
          if (correctCount === totalPairs) {
            pointsAwarded = qPoints;
          } else if (partialScoring && totalPairs > 0) {
            pointsAwarded = Math.round((correctCount / totalPairs) * qPoints * 100) / 100;
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
          if (correctCount === totalBlanks) {
            pointsAwarded = qPoints;
          } else if (partialScoring && totalBlanks > 0) {
            pointsAwarded = Math.round((correctCount / totalBlanks) * qPoints * 100) / 100;
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
        } else if (partialScoring) {
          const correctSelected = [...selectedSet].filter((id) => correctIds.has(id)).length;
          const wrongSelected = [...selectedSet].filter((id) => !correctIds.has(id)).length;
          if (wrongSelected === 0 && correctSelected > 0) {
            pointsAwarded = Math.round((correctSelected / totalCorrect) * questionPoints * 100) / 100;
          } else if (correctSelected > wrongSelected) {
            const netCorrect = Math.max(0, correctSelected - wrongSelected);
            pointsAwarded = Math.round((netCorrect / totalCorrect) * questionPoints * 100) / 100;
          }
        } else {
          const allCorrectSelected = [...correctIds].every((id) => selectedSet.has(id));
          const noWrongSelected = [...selectedSet].every((id) => correctIds.has(id));
          if (allCorrectSelected && noWrongSelected) {
            pointsAwarded = questionPoints;
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

export async function finishAttempt(
  attemptId: string,
  timeSpentSeconds: number
): Promise<OtisakAttempt> {
  const totalResult = await query<{ total: number; max: number }>(
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

  // Apply negative points if enabled
  const negCheck = await query<{
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
    const wrongResult = await query<{ wrong_count: number }>(
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

  // Check AI pending
  const pendingAiCheck = await query<{ pending_count: number }>(
    `SELECT COUNT(*)::int as pending_count FROM otisak_attempt_answers
     WHERE attempt_id = $1 AND ai_grading_status = 'pending'`,
    [attemptId]
  );
  const hasAiPending = (pendingAiCheck.rows[0]?.pending_count ?? 0) > 0;

  const result = await query<OtisakAttempt>(
    `UPDATE otisak_attempts
     SET submitted = TRUE, finished_at = NOW(),
         total_points = $2, max_points = $3, time_spent_seconds = $4, xp_earned = 0,
         ai_grading_status = $5
     WHERE id = $1 RETURNING *`,
    [attemptId, total, max, timeSpentSeconds, hasAiPending ? 'pending' : null]
  );
  return result.rows[0];
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

function shuffleArray<T>(arr: T[], seed: number): T[] {
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
  let sql = `SELECT a.*, e.title as exam_title, s.name as subject_name
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

export async function enrollByCourseAndYear(
  examId: string,
  courseCode: string,
  year: number,
  fromNumber?: number,
  toNumber?: number,
): Promise<number> {
  if (fromNumber !== undefined && toNumber !== undefined) {
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
  const result = await query(
    `SELECT a.user_id, u.name as user_name, u.email as user_email, u.index_number,
            a.total_points, a.max_points, a.submitted, a.started_at, a.finished_at, a.time_spent_seconds
     FROM otisak_attempts a
     JOIN users u ON a.user_id = u.id
     WHERE a.exam_id = $1
        OR a.exam_id IN (SELECT id FROM otisak_exams WHERE parent_exam_id = $1)
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
