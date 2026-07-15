// OTISAK Database Operations
// ========================================

import { query } from './client';
import { getOtisakExamById } from './otisak-exams';
import { getOtisakQuestions } from './otisak-questions';
import { getExamTagRules } from './otisak-tag-rules';
import { enrollUserInExam } from './otisak-enrollments';
import { startExamAttempt } from './otisak-attempts';
import type {
  OtisakExam,
  OtisakQuestion,
  OtisakAnswer,
  OtisakQuestionWithAnswers,
  OtisakAttempt,
  OtisakExamTagRule,
} from './otisak-types';

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
    // multi_answer, explanation and ai_grading_instructions must be carried:
    // without multi_answer the child renders checkboxes as radios, and the
    // student silently loses the ability to answer the question correctly.
    const qResult = await query<OtisakQuestion>(
      `INSERT INTO otisak_questions
         (exam_id, type, text, content, points, position, multi_answer, explanation, ai_grading_instructions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        childExamId, tq.type, tq.text, tq.content, tq.points, tq.position,
        tq.multi_answer, tq.explanation, tq.ai_grading_instructions,
      ]
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

  // self_service stays FALSE and parent_exam_id is set: that pair is what keeps
  // these per-student child rows out of both the admin lists and the student
  // practice list. Everything else is copied from the template, otherwise the
  // instance scores or renders differently from what the template configured.
  const childResult = await query<OtisakExam>(
    `INSERT INTO otisak_exams (
      title, subject_id, description, duration_minutes,
      allow_review, shuffle_questions, shuffle_answers, pass_threshold, has_pass_threshold,
      created_by, exam_mode, status, parent_exam_id, uses_question_bank, self_service,
      negative_points_enabled, negative_points_value, negative_points_threshold,
      partial_scoring, allow_notes, allow_calculator, tags
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'practice', 'active', $11, TRUE, FALSE, $12, $13, $14, $15, $16, $17, $18)
    RETURNING *`,
    [
      template.title, template.subject_id, template.description, template.duration_minutes,
      true, template.shuffle_questions, template.shuffle_answers, template.pass_threshold,
      template.has_pass_threshold,
      template.created_by, templateExamId,
      template.negative_points_enabled, template.negative_points_value, template.negative_points_threshold,
      template.partial_scoring, template.allow_notes, template.allow_calculator, template.tags ?? [],
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
