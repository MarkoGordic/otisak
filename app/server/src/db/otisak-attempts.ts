// OTISAK Database Operations
// ========================================

import { query, transaction } from './client';
import type { PoolClient } from 'pg';
import { getOtisakExamById } from './otisak-exams';
import { getOtisakQuestions } from './otisak-questions';
import {
  scoreOrdering,
  scoreMatching,
  scoreFillBlank,
  scoreMultiChoice,
  type MultiChoiceAnswer,
} from './otisak-scoring';
import type {
  OtisakExam,
  OtisakAttempt,
  OtisakAttemptAnswer,
  OtisakAttemptWithExam,
  SubmitAttemptAnswerInput,
  OtisakExamResults,
} from './otisak-types';

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

  // Validate question ownership AND fetch question metadata in one query, so the
  // per-answer loop does no per-iteration SELECTs (this used to be an N+1).
  // Answers whose question_id does not belong to this attempt's exam are dropped
  // - otherwise a student could POST a question_id from a different exam and
  // have it counted toward their score.
  let safeAnswers = answers;
  const questionMeta = new Map<string, { type: string; content: string | null; points: number }>();
  if (answers.length > 0) {
    const ids = answers.map((a) => a.question_id).filter(Boolean);
    if (ids.length > 0) {
      const valid = await query<{ id: string; type: string; content: string | null; points: number }>(
        `SELECT id, type, content, points FROM otisak_questions WHERE exam_id = $1 AND id = ANY($2::uuid[])`,
        [attemptExamId, ids],
      );
      for (const r of valid.rows) {
        questionMeta.set(r.id, { type: r.type, content: r.content, points: r.points });
      }
      safeAnswers = answers.filter((a) => questionMeta.has(a.question_id));
      if (safeAnswers.length === 0) return;
    }
  }

  // Batch-fetch all answer choices for the multi-choice questions in one query
  // (also part of killing the former N+1).
  const answersByQuestion = new Map<string, MultiChoiceAnswer[]>();
  const qids = [...new Set(safeAnswers.map((a) => a.question_id).filter(Boolean))];
  if (qids.length > 0) {
    const aRows = await query<{ question_id: string; id: string; is_correct: boolean }>(
      `SELECT question_id, id, is_correct FROM otisak_answers WHERE question_id = ANY($1::uuid[])`,
      [qids],
    );
    for (const r of aRows.rows) {
      const list = answersByQuestion.get(r.question_id) ?? [];
      list.push({ id: r.id, is_correct: r.is_correct });
      answersByQuestion.set(r.question_id, list);
    }
  }

  for (const ans of safeAnswers) {
    const meta = questionMeta.get(ans.question_id);
    if (ans.text_answer !== undefined && ans.text_answer !== null) {
      const qType = meta?.type;
      const qContent = meta?.content ?? null;
      const qPoints = Number(meta?.points || 0);

      if (qType === 'ordering' && qContent) {
        const pointsAwarded = scoreOrdering(qContent, ans.text_answer, qPoints, false);
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
        const pointsAwarded = scoreMatching(qContent, ans.text_answer, qPoints);
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
        const pointsAwarded = scoreFillBlank(qContent, ans.text_answer, qPoints);
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

    const allAnswers = answersByQuestion.get(ans.question_id) ?? [];
    const pointsAwarded = scoreMultiChoice(
      selectedIds,
      allAnswers,
      Number(meta?.points || 0),
      partialScoring,
    );

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
// an admin edits questions on a completed exam - the historical record of
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
// Counts answered-but-wrong questions for the negative-points penalty.
// Shared by finishAttempt and rescoreExam so their totals can never drift.
// "Answered" means a selected answer, or a text answer that has actually been
// scored: auto-scored text types (ordering/matching/fill_blank carry
// ai_grading_status NULL) and AI-graded open_text count; open_text still
// pending/grading/errored does not - an ungraded answer isn't wrong yet.
async function countWrongAnsweredQuestions(client: PoolClient, attemptId: string): Promise<number> {
  const result = await client.query<{ wrong_count: number }>(
    `SELECT COUNT(*)::int AS wrong_count
     FROM otisak_attempt_answers aa
     WHERE aa.attempt_id = $1 AND aa.points_awarded = 0
       AND (aa.selected_answer_id IS NOT NULL
            OR array_length(aa.selected_answer_ids, 1) > 0
            OR (aa.text_answer IS NOT NULL
                AND (aa.ai_grading_status IS NULL OR aa.ai_grading_status = 'graded')))`,
    [attemptId]
  );
  return result.rows[0]?.wrong_count ?? 0;
}

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

    // All submitted attempts. Live (not yet submitted) attempts are excluded -
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
        let pointsAwarded: number;

        if (q.type === 'ordering' && q.content) {
          pointsAwarded = scoreOrdering(q.content, aa.text_answer, Number(q.points || 0), true);
        } else if (q.type === 'matching' && q.content) {
          pointsAwarded = scoreMatching(q.content, aa.text_answer, Number(q.points || 0));
        } else if (q.type === 'fill_blank' && q.content) {
          pointsAwarded = scoreFillBlank(q.content, aa.text_answer, Number(q.points || 0));
        } else if (q.type === 'open_text') {
          // Carry over the AI-graded score (or 0 if still pending). Rescoring
          // shouldn't overwrite what the grader produced; admin can re-run AI
          // grading separately if they want a fresh pass.
          pointsAwarded = Number(aa.points_awarded || 0);
        } else {
          // Multi-choice (text/code/image). Same rules as submitAttemptAnswers:
          // any wrong pick -> 0. All correct -> full. Subset of correct with no
          // wrong -> proportional iff partial_scoring.
          const selectedIds = (aa.selected_answer_ids && aa.selected_answer_ids.length > 0)
            ? aa.selected_answer_ids
            : (aa.selected_answer_id ? [aa.selected_answer_id] : []);
          const allAnswers = answersByQuestion.get(q.id) ?? [];
          pointsAwarded = scoreMultiChoice(selectedIds, allAnswers, Number(q.points || 0), partialScoring);
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
        const wrongCount = await countWrongAnsweredQuestions(client, attemptId);
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
  // computing scores against stale rows and overwriting nothing - which still
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
      const wrongCount = await countWrongAnsweredQuestions(client, attemptId);
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

  // Reproduce the taker's ordering - but only where the exam actually
  // shuffles. Every attempt carries a seed, so gating on the seed alone
  // would reorder results for non-shuffled exams too.
  const seed = attempt.shuffle_seed;
  if (seed) {
    if (exam.shuffle_questions) {
      questions = shuffleArray(questions, seed);
    }
    if (exam.shuffle_answers) {
      questions = questions.map((q, idx) => ({
        ...q,
        answers: shuffleArray(q.answers, seed + idx + 1),
      }));
    }
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
