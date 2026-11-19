// Admin-side control over students' live sessions: list who is signed in (and
// in which running exam), and terminate sessions so a student can sign in to
// another exam or from another device.
//
// Sessions are stateless signed cookies, so termination = stamping the per-user
// sessions_revoked_at cutoff (requireAuth and the WebSocket upgrade refuse older
// cookies), dropping the in-memory device lock and closing open sockets.

import { query } from '../db/client';
import { finishAttempt } from '../db/otisak';
import { broadcastExamEvent, revokeUserSockets } from '../ws/events';
import { refreshLiveStatsNow } from '../ws/liveStatsAggregator';
import { listTrackedSessions, revokeTrackedSessions } from '../session-tracker';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ActiveStudentSession = {
  user_id: string;
  name: string | null;
  email: string;
  index_number: string | null;
  last_seen: string | null;
  exams: Array<{
    exam_id: string;
    title: string;
    attempt_started_at: string | null;
    exam_started: boolean;
  }>;
};

// Students with a live device lock or an unsubmitted attempt / lobby seat in an
// active real exam. The tracker covers "signed in right now"; the DB covers
// "mid-exam" even when the device went quiet.
export async function listActiveStudentSessions(): Promise<ActiveStudentSession[]> {
  const tracked = listTrackedSessions();
  const lastSeen = new Map(tracked.map((t) => [t.userId, t.lastSeen]));

  const rows = await query<{
    user_id: string;
    name: string | null;
    email: string;
    index_number: string | null;
    exam_id: string | null;
    title: string | null;
    attempt_started_at: Date | null;
    exam_started_at: Date | null;
  }>(
    `WITH candidates AS (
       SELECT unnest($1::uuid[]) AS user_id
       UNION
       SELECT a.user_id FROM otisak_attempts a
         JOIN otisak_exams e ON e.id = a.exam_id
        WHERE a.submitted = FALSE AND e.status = 'active' AND e.exam_mode = 'real'
     )
     SELECT u.id AS user_id, u.name, u.email, u.index_number,
            e.id AS exam_id, e.title, a.started_at AS attempt_started_at, e.exam_started_at
       FROM candidates c
       JOIN users u ON u.id = c.user_id AND u.role = 'student'
       LEFT JOIN otisak_enrollments en ON en.user_id = u.id
       LEFT JOIN otisak_exams e ON e.id = en.exam_id AND e.status = 'active' AND e.exam_mode = 'real'
       LEFT JOIN otisak_attempts a ON a.exam_id = e.id AND a.user_id = u.id AND a.submitted = FALSE
      WHERE e.id IS NULL
         OR a.id IS NOT NULL
         OR (e.exam_started_at IS NULL AND NOT EXISTS (
              SELECT 1 FROM otisak_attempts s
               WHERE s.exam_id = e.id AND s.user_id = u.id AND s.submitted = TRUE))
      ORDER BY u.index_number NULLS LAST, u.name`,
    [tracked.map((t) => t.userId)],
  );

  const byUser = new Map<string, ActiveStudentSession>();
  for (const r of rows.rows) {
    let entry = byUser.get(r.user_id);
    if (!entry) {
      const seen = lastSeen.get(r.user_id);
      entry = {
        user_id: r.user_id,
        name: r.name,
        email: r.email,
        index_number: r.index_number,
        last_seen: seen ? new Date(seen).toISOString() : null,
        exams: [],
      };
      byUser.set(r.user_id, entry);
    }
    if (r.exam_id && r.title) {
      entry.exams.push({
        exam_id: r.exam_id,
        title: r.title,
        attempt_started_at: r.attempt_started_at
          ? new Date(r.attempt_started_at).toISOString()
          : null,
        exam_started: !!r.exam_started_at,
      });
    }
  }
  // A tracked student with no running exam and no recent heartbeat is noise.
  return [...byUser.values()].filter((s) => s.exams.length > 0 || s.last_seen);
}

// Terminate every session of the given users. With finishAttempts, their
// unsubmitted attempts in active exams are closed and scored with what was
// saved (same as a kick); otherwise the attempts stay open and the student can
// continue them after signing in again.
export async function terminateStudentSessions(
  userIds: string[],
  opts: { finishAttempts?: boolean } = {},
): Promise<{ revoked: number; finished_attempts: number }> {
  const ids = [...new Set(userIds.filter((id) => typeof id === 'string' && UUID_RE.test(id)))];
  if (ids.length === 0) return { revoked: 0, finished_attempts: 0 };

  const at = Date.now();
  const updated = await query<{ id: string }>(
    `UPDATE users
        SET sessions_revoked_at = GREATEST(COALESCE(sessions_revoked_at, 'epoch'::timestamptz), $2::timestamptz)
      WHERE id = ANY($1::uuid[])
      RETURNING id`,
    [ids, new Date(at)],
  );

  for (const row of updated.rows) {
    revokeTrackedSessions(row.id, at);
    revokeUserSockets(row.id);
  }

  let finished = 0;
  if (opts.finishAttempts) {
    const open = await query<{ id: string; exam_id: string; user_id: string; started_at: Date }>(
      `SELECT a.id, a.exam_id, a.user_id, a.started_at
         FROM otisak_attempts a
         JOIN otisak_exams e ON e.id = a.exam_id
        WHERE a.user_id = ANY($1::uuid[]) AND a.submitted = FALSE AND e.status = 'active'`,
      [ids],
    );
    const touchedExams = new Set<string>();
    for (const a of open.rows) {
      const elapsed = Math.max(1, Math.floor((at - new Date(a.started_at).getTime()) / 1000));
      try {
        await finishAttempt(a.id, elapsed);
        finished++;
        touchedExams.add(a.exam_id);
        broadcastExamEvent(a.exam_id, { type: 'student.kicked', user_id: a.user_id });
      } catch (err) {
        console.error('terminateStudentSessions: finishAttempt failed for', a.id, err);
      }
    }
    for (const examId of touchedExams) {
      refreshLiveStatsNow(examId).catch((err) =>
        console.error('terminateStudentSessions: refreshLiveStatsNow failed', err),
      );
    }
  }

  return { revoked: updated.rows.length, finished_attempts: finished };
}
