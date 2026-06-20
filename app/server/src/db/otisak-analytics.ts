// OTISAK Database Operations
// ========================================

import { query } from './client';
import { getOtisakExamById } from './otisak-exams';
import { getExamEnrollments } from './otisak-enrollments';
import type {
  OtisakExamWithSubject,
} from './otisak-types';

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
  max_points: number;
  room_average_points: number;
  room_average_percent: number;
  per_student: Array<{
    user_id: string;
    user_name: string | null;
    user_email: string;
    index_number: string | null;
    submitted: boolean;
    answered_count: number;
    current_points: number;
    started_at: Date | null;
    finished_at: Date | null;
    time_spent_seconds: number;
    suspicious_count: number;
  }>;
}> {
  // Total question count and max points for the exam (the same for everyone).
  // Computed once here rather than as a correlated subquery in the per-student
  // SELECT below so they don't get repeated for every attempt row.
  const examMeta = await query<{ q_count: number; max_points: number }>(
    `SELECT COUNT(*)::int AS q_count,
            COALESCE(SUM(points), 0)::numeric AS max_points
     FROM otisak_questions WHERE exam_id = $1`,
    [examId]
  );
  const total_questions = examMeta.rows[0]?.q_count ?? 0;
  const max_points = Number(examMeta.rows[0]?.max_points ?? 0);

  // Suspicious activity event types we count for the live UI badge.
  const SUSPICIOUS_TYPES = ['tab_switch', 'copy_attempt', 'cut_attempt', 'paste_attempt', 'page_blur', 'mouse_leave_window', 'devtools_attempt', 'print_attempt'];

  const result = await query<{
    user_id: string;
    user_name: string | null;
    user_email: string;
    index_number: string | null;
    submitted: boolean;
    answered_count: number;
    current_points: number;
    started_at: Date | null;
    finished_at: Date | null;
    time_spent_seconds: number;
    suspicious_count: number;
  }>(
    // Pre-aggregate per attempt in two scoped CTEs and LEFT JOIN them, instead
    // of three correlated subqueries that re-ran once per attempt row. The
    // predicates (answered, running points, suspicious event types) are copied
    // verbatim so the numbers are identical. Running score reflects the live
    // state because submitAttemptAnswers updates points_awarded on every save.
    `WITH attempt_ids AS (
       SELECT id FROM otisak_attempts WHERE exam_id = $1
     ),
     answer_agg AS (
       SELECT aa.attempt_id,
              COUNT(*) FILTER (
                WHERE aa.selected_answer_id IS NOT NULL
                  OR (aa.selected_answer_ids IS NOT NULL AND array_length(aa.selected_answer_ids, 1) > 0)
                  OR (aa.text_answer IS NOT NULL AND length(trim(aa.text_answer)) > 0)
              )::int AS answered_count,
              COALESCE(SUM(aa.points_awarded), 0)::numeric AS current_points
       FROM otisak_attempt_answers aa
       WHERE aa.attempt_id IN (SELECT id FROM attempt_ids)
       GROUP BY aa.attempt_id
     ),
     susp_agg AS (
       SELECT al.attempt_id, COUNT(*)::int AS suspicious_count
       FROM exam_activity_log al
       WHERE al.event_type = ANY($2::text[])
         AND al.attempt_id IN (SELECT id FROM attempt_ids)
       GROUP BY al.attempt_id
     )
     SELECT a.user_id,
            u.name AS user_name,
            u.email AS user_email,
            u.index_number,
            a.submitted,
            a.started_at,
            a.finished_at,
            a.time_spent_seconds,
            COALESCE(an.answered_count, 0) AS answered_count,
            COALESCE(an.current_points, 0)::numeric AS current_points,
            COALESCE(s.suspicious_count, 0) AS suspicious_count
     FROM otisak_attempts a
     JOIN users u ON a.user_id = u.id
     LEFT JOIN answer_agg an ON an.attempt_id = a.id
     LEFT JOIN susp_agg s ON s.attempt_id = a.id
     WHERE a.exam_id = $1
       AND u.role = 'student'
     ORDER BY a.started_at ASC`,
    [examId, SUSPICIOUS_TYPES]
  );

  // Normalise numeric columns coming back as strings from pg.
  const per_student = result.rows.map((r) => ({ ...r, current_points: Number(r.current_points || 0) }));
  const finished_count = per_student.filter((r) => r.submitted).length;

  // Room averages only count students who have actually started (started_at
  // not null). A student in the lobby with 0 points would otherwise pull the
  // average down even though they're not playing yet.
  const started = per_student.filter((r) => r.started_at);
  const room_average_points = started.length > 0
    ? started.reduce((s, r) => s + r.current_points, 0) / started.length
    : 0;
  const room_average_percent = max_points > 0
    ? Math.round((room_average_points / max_points) * 100)
    : 0;

  return {
    total_participants: per_student.length,
    finished_count,
    total_questions,
    max_points,
    room_average_points: Math.round(room_average_points * 100) / 100,
    room_average_percent,
    per_student,
  };
}

