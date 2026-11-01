import React from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Code,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload as UploadIcon,
  X,
} from 'lucide-react';
import { useLang } from '../LangProvider';
import { Button } from '../ui/Button';
import { CodeBlock } from '../otisak';
import { ImageUploadButton } from '../manage/ImageUploadButton';
import { parseCodeContent } from '../../lib/codeQuestion';
import { CODE_LANGUAGES } from '../../lib/codeLanguages';
import { Field, Toggle, inputClass, type Answer, type Question } from './fields';

// Map from question type -> i18n key + icon (label is resolved through `t()` at render time).
const TYPE_LABELS: Record<string, { labelKey: string; icon: React.ReactNode }> = {
  text: { labelKey: 'questions.multipleChoice', icon: <FileText size={13} /> },
  code: { labelKey: 'questions.code', icon: <Code size={13} /> },
  image: { labelKey: 'questions.image', icon: <ImageIcon size={13} /> },
  open_text: { labelKey: 'questions.openText', icon: <MessageSquare size={13} /> },
};

// One question in the exam editor: a collapsed header, the read view, and the
// inline editor. All state lives in the page; this only renders and reports.
export function QuestionItem({
  q,
  index,
  isOpen,
  draft,
  saving,
  onToggle,
  onBeginEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  patchDraft,
  patchDraftAnswers,
  updateCodeDraft,
}: {
  q: Question;
  index: number;
  isOpen: boolean;
  draft: Question | undefined;
  saving: boolean;
  onToggle: () => void;
  onBeginEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  patchDraft: (patch: Partial<Question>) => void;
  patchDraftAnswers: (fn: (answers: Answer[]) => Answer[]) => void;
  updateCodeDraft: (snippet?: string, language?: string) => void;
}) {
  const { t } = useLang();
  const typeInfo = TYPE_LABELS[q.type] || { labelKey: '', icon: <FileText size={13} /> };

  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-subtle)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className="text-xs font-mono text-[var(--text-muted)] w-6 flex-shrink-0 tabular-nums">
          {index + 1}.
        </span>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded-full flex-shrink-0">
          {typeInfo.icon}
          {typeInfo.labelKey ? t(typeInfo.labelKey) : q.type}
        </span>
        {q.multi_answer && (
          <span className="hidden sm:inline text-[11px] font-medium text-warning bg-warning-light px-2 py-0.5 rounded-full flex-shrink-0">
            {t('examEdit.multiAnswer')}
          </span>
        )}
        <span className="flex-1 min-w-0 text-sm text-[var(--text-primary)] truncate">{q.text}</span>
        <span className="text-xs font-mono text-[var(--text-secondary)] flex-shrink-0 tabular-nums">
          {Number(q.points)} {t('questions.pts')}
        </span>
        {isOpen ? (
          <ChevronUp size={14} className="text-[var(--text-muted)] flex-shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-[var(--text-muted)] flex-shrink-0" />
        )}
      </button>

      {isOpen && !draft && (
        <div className="px-4 pb-4 border-t border-[var(--border-subtle)] pt-3">
          <p className="text-sm text-[var(--text-primary)] mb-2 whitespace-pre-wrap">{q.text}</p>
          {q.type === 'code' &&
            q.content &&
            (() => {
              const { snippet, language } = parseCodeContent(q.content);
              return <CodeBlock code={snippet} language={language} />;
            })()}
          {q.type === 'image' && q.content && (
            <img src={q.content} alt="" className="max-h-60 max-w-full rounded-lg mx-auto block" />
          )}
          {q.answers.length > 0 && (
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {q.answers.map((a, i) => (
                <li
                  key={a.id ?? i}
                  className={`flex items-start gap-2 text-xs px-2.5 py-1.5 rounded-lg border ${a.is_correct ? 'border-transparent bg-success-light text-success' : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'}`}
                >
                  <span className="font-mono flex-shrink-0">
                    {a.is_correct ? '✓' : `${String.fromCharCode(65 + i)}.`}
                  </span>
                  <span className="break-words min-w-0">{a.text}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end mt-3 gap-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Pencil size={14} />}
              onClick={onBeginEdit}
            >
              {t('examEdit.editQuestion')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Trash2 size={14} />}
              onClick={onDelete}
              className="text-danger hover:bg-danger-light"
            >
              {t('examEdit.delete')}
            </Button>
          </div>
        </div>
      )}

      {isOpen && draft && (
        <QuestionEditor
          draft={draft}
          saving={saving}
          onCancel={onCancelEdit}
          onSave={onSaveEdit}
          patchDraft={patchDraft}
          patchDraftAnswers={patchDraftAnswers}
          updateCodeDraft={updateCodeDraft}
        />
      )}
    </div>
  );
}

function parseCodeDraft(q: Question): { snippet: string; language: string } {
  if (!q.content) return { snippet: '', language: '' };
  try {
    const parsed = JSON.parse(q.content);
    return { snippet: String(parsed.snippet ?? ''), language: String(parsed.language ?? '') };
  } catch {
    return { snippet: q.content, language: '' };
  }
}

function QuestionEditor({
  draft,
  saving,
  onCancel,
  onSave,
  patchDraft,
  patchDraftAnswers,
  updateCodeDraft,
}: {
  draft: Question;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  patchDraft: (patch: Partial<Question>) => void;
  patchDraftAnswers: (fn: (answers: Answer[]) => Answer[]) => void;
  updateCodeDraft: (snippet?: string, language?: string) => void;
}) {
  const { t } = useLang();
  const code = parseCodeDraft(draft);
  const editableMulti = ['text', 'code', 'image'].includes(draft.type);
  // A language this list doesn't know (older imports) still shows as itself.
  const knownLanguage = !code.language || CODE_LANGUAGES.some((l) => l.value === code.language);

  return (
    <div className="px-4 pb-4 border-t border-[var(--border-subtle)] pt-3 space-y-3">
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <Field label={t('questions.questionText')}>
          <textarea
            value={draft.text}
            onChange={(e) => patchDraft({ text: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:border-accent focus:ring-0"
          />
        </Field>
        <Field label={t('questions.points')}>
          <input
            type="text"
            inputMode="decimal"
            value={String(draft.points)}
            // Kept as typed ("1," mid-edit); parsed with parsePoints on save.
            onChange={(e) => patchDraft({ points: e.target.value as unknown as number })}
            className={inputClass}
          />
        </Field>
      </div>

      {draft.type === 'code' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Field label={t('questions.codeSnippet')}>
              <textarea
                value={code.snippet}
                onChange={(e) => updateCodeDraft(e.target.value, undefined)}
                rows={6}
                spellCheck={false}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[#0d1117] text-gray-200 text-xs font-mono"
              />
            </Field>
          </div>
          <Field label={t('questions.codeLanguage')}>
            <select
              value={code.language}
              onChange={(e) => updateCodeDraft(undefined, e.target.value)}
              className={inputClass}
            >
              <option value="">{t('questions.codeLanguageAuto')}</option>
              {!knownLanguage && <option value={code.language}>{code.language}</option>}
              {CODE_LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {draft.type === 'image' && (
        <Field label={t('questions.image')}>
          <div className="flex items-center gap-2">
            <ImageUploadButton
              onUploaded={(url) => patchDraft({ content: url })}
              className="inline-flex items-center gap-1.5 px-3 h-10 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <UploadIcon size={14} />
              {t('questions.imageUpload')}
            </ImageUploadButton>
            <input
              value={draft.content?.startsWith('data:') ? '' : (draft.content ?? '')}
              onChange={(e) => patchDraft({ content: e.target.value })}
              className={`flex-1 ${inputClass}`}
              placeholder={t('questions.imageUrlPlaceholder')}
            />
          </div>
          {draft.content && (
            <img
              src={draft.content}
              alt=""
              className="mt-2 max-h-40 max-w-full rounded-lg mx-auto block"
            />
          )}
        </Field>
      )}

      {editableMulti && (
        <Toggle
          label={t('examEdit.multiAnswerToggle')}
          value={draft.multi_answer}
          onChange={(v) =>
            // Switching to single keeps only the first correct answer, so the
            // question can't end up single-choice with two right answers.
            patchDraft(
              v
                ? { multi_answer: true }
                : {
                    multi_answer: false,
                    answers: (() => {
                      const first = draft.answers.findIndex((a) => a.is_correct);
                      return draft.answers.map((a, i) => ({ ...a, is_correct: i === first }));
                    })(),
                  },
            )
          }
        />
      )}

      {draft.type !== 'open_text' && (
        <div>
          <div className="text-xs font-medium text-[var(--text-secondary)] mb-1.5">
            {t('examEdit.answers')}
          </div>
          <div className="space-y-1.5">
            {draft.answers.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs font-mono text-[var(--text-muted)] w-5 flex-shrink-0">
                  {String.fromCharCode(65 + i)}.
                </span>
                <input
                  value={a.text}
                  onChange={(e) =>
                    patchDraftAnswers((xs) =>
                      xs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                    )
                  }
                  placeholder={t('examEdit.answerPlaceholder')}
                  className={`flex-1 h-9 ${inputClass}`}
                />
                <button
                  type="button"
                  onClick={() =>
                    // Multi-answer: toggle independently. Single-answer: clicking
                    // sets this one correct and clears the rest.
                    patchDraftAnswers((xs) =>
                      xs.map((x, j) =>
                        draft.multi_answer
                          ? j === i
                            ? { ...x, is_correct: !x.is_correct }
                            : x
                          : { ...x, is_correct: j === i },
                      ),
                    )
                  }
                  title={a.is_correct ? t('examEdit.markIncorrect') : t('examEdit.markCorrect')}
                  aria-label={
                    a.is_correct ? t('examEdit.markIncorrect') : t('examEdit.markCorrect')
                  }
                  className={`h-9 w-9 flex items-center justify-center rounded-lg border text-xs ${a.is_correct ? 'border-transparent bg-success text-white' : 'border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => patchDraftAnswers((xs) => xs.filter((_, j) => j !== i))}
                  title={t('examEdit.removeAnswer')}
                  aria-label={t('examEdit.removeAnswer')}
                  className="h-9 w-9 flex items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-muted)] hover:text-danger"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => patchDraftAnswers((xs) => [...xs, { text: '', is_correct: false }])}
            className="mt-2"
          >
            {t('examEdit.addAnswer')}
          </Button>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          {t('examEdit.cancel')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Save size={14} />}
          loading={saving}
          onClick={onSave}
        >
          {t('examEdit.save')}
        </Button>
      </div>
    </div>
  );
}
