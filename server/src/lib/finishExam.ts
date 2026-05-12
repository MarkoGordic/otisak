import {
  getOtisakExamById,
  updateOtisakExamStatus,
} from '../db/otisak';
import { endLockdown, getTotalLockdownPauseSeconds } from '../db/settings';
import { finishAttempt } from '../db/otisak';
import { query } from '../db/client';
import { broadcastExamEvent } from '../ws/events';
import { refreshLiveStatsNow } from '../ws/liveStatsAggregator';

type FinishResult = { ok: true; finishedCount: number } | { ok: false; error: string; status: number };

// Finish an exam "for everyone": submit every unsubmitted attempt with the elapsed
// time computed from the timer reference, end any open lockdown, flip status to
// 'completed', invalidate the live-stats cache, and broadcast exam.finished.
//
// Used both by:
//   1. POST /exams/:id/finish-all (admin action, optional redirect flag)
//   2. The exam-expiry watcher (automatic, redirect=false → results page)
//
// Safe to call on an already-completed exam: openRows comes back empty and the
// status transition is idempotent. Returns finishedCount so the caller can show
// it to the admin or skip the broadcast when nothing actually changed.
export async function finishExamForEveryone(
  examId: string,
  options: { redirectStudents: boolean; broadcast?: boolean; invalidateCache?: (examId: string) => void }
): Promise<FinishResult> {
  const exam = await getOtisakExamById(examId);
  if (!exam) return { ok: false, error: 'Exam not found', status: 404 };

  const openRows = await query<{ id: string; started_at: Date }>(
    `SELECT id, started_at FROM otisak_attempts
     WHERE exam_id = $1 AND submitted = FALSE`,
    [examId],
  );

  const startMs = exam.exam_started_at ? new Date(exam.exam_started_at).getTime() : null;
  let finishedCount = 0;
  for (const row of openRows.rows) {
    const refStart = startMs ?? new Date(row.started_at).getTime();
    const elapsed = Math.max(1, Math.floor((Date.now() - refStart) / 1000));
    try {
      await finishAttempt(row.id, elapsed);
      finishedCount++;
    } catch (e) {
      console.error('finishExamForEveryone: per-attempt finish failed', row.id, e);
    }
  }

  await endLockdown(examId);
  await updateOtisakExamStatus(examId, 'completed');
  options.invalidateCache?.(examId);

  if (options.broadcast !== false) {
    broadcastExamEvent(examId, {
      type: 'exam.finished',
      redirect: options.redirectStudents,
      finished_count: finishedCount,
    });
    // Live-stats cache should reflect that everyone is now submitted, in case the
    // admin RoomPage polls right after we broadcast.
    refreshLiveStatsNow(examId).catch((err) => console.error('finishExamForEveryone: refreshLiveStatsNow failed', err));
  }

  return { ok: true, finishedCount };
}

// True when the exam timer has run out — i.e. exam_started_at + duration + extra
// has elapsed, accounting for any lockdown pauses. Mirrors the per-attempt
// autoFinishIfExpired check but operates on the exam as a whole.
export async function isExamPastDeadline(examId: string): Promise<boolean> {
  const exam = await getOtisakExamById(examId);
  if (!exam || !exam.exam_started_at || exam.status !== 'active') return false;
  const startMs = new Date(exam.exam_started_at).getTime();
  const extraSec = Number(exam.extra_seconds ?? 0);
  const durationMs = (exam.duration_minutes * 60 + extraSec) * 1000;
  const pauseMs = (await getTotalLockdownPauseSeconds(examId)) * 1000;
  return Date.now() - pauseMs >= startMs + durationMs;
}
