// OTISAK Database Operations
// ========================================

import { query, transaction } from './client';
import type {
  OtisakQuestion,
  OtisakAnswer,
  OtisakQuestionWithAnswers,
  CreateOtisakQuestionInput,
  UpdateOtisakQuestionInput,
} from './otisak-types';

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
  // JSON import) is responsible for setting it correctly - single source of truth in
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
  // to "any question with 2+ correct answers is multi-select" - matches the
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
// and reinserted from the patch - keeping diffs of answer ids would force
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
      // null those refs (ON DELETE SET NULL) - fine for edits while the exam is
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
