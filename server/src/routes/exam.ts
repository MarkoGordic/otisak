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
  getExamAttemptsSummary,
  enrollUserInExam,
  enrollUsersByPattern,
  enrollByCourseAndYear,
  getExamEnrollments,
  createOtisakQuestion,
  deleteOtisakQuestion,
  joinExamByIndex,
  getExamRoomStatus,
  startExamTimer,
  updateOtisakExamStatus,
  getLiveExamStats,
} from '../db/otisak';
import { getActiveLockdown, createLockdown, endLockdown } from '../db/settings';
import { logEvents, getActivityLog, getActivityStats, enrichActivityEventData } from '../db/activity-log';
import {
  createExamRequest,
  listPendingRequestsForExam,
  listRequestsForUser,
  decideExamRequest,
  isSubmittableByStudent,
} from '../db/exam-requests';
import { findUserById, findUserByIndexNumber } from '../db/users';
import { query } from '../db/client';
import { broadcastExamEvent } from '../ws/events';
import { getCachedLiveStats, markExamMonitored, refreshLiveStatsNow } from '../ws/liveStatsAggregator';
import { buildStudentReportHTML, buildResultsTableHTML, renderHtmlToPdf } from '../lib/studentReport';
import { finishExamForEveryone } from '../lib/finishExam';
import archiver from 'archiver';
import { createSessionCookie, parseSessionCookie, SESSION_COOKIE, DEFAULT_TTL_MS } from '../session';
import { markSessionActive, isLockedByOtherSession } from '../session-tracker';
import { requireAuth, requireRole } from '../middleware';
import { canUserManageExam } from '../db/auth-helpers';

const router = Router({ mergeParams: true });

// Helper function to get examId from params
function getExamId(req: Request): string {
  return req.params.examId;
}

// Gate any mutation route that admins+assistants share: admins are always
// allowed; assistants must be assigned to the exam's subject. Sends the
// response on rejection and returns false so the caller can early-exit.
async function assertCanManageExam(req: Request, res: Response, examId: string): Promise<boolean> {
  const user = req.user!;
  if (user.role === 'admin') return true;
  const allowed = await canUserManageExam(user.id, examId, false);
  if (!allowed) {
    res.status(403).json({ error: 'Not authorized to manage this exam' });
    return false;
  }
  return true;
}

// Tiny in-memory cache for high-frequency polling endpoints. 1s TTL keeps the load
// off the DB when many students poll /room-status and /lockdown every 2-3s.
const examCache = new Map<string, { exam: Awaited<ReturnType<typeof getOtisakExamById>>; expiresAt: number }>();
async function getCachedExam(examId: string) {
  const now = Date.now();
  const hit = examCache.get(examId);
  if (hit && hit.expiresAt > now) return hit.exam;
  const exam = await getOtisakExamById(examId);
  examCache.set(examId, { exam, expiresAt: now + 1000 });
  return exam;
}
function invalidateExamCache(examId: string) { examCache.delete(examId); }

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

    // For students, strip correct answers
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

    // If no active attempt, start one — but ONLY if the student hasn't already
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

