import { Router, Request, Response } from 'express';
import {
  getOtisakExamById,
  getOtisakQuestions,
  getActiveAttempt,
  autoFinishIfExpired,
  startExamAttempt,
  getSavedAnswers,
  submitAttemptAnswers,
  finishAttempt,
  getAttemptResults,
  getUserAttempts,
  joinExamByIndex,
  shuffleArray,
} from '../db/otisak';
import { getActiveLockdown } from '../db/settings';
import { logEvents } from '../db/activity-log';
import {
  createExamRequest,
  listRequestsForUser,
  isSubmittableByStudent,
} from '../db/exam-requests';
import { findUserById, findUserByIndexNumber } from '../db/users';
import { broadcastExamEvent } from '../ws/events';
import { refreshLiveStatsNow } from '../ws/liveStatsAggregator';
import { createSessionCookie, parseSessionCookie, SESSION_COOKIE, DEFAULT_TTL_MS } from '../session';
import { markSessionActive, isLockedByOtherSession } from '../session-tracker';
import { requireAuth, requireRole } from '../middleware';
import { getExamId, getCachedExam } from './exam-shared';

const router = Router({ mergeParams: true });

// GET /exams/:examId - get exam + attempt + questions for student
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const user = req.user!;

    const exam = await getOtisakExamById(examId);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    let attempt = await getActiveAttempt(examId, user.id);
    if (attempt) {
      const expired = await autoFinishIfExpired(attempt);
      if (expired) {
        attempt = null;
      }
    }

    // If student already has a submitted attempt, signal client to redirect to results
    if (!attempt && user.role === 'student') {
      const userAttempts = await getUserAttempts(user.id);
      const submitted = userAttempts.find((a) => a.exam_id === examId && a.submitted);
      if (submitted) {
        return res.json({ exam, attempt: null, questions: [], savedAnswers: [], alreadySubmitted: true });
      }
    }

    // Auto-create attempt for students once admin has started the exam, so the timer becomes visible.
    // BUT: late joiners (who have a pending late_join request) must wait for admin approval.
    if (!attempt && user.role === 'student' && exam.status === 'active' && exam.exam_started_at) {
      const pending = await listRequestsForUser(examId, user.id);
      const hasPendingLateJoin = pending.some((r) => r.type === 'late_join' && r.status === 'pending');
      if (hasPendingLateJoin) {
        return res.json({
          exam,
          attempt: null,
          questions: [],
          savedAnswers: [],
          pendingRequest: { type: 'late_join' },
        });
      }
      attempt = await startExamAttempt(examId, user.id, {
        ip_address: req.ip || undefined,
        user_agent: req.headers['user-agent'] || undefined,
      });
    }

    let questions = await getOtisakQuestions(examId);

    // Apply the per-attempt seeded shuffle so the student sees the same
    // question / answer ordering that `getAttemptResults` (and therefore the
    // results screen + per-student PDF) will compute later. Without this the
    // student saw canonical position order while results came out shuffled.
    // Only runs when the student has an attempt - admins/assistants viewing
    // the same endpoint should keep canonical order for editing flows.
    if (attempt && user.role === 'student') {
      const seed = Number(attempt.shuffle_seed) | 0;
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

    // For students, strip correct answers (applied after shuffling so the
    // shuffle key isn't influenced by the redacted field).
    if (user.role === 'student') {
      questions = questions.map((q) => ({
        ...q,
        answers: q.answers.map((a) => ({ ...a, is_correct: undefined as unknown as boolean })),
      }));
    }

    let savedAnswers: Array<{ question_id: string; selected_answer_ids: string[] }> = [];
    if (attempt) {
      savedAnswers = await getSavedAnswers(attempt.id);
    }

    return res.json({
      exam,
      attempt,
      questions,
      savedAnswers,
    });
  } catch (error) {
    console.error('Get exam error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /exams/:examId/attempt - save/submit answers.
// Student-only: admins/assistants writing into otisak_attempts as their own
// user_id would corrupt live stats and audit trails (they'd show up as
// participants). Force-finish flows go through /finish-all instead.
router.post('/attempt', requireAuth, requireRole(['student']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const user = req.user!;
    const { answers, submit, time_spent_seconds } = req.body;

    let attempt = await getActiveAttempt(examId, user.id);

    // If no active attempt, start one - but ONLY if the student hasn't already
    // submitted this exam. Without this guard a student could call /attempt
    // again after submitting and silently overwrite their previous result.
    if (!attempt) {
      const userAttempts = await getUserAttempts(user.id);
      const submittedAlready = userAttempts.find((a) => a.exam_id === examId && a.submitted);
      if (submittedAlready) {
        return res.status(409).json({ error: 'Already submitted', code: 'ALREADY_SUBMITTED' });
      }

      const exam = await getOtisakExamById(examId);
      if (!exam) {
        return res.status(404).json({ error: 'Exam not found' });
      }
      if (exam.status !== 'active') {
        return res.status(400).json({ error: 'Exam is not active' });
      }

      attempt = await startExamAttempt(examId, user.id, {
        ip_address: req.ip || undefined,
        user_agent: req.headers['user-agent'] || undefined,
      });
    }

    // Save answers
    if (answers && Array.isArray(answers)) {
      await submitAttemptAnswers(attempt.id, answers);
    }

    // Submit (finish) attempt
    if (submit === true) {
      const timeSpent = time_spent_seconds || Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 1000);
      const finished = await finishAttempt(attempt.id, timeSpent);
      // Refresh the live-stats cache immediately so the next admin poll (within 5s)
      // reflects this submission. Also fire a WS event so any admin RoomPage that
      // happens to be open can react instantly (without waiting up to 5s for the next poll).
      try {
        const stats = await refreshLiveStatsNow(examId);
        if (stats) {
          broadcastExamEvent(examId, {
            type: 'exam.submitted',
            user_id: user.id,
            finished_count: stats.finished_count,
            total_participants: stats.total_participants,
          });
        }
      } catch (err) {
        console.error('Failed to refresh stats / broadcast exam.submitted', err);
      }
      return res.json({ attempt: finished, submitted: true });
    }

    // No per-save broadcast: progress is delivered to admin via the 5s polling cycle,
    // which fetches the server-side cache. Lower WS chatter, simpler debugging.
    return res.json({ attempt, submitted: false });
  } catch (error) {
    console.error('Attempt error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /exams/:examId/results
router.get('/results', requireAuth, async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const user = req.user!;

    const attempts = await getUserAttempts(user.id);
    const attempt = attempts.find((a) => a.exam_id === examId && a.submitted);
    if (!attempt) {
      return res.status(404).json({ error: 'No submitted attempt found' });
    }

    const fullResults = await getAttemptResults(attempt.id);

    // For students, strip everything that could leak correct answers or content.
    // The recap UI only needs per-question id + points (max) + points_awarded + ai_grading_status.
    if (user.role === 'student' && fullResults) {
      const safe = {
        attempt: fullResults.attempt,
        exam: {
          id: fullResults.exam.id,
          title: fullResults.exam.title,
          pass_threshold: fullResults.exam.pass_threshold,
          has_pass_threshold: fullResults.exam.has_pass_threshold,
          allow_review: false,
        },
        questions: fullResults.questions.map((q) => ({
          question: { id: q.question.id, points: q.question.points, type: q.question.type },
          answers: [],
          selected_answer_id: null,
          selected_answer_ids: [],
          points_awarded: q.points_awarded,
          correct_answer_id: null,
          correct_answer_ids: [],
          text_answer: null,
          ai_grading_status: q.ai_grading_status,
          ai_feedback: null,
        })),
      };
      return res.json({ results: safe });
    }

    return res.json({ results: fullResults });
  } catch (error) {
    console.error('Results error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /exams/:examId/lookup-by-index - public, look up student name by index for confirmation
router.post('/lookup-by-index', async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const { index_number } = req.body;

    if (!index_number?.trim()) {
      return res.status(400).json({ error: 'Index number is required' });
    }

    const exam = await getOtisakExamById(examId);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    if (exam.status !== 'active') {
      return res.status(400).json({ error: 'Exam is not active' });
    }

    const user = await findUserByIndexNumber(index_number.trim());
    if (!user) {
      return res.status(404).json({ error: 'Index number not found. Contact your administrator.' });
    }

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        index_number: user.index_number,
      },
    });
  } catch (error) {
    console.error('Lookup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /exams/:examId/join - public, student joins with index number
router.post('/join', async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const { index_number } = req.body;

    if (!index_number?.trim()) {
      return res.status(400).json({ error: 'Index number is required' });
    }

    const result = await joinExamByIndex(examId, index_number);
    if (!result.user) {
      return res.status(400).json({ error: result.error });
    }

    // Create a session for this student
    const fullUser = await findUserById(result.user.id);
    if (!fullUser) {
      return res.status(400).json({ error: 'User not found' });
    }

    // No-double-login enforcement. Covers BOTH the lobby/waiting phase (no
    // attempt yet, student is just sitting on the join screen) and the
    // running exam phase (attempt exists). The earlier "lobby is OK to
    // switch devices" carve-out was a cheating risk: a student could sit
    // on PC A in waiting and join from PC B to have a second runner once
    // the timer started. The session-tracker entry goes stale after
    // STALE_MS of no heartbeat, so an honest device-switch (broken PC,
    // browser crash) is still recoverable after a few minutes.
    {
      const incomingCookie = req.cookies?.[SESSION_COOKIE];
      const incomingSession = incomingCookie ? parseSessionCookie(incomingCookie) : null;
      const incomingSessionId = incomingSession?.id ?? null;
      if (isLockedByOtherSession(fullUser.id, incomingSessionId)) {
        return res.status(409).json({
          error: 'Index already in use on another device for this exam.',
          code: 'INDEX_IN_USE',
        });
      }
    }

    const cookie = createSessionCookie({
      id: fullUser.id,
      email: fullUser.email,
      name: fullUser.name || undefined,
      role: fullUser.role,
      index_number: fullUser.index_number || undefined,
    });

    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie(SESSION_COOKIE, cookie, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: DEFAULT_TTL_MS,
      path: '/',
    });

    // Mark this user's session active so the next /join from a different
    // browser is blocked while this one is taking the exam.
    const newSession = parseSessionCookie(cookie);
    if (newSession) markSessionActive(fullUser.id, newSession.id);

    // Late-join detection: if the admin has already started the exam,
    // submit a late_join request that the admin must approve.
    // Read fresh - never from the 1s poll cache - so we never miss a /start
    // that fired in the same second the student joined.
    let pendingRequestId: string | null = null;
    const exam = await getOtisakExamById(examId);
    if (exam && exam.exam_started_at && exam.status === 'active') {
      const created = await createExamRequest({
        examId,
        userId: fullUser.id,
        type: 'late_join',
      });
      if ('request' in created) {
        pendingRequestId = created.request.id;
        // Tell every connected admin so the request list refreshes immediately.
        broadcastExamEvent(examId, {
          type: 'request.created',
          request_id: created.request.id,
          request_type: created.request.type,
          user_id: created.request.user_id,
        });
      }
    }

    // Always notify the room so the admin's participant list refreshes the moment a
    // student joins, instead of waiting for the 5s polling fallback.
    broadcastExamEvent(examId, {
      type: 'student.joined',
      user_id: fullUser.id,
    });

    return res.json({
      user: {
        id: result.user.id,
        name: result.user.name,
        index_number: result.user.index_number,
      },
      exam_id: examId,
      pending_request_id: pendingRequestId,
      late_join: !!pendingRequestId,
    });
  } catch (error) {
    console.error('Join error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /exams/:examId/room-status - public, get exam status for polling
router.get('/room-status', async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const exam = await getCachedExam(examId);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Heartbeat the session-tracker if the caller is a logged-in student in
    // the lobby. /room-status is the only request a waiting student fires
    // (every 2 seconds while the lobby waits for the timer to start), and
    // without this their session-tracker entry would go stale after
    // STALE_MS and another device could grab the lock. Public route stays
    // public; we just opportunistically refresh the lock when the cookie
    // is present.
    const cookieValue = req.cookies?.[SESSION_COOKIE];
    if (cookieValue) {
      const session = parseSessionCookie(cookieValue);
      if (session?.user?.id && session.id) {
        markSessionActive(session.user.id, session.id);
      }
    }

    const lockdown = await getActiveLockdown(examId);
    const { getTotalLockdownPauseSeconds } = await import('../db/settings');
    const paused_seconds = await getTotalLockdownPauseSeconds(examId);

    const extraSec = Number((exam as unknown as { extra_seconds?: number }).extra_seconds ?? 0);
    return res.json({
      title: exam.title,
      subject_name: exam.subject_name,
      status: exam.status,
      exam_started_at: exam.exam_started_at,
      duration_minutes: exam.duration_minutes,
      extra_seconds: extraSec,
      effective_duration_seconds: Number(exam.duration_minutes) * 60 + extraSec,
      lockdown_active: !!lockdown,
      lockdown_message: lockdown?.message ?? null,
      paused_seconds,
    });
  } catch (error) {
    console.error('Room status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /exams/:examId/lockdown - public, check lockdown status (and total paused seconds for timer)
router.get('/lockdown', async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const lockdown = await getActiveLockdown(examId);
    const { getTotalLockdownPauseSeconds } = await import('../db/settings');
    const paused_seconds = await getTotalLockdownPauseSeconds(examId);
    const exam = await getCachedExam(examId);
    const extra_seconds = Number((exam as unknown as { extra_seconds?: number } | null)?.extra_seconds ?? 0);
    return res.json({
      lockdown: lockdown ? { is_active: true, message: lockdown.message } : null,
      paused_seconds,
      extra_seconds,
    });
  } catch (error) {
    console.error('Lockdown status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /exams/:examId/events - auth required, log activity events
router.post('/events', requireAuth, async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const { attempt_id, events } = req.body;

    if (!attempt_id || !Array.isArray(events)) {
      return res.status(400).json({ error: 'attempt_id and events array are required' });
    }
    if (events.length > 500) {
      return res.status(400).json({ error: 'Too many events in one batch' });
    }

    // Verify the attempt belongs to this user and exam - prevent log poisoning across students
    const userAttempts = await getUserAttempts(req.user!.id);
    const owns = userAttempts.some((a) => a.id === attempt_id && a.exam_id === examId);
    if (!owns) {
      return res.status(403).json({ error: 'Attempt does not belong to this user' });
    }

    await logEvents(attempt_id, req.user!.id, examId, events);
    return res.json({ success: true });
  } catch (error) {
    console.error('Events error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// REQUEST QUEUE - admin approval for student-initiated actions
// ============================================================================

// POST /exams/:examId/requests - student creates a request (whitelist enforced server-side)
router.post('/requests', requireAuth, async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const user = req.user!;
    const { type, payload } = req.body || {};

    if (typeof type !== 'string' || !isSubmittableByStudent(type)) {
      return res.status(400).json({ error: 'Invalid or unsupported request type' });
    }

    const result = await createExamRequest({
      examId,
      userId: user.id,
      type,
      payload: typeof payload === 'object' && payload ? payload : {},
    });

    if ('error' in result) return res.status(400).json({ error: result.error });
    // Notify everyone subscribed (admin RoomPage refreshes the list).
    broadcastExamEvent(examId, {
      type: 'request.created',
      request_id: result.request.id,
      request_type: result.request.type,
      user_id: result.request.user_id,
    });
    return res.json({ request: result.request });
  } catch (error) {
    console.error('Create request error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /exams/:examId/requests/mine - auth: caller's own requests for this exam
router.get('/requests/mine', requireAuth, async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const requests = await listRequestsForUser(examId, req.user!.id);
    return res.json({ requests });
  } catch (error) {
    console.error('List my requests error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
