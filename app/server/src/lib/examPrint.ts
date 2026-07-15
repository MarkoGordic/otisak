import { getOtisakExamById } from '../db/otisak-exams';
import { getOtisakQuestions } from '../db/otisak-questions';
import type { OtisakQuestionWithAnswers } from '../db/otisak-types';
import { examPrintStrings } from './examPrintStrings';
import type { ReportLocale } from './reportStrings';

export type PrintableExamResult =
  | { ok: true; html: string; footerHtml: string; filenameBase: string }
  | { ok: false; error: string; status: number };

// Anything authored (exam title, question text, answer text, content items) is
// user-controlled and must be escaped before it goes into the HTML the headless
// browser renders.
function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
  )[c]);
}

// A1, ..., Z, AA, ... for option/column lettering.
function letter(i: number): string {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Deterministic permutation seeded by the question id. Used to scramble the
// displayed order of ordering items and matching pairs so that the correct
// answer can NOT be read straight off the printed sequence, while re-prints of
// the same exam stay identical.
function seededShuffle(arr: string[], seed: string): string[] {
  return arr
    .map((el, i) => ({ el, k: hash32(`${seed}:${i}:${el}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.el);
}

function parseContent(content: string | null): { items?: string[]; left?: string[]; right?: string[]; blanks?: Array<{ id: string }> } {
  try {
    return JSON.parse(content || '{}');
  } catch {
    return {};
  }
}

// Uppercase ids only, matching the exam and results renderers. Accepting
// lowercase here would print a writeable blank for a placeholder the exam UI
// renders as literal text, so the PDF would promise an input the student
// never gets - and the question then always scores 0.
const FILL_BLANK_RE = /(___[A-Z0-9_]+___)/g;
const FILL_BLANK_ONE = /^___[A-Z0-9_]+___$/;

// A writeable underline that stretches to fill its row.
const FILL = '<span style="flex:1;border-bottom:1px solid #111;height:15px;margin-left:8px;"></span>';
// An empty box the student writes a single mark/letter/number into.
const BOX_SM = '<span style="display:inline-block;width:14px;height:14px;border:1.5px solid #111;border-radius:3px;flex:0 0 auto;margin-top:1px;"></span>';
const BOX_LG = '<span style="display:inline-block;width:26px;height:22px;border:1.5px solid #111;border-radius:3px;flex:0 0 auto;"></span>';

function fillField(label: string, flex: number): string {
  return `<div style="display:flex;align-items:flex-end;flex:${flex};min-width:0;">
    <span style="font-size:11px;color:#111;white-space:nowrap;">${escapeHtml(label)}:</span>${FILL}
  </div>`;
}

function renderChoice(q: OtisakQuestionWithAnswers): string {
  const mono = q.type === 'code';
  const opts = q.answers.map((a, i) => {
    let body: string;
    if (q.type === 'image') {
      body = `<img src="${escapeHtml(a.text)}" alt="${letter(i)}" style="max-height:80px;max-width:80%;filter:grayscale(1);display:block;border:1px solid #bbb;border-radius:4px;" />`;
    } else if (mono) {
      body = `<span style="white-space:pre-wrap;font-family:'JetBrains Mono','DejaVu Sans Mono',monospace;font-size:11px;">${escapeHtml(a.text)}</span>`;
    } else {
      body = `<span>${escapeHtml(a.text)}</span>`;
    }
    return `<div style="display:flex;align-items:flex-start;gap:9px;margin:5px 0;font-size:12px;">
      ${BOX_SM}
      <span style="font-weight:700;flex:0 0 auto;">${letter(i)})</span>
      <span style="flex:1;min-width:0;">${body}</span>
    </div>`;
  }).join('');
  return `<div style="margin-top:6px;">${opts}</div>`;
}

function renderOpenText(points: number): string {
  const n = Math.min(14, Math.max(4, Math.round(points) * 2 + 2));
  const lines = Array.from({ length: n }, () => '<div style="border-bottom:1px solid #999;height:22px;"></div>').join('');
  return `<div style="margin-top:8px;">${lines}</div>`;
}

function renderOrdering(q: OtisakQuestionWithAnswers, hint: string): string {
  const items = seededShuffle(parseContent(q.content).items || [], q.id);
  const rows = items.map((it) => `<div style="display:flex;align-items:center;gap:10px;margin:5px 0;font-size:12px;">
    ${BOX_LG}<span style="flex:1;min-width:0;">${escapeHtml(it)}</span>
  </div>`).join('');
  return `<div style="font-size:10px;color:#444;font-style:italic;margin:4px 0 6px;">${escapeHtml(hint)}</div>${rows}`;
}

function renderMatching(q: OtisakQuestionWithAnswers, hint: string): string {
  const data = parseContent(q.content);
  const left = data.left || [];
  const right = seededShuffle(data.right || [], q.id);
  const leftCol = left.map((it, i) => `<div style="display:flex;align-items:center;gap:8px;margin:5px 0;font-size:12px;">
    <span style="font-weight:700;flex:0 0 auto;">${i + 1}.</span>
    <span style="flex:1;min-width:0;">${escapeHtml(it)}</span>${BOX_LG}
  </div>`).join('');
  const rightCol = right.map((it, j) => `<div style="display:flex;align-items:flex-start;gap:8px;margin:5px 0;font-size:12px;">
    <span style="font-weight:700;flex:0 0 auto;">${letter(j)})</span>
    <span style="flex:1;min-width:0;">${escapeHtml(it)}</span>
  </div>`).join('');
  return `<div style="font-size:10px;color:#444;font-style:italic;margin:4px 0 6px;">${escapeHtml(hint)}</div>
    <div style="display:flex;gap:24px;">
      <div style="flex:1;min-width:0;">${leftCol}</div>
      <div style="flex:1;min-width:0;">${rightCol}</div>
    </div>`;
}

// Render question text with the ___ID___ placeholders turned into writeable
// underlines. Text segments are escaped; only the placeholder is replaced.
function renderFillBlankText(text: string): string {
  const parts = text.split(FILL_BLANK_RE);
  return parts.map((p) =>
    FILL_BLANK_ONE.test(p)
      ? '<span style="display:inline-block;border-bottom:1px solid #111;min-width:38mm;height:14px;vertical-align:-2px;margin:0 3px;"></span>'
      : escapeHtml(p),
  ).join('');
}

export async function buildPrintableExamHTML(examId: string, locale?: ReportLocale | string): Promise<PrintableExamResult> {
  const S = examPrintStrings(locale);

  const exam = await getOtisakExamById(examId);
  if (!exam) return { ok: false, error: 'Exam not found', status: 404 };

  const questions = await getOtisakQuestions(examId);
  const maxPoints = questions.reduce((sum, q) => sum + Number(q.points || 0), 0);

  const meta: string[] = [];
  if (exam.subject_name) meta.push(escapeHtml(exam.subject_name));
  if (exam.duration_minutes) meta.push(`${exam.duration_minutes} ${escapeHtml(S.minutesShort)}`);
  meta.push(`${questions.length} ${escapeHtml(S.questions)}`);
  meta.push(`${maxPoints} ${escapeHtml(S.pointsShort)}`);

  const questionsHtml = questions.map((q, idx) => {
    const points = Number(q.points || 0);
    const isMulti = q.type !== 'open_text' && (q.type === 'text' || q.type === 'code' || q.type === 'image') && q.multi_answer;

    // For fill_blank the prompt itself carries the blanks, so it doubles as the body.
    const head = q.type === 'fill_blank' ? renderFillBlankText(q.text) : escapeHtml(q.text);

    let body = '';
    if (q.type === 'open_text') body = renderOpenText(points);
    else if (q.type === 'ordering') body = renderOrdering(q, S.orderingHint);
    else if (q.type === 'matching') body = renderMatching(q, S.matchingHint);
    else if (q.type === 'fill_blank') body = '';
    else body = renderChoice(q); // text / code / image

    const multiHint = isMulti
      ? `<div style="font-size:10px;color:#444;font-style:italic;margin:2px 0 4px;">${escapeHtml(S.multiSelectHint)}</div>`
      : '';

    return `<div class="q">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;">
        <div style="font-size:12.5px;white-space:pre-wrap;"><b>${idx + 1}.</b> ${head}</div>
        <div style="font-size:10px;color:#333;white-space:nowrap;border:1px solid #aaa;border-radius:4px;padding:1px 7px;">${points} ${escapeHtml(S.pointsShort)}</div>
      </div>
      ${multiHint}
      ${body}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapeHtml(exam.title)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  @page { size: A4; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { background:#fff; color:#111; font-family:'Inter','DejaVu Sans','Noto Sans',Arial,sans-serif; font-size:12px; line-height:1.45; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  .q { page-break-inside:avoid; break-inside:avoid; margin-bottom:15px; }
</style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:12px;">
    <div style="min-width:0;">
      <div style="font-size:11px;letter-spacing:4px;font-weight:600;">OTISAK</div>
      <div style="font-size:19px;font-weight:700;margin-top:4px;">${escapeHtml(exam.title)}</div>
      <div style="font-size:11px;color:#444;margin-top:3px;">${meta.join(' &middot; ')}</div>
    </div>
    <div style="border:1.5px solid #111;border-radius:6px;padding:8px 12px;text-align:center;flex:0 0 auto;">
      <div style="font-size:8px;text-transform:uppercase;letter-spacing:1px;color:#444;">${escapeHtml(S.forGrader)}</div>
      <div style="font-size:11px;font-weight:600;margin-top:7px;">${escapeHtml(S.points)}</div>
      <div style="font-size:15px;margin-top:5px;letter-spacing:1px;">______ / ${maxPoints}</div>
    </div>
  </div>

  <div style="border:1px solid #111;border-radius:6px;padding:12px 14px;margin-bottom:12px;">
    <div style="margin-bottom:11px;">${fillField(S.name, 1)}</div>
    <div style="display:flex;gap:18px;margin-bottom:11px;">
      ${fillField(S.index, 1)}
      ${fillField(S.group, 0.7)}
      ${fillField(S.date, 0.8)}
    </div>
    <div style="display:flex;width:55%;">${fillField(S.signature, 1)}</div>
  </div>

  <div style="font-size:10px;color:#222;font-style:italic;margin-bottom:16px;padding:7px 10px;border-left:3px solid #111;background:#f4f4f4;">${escapeHtml(S.instructions)}</div>

  ${questionsHtml}
</body>
</html>`;

  const footerHtml = `<div style="font-size:8px;color:#555;width:100%;padding:0 13mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif;">
    <span>${escapeHtml(exam.title)}</span>
    <span>${escapeHtml(S.page)} <span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`;

  const safeBase = (exam.title || 'otisak').replace(/[^a-z0-9._-]+/gi, '_');

  return { ok: true, html, footerHtml, filenameBase: `otisak-test-${safeBase}` };
}
