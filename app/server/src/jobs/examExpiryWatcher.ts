import { query } from '../db/client';
import { finishExamForEveryone, isExamPastDeadline } from '../lib/finishExam';
import { logger } from '../lib/logger';
import { reportError } from '../lib/reportError';

// Background job: every WATCH_INTERVAL_MS, find active exams whose timer has expired
// and force-finish them.
//
// Why this exists: previously the exam only ended when (a) the admin clicked
// "finish for everyone" or (b) each student's local timer hit 0 and called the
// submit endpoint. If a student closed the tab, lost connection, or never opened
// the page after joining, their attempt sat open forever. With this watcher, the
// server is authoritative — when the deadline passes, every unsubmitted attempt
// gets force-submitted from the server side and an exam.finished broadcast
// bounces any still-connected client to the results screen.

const WATCH_INTERVAL_MS = 30_000;

let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  try {
    // Only check exams that are currently active and have actually been started.
    // No filter on attempts here — an exam can hit its deadline with zero
    // submitted attempts and still need to flip to 'completed'.
    const result = await query<{ id: string }>(
      `SELECT id FROM otisak_exams
       WHERE status = 'active' AND exam_started_at IS NOT NULL`
    );
    for (const row of result.rows) {
      try {
        if (await isExamPastDeadline(row.id)) {
          const finished = await finishExamForEveryone(row.id, {
            // Server-driven expiry routes students to results, not the home page —
            // the admin "redirect to home" flag is an explicit-action thing only.
            redirectStudents: false,
          });
          if (finished.ok) {
            logger.info(
              { examId: row.id, finishedCount: finished.finishedCount },
              'examExpiryWatcher: auto-finished exam',
            );
          }
        }
      } catch (err) {
        reportError(err, {
          source: 'job',
          context: { job: 'examExpiryWatcher', examId: row.id },
        });
      }
    }
  } catch (err) {
    reportError(err, { source: 'job', context: { job: 'examExpiryWatcher', phase: 'top-level' } });
  }
}

export function startExamExpiryWatcher(): void {
  if (timer) return;
  // First tick immediately so a server restart right at the deadline doesn't
  // wait the full interval before catching up.
  tick().catch((err) =>
    reportError(err, { source: 'job', context: { job: 'examExpiryWatcher', phase: 'initial' } }),
  );
  timer = setInterval(tick, WATCH_INTERVAL_MS);
}

export function stopExamExpiryWatcher(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
