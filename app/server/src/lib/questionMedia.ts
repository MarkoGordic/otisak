import type { OtisakQuestion } from '../db/otisak-types';
import { inlineStoredImage } from './images';

// The picture or code block that sits between a question's prompt and its
// answers. Shared by the printable blank exam (white, ink-friendly) and the
// student report PDF (dark), so the two never disagree about what a question
// looks like.

function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      (
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }) as Record<
          string,
          string
        >
      )[c],
  );
}

// A code question's content is either {"snippet": "..."} or the bare snippet.
export function parseCodeSnippet(content: string): string {
  try {
    const parsed = JSON.parse(content) as { snippet?: unknown };
    if (parsed && typeof parsed.snippet === 'string') return parsed.snippet;
  } catch {
    // Not JSON: a bare snippet.
  }
  return content;
}

const THEMES = {
  print: {
    pre: 'border:1px solid #bbb;border-radius:4px;padding:6px 9px;margin:6px 0 4px;font-size:10.5px;',
    img: 'max-height:300px;margin:6px 0 4px;border:1px solid #bbb;border-radius:4px;',
  },
  dark: {
    pre: 'background:#0b1220;color:#e2e8f0;border:1px solid #1e293b;border-radius:7px;padding:9px 11px;margin:0 0 10px;font-size:10px;',
    img: 'max-height:260px;margin:0 0 10px;border:1px solid #1e293b;border-radius:7px;background:#fff;',
  },
} as const;

// Uploaded images are inlined as data: URLs because the headless browser that
// renders the page has no session cookie to fetch them with.
export async function renderQuestionMedia(
  q: Pick<OtisakQuestion, 'type' | 'content'>,
  theme: keyof typeof THEMES,
): Promise<string> {
  if (!q.content) return '';
  const t = THEMES[theme];
  if (q.type === 'image') {
    const src = await inlineStoredImage(q.content);
    return `<img src="${escapeHtml(src)}" alt="" style="display:block;max-width:100%;${t.img}" />`;
  }
  if (q.type === 'code') {
    // pre-wrap + break-word: long lines wrap instead of running off the page;
    // orphans/widows keep a page break from stranding one line of code.
    return `<pre class="q-code" style="white-space:pre-wrap;overflow-wrap:anywhere;tab-size:4;font-family:'JetBrains Mono','DejaVu Sans Mono',monospace;line-height:1.45;orphans:3;widows:3;${t.pre}">${escapeHtml(parseCodeSnippet(q.content))}</pre>`;
  }
  return '';
}
