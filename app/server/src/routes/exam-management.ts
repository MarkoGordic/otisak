import { Router, Request, Response } from 'express';
import {
  getOtisakExamById,
  getOtisakQuestions,
  getAttemptResults,
  getUserAttempts,
  getExamAttemptsSummary,
  enrollUserInExam,
  enrollUsersByPattern,
  enrollByCourseAndYear,
  getExamEnrollments,
  createOtisakQuestion,
  updateOtisakQuestion,
  deleteOtisakQuestion,
  rescoreExam,
  getLiveExamStats,
  getExamStats,
} from '../db/otisak';
import { getActivityLog, getActivityStats, enrichActivityEventData } from '../db/activity-log';
import { findUserById } from '../db/users';
import { buildStudentReportHTML, buildResultsTableHTML, renderHtmlToPdf } from '../lib/studentReport';
import { buildPrintableExamHTML } from '../lib/examPrint';
import archiver from 'archiver';
import { requireAuth, requireRole } from '../middleware';
import { getExamId, assertCanManageExam } from './exam-shared';

const router = Router({ mergeParams: true });

// GET /exams/:examId/report - admin/assistant, exam attempts summary
router.get('/report', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    if (!(await assertCanManageExam(req, res, examId))) return;
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
    if (!(await assertCanManageExam(req, res, examId))) return;
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
        has_pass_threshold: exam.has_pass_threshold,
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
    if (!(await assertCanManageExam(req, res, examId))) return;
    const userId = req.params.userId;
    const locale = typeof req.query.lang === 'string' ? req.query.lang : undefined;
    const built = await buildStudentReportHTML(examId, userId, locale);
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

// GET /exams/:examId/print/pdf - admin/assistant, a printable BLANK exam (the
// questions on paper, no answer key) for offline / paper administration. White,
// ink-friendly, with fill-in fields for the student's name and index. Served
// inline so the admin's browser opens it straight into the print dialog.
router.get('/print/pdf', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    if (!(await assertCanManageExam(req, res, examId))) return;
    const locale = typeof req.query.lang === 'string' ? req.query.lang : undefined;
    const built = await buildPrintableExamHTML(examId, locale);
    if (!built.ok) return res.status(built.status).json({ error: built.error });

    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const pdf = await renderHtmlToPdf(built.html, browser, {
        printBackground: true,
        preferCSSPageSize: false,
        margin: { top: '14mm', bottom: '16mm', left: '13mm', right: '13mm' },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: built.footerHtml,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${built.filenameBase}.pdf"`);
      return res.end(pdf);
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error('Printable exam error:', error);
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
    if (!(await assertCanManageExam(req, res, examId))) return;
    const locale = typeof req.query.lang === 'string' ? req.query.lang : undefined;
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
    // When the exam opts out of a pass threshold, drop the verdict column from
    // CSV and skip the per-row passed flag from the table snapshot. The PDF
    // generators downstream use `has_pass_threshold` to suppress the same.
    const hasPassThreshold = !!exam.has_pass_threshold;
    const csvHeader = [
      'Ime', 'Indeks', 'Email', 'Bodovi', 'Maksimum', 'Procenat',
      ...(hasPassThreshold ? ['Polozeno'] : []),
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
      const passed = hasPassThreshold ? percentage >= Number(exam.pass_threshold) : false;
      const suspiciousCount = suspiciousByUser.get(row.user_id) ?? 0;
      csvRows.push([
        row.user_name ?? '',
        row.index_number ?? '',
        row.user_email,
        String(totalPoints),
        String(maxPoints),
        `${percentage}%`,
        ...(hasPassThreshold ? [passed ? 'da' : 'ne'] : []),
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
        hasPassThreshold,
        locale,
        rows: tableRows,
      });
      const tablePdf = await renderHtmlToPdf(tableHtml, browser, true);
      archive.append(tablePdf, { name: 'rezultati.pdf' });

      // Per-student PDFs. Render serially: parallel pages in one Chromium can OOM
      // on small servers and the time is already dominated by IO.
      for (const row of submitted) {
        try {
          const built = await buildStudentReportHTML(examId, row.user_id, locale);
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
    if (!(await assertCanManageExam(req, res, examId))) return;
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
    if (!(await assertCanManageExam(req, res, examId))) return;
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
        has_pass_threshold: !!exam.has_pass_threshold,
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
        // (export → re-import) preserves authoring intent - not just whatever
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
    if (!(await assertCanManageExam(req, res, examId))) return;
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
    // Adding a question on a completed exam grows max_points; rescore so the
    // percentages on every attempt reflect the new total.
    let rescored = 0;
    const exam = await getOtisakExamById(examId);
    if (exam && exam.status === 'completed') {
      try { rescored = await rescoreExam(examId); }
      catch (err) { console.error('Rescore after question POST failed:', err); }
    }
    return res.json({ ...question, rescored });
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

// PATCH /exams/:examId/questions - admin/assistant, update a single question.
// Body shape: { id: string, ...UpdateOtisakQuestionInput fields }. Mirrors the
// DELETE handler's "id in body" convention so the client can keep using a
// single collection URL for create/update/delete. `type` is not editable here
// (would invalidate answer semantics); change by deleting + recreating.
router.patch('/questions', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    if (!(await assertCanManageExam(req, res, examId))) return;
    const { id, type, ...patch } = req.body || {};
    if (type !== undefined) {
      return res.status(400).json({ error: 'Question type is not editable' });
    }
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Question id is required' });
    }
    const updated = await updateOtisakQuestion(id, patch);
    if (!updated) return res.status(404).json({ error: 'Question not found' });

    // If the exam is already closed, every change here (points, answers,
    // correct flags, content) can shift scoring outcomes - replay grading
    // against all stored attempts so the room's export reflects the new
    // scale immediately. Draft/scheduled/active exams: no attempts to
    // rescore (or rescoring would clash with in-flight students), skip.
    let rescored = 0;
    const exam = await getOtisakExamById(examId);
    if (exam && exam.status === 'completed') {
      try {
        rescored = await rescoreExam(examId);
      } catch (err) {
        console.error('Rescore after question PATCH failed:', err);
        return res.status(500).json({ error: 'Question updated but rescore failed', code: 'RESCORE_FAILED' });
      }
    }
    return res.json({ ...updated, rescored });
  } catch (error) {
    const msg = (error as Error).message || '';
    if (/exceeds|required|Invalid/i.test(msg)) {
      return res.status(400).json({ error: msg });
    }
    console.error('Update question error:', error);
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
    // Same reasoning as the PATCH path: a deletion on a completed exam shrinks
    // max_points and removes that question's contribution from every total.
    let rescored = 0;
    const exam = await getOtisakExamById(examId);
    if (exam && exam.status === 'completed') {
      try {
        rescored = await rescoreExam(examId);
      } catch (err) {
        console.error('Rescore after question DELETE failed:', err);
      }
    }
    return res.json({ success: true, rescored });
  } catch (error) {
    console.error('Delete question error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /exams/:examId/stats - admin/assistant, per-exam analytics.
// No status gate: meaningful on completed/archived but also usable mid-run
// for spotting questions everyone is missing. Population is submitted
// attempts only (in-flight ones would skew everything with partial scores).
router.get('/stats', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    if (!(await assertCanManageExam(req, res, examId))) return;
    const stats = await getExamStats(examId);
    if (!stats) return res.status(404).json({ error: 'Exam not found' });
    return res.json(stats);
  } catch (error) {
    console.error('Exam stats error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
