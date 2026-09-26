// Manual grading of open-text answers.
//
// Every non-blank open-text answer on a submitted attempt of a real exam lands
// here with ai_grading_status = 'pending' and 0 points. The subject's staff
// (admin, or a professor/assistant assigned to the exam's subject) score it by
// hand; grading an answer recomputes the attempt total with the same logic as
// submitting, and the attempt stops being "pending" once nothing is left.

import { query, transaction } from './client';
import { computeAttemptTotal } from './otisak-attempts';

export type GradingExamSummary = {
  exam_id: string;
  title: string;
  status: string;
  subject_name: string | null;
  pending: number;
  graded: number;
  students_pending: number;
};

// Exams with open-text answers still waiting for a grade, most work first.
// Admins see every exam; everyone else only exams of their assigned subjects.
export async function getGradingSummary(userId: string, isAdmin: boolean): Promise<GradingExamSummary[]> {
  const result = await query<GradingExamSummary>(
    `SELECT e.id AS exam_id, e.title, e.status, s.name AS subject_name,
            COUNT(*) FILTER (WHERE aa.ai_grading_status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE aa.ai_grading_status = 'graded')::int AS graded,
            COUNT(DISTINCT a.id) FILTER (WHERE aa.ai_grading_status = 'pending')::int AS students_pending
       FROM otisak_attempt_answers aa
       JOIN otisak_attempts a ON a.id = aa.attempt_id AND a.submitted
       JOIN otisak_questions q ON q.id = aa.question_id AND q.type = 'open_text'
       JOIN otisak_exams e ON e.id = a.exam_id AND e.exam_mode = 'real'
       LEFT JOIN otisak_subjects s ON s.id = e.subject_id
      WHERE aa.ai_grading_status IN ('pending', 'graded')
        AND ($2::boolean OR e.subject_id IN (SELECT subject_id FROM subject_assignments WHERE user_id = $1))
      GROUP BY e.id, s.name
     HAVING COUNT(*) FILTER (WHERE aa.ai_grading_status = 'pending') > 0
      ORDER BY pending DESC, e.title`,
    [userId, isAdmin]
  );
  return result.rows;
}

export type GradingItem = {
  attempt_id: string;
  question_id: string;
  question_text: string;
  question_position: number;
  grading_instructions: string | null;
  max_points: number;
  student_id: string;
  student_name: string | null;
  student_email: string;
  student_index: string | null;
  text_answer: string;
  points_awarded: number;
  status: 'pending' | 'graded';
  feedback: string | null;
  graded_at: string | null;
  graded_by_name: string | null;
};

// Every gradable open-text answer of one exam, grouped by question (in exam
// order) and then by student, so a grader can go through one question at a time.
export async function getExamGradingItems(examId: string): Promise<GradingItem[]> {
  const result = await query<GradingItem>(
    `SELECT aa.attempt_id, aa.question_id,
            q.text AS question_text, q.position AS question_position,
            q.ai_grading_instructions AS grading_instructions,
            q.points::float AS max_points,
            u.id AS student_id, u.name AS student_name, u.email AS student_email,
            u.index_number AS student_index,
            aa.text_answer, aa.points_awarded::float AS points_awarded,
            aa.ai_grading_status AS status, aa.ai_feedback AS feedback,
            aa.ai_graded_at AS graded_at, g.name AS graded_by_name
       FROM otisak_attempt_answers aa
       JOIN otisak_attempts a ON a.id = aa.attempt_id AND a.submitted
       JOIN otisak_questions q ON q.id = aa.question_id AND q.type = 'open_text'
       JOIN users u ON u.id = a.user_id
       LEFT JOIN users g ON g.id = aa.graded_by
      WHERE a.exam_id = $1
        AND aa.ai_grading_status IN ('pending', 'graded')
      ORDER BY q.position, q.id, u.name NULLS LAST, u.email`,
    [examId]
  );
  return result.rows;
}

export type GradeAnswerResult =
  | { ok: true; total_points: number; max_points: number; attempt_pending: boolean }
  | { ok: false; status: number; error: string };

export async function gradeOpenTextAnswer(input: {
  examId: string;
  attemptId: string;
  questionId: string;
  points: number;
  // undefined = leave the existing comment as it is; null = remove it.
  feedback: string | null | undefined;
  graderId: string;
}): Promise<GradeAnswerResult> {
  return transaction(async (client) => {
    // Lock the attempt so two graders saving answers of the same student at
    // once can't compute the total from each other's half-written state.
    const attemptRes = await client.query<{ submitted: boolean }>(
      `SELECT submitted FROM otisak_attempts WHERE id = $1 AND exam_id = $2 FOR UPDATE`,
      [input.attemptId, input.examId]
    );
    const attempt = attemptRes.rows[0];
    if (!attempt) return { ok: false, status: 404, error: 'Attempt not found' };
    if (!attempt.submitted) return { ok: false, status: 409, error: 'Attempt is not submitted yet' };

    const questionRes = await client.query<{ type: string; points: number }>(
      `SELECT type, points FROM otisak_questions WHERE id = $1 AND exam_id = $2`,
      [input.questionId, input.examId]
    );
    const question = questionRes.rows[0];
    if (!question) return { ok: false, status: 404, error: 'Question not found' };
    if (question.type !== 'open_text') {
      return { ok: false, status: 400, error: 'Only open-text answers are graded manually' };
    }
    const maxPoints = Number(question.points || 0);
    if (!Number.isFinite(input.points) || input.points < 0 || input.points > maxPoints) {
      return { ok: false, status: 400, error: `Points must be between 0 and ${maxPoints}` };
    }

    const updated = await client.query(
      `UPDATE otisak_attempt_answers
          SET points_awarded = $3, ai_grading_status = 'graded',
              ai_feedback = CASE WHEN $6 THEN $4 ELSE ai_feedback END,
              ai_graded_at = NOW(), graded_by = $5
        WHERE attempt_id = $1 AND question_id = $2
          AND ai_grading_status IN ('pending', 'graded')`,
      [input.attemptId, input.questionId, input.points, input.feedback ?? null, input.graderId, input.feedback !== undefined]
    );
    if ((updated.rowCount ?? 0) === 0) {
      return { ok: false, status: 404, error: 'No gradable answer for this question' };
    }

    const { total, max } = await computeAttemptTotal(client, input.attemptId);
    const pendingRes = await client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM otisak_attempt_answers
        WHERE attempt_id = $1 AND ai_grading_status = 'pending'`,
      [input.attemptId]
    );
    const attemptPending = (pendingRes.rows[0]?.n ?? 0) > 0;
    await client.query(
      `UPDATE otisak_attempts SET total_points = $2, max_points = $3, ai_grading_status = $4 WHERE id = $1`,
      [input.attemptId, total, max, attemptPending ? 'pending' : 'graded']
    );

    return { ok: true, total_points: total, max_points: max, attempt_pending: attemptPending };
  });
}