// Per-exam analytics for the stats page. Reads from existing storage only -
// no new columns, no migration. Submitted attempts are the population. Each
// per-question row carries success / partial / zero counts plus an answer
// pick distribution for multi-choice questions (null for the compound types
// where answers live in JSON inside text_answer). Overall stats include
// score histogram, pass rate (or null when has_pass_threshold=false), and
// extremes for quick scanning.
//
// Cost: 4 small queries (exam meta, attempts, per-question aggregates, pick
// distribution). All filtered by exam_id, all hit existing indexes.
export type ExamStats = {
  exam: {
    id: string;
    title: string;
    subject_name: string | null;
    status: string;
    total_questions: number;
    has_pass_threshold: boolean;
    pass_threshold: number;
  };
  overall: {
    attempts_submitted: number;
    avg_percent: number;
    median_percent: number;
    min_percent: number;
    max_percent: number;
    pass_rate: number | null;
    avg_time_seconds: number;
    score_buckets: Array<{ from: number; to: number; count: number }>;
  };
  per_question: Array<{
    question_id: string;
    position: number;
    type: string;
    text_preview: string;
    points: number;
    attempts: number;
    correct_count: number;
    partial_count: number;
    zero_count: number;
    success_rate: number;
    avg_points: number;
    pick_distribution: Array<{ answer_id: string; text: string; is_correct: boolean; count: number }> | null;
  }>;
};

