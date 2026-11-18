import React from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeftRight,
  Check,
  Code,
  FileText,
  Image as ImageIcon,
  ListOrdered,
  MessageSquare,
  TextCursorInput,
  Trash2,
} from 'lucide-react';
import { useLang } from '../LangProvider';
import { CodeBlock } from '../otisak';
import { typeLabelKey, type BankQuestion } from './types';

const typeIcons: Record<string, React.ReactNode> = {
  text: <FileText size={13} />,
  code: <Code size={13} />,
  image: <ImageIcon size={13} />,
  open_text: <MessageSquare size={13} />,
  ordering: <ListOrdered size={13} />,
  matching: <ArrowLeftRight size={13} />,
  fill_blank: <TextCursorInput size={13} />,
};

function parseContent(content: string | null | undefined): Record<string, unknown> {
  try {
    const v = JSON.parse(content || '');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

// The solution of an ordering / matching / fill_blank question, read from its
// exam-shaped JSON. These have no answer list; the content IS the key.
function StructuredKey({ q }: { q: BankQuestion }) {
  const c = parseContent(q.content);
  const row =
    'rounded-lg border border-transparent bg-success-light text-success px-2.5 py-1.5 text-xs leading-snug';
  if (q.type === 'ordering') {
    return (
      <ol className="mt-3 grid gap-1.5">
        {strings(c.items).map((item, i) => (
          <li key={i} className={`${row} flex gap-2`}>
            <span className="font-mono tabular-nums">{i + 1}.</span>
            <span className="break-words min-w-0">{item}</span>
          </li>
        ))}
      </ol>
    );
  }
  if (q.type === 'matching') {
    const right = strings(c.right);
    return (
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {strings(c.left).map((l, i) => (
          <li key={i} className={`${row} flex items-center gap-2`}>
            <span className="break-words min-w-0">{l}</span>
            <ArrowLeftRight size={11} className="flex-shrink-0 opacity-60" />
            <span className="break-words min-w-0">{right[i]}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (q.type === 'fill_blank') {
    const blanks = Array.isArray(c.blanks)
      ? (c.blanks as Array<{ id?: string; correct?: string }>)
      : [];
    return (
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {blanks.map((b, i) => (
          <li key={i} className={`${row} flex gap-1.5`}>
            <span className="font-mono opacity-70">{b.id}</span>
            <span className="break-words min-w-0">{b.correct}</span>
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

// One bank question, shown the way a student will meet it: full text, the
// highlighted snippet or image, and every answer with the correct ones marked.
// Tags are buttons so a reviewer can jump straight to a topic.
export function BankQuestionCard({
  question: q,
  number,
  animationIndex,
  activeTag,
  onTagClick,
  onDelete,
}: {
  question: BankQuestion;
  number: number;
  animationIndex: number;
  activeTag: string;
  onTagClick: (tag: string) => void;
  onDelete: () => void;
}) {
  const { t } = useLang();
  const multi =
    typeof q.multi_answer === 'boolean'
      ? q.multi_answer
      : q.answers.filter((a) => a.is_correct).length > 1;
  // fill_blank text shows its ___A___ markers as short slots.
  const shownText =
    q.type === 'fill_blank' ? q.text.replace(/___([A-Z0-9_]+)___/g, '[ $1 ]') : q.text;

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(animationIndex, 12) * 0.02 }}
      className="group bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-subtle)] p-4 sm:p-5"
    >
      <header className="flex items-center gap-2 mb-3">
        <span className="font-mono text-xs text-[var(--text-muted)] tabular-nums w-7">
          {number}.
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)] bg-[var(--bg-tertiary)] rounded-full px-2 py-0.5">
          {typeIcons[q.type]}
          {t(typeLabelKey[q.type] || q.type)}
        </span>
        <span className="text-[11px] font-medium text-accent bg-accent-light rounded-full px-2 py-0.5 tabular-nums">
          {q.points} {t('questions.pts')}
        </span>
        {multi && (
          <span className="text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--border-default)] rounded-full px-2 py-0.5">
            {t('questions.multiCorrect')}
          </span>
        )}
        <button
          type="button"
          onClick={onDelete}
          title={t('questions.delete')}
          aria-label={t('questions.delete')}
          className="ml-auto p-1.5 rounded-lg text-[var(--text-muted)] opacity-60 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-danger hover:bg-danger-light transition"
        >
          <Trash2 size={14} />
        </button>
      </header>

      <p className="text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-line">
        {shownText}
      </p>

      {q.type === 'code' && q.code_snippet && (
        <CodeBlock code={q.code_snippet} language={q.code_language || undefined} />
      )}
      {q.type === 'image' && q.image_url && (
        <img
          src={q.image_url}
          alt=""
          loading="lazy"
          className="mt-3 max-h-56 max-w-full rounded-lg border border-[var(--border-default)]"
        />
      )}

      {q.answers.length > 0 && (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {q.answers.map((a, i) => (
            <li
              key={a.id}
              // No `border-success/40`: success is a CSS variable, Tailwind can't
              // add opacity to it and the class fell back to a near-white border.
              className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs leading-snug ${
                a.is_correct
                  ? 'border-transparent bg-success-light text-success'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
              }`}
            >
              <span
                className={`flex-shrink-0 w-4 h-4 mt-px rounded flex items-center justify-center text-[10px] font-semibold ${
                  a.is_correct ? 'bg-success text-white' : 'bg-[var(--bg-tertiary)]'
                }`}
              >
                {a.is_correct ? <Check size={10} strokeWidth={3} /> : String.fromCharCode(65 + i)}
              </span>
              <span className={`break-words min-w-0 ${q.type === 'code' ? 'font-mono' : ''}`}>
                {a.text}
              </span>
            </li>
          ))}
        </ul>
      )}

      <StructuredKey q={q} />

      {q.explanation && (
        <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)] whitespace-pre-line">
          {q.explanation}
        </p>
      )}

      {q.tags.length > 0 && (
        <footer className="mt-3 flex flex-wrap gap-1.5">
          {q.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagClick(tag)}
              className={`text-[11px] rounded-md px-1.5 py-0.5 transition-colors ${
                activeTag === tag
                  ? 'bg-accent text-white'
                  : 'text-[var(--text-muted)] hover:text-accent hover:bg-accent-light'
              }`}
            >
              #{tag}
            </button>
          ))}
        </footer>
      )}
    </motion.article>
  );
}
