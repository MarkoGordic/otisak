import { Router, Request, Response } from 'express';
import {
  getOtisakExamById,
  getActiveAttempt,
  finishAttempt,
  getExamRoomStatus,
  startExamTimer,
} from '../db/otisak';
import { createLockdown, endLockdown } from '../db/settings';
import {
  listPendingRequestsForExam,
  decideExamRequest,
} from '../db/exam-requests';
import { query } from '../db/client';
import { broadcastExamEvent } from '../ws/events';
import { getCachedLiveStats, markExamMonitored, refreshLiveStatsNow } from '../ws/liveStatsAggregator';
import { finishExamForEveryone } from '../lib/finishExam';
import { clearSessionForUser } from '../session-tracker';
import { requireAuth, requireRole } from '../middleware';
import { getExamId, assertCanManageExam, invalidateExamCache } from './exam-shared';

const router = Router({ mergeParams: true });

// GET /exams/:examId/room - admin/assistant, get room status with participants
router.get('/room', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const roomStatus = await getExamRoomStatus(examId);
    return res.json(roomStatus);
  } catch (error) {
    console.error('Room error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /exams/:examId/live-stats - admin/assistant, snapshot of per-student live progress.
// Served from a 5s server-side cache populated by the background aggregator. Admin's
// RoomPage polls this every 5s; the cache absorbs the load so 10 admins polling do not
// equal 10 DB hits per 5s. First-time hit primes the cache and marks the exam monitored.
router.get('/live-stats', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const cached = getCachedLiveStats(examId);
    if (cached) {
      // Mark monitored in case admin landed via direct URL without the WS subscription firing yet.
      markExamMonitored(examId);
      return res.json(cached);
    }
    // Cache miss: compute now AND start the aggregator for this exam.
    const fresh = await refreshLiveStatsNow(examId);
    if (!fresh) return res.status(500).json({ error: 'Failed to compute stats' });
    return res.json(fresh);
  } catch (error) {
    console.error('Live stats error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /exams/:examId/start - admin/assistant, start exam timer
router.post('/start', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    if (!(await assertCanManageExam(req, res, examId))) return;
    const exam = await startExamTimer(examId);
    if (!exam) {
      return res.status(400).json({ error: 'Exam not found or not active' });
    }
    invalidateExamCache(examId);
    broadcastExamEvent(examId, {
      type: 'exam.started',
      exam_started_at: exam.exam_started_at,
      duration_minutes: exam.duration_minutes,
    });
    return res.json({ exam });
  } catch (error) {
    console.error('Start exam error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /exams/:examId/finish-all  admin/assistant
// One-shot exam termination:
//   - mark every unsubmitted attempt as submitted (score is computed from
//     whatever answers were saved before the cut-off)
//   - close any open lockdown
//   - flip exam.status to 'completed' (which is irreversible - the
//     updateOtisakExamStatus DB layer refuses to flip back to 'active')
//   - broadcast exam.finished so every connected student transitions out of
//     the exam UI immediately. The optional `redirect` flag tells the client
//     to bounce home instead of showing the results screen.
router.post('/finish-all', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    if (!(await assertCanManageExam(req, res, examId))) return;
    const redirectStudents = req.body?.redirect_students === true;
    const result = await finishExamForEveryone(examId, {
      redirectStudents,
      invalidateCache: invalidateExamCache,
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json({ ok: true, finished_count: result.finishedCount, redirect_students: redirectStudents });
  } catch (error) {
    console.error('Finish-all error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /exams/:examId/lockdown - admin/assistant, lock/unlock
router.post('/lockdown', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    if (!(await assertCanManageExam(req, res, examId))) return;
    const { lock, message } = req.body;

    if (lock) {
      await createLockdown(examId, req.user!.id, message);
      broadcastExamEvent(examId, { type: 'lockdown.changed', is_active: true, message: message ?? null });
      return res.json({ locked: true });
    } else {
      await endLockdown(examId);
      broadcastExamEvent(examId, { type: 'lockdown.changed', is_active: false, message: null });
      return res.json({ locked: false });
    }
  } catch (error) {
    console.error('Lockdown error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /exams/:examId/requests - admin/assistant: list pending requests for the exam
router.get('/requests', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const requests = await listPendingRequestsForExam(examId);
    return res.json({ requests });
  } catch (error) {
    console.error('List requests error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /exams/:examId/requests/:id/decide - admin/assistant: approve or deny
router.post('/requests/:id/decide', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    if (!(await assertCanManageExam(req, res, examId))) return;
    const requestId = req.params.id;
    const { decision, note } = req.body || {};

    if (decision !== 'approved' && decision !== 'denied') {
      return res.status(400).json({ error: 'decision must be "approved" or "denied"' });
    }

    const result = await decideExamRequest({
      requestId,
      examId,
      decidedBy: req.user!.id,
      decision,
      note: typeof note === 'string' ? note : undefined,
    });

    if ('error' in result) return res.status(400).json({ error: result.error });
    invalidateExamCache(examId);
    broadcastExamEvent(examId, {
      type: 'request.decided',
      request_id: result.request.id,
      request_type: result.request.type,
      user_id: result.request.user_id,
      status: result.request.status,
    });
    return res.json({ request: result.request });
  } catch (error) {
    console.error('Decide request error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// TIMER ADJUSTMENT - admin adds or removes seconds from the running clock
// ============================================================================

// POST /exams/:examId/adjust-timer - admin/assistant
router.post('/adjust-timer', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    if (!(await assertCanManageExam(req, res, examId))) return;
    const { delta_seconds } = req.body || {};

    const delta = Number(delta_seconds);
    if (!Number.isFinite(delta) || delta === 0) {
      return res.status(400).json({ error: 'delta_seconds must be a non-zero number' });
    }
    if (Math.abs(delta) > 6 * 3600) {
      return res.status(400).json({ error: 'delta_seconds out of range' });
    }

    const exam = await getOtisakExamById(examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const baseDuration = Number(exam.duration_minutes) * 60;
    const currentExtra = Number((exam as unknown as { extra_seconds?: number }).extra_seconds ?? 0);
    let nextExtra = currentExtra + Math.round(delta);
    // Don't let total effective duration go below 30 seconds - gives the timer time to settle.
    if (baseDuration + nextExtra < 30) nextExtra = -baseDuration + 30;

    const updated = await query<{ id: string; extra_seconds: number; duration_minutes: number }>(
      `UPDATE otisak_exams SET extra_seconds = $1, updated_at = NOW() WHERE id = $2 RETURNING id, extra_seconds, duration_minutes`,
      [nextExtra, examId]
    );

    invalidateExamCache(examId);

    const newExtra = Number(updated.rows[0]?.extra_seconds ?? nextExtra);
    broadcastExamEvent(examId, {
      type: 'timer.adjusted',
      extra_seconds: newExtra,
      effective_duration_seconds: baseDuration + newExtra,
      delta_seconds: Math.round(delta),
    });

    return res.json({
      extra_seconds: newExtra,
      duration_minutes: Number(updated.rows[0]?.duration_minutes ?? exam.duration_minutes),
      effective_duration_seconds: baseDuration + newExtra,
    });
  } catch (error) {
    console.error('Adjust timer error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// KICK - admin/assistant removes a specific student from the running exam
// ============================================================================

// POST /exams/:examId/kick - body { user_id }
// Finishes the student's attempt (if any) with whatever they had saved so the
// row stays in the results table, clears the student's device-lock so they
// can navigate freely, and broadcasts student.kicked so the target's browser
// drops out of the exam UI and lands on the home/picker screen.
//
// The kicked student can't re-enter THIS exam (GET /exams/:examId sees their
// submitted attempt and routes them straight to results), but they can pick
// a different active exam from the home page if there is one.
router.post('/kick', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    if (!(await assertCanManageExam(req, res, examId))) return;

    const { user_id } = req.body || {};
    if (typeof user_id !== 'string' || !user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const attempt = await getActiveAttempt(examId, user_id);
    if (attempt) {
      // Score with whatever they had at the moment of the kick. Same path
      // /finish-all uses for unsubmitted attempts.
      const elapsed = Math.max(1, Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 1000));
      try {
        await finishAttempt(attempt.id, elapsed);
      } catch (err) {
        console.error('kick: finishAttempt failed for', attempt.id, err);
      }
    }

    // Release the session-tracker entry so the kicked student isn't stuck
    // unable to log into any other exam from another device.
    clearSessionForUser(user_id);

    broadcastExamEvent(examId, {
      type: 'student.kicked',
      user_id,
    });

    // Refresh the live-stats cache so the room's participant list reflects
    // the new submitted=true state without waiting for the next 5s poll.
    refreshLiveStatsNow(examId).catch((err) => console.error('kick: refreshLiveStatsNow failed', err));

    return res.json({ ok: true });
  } catch (error) {
    console.error('Kick error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
