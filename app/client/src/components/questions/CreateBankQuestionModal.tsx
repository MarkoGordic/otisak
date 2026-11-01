import { useEffect, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { useLang } from '../LangProvider';
import { useToast } from '../Toast';
import { Button } from '../ui/Button';
import { Dropdown } from '../ui/Dropdown';
import { CodeBlock } from '../otisak';
import { ImageUploadButton } from '../manage/ImageUploadButton';
import { parsePoints } from '../../lib/points';
import { CODE_LANGUAGES } from '../../lib/codeLanguages';

const emptyAnswers = () => [
  { text: '', is_correct: true },
  { text: '', is_correct: false },
  { text: '', is_correct: false },
  { text: '', is_correct: false },
];

const inputClass =
  'w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:border-accent focus:ring-0';
const labelClass = 'block text-sm font-medium text-[var(--text-secondary)] mb-1';

export function CreateBankQuestionModal({
  subjectId,
  defaultCodeLanguage,
  onClose,
  onCreated,
}: {
  subjectId: string;
  defaultCodeLanguage: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useLang();
  const toast = useToast();
  const [text, setText] = useState('');
  const [type, setType] = useState('text');
  const [points, setPoints] = useState('1');
  const [tags, setTags] = useState('');
  const [codeSnippet, setCodeSnippet] = useState('');
  const [codeLanguage, setCodeLanguage] = useState(defaultCodeLanguage);
  const [imageUrl, setImageUrl] = useState(''); // uploaded /api/otisak/images/<id> or a pasted http(s) URL
  const [imageError, setImageError] = useState('');
  const [answers, setAnswers] = useState(emptyAnswers);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const patchAnswer = (i: number, patch: Partial<{ text: string; is_correct: boolean }>) =>
    setAnswers((prev) => prev.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  const handleCreate = async () => {
    if (!text.trim() || !subjectId) return;
    if (type === 'code' && !codeSnippet.trim()) return toast.error(t('questions.codeRequired'));
    if (type === 'image' && !imageUrl.trim()) return toast.error(t('questions.imageRequired'));
    const filled = answers.filter((a) => a.text.trim());
    if (type !== 'open_text') {
      if (filled.length < 2) return toast.error(t('questions.answersRequired'));
      if (!filled.some((a) => a.is_correct)) return toast.error(t('questions.correctRequired'));
    }
    setCreating(true);
    try {
      const res = await fetch('/api/otisak/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subject_id: subjectId,
          type,
          text,
          points: parsePoints(points, 1),
          tags: tags
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          code_snippet: type === 'code' ? codeSnippet : null,
          code_language: type === 'code' ? codeLanguage || null : null,
          image_url: type === 'image' ? imageUrl : null,
          answers: type === 'open_text' ? [] : filled,
        }),
      });
      if (res.ok) {
        toast.success(t('examEdit.questionAdded'));
        onCreated();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('examEdit.addFailed'));
      }
    } catch {
      toast.error(t('examEdit.addFailed'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[var(--bg-elevated)] rounded-2xl border border-[var(--border-default)] shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-display font-semibold text-[var(--text-primary)]">
            {t('questions.addTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('questions.cancel')}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 pb-2 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className={labelClass}>{t('questions.type')}</label>
              <Dropdown
                options={[
                  { value: 'text', label: t('questions.multipleChoice') },
                  { value: 'code', label: t('questions.code') },
                  { value: 'image', label: t('questions.image') },
                  { value: 'open_text', label: t('questions.openText') },
                ]}
                value={type}
                onChange={setType}
              />
            </div>
            <div>
              <label className={labelClass}>{t('questions.points')}</label>
              <input
                type="text"
                inputMode="decimal"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                className={inputClass}
                placeholder="1.5"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>{t('questions.questionText')}</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              className="w-full h-24 px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm resize-y focus:border-accent focus:ring-0"
              placeholder={t('questions.questionPlaceholder')}
            />
          </div>

          {type === 'code' && (
            <div className="space-y-2">
              <div className="flex items-end justify-between gap-3">
                <label className={labelClass}>{t('questions.codeSnippet')}</label>
                <div className="w-56">
                  <Dropdown
                    options={[
                      ...CODE_LANGUAGES,
                      { value: '', label: t('questions.codeLanguageAuto') },
                    ]}
                    value={codeLanguage}
                    onChange={setCodeLanguage}
                  />
                </div>
              </div>
              <textarea
                value={codeSnippet}
                onChange={(e) => setCodeSnippet(e.target.value)}
                spellCheck={false}
                className="w-full h-40 px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[#0d1117] text-gray-200 text-xs font-mono resize-y"
              />
              {codeSnippet.trim() && (
                <CodeBlock code={codeSnippet} language={codeLanguage || undefined} />
              )}
            </div>
          )}

          {type === 'image' && (
            <div className="space-y-2">
              <label className={labelClass}>{t('questions.imageSection')}</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <ImageUploadButton
                  onUploaded={(url) => {
                    setImageError('');
                    setImageUrl(url);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 h-10 px-3 rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--bg-primary)] text-sm text-[var(--text-secondary)] hover:border-accent hover:text-accent transition-colors"
                >
                  <Upload size={14} />
                  {t('questions.imageUpload')}
                </ImageUploadButton>
                <input
                  value={imageUrl.startsWith('data:') ? '' : imageUrl}
                  onChange={(e) => {
                    setImageError('');
                    setImageUrl(e.target.value);
                  }}
                  className={`flex-1 ${inputClass}`}
                  placeholder={t('questions.imageUrlPlaceholder')}
                />
              </div>
              {imageError && <p className="text-xs text-danger">{imageError}</p>}
              {imageUrl && (
                <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] p-2">
                  <img
                    src={imageUrl}
                    alt=""
                    className="max-h-60 max-w-full rounded-md mx-auto block"
                    onError={() => setImageError(t('questions.imageInvalidUrl'))}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImageUrl('');
                      setImageError('');
                    }}
                    className="mt-2 text-xs text-danger hover:underline"
                  >
                    {t('questions.imageClear')}
                  </button>
                </div>
              )}
            </div>
          )}

          {type !== 'open_text' && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                {t('examEdit.answers')}
              </label>
              <div className="space-y-2">
                {answers.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => patchAnswer(i, { is_correct: !a.is_correct })}
                      title={t('questions.toggleCorrect')}
                      className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors ${a.is_correct ? 'bg-success text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                    >
                      {a.is_correct ? '✓' : String.fromCharCode(65 + i)}
                    </button>
                    <input
                      value={a.text}
                      onChange={(e) => patchAnswer(i, { text: e.target.value })}
                      className={`flex-1 h-9 ${inputClass}`}
                      placeholder={`${t('examEdit.answer')} ${String.fromCharCode(65 + i)}`}
                    />
                    <button
                      type="button"
                      disabled={answers.length <= 2}
                      onClick={() => setAnswers((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={t('questions.removeAnswer')}
                      title={t('questions.removeAnswer')}
                      className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-danger hover:bg-danger-light disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <X size={14} />
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
            </div>
          )}

          <div>
            <label className={labelClass}>{t('questions.tagsLabel')}</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className={inputClass}
              placeholder="tag1, tag2"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-default)] mt-2">
          <Button variant="secondary" onClick={onClose}>
            {t('questions.cancel')}
          </Button>
          <Button variant="primary" loading={creating} onClick={handleCreate}>
            {t('questions.createQuestion')}
          </Button>
        </div>
      </div>
    </div>
  );
}
