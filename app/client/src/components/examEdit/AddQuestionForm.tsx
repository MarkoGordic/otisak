import { useState } from 'react';
import { Plus, Trash2, Upload as UploadIcon } from 'lucide-react';
import { useLang } from '../LangProvider';
import { useToast } from '../Toast';
import { Button } from '../ui/Button';
import { CodeBlock } from '../otisak';
import { ImageUploadButton } from '../manage/ImageUploadButton';
import { parsePoints } from '../../lib/points';
import { CODE_LANGUAGES } from '../../lib/codeLanguages';
import { Field, Toggle, inputClass, needsMulti, type Answer } from './fields';

const blankAnswers = (): Answer[] => [
  { text: '', is_correct: true },
  { text: '', is_correct: false },
  { text: '', is_correct: false },
  { text: '', is_correct: false },
];

// The "add a question" form. Owns its draft so typing here doesn't re-render
// the whole question list above it.
export function AddQuestionForm({
  examId,
  defaultLanguage,
  onAdded,
}: {
  examId: string;
  defaultLanguage: string;
  onAdded: () => void;
}) {
  const { t } = useLang();
  const toast = useToast();
  const [type, setType] = useState('text');
  const [text, setText] = useState('');
  const [points, setPoints] = useState('2');
  const [code, setCode] = useState('');
  const [lang, setLang] = useState(defaultLanguage);
  const [image, setImage] = useState('');
  const [answers, setAnswers] = useState<Answer[]>(blankAnswers);
  // Explicit single vs multi flag, stored on the question. Forced on when
  // more than one answer is marked correct (see needsMulti).
  const [multi, setMulti] = useState(false);
  const [creating, setCreating] = useState(false);

  const choice = ['text', 'code', 'image'].includes(type);

  const handleAdd = async () => {
    if (!text.trim()) return toast.error(t('examEdit.questionTextRequired'));
    if (type === 'code' && !code.trim()) return toast.error(t('questions.codeRequired'));
    if (type === 'image' && !image.trim()) return toast.error(t('questions.imageRequired'));
    const filled = answers.filter((a) => a.text.trim());
    if (type !== 'open_text') {
      if (filled.length < 2) return toast.error(t('questions.answersRequired'));
      if (!filled.some((a) => a.is_correct)) return toast.error(t('questions.correctRequired'));
    }

    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        type,
        text,
        points: parsePoints(points, 1),
        // Only choice types have selectable options; for open_text etc. the
        // flag is meaningless.
        ...(choice ? { multi_answer: multi || needsMulti(filled) } : {}),
        answers: type === 'open_text' ? [] : filled,
      };
      if (type === 'code') body.content = JSON.stringify({ snippet: code, language: lang || null });
      else if (type === 'image') body.content = image;

      const res = await fetch(`/api/otisak/exams/${examId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('examEdit.addFailed'));
        return;
      }
      toast.success(t('examEdit.questionAdded'));
      setText('');
      setCode('');
      setImage('');
      setPoints('2');
      setAnswers(blankAnswers());
      setMulti(false);
      onAdded();
    } catch {
      toast.error(t('examEdit.addFailed'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="col-span-1 sm:col-span-2">
          <Field label={t('questions.type')}>
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
              <option value="text">{t('questions.multipleChoice')}</option>
              <option value="code">{t('questions.code')}</option>
              <option value="image">{t('questions.image')}</option>
              <option value="open_text">{t('questions.openText')}</option>
            </select>
          </Field>
        </div>
        <Field label={t('questions.points')}>
          <input
            type="text"
            inputMode="decimal"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label={t('questions.questionText')}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full h-20 px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm resize-y focus:border-accent focus:ring-0"
        />
      </Field>

      {type === 'code' && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Field label={t('questions.codeSnippet')}>
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  spellCheck={false}
                  className="w-full h-32 px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[#0d1117] text-gray-200 text-xs font-mono resize-y"
                />
              </Field>
            </div>
            <Field label={t('questions.codeLanguage')}>
              <select value={lang} onChange={(e) => setLang(e.target.value)} className={inputClass}>
                {CODE_LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
                <option value="">{t('questions.codeLanguageAuto')}</option>
              </select>
            </Field>
          </div>
          {code.trim() && <CodeBlock code={code} language={lang || undefined} />}
        </div>
      )}

      {type === 'image' && (
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <ImageUploadButton
              onUploaded={setImage}
              className="flex-1 flex items-center justify-center gap-2 h-10 px-3 rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--bg-primary)] text-sm text-[var(--text-secondary)] hover:border-accent hover:text-accent transition-colors"
            >
              <UploadIcon size={14} />
              {t('questions.imageUpload')}
            </ImageUploadButton>
            <input
              value={image.startsWith('data:') ? '' : image}
              onChange={(e) => setImage(e.target.value)}
              className={`flex-1 ${inputClass}`}
              placeholder={t('questions.imageUrlPlaceholder')}
            />
          </div>
          {image && (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-2">
              <img src={image} alt="" className="max-h-48 max-w-full rounded mx-auto block" />
            </div>
          )}
        </div>
      )}

      {choice && (
        <Toggle label={t('examEdit.multiAnswerToggle')} value={multi} onChange={setMulti} />
      )}

      {type !== 'open_text' && (
        <div className="space-y-2">
          <span className="block text-xs font-medium text-[var(--text-secondary)]">
            {t('examEdit.answers')}
          </span>
          {answers.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                title={a.is_correct ? t('examEdit.markIncorrect') : t('examEdit.markCorrect')}
                onClick={() =>
                  setAnswers((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, is_correct: !x.is_correct } : x)),
                  )
                }
                className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors ${a.is_correct ? 'bg-success text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
              >
                {a.is_correct ? '✓' : String.fromCharCode(65 + i)}
              </button>
              <input
                value={a.text}
                onChange={(e) =>
                  setAnswers((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                  )
                }
                className={`flex-1 h-9 ${inputClass}`}
                placeholder={`${t('examEdit.answer')} ${String.fromCharCode(65 + i)}`}
              />
              <button
                type="button"
                disabled={answers.length <= 2}
                onClick={() => setAnswers((prev) => prev.filter((_, j) => j !== i))}
                className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-danger hover:bg-danger-light disabled:opacity-30 disabled:pointer-events-none"
                title={t('examEdit.removeAnswer')}
                aria-label={t('examEdit.removeAnswer')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setAnswers((prev) => [...prev, { text: '', is_correct: false }])}
            className="text-xs text-accent hover:text-accent-hover"
          >
            + {t('examEdit.addAnswer')}
          </button>
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Button
          variant="primary"
          leftIcon={<Plus size={14} />}
          loading={creating}
          onClick={handleAdd}
        >
          {t('examEdit.addQuestion')}
        </Button>
      </div>
    </div>
  );
}