export async function getExamStats(examId: string): Promise<ExamStats | null> {
  const examRes = await query<{
    id: string; title: string; subject_name: string | null; status: string;
    has_pass_threshold: boolean; pass_threshold: number;
  }>(
    `SELECT e.id, e.title, s.name AS subject_name, e.status,
            e.has_pass_threshold, e.pass_threshold
     FROM otisak_exams e LEFT JOIN otisak_subjects s ON s.id = e.subject_id
     WHERE e.id = $1`,
    [examId]
  );
  const exam = examRes.rows[0];
  if (!exam) return null;

  // Submitted attempts as the analytic population. In-flight attempts would
  // skew everything (incomplete answers, partial scores).
  const attRes = await query<{ total_points: number; max_points: number; time_spent_seconds: number }>(
    `SELECT total_points::numeric AS total_points,
            max_points::numeric AS max_points,
            time_spent_seconds
     FROM otisak_attempts WHERE exam_id = $1 AND submitted = TRUE`,
    [examId]
  );
  const attempts = attRes.rows.map((a) => ({
    total: Number(a.total_points || 0),
    max: Number(a.max_points || 0),
    time: Number(a.time_spent_seconds || 0),
    pct: Number(a.max_points || 0) > 0 ? (Number(a.total_points || 0) / Number(a.max_points || 0)) * 100 : 0,
  }));

  const attempts_submitted = attempts.length;
  const sortedPct = attempts.map((a) => a.pct).slice().sort((a, b) => a - b);
  const avg_percent = attempts_submitted > 0
    ? Math.round((sortedPct.reduce((s, v) => s + v, 0) / attempts_submitted))
    : 0;
  const median_percent = attempts_submitted > 0
    ? Math.round(sortedPct[Math.floor((sortedPct.length - 1) / 2)])
    : 0;
  const min_percent = attempts_submitted > 0 ? Math.round(sortedPct[0]) : 0;
  const max_percent = attempts_submitted > 0 ? Math.round(sortedPct[sortedPct.length - 1]) : 0;
  const avg_time_seconds = attempts_submitted > 0
    ? Math.round(attempts.reduce((s, a) => s + a.time, 0) / attempts_submitted)
    : 0;
  const pass_rate = exam.has_pass_threshold && attempts_submitted > 0
    ? Math.round((attempts.filter((a) => a.pct >= Number(exam.pass_threshold)).length / attempts_submitted) * 100)
    : null;

  // 10% buckets [0,10), [10,20), … [90,100]. Last bucket is inclusive on
  // both ends so a perfect 100% lands inside.
  const score_buckets = Array.from({ length: 10 }, (_, i) => ({
    from: i * 10, to: (i + 1) * 10, count: 0,
  }));
  for (const a of attempts) {
    const idx = Math.min(9, Math.max(0, Math.floor(a.pct / 10)));
    score_buckets[idx].count++;
  }

  // Per-question aggregates. Joins attempts to only count submitted ones.
  const perQ = await query<{
    question_id: string;
    position: number;
    type: string;
    text_preview: string;
    points: number;
    attempts_for_q: number;
    correct_count: number;
    partial_count: number;
    zero_count: number;
    sum_points: number;
  }>(
    `SELECT q.id AS question_id,
            q.position,
            q.type,
            substring(q.text, 1, 140) AS text_preview,
            q.points,
            COUNT(aa.*)::int AS attempts_for_q,
            COUNT(*) FILTER (WHERE aa.points_awarded = q.points AND q.points > 0)::int AS correct_count,
            COUNT(*) FILTER (WHERE aa.points_awarded > 0 AND aa.points_awarded < q.points)::int AS partial_count,
            COUNT(*) FILTER (WHERE aa.points_awarded = 0)::int AS zero_count,
            COALESCE(SUM(aa.points_awarded), 0)::numeric AS sum_points
     FROM otisak_questions q
     LEFT JOIN otisak_attempt_answers aa ON aa.question_id = q.id
       AND aa.attempt_id IN (SELECT id FROM otisak_attempts WHERE exam_id = $1 AND submitted = TRUE)
     WHERE q.exam_id = $1
     GROUP BY q.id, q.position, q.type, q.text, q.points
     ORDER BY q.position ASC`,
    [examId]
  );

  // Pick distribution for multi-choice. UNNEST(selected_answer_ids) gives
  // one row per pick; group by answer_id and count. Skipped for compound
  // types where the answer lives in text_answer JSON (ordering/matching/
  // fill_blank) and for open_text.
  const distRes = await query<{ question_id: string; answer_id: string; text: string; is_correct: boolean; count: number }>(
    `SELECT q.id AS question_id,
            a.id AS answer_id,
            a.text,
            a.is_correct,
            COUNT(*)::int AS count
     FROM otisak_questions q
     JOIN otisak_answers a ON a.question_id = q.id
     LEFT JOIN otisak_attempt_answers aa ON aa.question_id = q.id
       AND aa.attempt_id IN (SELECT id FROM otisak_attempts WHERE exam_id = $1 AND submitted = TRUE)
       AND a.id = ANY(aa.selected_answer_ids)
     WHERE q.exam_id = $1
       AND q.type IN ('text', 'code', 'image')
     GROUP BY q.id, a.id, a.text, a.is_correct, a.position
     ORDER BY q.position ASC, a.position ASC`,
    [examId]
  );
  const distByQuestion = new Map<string, Array<{ answer_id: string; text: string; is_correct: boolean; count: number }>>();
  for (const row of distRes.rows) {
    const list = distByQuestion.get(row.question_id) ?? [];
    list.push({
      answer_id: row.answer_id,
      text: row.text,
      is_correct: row.is_correct,
      count: Number(row.count || 0),
    });
    distByQuestion.set(row.question_id, list);
  }

  const per_question = perQ.rows.map((q) => {
    const attempts_for_q = Number(q.attempts_for_q || 0);
    const correct_count = Number(q.correct_count || 0);
    const compound = q.type === 'ordering' || q.type === 'matching' || q.type === 'fill_blank' || q.type === 'open_text';
    return {
      question_id: q.question_id,
      position: q.position,
      type: q.type,
      text_preview: q.text_preview,
      points: Number(q.points || 0),
      attempts: attempts_for_q,
      correct_count,
      partial_count: Number(q.partial_count || 0),
      zero_count: Number(q.zero_count || 0),
      success_rate: attempts_for_q > 0 ? Math.round((correct_count / attempts_for_q) * 100) : 0,
      avg_points: attempts_for_q > 0
        ? Math.round((Number(q.sum_points || 0) / attempts_for_q) * 100) / 100
        : 0,
      pick_distribution: compound ? null : (distByQuestion.get(q.question_id) ?? []),
    };
  });

  return {
    exam: {
      id: exam.id,
      title: exam.title,
      subject_name: exam.subject_name,
      status: exam.status,
      total_questions: perQ.rows.length,
      has_pass_threshold: !!exam.has_pass_threshold,
      pass_threshold: Number(exam.pass_threshold || 50),
    },
    overall: {
      attempts_submitted,
      avg_percent,
      median_percent,
      min_percent,
      max_percent,
      pass_rate,
      avg_time_seconds,
      score_buckets,
    },
    per_question,
  };
}