// GET /exams/:examId/report - admin/assistant, exam attempts summary
router.get('/report', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const summary = await getExamAttemptsSummary(examId);
    return res.json(summary);
  } catch (error) {
    console.error('Report error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /exams/:examId/report/:userId - admin/assistant, detailed student report JSON
router.get('/report/:userId', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const userId = req.params.userId;

    const exam = await getOtisakExamById(examId);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const student = await findUserById(userId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const attempts = await getUserAttempts(userId);
    const attempt = attempts.find((a) => a.exam_id === examId && a.submitted);
    if (!attempt) {
      return res.status(404).json({ error: 'No submitted attempt found' });
    }

    const fullResults = await getAttemptResults(attempt.id);
    const activityLog = await getActivityLog(attempt.id);
    const stats = await getActivityStats(attempt.id);

    const results = fullResults
      ? {
          questions: fullResults.questions.map((q, i) => ({
            index: i + 1,
            text: q.question.text,
            type: q.question.type,
            points: Number(q.question.points),
            points_awarded: Number(q.points_awarded),
            selected_answer_ids: q.selected_answer_ids,
            correct_answer_ids: q.correct_answer_ids,
            text_answer: q.text_answer,
            answers: q.answers.map((a) => ({
              id: a.id,
              text: a.text,
              is_correct: a.is_correct,
            })),
          })),
        }
      : null;

    const enriched = await enrichActivityEventData(examId, activityLog);
    const timeline = enriched.map((e) => ({
      time: typeof e.timestamp === 'string' ? e.timestamp : new Date(e.timestamp).toISOString(),
      type: e.event_type,
      data: e.event_data,
    }));

    return res.json({
      exam: {
        id: exam.id,
        title: exam.title,
        subject_name: exam.subject_name,
        duration_minutes: exam.duration_minutes,
        pass_threshold: Number(exam.pass_threshold),
      },
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        index_number: student.index_number,
      },
      attempt: {
        id: attempt.id,
        started_at: attempt.started_at,
        finished_at: attempt.finished_at,
        total_points: Number(attempt.total_points),
        max_points: Number(attempt.max_points),
        time_spent_seconds: Number(attempt.time_spent_seconds),
      },
      results,
      activity: {
        stats,
        timeline,
      },
    });
  } catch (error) {
    console.error('Student report error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /exams/:examId/report/:userId/pdf - admin/assistant, single-student PDF report.
// HTML construction and Puppeteer rendering both live in lib/studentReport so the bulk
// /export-results path uses an identical layout.
router.get('/report/:userId/pdf', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const userId = req.params.userId;
    const built = await buildStudentReportHTML(examId, userId);
    if (!built.ok) return res.status(built.status).json({ error: built.error });

    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const pdf = await renderHtmlToPdf(built.data.html, browser);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${built.data.filenameBase}.pdf"`);
      return res.end(pdf);
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error('PDF report error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /exams/:examId/export-results - admin/assistant, ZIP bundle of all post-exam
// artifacts: rezultati.csv (full per-student table), rezultati.pdf (formatted version
// of the same table), and per-student detailed PDFs under izvestaji/. Intended to be
// downloaded once an exam is finished, before the admin archives it.
router.get('/export-results', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const exam = await getOtisakExamById(examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    // Collect every submitted attempt + live-stats row (the live-stats query also gives
    // us suspicious_count, which we want in the CSV/table without re-querying).
    const summary = await getExamAttemptsSummary(examId);
    const stats = await getLiveExamStats(examId);
    const suspiciousByUser = new Map(stats.per_student.map((r) => [r.user_id, r.suspicious_count] as const));
    const submitted = summary.filter((s) => s.submitted);

    if (submitted.length === 0) {
      return res.status(409).json({ error: 'No submitted attempts to export' });
    }

    // Build a single CSV. Excel-friendly: UTF-8 BOM + CRLF separators. Embedded
    // commas/quotes are escaped per RFC 4180.
    const csvEscape = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csvHeader = [
      'Ime', 'Indeks', 'Email', 'Bodovi', 'Maksimum', 'Procenat', 'Polozeno',
      'Vreme (sekundi)', 'Pocetak', 'Kraj', 'Sumnjive aktivnosti',
    ];
    const csvRows: string[][] = [csvHeader];
    type TableRow = {
      name: string | null; indexNumber: string | null; email: string;
      totalPoints: number; maxPoints: number; percentage: number; passed: boolean;
      timeSpentSeconds: number; suspiciousCount: number;
    };
    const tableRows: TableRow[] = [];
    for (const row of submitted) {
      const totalPoints = Number(row.total_points);
      const maxPoints = Number(row.max_points);
      const percentage = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
      const passed = percentage >= Number(exam.pass_threshold);
      const suspiciousCount = suspiciousByUser.get(row.user_id) ?? 0;
      csvRows.push([
        row.user_name ?? '',
        row.index_number ?? '',
        row.user_email,
        String(totalPoints),
        String(maxPoints),
        `${percentage}%`,
        passed ? 'da' : 'ne',
        String(row.time_spent_seconds),
        row.started_at ? new Date(row.started_at).toISOString() : '',
        row.finished_at ? new Date(row.finished_at).toISOString() : '',
        String(suspiciousCount),
      ].map(csvEscape));
      tableRows.push({
        name: row.user_name,
        indexNumber: row.index_number,
        email: row.user_email,
        totalPoints, maxPoints, percentage, passed,
        timeSpentSeconds: Number(row.time_spent_seconds),
        suspiciousCount,
      });
    }
    const csvBody = '﻿' + csvRows.map((r) => r.join(',')).join('\r\n');

    // Stream the ZIP directly to the response so a 200-student export doesn't have to
    // buffer in memory before the user starts downloading.
    const safeBase = (exam.title || 'otisak').replace(/[^a-z0-9._-]+/gi, '_');
    // Timestamp in the filename so the admin can re-download later (e.g. after AI
    // re-grading) and not overwrite an earlier export. Format: 2026-05-12_14-32.
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    const zipName = `${safeBase}-rezultati-${stamp}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (err) => { console.error('archiver warning:', err); });
    archive.on('error', (err) => { console.error('archiver error:', err); try { res.end(); } catch {} });
    archive.pipe(res);

    archive.append(csvBody, { name: 'rezultati.csv' });

    // Single Puppeteer browser shared across the summary PDF + every student PDF.
    // Launching once per PDF would dominate the total export time (each launch ~1-2s).
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      // Summary table PDF (landscape so all 9 columns fit comfortably).
      const tableHtml = buildResultsTableHTML({
        examTitle: exam.title,
        subjectName: exam.subject_name,
        passThreshold: Number(exam.pass_threshold),
        rows: tableRows,
      });
      const tablePdf = await renderHtmlToPdf(tableHtml, browser, true);
      archive.append(tablePdf, { name: 'rezultati.pdf' });

      // Per-student PDFs. Render serially: parallel pages in one Chromium can OOM
      // on small servers and the time is already dominated by IO.
      for (const row of submitted) {
        try {
          const built = await buildStudentReportHTML(examId, row.user_id);
          if (!built.ok) continue;
          const pdf = await renderHtmlToPdf(built.data.html, browser);
          archive.append(pdf, { name: `izvestaji/${built.data.filenameBase}.pdf` });
        } catch (err) {
          console.error(`export-results: failed to render PDF for ${row.user_id}`, err);
        }
      }
    } finally {
      await browser.close();
    }

    await archive.finalize();
  } catch (error) {
    console.error('Export results error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      try { res.end(); } catch {}
    }
  }
});

// POST /exams/:examId/enroll - admin/assistant, enroll students
router.post('/enroll', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    if (!(await assertCanManageExam(req, res, examId))) return;
    const { user_ids, pattern, course_code, year, from_number, to_number } = req.body;

    // Enroll by pattern
    if (pattern) {
      const count = await enrollUsersByPattern(examId, pattern);
      return res.json({ enrolled: count });
    }

    // Enroll by course and year
    if (course_code && year) {
      try {
        const count = await enrollByCourseAndYear(examId, course_code, year, from_number, to_number);
        return res.json({ enrolled: count });
      } catch (err) {
        // Validation errors thrown from enrollByCourseAndYear (bad course_code,
        // year out of range, range too wide) are user-correctable: surface
        // them as 400 instead of swallowing into a generic 500.
        return res.status(400).json({ error: (err as Error).message });
      }
    }

    // Enroll specific user IDs
    if (user_ids && Array.isArray(user_ids)) {
      let enrolled = 0;
      for (const userId of user_ids) {
        await enrollUserInExam(examId, userId);
        enrolled++;
      }
      return res.json({ enrolled });
    }

    return res.status(400).json({ error: 'Provide user_ids, pattern, or course_code+year' });
  } catch (error) {
    console.error('Enroll error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /exams/:examId/enroll - admin/assistant, get enrollments
router.get('/enroll', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const enrollments = await getExamEnrollments(examId);
    return res.json({ enrollments });
  } catch (error) {
    console.error('Get enrollments error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /exams/:examId/export-json - admin/assistant, dump exam config + questions
// Used to back up an exam or move it between environments. The shape mirrors
// the body accepted by /api/otisak/exams/import-json.
router.get('/export-json', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const exam = await getOtisakExamById(examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const questions = await getOtisakQuestions(examId);

    const payload = {
      version: 1,
      exam: {
        title: exam.title,
        description: exam.description,
        duration_minutes: Number(exam.duration_minutes),
        pass_threshold: Number(exam.pass_threshold),
        exam_mode: exam.exam_mode,
        allow_review: exam.allow_review,
        shuffle_questions: exam.shuffle_questions,
        shuffle_answers: exam.shuffle_answers,
        partial_scoring: exam.partial_scoring,
        negative_points_enabled: exam.negative_points_enabled,
        negative_points_value: Number(exam.negative_points_value),
        negative_points_threshold: Number(exam.negative_points_threshold),
        subject_name: exam.subject_name,
        subject_code: exam.subject_code,
      },
      questions: questions.map((q) => ({
        type: q.type,
        text: q.text,
        content: q.content,
        points: Number(q.points),
        position: q.position,
        explanation: q.explanation,
        ai_grading_instructions: q.ai_grading_instructions,
        // Carry the single/multi distinction in the export so a round-trip
        // (export → re-import) preserves authoring intent — not just whatever
        // is_correct count happens to be on disk.
        multi_answer: q.multi_answer,
        answers: q.answers.map((a) => ({
          text: a.text,
          is_correct: a.is_correct,
          position: a.position,
        })),
      })),
    };

    const safeName = exam.title.replace(/[^a-z0-9._-]+/gi, '_');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="otisak-${safeName}.json"`);
    return res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error('Export exam JSON error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /exams/:examId/questions - admin/assistant, get questions
router.get('/questions', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const questions = await getOtisakQuestions(examId);
    return res.json({ questions });
  } catch (error) {
    console.error('Get questions error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /exams/:examId/questions - admin/assistant, create question
router.post('/questions', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    if (!(await assertCanManageExam(req, res, examId))) return;
    const question = await createOtisakQuestion(examId, req.body);
    return res.json(question);
  } catch (error) {
    const msg = (error as Error).message || '';
    // Surface validation errors (text length caps, missing text) as 400 so the
    // UI can show the precise reason. Genuine 500s still log to stderr below.
    if (/exceeds|required|Invalid/i.test(msg)) {
      return res.status(400).json({ error: msg });
    }
    console.error('Create question error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /exams/:examId/questions - admin/assistant, delete question
router.delete('/questions', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    if (!(await assertCanManageExam(req, res, examId))) return;
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Question id is required' });
    }

    const deleted = await deleteOtisakQuestion(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Question not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete question error:', error);
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
    // Read fresh — never from the 1s poll cache — so we never miss a /start
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
//   - flip exam.status to 'completed' (which is irreversible — the
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

    // Verify the attempt belongs to this user and exam — prevent log poisoning across students
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
// REQUEST QUEUE — admin approval for student-initiated actions
// ============================================================================

// POST /exams/:examId/requests — student creates a request (whitelist enforced server-side)
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

// GET /exams/:examId/requests — admin/assistant: list pending requests for the exam
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

// GET /exams/:examId/requests/mine — auth: caller's own requests for this exam
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

// POST /exams/:examId/requests/:id/decide — admin/assistant: approve or deny
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
// TIMER ADJUSTMENT — admin adds or removes seconds from the running clock
// ============================================================================

// POST /exams/:examId/adjust-timer — admin/assistant
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
    // Don't let total effective duration go below 30 seconds — gives the timer time to settle.
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

export default router;
