import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession, requireRole } from '@/lib/api-auth';
import { getOtisakExamById, getAttemptResults, getUserAttempts } from '@/lib/db/otisak';
import { getActivityLog, getActivityStats } from '@/lib/db/activity-log';
import { findUserById } from '@/lib/db/users';

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

export async function GET(
  request: NextRequest,
  { params }: { params: { examId: string; userId: string } }
) {
  const user = await getUserFromSession(request);
  const roleErr = requireRole(user, ['admin', 'assistant']);
  if (roleErr) return roleErr;

  const exam = await getOtisakExamById(params.examId);
  if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 });

  const student = await findUserById(params.userId);
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  const attempts = await getUserAttempts(params.userId);
  const attempt = attempts.find(a => a.exam_id === params.examId && a.submitted);
  if (!attempt) return NextResponse.json({ error: 'No attempt' }, { status: 404 });

  const results = await getAttemptResults(attempt.id);
  const activityLog = await getActivityLog(attempt.id);
  const stats = await getActivityStats(attempt.id);

  const totalPoints = Number(attempt.total_points);
  const maxPoints = Number(attempt.max_points);
  const percentage = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
  const passed = percentage >= Number(exam.pass_threshold);

  // Generate HTML-based PDF
  const suspiciousEvents = activityLog.filter(e =>
    ['copy_attempt', 'cut_attempt', 'paste_attempt', 'page_blur', 'mouse_leave_window', 'devtools_attempt', 'print_attempt', 'tab_switch'].includes(e.event_type)
  );

  const questionsHtml = results?.questions.map((q, idx) => {
    const correct = q.points_awarded > 0;
    const answersHtml = q.answers.map(a => {
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

  const timelineHtml = activityLog.slice(0, 200).map(e => {
    const isSuspicious = ['copy_attempt', 'cut_attempt', 'paste_attempt', 'page_blur', 'mouse_leave_window', 'devtools_attempt', 'print_attempt'].includes(e.event_type);
    const color = isSuspicious ? '#f87171' : '#94a3b8';
    const bg = isSuspicious ? 'rgba(239,68,68,0.05)' : 'transparent';
    const label = EVENT_LABELS[e.event_type] || e.event_type;
    const dataStr = Object.entries(e.event_data || {}).filter(([k]) => k !== 'ts').map(([k, v]) => `${k}: ${v}`).join(', ');
    return `<tr style="background:${bg};">
      <td style="padding:4px 8px;font-size:10px;color:#6b7280;font-family:monospace;white-space:nowrap;border-bottom:1px solid #1a1a2e;">${formatTime(e.timestamp)}</td>
      <td style="padding:4px 8px;font-size:10px;color:${color};border-bottom:1px solid #1a1a2e;">${isSuspicious ? '&#9888; ' : ''}${label}</td>
      <td style="padding:4px 8px;font-size:9px;color:#4b5563;border-bottom:1px solid #1a1a2e;max-width:250px;overflow:hidden;text-overflow:ellipsis;">${dataStr}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>OTISAK Izvestaj - ${student.name || student.email}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter',sans-serif; background:#070b14; color:#e5e7eb; }
  .page { max-width:800px; margin:0 auto; padding:40px; }
  @media print {
    body { background:#070b14 !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    .page { padding:20px; }
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
      ].map(s => `<div style="flex:1;min-width:120px;padding:12px;border-radius:8px;background:#0d1117;border:1px solid #1f2937;text-align:center;">
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
      ${suspiciousEvents.map(e => `<tr>
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

<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px;">
  <button onclick="window.print()" style="padding:10px 20px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-family:Inter,sans-serif;">Stampaj / Sacuvaj PDF</button>
</div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
