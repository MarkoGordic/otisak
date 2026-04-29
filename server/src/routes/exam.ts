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
} from '../db/otisak';
import { getActiveLockdown, createLockdown, endLockdown } from '../db/settings';
import { logEvents, getActivityLog, getActivityStats, enrichActivityEventData } from '../db/activity-log';
import { findUserById, findUserByIndexNumber } from '../db/users';
import { createSessionCookie, SESSION_COOKIE, DEFAULT_TTL_MS } from '../session';
import { requireAuth, requireRole } from '../middleware';

const router = Router({ mergeParams: true });

// Helper function to get examId from params
function getExamId(req: Request): string {
  return req.params.examId;
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

    // Auto-create attempt for students once admin has started the exam, so the timer becomes visible
    if (!attempt && user.role === 'student' && exam.status === 'active' && exam.exam_started_at) {
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

// POST /exams/:examId/attempt - save/submit answers
router.post('/attempt', requireAuth, async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const user = req.user!;
    const { answers, submit, time_spent_seconds } = req.body;

    let attempt = await getActiveAttempt(examId, user.id);

    // If no active attempt, start one
    if (!attempt) {
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
      return res.json({ attempt: finished, submitted: true });
    }

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

    const results = await getAttemptResults(attempt.id);
    return res.json({ results });
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

// GET /exams/:examId/report/:userId/pdf - admin/assistant, HTML report
router.get('/report/:userId/pdf', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
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
      return res.status(404).json({ error: 'No attempt' });
    }

    const results = await getAttemptResults(attempt.id);
    const activityLog = await getActivityLog(attempt.id);
    const stats = await getActivityStats(attempt.id);

    const totalPoints = Number(attempt.total_points);
    const maxPoints = Number(attempt.max_points);
    const percentage = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
    const passed = percentage >= Number(exam.pass_threshold);

    const EVENT_LABELS: Record<string, string> = {
      exam_view_started: 'Pocetak pregleda ispita',
      exam_submit: 'Predaja ispita',
      answer_selected: 'Odgovor izabran',
      answer_deselected: 'Odgovor ponisten',
      question_next: 'Sledece pitanje',
      question_prev: 'Prethodno pitanje',
      keystroke_batch: 'Unos tastaturom',
      key_combo: 'Kombinacija tastera',
      special_key: 'Specijalan taster',
      copy_attempt: 'Pokusaj kopiranja',
      cut_attempt: 'Pokusaj isecanja',
      paste_attempt: 'Pokusaj lepljenja',
      right_click: 'Desni klik',
      page_blur: 'Napustanje prozora',
      page_focus: 'Povratak u prozor',
      visibility_change: 'Promena vidljivosti',
      tab_switch: 'Promena taba',
      window_resize: 'Promena velicine prozora',
      mouse_leave_window: 'Mis napustio prozor',
      print_attempt: 'Pokusaj stampanja',
      devtools_attempt: 'Pokusaj otvaranja DevTools',
      text_typed: 'Unos teksta',
    };

    function formatTime(date: Date | string): string {
      return new Date(date).toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    function formatDate(date: Date | string): string {
      return new Date(date).toLocaleDateString('sr-RS', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    function formatDuration(seconds: number): string {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}m ${s}s`;
    }

    const suspiciousEvents = activityLog.filter((e) =>
      ['copy_attempt', 'cut_attempt', 'paste_attempt', 'page_blur', 'mouse_leave_window', 'devtools_attempt', 'print_attempt', 'tab_switch'].includes(e.event_type)
    );

    const questionsHtml = results?.questions.map((q, idx) => {
      const correct = q.points_awarded > 0;
      const answersHtml = q.answers.map((a) => {
        const selected = q.selected_answer_ids.includes(a.id);
        const isCorrect = q.correct_answer_ids.includes(a.id);
        const bg = isCorrect ? '#052e16' : selected ? '#450a0a' : '#111827';
        const border = isCorrect ? '#059669' : selected && !isCorrect ? '#dc2626' : '#1f2937';
        const icon = isCorrect ? '&#10003;' : selected && !isCorrect ? '&#10007;' : '&nbsp;&nbsp;';
        return `<div style="padding:6px 10px;margin:3px 0;border-radius:6px;background:${bg};border:1px solid ${border};font-size:11px;color:#e5e7eb;display:flex;align-items:center;gap:8px;">
          <span style="font-weight:bold;color:${isCorrect ? '#34d399' : selected ? '#f87171' : '#6b7280'};font-size:13px;">${icon}</span>
          ${a.text}
          ${selected && !isCorrect ? '<span style="margin-left:auto;color:#f87171;font-size:9px;">VAS ODGOVOR</span>' : ''}
          ${isCorrect && !selected ? '<span style="margin-left:auto;color:#34d399;font-size:9px;">TACAN</span>' : ''}
        </div>`;
      }).join('');

      return `<div style="margin-bottom:16px;padding:14px;border-radius:10px;border:1px solid ${correct ? '#065f46' : '#7f1d1d'};background:${correct ? 'rgba(5,46,22,0.3)' : 'rgba(69,10,10,0.3)'};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:${correct ? '#34d399' : '#f87171'};">Pitanje ${idx + 1} ${correct ? '&#10003;' : '&#10007;'}</span>
          <span style="font-size:11px;font-weight:bold;color:${correct ? '#34d399' : '#f87171'};">${q.points_awarded}/${Number(q.question.points)} bod.</span>
        </div>
        <p style="font-size:12px;color:#f1f5f9;margin-bottom:10px;line-height:1.5;">${q.question.text}</p>
        ${q.question.type === 'open_text' ? `<div style="padding:8px 10px;border-radius:6px;background:#111827;border:1px solid #1f2937;font-size:11px;color:#94a3b8;"><strong>Odgovor:</strong> ${q.text_answer || '<em>Bez odgovora</em>'}</div>` : answersHtml}
      </div>`;
    }).join('') || '';

    const enrichedActivity = await enrichActivityEventData(examId, activityLog);
    const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
    const timelineHtml = enrichedActivity.slice(0, 200).map((e) => {
      const isSuspicious = ['copy_attempt', 'cut_attempt', 'paste_attempt', 'page_blur', 'mouse_leave_window', 'devtools_attempt', 'print_attempt'].includes(e.event_type);
      const color = isSuspicious ? '#f87171' : '#94a3b8';
      const bg = isSuspicious ? 'rgba(239,68,68,0.05)' : 'transparent';
      const label = EVENT_LABELS[e.event_type] || e.event_type;
      const dataStr = Object.entries(e.event_data || {}).map(([k, v]) => `${k}: ${escapeHtml(String(v))}`).join('<br/>');
      return `<tr style="background:${bg};">
        <td style="padding:5px 8px;font-size:10px;color:#6b7280;font-family:monospace;white-space:nowrap;border-bottom:1px solid #1a1a2e;vertical-align:top;">${formatTime(e.timestamp)}</td>
        <td style="padding:5px 8px;font-size:10px;color:${color};border-bottom:1px solid #1a1a2e;vertical-align:top;white-space:nowrap;">${isSuspicious ? '&#9888; ' : ''}${label}</td>
        <td style="padding:5px 8px;font-size:10px;color:#cbd5e1;border-bottom:1px solid #1a1a2e;line-height:1.5;">${dataStr}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>OTISAK Izvestaj - ${student.name || student.email}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  @page { size: A4; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { background:#070b14; color:#e5e7eb; font-family:'Inter',sans-serif; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  .page { background:#070b14; padding:14mm 12mm; }
  @media print {
    .no-print { display:none !important; }
  }
</style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:20px;border-bottom:2px solid #2563eb;margin-bottom:30px;">
    <div>
      <div style="font-size:28px;font-weight:300;color:#3b82f6;letter-spacing:6px;">OTISAK</div>
      <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-top:2px;">Detaljan izvestaj o aktivnosti studenta</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px;color:#6b7280;">Generisano</div>
      <div style="font-size:11px;color:#94a3b8;">${formatDate(new Date())} ${formatTime(new Date())}</div>
    </div>
  </div>

  <!-- Student & Exam Info -->
  <div style="display:flex;gap:16px;margin-bottom:24px;">
    <div style="flex:1;padding:16px;border-radius:10px;background:#0d1117;border:1px solid #1e3a5f;">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#3b82f6;margin-bottom:8px;">Student</div>
      <div style="font-size:16px;font-weight:600;color:#f1f5f9;">${student.name || 'N/A'}</div>
      <div style="font-size:11px;color:#60a5fa;font-family:'JetBrains Mono',monospace;margin-top:2px;">${student.index_number || ''}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:4px;">${student.email}</div>
    </div>
    <div style="flex:1;padding:16px;border-radius:10px;background:#0d1117;border:1px solid #1e3a5f;">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#3b82f6;margin-bottom:8px;">Ispit</div>
      <div style="font-size:16px;font-weight:600;color:#f1f5f9;">${exam.title}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${exam.subject_name || ''}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:4px;">${formatDate(attempt.started_at)} | Trajanje: ${formatDuration(Number(attempt.time_spent_seconds))}</div>
    </div>
  </div>

  <!-- Score -->
  <div style="padding:20px;border-radius:12px;background:${passed ? 'rgba(5,46,22,0.4)' : 'rgba(69,10,10,0.4)'};border:2px solid ${passed ? '#059669' : '#dc2626'};margin-bottom:24px;text-align:center;">
    <div style="font-size:48px;font-weight:700;color:${passed ? '#34d399' : '#f87171'};font-family:'JetBrains Mono',monospace;">${totalPoints}/${maxPoints}</div>
    <div style="font-size:14px;color:${passed ? '#34d399' : '#f87171'};margin-top:4px;">${percentage}% | ${passed ? 'POLOZENO' : 'NIJE POLOZENO'}</div>
    <div style="font-size:10px;color:#6b7280;margin-top:4px;">Prag: ${exam.pass_threshold}% | Vreme: ${formatDuration(Number(attempt.time_spent_seconds))}</div>
  </div>

  <!-- Activity Stats -->
  <div style="margin-bottom:24px;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#3b82f6;margin-bottom:12px;font-weight:600;">Statistika aktivnosti</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      ${[
        { label: 'Ukupno dogadjaja', value: stats.totalEvents, color: '#3b82f6' },
        { label: 'Unosi tastature', value: stats.keystrokes, color: '#3b82f6' },
        { label: 'Promena odgovora', value: stats.answerChanges, color: '#f59e0b' },
        { label: 'Napustanje prozora', value: stats.tabSwitches, color: stats.tabSwitches > 3 ? '#ef4444' : '#f59e0b' },
        { label: 'Pokusaji kopiranja', value: stats.copyAttempts, color: stats.copyAttempts > 0 ? '#ef4444' : '#22c55e' },
        { label: 'Desni klikovi', value: stats.rightClicks, color: stats.rightClicks > 2 ? '#ef4444' : '#6b7280' },
      ].map((s) => `<div style="flex:1;min-width:120px;padding:12px;border-radius:8px;background:#0d1117;border:1px solid #1f2937;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:${s.color};font-family:'JetBrains Mono',monospace;">${s.value}</div>
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">${s.label}</div>
      </div>`).join('')}
    </div>
  </div>

  <!-- Suspicious Activity -->
  ${suspiciousEvents.length > 0 ? `
  <div style="margin-bottom:24px;padding:16px;border-radius:10px;background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.2);">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#ef4444;margin-bottom:10px;font-weight:600;">&#9888; Sumnjiva aktivnost (${suspiciousEvents.length})</div>
    <table style="width:100%;border-collapse:collapse;">
      ${suspiciousEvents.map((e) => `<tr>
        <td style="padding:3px 6px;font-size:10px;color:#6b7280;font-family:monospace;">${formatTime(e.timestamp)}</td>
        <td style="padding:3px 6px;font-size:10px;color:#f87171;">${EVENT_LABELS[e.event_type] || e.event_type}</td>
      </tr>`).join('')}
    </table>
  </div>
  ` : `
  <div style="margin-bottom:24px;padding:14px;border-radius:10px;background:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.2);">
    <div style="font-size:11px;color:#22c55e;">&#10003; Nije detektovana sumnjiva aktivnost</div>
  </div>
  `}

  <!-- Questions -->
  <div style="margin-bottom:24px;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#3b82f6;margin-bottom:12px;font-weight:600;">Odgovori po pitanjima</div>
    ${questionsHtml}
  </div>

  <!-- Timeline -->
  <div style="margin-bottom:24px;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#3b82f6;margin-bottom:12px;font-weight:600;">Hronologija aktivnosti (${activityLog.length} dogadjaja)</div>
    <div style="border-radius:10px;background:#0d1117;border:1px solid #1f2937;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#111827;">
            <th style="padding:6px 8px;text-align:left;font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #1f2937;">Vreme</th>
            <th style="padding:6px 8px;text-align:left;font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #1f2937;">Dogadjaj</th>
            <th style="padding:6px 8px;text-align:left;font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #1f2937;">Detalji</th>
          </tr>
        </thead>
        <tbody>${timelineHtml}</tbody>
      </table>
      ${activityLog.length > 200 ? `<div style="padding:8px;text-align:center;font-size:10px;color:#6b7280;">... i jos ${activityLog.length - 200} dogadjaja</div>` : ''}
    </div>
  </div>

  <!-- Footer -->
  <div style="border-top:1px solid #1f2937;padding-top:16px;text-align:center;">
    <div style="font-size:10px;color:#4b5563;">OTISAK v2.0 | Izvestaj generisan automatski</div>
    <div style="font-size:9px;color:#374151;margin-top:4px;">Ovaj dokument je poverljiv i namenjen iskljucivo ovlascenom osoblju.</div>
  </div>
</div>

</body>
</html>`;

    // Render the HTML to a real PDF via headless Chromium with the dark background preserved.
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.emulateMediaType('screen');
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      const safeName = (student.index_number || student.name || student.email).replace(/[^a-z0-9._-]+/gi, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="otisak-izvestaj-${safeName}.pdf"`);
      return res.end(pdf);
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error('PDF report error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /exams/:examId/enroll - admin/assistant, enroll students
router.post('/enroll', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const { user_ids, pattern, course_code, year, from_number, to_number } = req.body;

    // Enroll by pattern
    if (pattern) {
      const count = await enrollUsersByPattern(examId, pattern);
      return res.json({ enrolled: count });
    }

    // Enroll by course and year
    if (course_code && year) {
      const count = await enrollByCourseAndYear(examId, course_code, year, from_number, to_number);
      return res.json({ enrolled: count });
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
    const question = await createOtisakQuestion(examId, req.body);
    return res.json(question);
  } catch (error) {
    console.error('Create question error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /exams/:examId/questions - admin/assistant, delete question
router.delete('/questions', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
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

    const cookie = createSessionCookie({
      id: fullUser.id,
      email: fullUser.email,
      name: fullUser.name || undefined,
      role: fullUser.role,
      index_number: fullUser.index_number || undefined,
    });

    res.cookie(SESSION_COOKIE, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: DEFAULT_TTL_MS,
      path: '/',
    });

    return res.json({
      user: {
        id: result.user.id,
        name: result.user.name,
        index_number: result.user.index_number,
      },
      exam_id: examId,
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

    const lockdown = await getActiveLockdown(examId);
    const { getTotalLockdownPauseSeconds } = await import('../db/settings');
    const paused_seconds = await getTotalLockdownPauseSeconds(examId);

    return res.json({
      status: exam.status,
      exam_started_at: exam.exam_started_at,
      duration_minutes: exam.duration_minutes,
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

// POST /exams/:examId/start - admin/assistant, start exam timer
router.post('/start', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const examId = getExamId(req);
    const exam = await startExamTimer(examId);
    if (!exam) {
      return res.status(400).json({ error: 'Exam not found or not active' });
    }
    invalidateExamCache(examId);
    return res.json({ exam });
  } catch (error) {
    console.error('Start exam error:', error);
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
    return res.json({
      lockdown: lockdown ? { is_active: true, message: lockdown.message } : null,
      paused_seconds,
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
    const { lock, message } = req.body;

    if (lock) {
      await createLockdown(examId, req.user!.id, message);
      return res.json({ locked: true });
    } else {
      await endLockdown(examId);
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

export default router;
