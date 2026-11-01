import { useEffect, useState } from 'react';
import { AlertTriangle, Plus, Save, Shuffle, Trash2 } from 'lucide-react';
import { useLang } from '../LangProvider';
import { useToast } from '../Toast';
import { Button } from '../ui/Button';
import { parsePoints } from '../../lib/points';
import { inputClass } from './fields';

type Rule = { tag: string; question_count: string; points_per_question: string };
type TagCount = { tag: string; count: number };

// Bank rules for a practice template: each run draws `question_count` random
// questions tagged `tag` from the subject's bank. Before this panel the rules
// could only be set in SQL, which is how several published tests silently lost
// theirs and handed students empty tests.
export function BankRulesPanel({
  examId,
  subjectId,
  initialRules,
  onSaved,
}: {
  examId: string;
  subjectId: string | null | undefined;
  initialRules: Array<{ tag: string; question_count: number; points_per_question: number }>;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const toast = useToast();
  const [rules, setRules] = useState<Rule[]>(() =>
    initialRules.map((r) => ({
      tag: r.tag,
      question_count: String(r.question_count),
      points_per_question: String(r.points_per_question),
    })),
  );
  const [tags, setTags] = useState<TagCount[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!subjectId) return;
    (async () => {
      const res = await fetch(`/api/otisak/questions?subject_id=${subjectId}&limit=20`, {
        credentials: 'include',
      });
      if (res.ok) setTags((await res.json()).tags || []);
    })();
  }, [subjectId]);

  const available = (tag: string) => tags.find((x) => x.tag === tag)?.count ?? 0;
  const patch = (i: number, p: Partial<Rule>) =>
    setRules((prev) => prev.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const totalQuestions = rules.reduce((s, r) => s + (parseInt(r.question_count) || 0), 0);
  const totalPoints = rules.reduce(
    (s, r) => s + (parseInt(r.question_count) || 0) * parsePoints(r.points_per_question, 0),
    0,
  );

  const save = async () => {
    const payload = rules
      .filter((r) => r.tag)
      .map((r) => ({
        tag: r.tag,
        question_count: parseInt(r.question_count) || 0,
        points_per_question: parsePoints(r.points_per_question, 2),
      }));
    if (payload.some((r) => r.question_count < 1)) return toast.error(t('bankRules.countInvalid'));
    setSaving(true);
    try {
      const res = await fetch('/api/otisak/exams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: examId, tag_rules: payload }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('examEdit.saveFailed'));
        return;
      }
      toast.success(t('bankRules.saved'));
      onSaved();
    } catch {
      toast.error(t('examEdit.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{t('bankRules.help')}</p>

      {!subjectId && (
        <div className="flex items-center gap-2 text-xs text-warning">
          <AlertTriangle size={13} />
          {t('bankRules.needsSubject')}
        </div>
      )}

      {rules.length > 0 && (
        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_6rem_6rem_2.25rem] gap-2 px-1 text-[11px] font-medium text-[var(--text-muted)]">
            <span>{t('bankRules.tag')}</span>
            <span>{t('bankRules.count')}</span>
            <span>{t('bankRules.points')}</span>
            <span />
          </div>
          {rules.map((r, i) => {
            const have = available(r.tag);
            const want = parseInt(r.question_count) || 0;
            const short = r.tag !== '' && tags.length > 0 && want > have;
            return (
              <div key={i}>
                <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_2.25rem] sm:grid-cols-[minmax(0,1fr)_6rem_6rem_2.25rem] gap-2 items-center">
                  <select
                    value={r.tag}
                    onChange={(e) => patch(i, { tag: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">{t('bankRules.pickTag')}</option>
                    {/* Keep a saved tag selectable even if no question carries it any more. */}
                    {r.tag && !tags.some((x) => x.tag === r.tag) && (
                      <option value={r.tag}>{r.tag} (0)</option>
                    )}
                    {tags.map((x) => (
                      <option key={x.tag} value={x.tag}>
                        {x.tag} ({x.count})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={r.question_count}
                    onChange={(e) => patch(i, { question_count: e.target.value })}
                    className={inputClass}
                    aria-label={t('bankRules.count')}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={r.points_per_question}
                    onChange={(e) => patch(i, { points_per_question: e.target.value })}
                    className={inputClass}
                    aria-label={t('bankRules.points')}
                  />
                  <button
                    type="button"
                    onClick={() => setRules((prev) => prev.filter((_, j) => j !== i))}
                    className="h-9 w-9 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-danger hover:bg-danger-light"
                    title={t('bankRules.remove')}
                    aria-label={t('bankRules.remove')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {short && (
                  <p className="mt-1 px-1 text-[11px] text-warning">
                    {t('bankRules.short', { have, want })}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              setRules((prev) => [
                ...prev,
                { tag: '', question_count: '10', points_per_question: '2' },
              ])
            }
            disabled={!subjectId}
            className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover disabled:opacity-40"
          >
            <Plus size={13} />
            {t('bankRules.add')}
          </button>
          {rules.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <Shuffle size={12} />
              {t('bankRules.total', { count: totalQuestions, points: totalPoints })}
            </span>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Save size={14} />}
          loading={saving}
          onClick={save}
        >
          {t('bankRules.save')}
        </Button>
      </div>
    </div>
  );
}
