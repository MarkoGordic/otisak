import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Loader2,
  ArrowLeft,
  Plus,
  Settings,
  Download,
  Save,
  ChevronDown,
  AlertTriangle,
  Printer,
  Shuffle,
  ListChecks,
} from 'lucide-react';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import { useToast } from '../components/Toast';
import { AppCopyright } from '../components/AppCopyright';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { parsePoints } from '../lib/points';
import {
  Field,
  Toggle,
  TagChipsEditor,
  inputClass,
  needsMulti,
  type Answer,
  type Question,
} from '../components/examEdit/fields';
import { AddQuestionForm } from '../components/examEdit/AddQuestionForm';
import { QuestionItem } from '../components/examEdit/QuestionItem';
import { BankRulesPanel } from '../components/examEdit/BankRulesPanel';

type Exam = {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  pass_threshold: number;
  has_pass_threshold: boolean;
  exam_mode: 'real' | 'practice';
  allow_review: boolean;
  allow_notes: boolean;
  allow_calculator: boolean;
  shuffle_questions: boolean;
  shuffle_answers: boolean;
  partial_scoring: boolean;
  negative_points_enabled: boolean;
  negative_points_value: number;
  negative_points_threshold: number;
  status: string;
  subject_id?: string | null;
  subject_name?: string | null;
  question_count?: number;
  bank_rules?: Array<{ tag: string; question_count: number; points_per_question: number }>;
  tags: string[];
};

type Subject = { id: string; name: string; code: string | null };
type UserInfo = { name?: string; role?: string; avatar_url?: string };

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'neutral'> = {
  active: 'success',
  scheduled: 'warning',
  completed: 'info',
};

export default function ExamEditPage() {
  const navigate = useNavigate();
  const { examId } = useParams();
  const { t, locale } = useLang();
  const toast = useToast();

  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  // Which collapsible sections are open; decided once the exam has loaded.
  const [open, setOpen] = useState<Record<string, boolean> | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // When a question id is in this map it's being edited; the value is the
  // working copy of the question fields. Closing/cancelling drops the entry;
  // saving PATCHes and refetches from the server.
  const [editDrafts, setEditDrafts] = useState<Record<string, Question>>({});
  const [savingEdit, setSavingEdit] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/session', { credentials: 'include' });
      const data = await res.json();
      if (!data.authenticated || !['admin', 'assistant', 'professor'].includes(data.user?.role)) {
        navigate('/login', { replace: true });
        return;
      }
      setUser({ name: data.user?.name, role: data.user?.role, avatar_url: data.user?.avatar_url });
    })();
  }, [navigate]);

  const load = useCallback(async () => {
    if (!examId) return;
    try {
      const [examsRes, qRes, subjectsRes] = await Promise.all([
        fetch('/api/otisak/exams', { credentials: 'include' }),
        fetch(`/api/otisak/exams/${examId}/questions`, { credentials: 'include' }),
        // Only subjects this user may attach the exam to.
        fetch('/api/otisak/questions/subjects', { credentials: 'include' }),
      ]);
      if (examsRes.ok) {
        const d = await examsRes.json();
        const found = (d.exams || []).find((e: Exam) => e.id === examId) || null;
        setExam(
          found
            ? {
                ...found,
                // Old payloads may lack these; default so the editor never crashes.
                tags: Array.isArray(found.tags) ? found.tags : [],
                bank_rules: Array.isArray(found.bank_rules) ? found.bank_rules : [],
                has_pass_threshold:
                  typeof found.has_pass_threshold === 'boolean' ? found.has_pass_threshold : true,
              }
            : null,
        );
      }
      if (qRes.ok) {
        const d = await qRes.json();
        setQuestions(
          (d.questions || []).sort((a: Question, b: Question) => a.position - b.position),
        );
      }
      if (subjectsRes.ok) setSubjects((await subjectsRes.json()).subjects || []);
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Open what the exam needs: a new exam opens on settings and the add form, a
  // bank-drawn practice test on its rules, a filled exam on its question list.
  useEffect(() => {
    if (!exam || open) return;
    const hasRules = (exam.bank_rules?.length ?? 0) > 0;
    const isPractice = exam.exam_mode === 'practice';
    setOpen({
      settings: questions.length === 0 && !hasRules,
      bank: isPractice && (hasRules || questions.length === 0),
      add: questions.length === 0 && !hasRules,
    });
  }, [exam, questions.length, open]);

  const handleSaveSettings = async () => {
    if (!exam) return;
    setSavingSettings(true);
    try {
      const res = await fetch('/api/otisak/exams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: exam.id,
          title: exam.title,
          description: exam.description,
          duration_minutes: Math.max(1, Math.round(Number(exam.duration_minutes) || 60)),
          // 0% is a legal threshold; `|| 50` used to turn it into 50 on every save.
          pass_threshold: Math.min(100, Math.max(0, Number(exam.pass_threshold) || 0)),
          has_pass_threshold: exam.has_pass_threshold,
          // exam_mode is deliberately NOT sent. Mode is fixed by the page the
          // exam was created on, and sending it here would make the server
          // re-derive self_service / is_public on every save, silently
          // republishing a practice exam that had been made private.
          subject_id: exam.subject_id ?? null,
          allow_review: exam.allow_review,
          allow_notes: exam.allow_notes,
          allow_calculator: exam.allow_calculator,
          shuffle_questions: exam.shuffle_questions,
          shuffle_answers: exam.shuffle_answers,
          partial_scoring: exam.partial_scoring,
          negative_points_enabled: exam.negative_points_enabled,
          negative_points_value: Number(exam.negative_points_value) || 0,
          negative_points_threshold: Number(exam.negative_points_threshold) || 0,
          tags: exam.tags ?? [],
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(
          d.error === 'DEMO_EXAM_LOCKED'
            ? t('manage.demoLocked')
            : d.error || t('examEdit.saveFailed'),
        );
        return;
      }
      // The PATCH returns the raw row (numerics as strings, no subject_name);
      // reload so the form shows exactly what was persisted.
      toast.success(t('examEdit.saveSuccess'));
      await load();
    } catch {
      toast.error(t('examEdit.saveFailed'));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDeleteQuestion = async (qid: string) => {
    if (!confirm(t('examEdit.confirmDelete'))) return;
    try {
      const res = await fetch(`/api/otisak/exams/${examId}/questions`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: qid }),
      });
      if (res.ok) {
        toast.success(t('examEdit.questionDeleted'));
        setQuestions((qs) => qs.filter((q) => q.id !== qid));
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('examEdit.questionDeleteFailed'));
      }
    } catch {
      toast.error(t('examEdit.questionDeleteFailed'));
    }
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Open the inline editor for a question. Clones the row so edits don't
  // mutate the canonical list before save.
  const beginEdit = (q: Question) => {
    setExpanded((prev) => new Set(prev).add(q.id));
    setEditDrafts((prev) => ({
      ...prev,
      [q.id]: { ...q, answers: q.answers.map((a) => ({ ...a })) },
    }));
  };

  const cancelEdit = (qid: string) =>
    setEditDrafts((prev) => {
      const next = { ...prev };
      delete next[qid];
      return next;
    });

  const patchDraft = (qid: string, patch: Partial<Question>) =>
    setEditDrafts((prev) => (prev[qid] ? { ...prev, [qid]: { ...prev[qid], ...patch } } : prev));

  const patchDraftAnswers = (qid: string, fn: (answers: Answer[]) => Answer[]) =>
    setEditDrafts((prev) =>
      prev[qid] ? { ...prev, [qid]: { ...prev[qid], answers: fn(prev[qid].answers) } } : prev,
    );

  // The DB stores a code question's snippet and language as one JSON `content`;
  // the editor splits them into two inputs and re-encodes on every keystroke.
  const updateCodeDraft = (qid: string, snippet?: string, language?: string) => {
    const draft = editDrafts[qid];
    if (!draft) return;
    let current: { snippet?: string; language?: string } = {};
    if (draft.content) {
      try {
        current = JSON.parse(draft.content);
      } catch {
        current = { snippet: draft.content };
      }
    }
    patchDraft(qid, {
      content: JSON.stringify({
        snippet: snippet !== undefined ? snippet : (current.snippet ?? ''),
        language: language !== undefined ? language : (current.language ?? null),
      }),
    });
  };

  const handleSaveEdit = async (qid: string) => {
    const draft = editDrafts[qid];
    if (!draft) return;
    if (!draft.text.trim()) return toast.error(t('examEdit.questionTextRequired'));
    const answers = draft.answers.filter((a) => a.text.trim());
    if (draft.type !== 'open_text') {
      if (answers.length < 2) return toast.error(t('questions.answersRequired'));
      if (!answers.some((a) => a.is_correct)) return toast.error(t('questions.correctRequired'));
    }
    // `type` is never sent: the server rejects type changes (they would
    // invalidate the answer semantics).
    const body: Record<string, unknown> = {
      id: qid,
      text: draft.text,
      points: parsePoints(String(draft.points), 0),
      explanation: draft.explanation,
      ai_grading_instructions: draft.ai_grading_instructions,
    };
    if (['text', 'code', 'image'].includes(draft.type)) {
      body.multi_answer = draft.multi_answer || needsMulti(answers);
    }
    if (draft.type === 'code' || draft.type === 'image' || draft.type === 'open_text') {
      body.content = draft.content;
    }
    body.answers =
      draft.type === 'open_text'
        ? []
        : answers.map((a, i) => ({ text: a.text, is_correct: a.is_correct, position: i }));

    setSavingEdit((prev) => new Set(prev).add(qid));
    try {
      const res = await fetch(`/api/otisak/exams/${examId}/questions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('examEdit.questionUpdateFailed'));
        return;
      }
      toast.success(t('examEdit.questionUpdated'));
      cancelEdit(qid);
      load();
    } catch {
      toast.error(t('examEdit.questionUpdateFailed'));
    } finally {
      setSavingEdit((prev) => {
        const next = new Set(prev);
        next.delete(qid);
        return next;
      });
    }
  };

  // New code questions default to the language this exam already uses most.
  const defaultLanguage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const q of questions) {
      if (q.type !== 'code' || !q.content) continue;
      try {
        const lang = JSON.parse(q.content).language;
        if (lang) counts.set(lang, (counts.get(lang) || 0) + 1);
      } catch {
        // bare snippet, no language
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'python';
  }, [questions]);

  if (!user || loading || (exam && !open)) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!exam || !open) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center">
        <p className="text-[var(--text-secondary)]">{t('examEdit.notFound')}</p>
      </div>
    );
  }

  const isPractice = exam.exam_mode === 'practice';
  const rules = exam.bank_rules ?? [];
  const bankCount = rules.reduce((s, r) => s + r.question_count, 0);
  const bankPoints = rules.reduce((s, r) => s + r.question_count * r.points_per_question, 0);
  const ownPoints = questions.reduce((s, q) => s + Number(q.points || 0), 0);
  const toggle = (key: string) => setOpen((prev) => ({ ...(prev ?? {}), [key]: !prev?.[key] }));
  const backHref = isPractice ? '/practice' : '/manage';

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex">
      <Sidebar userName={user.name} userRole={user.role} userAvatar={user.avatar_url} />
      <MobileNav userName={user.name} userRole={user.role} />

      <div className="flex-1 min-w-0 lg:ml-[260px] flex flex-col min-h-screen">
        <main className="flex-1 flex flex-col pb-20 lg:pb-8">
          <div className="p-4 sm:p-6 lg:p-8 max-w-[960px] mx-auto w-full">
            {/* Header */}
            <Link
              to={backHref}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-3"
            >
              <ArrowLeft size={14} />
              {t(isPractice ? 'nav.practiceAdmin' : 'nav.manage')}
            </Link>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-display font-bold text-[var(--text-primary)] break-words">
                    {exam.title}
                  </h1>
                  <Badge variant={STATUS_VARIANT[exam.status] ?? 'neutral'} size="sm">
                    {t(`manage.${exam.status}`)}
                  </Badge>
                  {/* Mode is fixed at creation, so it's a label, not a control. */}
                  {isPractice && (
                    <Badge variant="accent" size="sm">
                      {t('examEdit.modePractice')}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  {exam.subject_name && <>{exam.subject_name} · </>}
                  {bankCount > 0
                    ? t('examEdit.summaryBank', { count: bankCount, points: bankPoints })
                    : t('examEdit.summary', { count: questions.length, points: ownPoints })}
                  {' · '}
                  {exam.duration_minutes} {t('manage.minShort')}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={`/api/otisak/exams/${exam.id}/print/pdf?lang=${locale}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-sm font-medium hover:border-accent hover:text-accent transition-colors"
                >
                  <Printer size={14} />
                  {t('manage.printTest')}
                </a>
                <a
                  href={`/api/otisak/exams/${exam.id}/export`}
                  className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-sm font-medium hover:border-accent hover:text-accent transition-colors"
                >
                  <Download size={14} />
                  JSON
                </a>
              </div>
            </div>

            {/* Settings */}
            <Section
              icon={<Settings size={16} />}
              title={t('examEdit.settings')}
              open={open.settings}
              onToggle={() => toggle('settings')}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={t('examEdit.title')}>
                  <input
                    value={exam.title}
                    onChange={(e) => setExam({ ...exam, title: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label={t('examEdit.subject')}>
                  <select
                    value={exam.subject_id ?? ''}
                    onChange={(e) => setExam({ ...exam, subject_id: e.target.value || null })}
                    className={inputClass}
                  >
                    <option value="">{t('examEdit.noSubject')}</option>
                    {exam.subject_id && !subjects.some((s) => s.id === exam.subject_id) && (
                      <option value={exam.subject_id}>{exam.subject_name}</option>
                    )}
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code ? `${s.name} (${s.code})` : s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label={t('examEdit.description')}>
                    <textarea
                      value={exam.description ?? ''}
                      onChange={(e) => setExam({ ...exam, description: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm resize-y focus:border-accent focus:ring-0"
                    />
                  </Field>
                </div>
                <Field label={t('examEdit.duration')}>
                  <input
                    type="number"
                    min={1}
                    value={exam.duration_minutes}
                    onChange={(e) => setExam({ ...exam, duration_minutes: Number(e.target.value) })}
                    className={inputClass}
                  />
                </Field>
                <Field label={t('examEdit.passThreshold')}>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={exam.pass_threshold}
                      disabled={!exam.has_pass_threshold}
                      onChange={(e) => setExam({ ...exam, pass_threshold: Number(e.target.value) })}
                      className={`${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                    />
                    <span className="text-sm text-[var(--text-muted)]">%</span>
                  </div>
                </Field>
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Toggle
                    label={t('examEdit.hasPassThresholdOn')}
                    value={exam.has_pass_threshold}
                    onChange={(v) => setExam({ ...exam, has_pass_threshold: v })}
                  />
                  <Toggle
                    label={t('examEdit.allowReview')}
                    value={exam.allow_review}
                    onChange={(v) => setExam({ ...exam, allow_review: v })}
                  />
                  <Toggle
                    label={t('examEdit.shuffleQuestions')}
                    value={exam.shuffle_questions}
                    onChange={(v) => setExam({ ...exam, shuffle_questions: v })}
                  />
                  <Toggle
                    label={t('examEdit.shuffleAnswers')}
                    value={exam.shuffle_answers}
                    onChange={(v) => setExam({ ...exam, shuffle_answers: v })}
                  />
                  <Toggle
                    label={t('examEdit.partialScoring')}
                    value={exam.partial_scoring}
                    onChange={(v) => setExam({ ...exam, partial_scoring: v })}
                  />
                  <Toggle
                    label={t('examEdit.allowNotes')}
                    value={exam.allow_notes}
                    onChange={(v) => setExam({ ...exam, allow_notes: v })}
                  />
                  <Toggle
                    label={t('examEdit.allowCalculator')}
                    value={exam.allow_calculator}
                    onChange={(v) => setExam({ ...exam, allow_calculator: v })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Field label={t('examEdit.tags')}>
                    <TagChipsEditor
                      value={exam.tags ?? []}
                      onChange={(next) => setExam({ ...exam, tags: next })}
                      placeholder={t('examEdit.tagsPlaceholder')}
                    />
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">
                      {t('examEdit.tagsHelp')}
                    </p>
                  </Field>
                </div>
                {exam.status === 'completed' && (
                  <div className="sm:col-span-2 flex items-center gap-2 rounded-lg bg-warning-light px-3 py-2 text-xs text-warning">
                    <AlertTriangle size={14} />
                    <span>{t('examEdit.rescoreNotice')}</span>
                  </div>
                )}
                <div className="sm:col-span-2 flex justify-end">
                  <Button
                    variant="primary"
                    leftIcon={<Save size={14} />}
                    loading={savingSettings}
                    onClick={handleSaveSettings}
                  >
                    {t('examEdit.saveSettings')}
                  </Button>
                </div>
              </div>
            </Section>

            {/* Bank rules: practice templates only, real exams never draw from the bank. */}
            {isPractice && (
              <Section
                icon={<Shuffle size={16} />}
                title={t('bankRules.title')}
                aside={
                  bankCount > 0
                    ? t('bankRules.total', { count: bankCount, points: bankPoints })
                    : undefined
                }
                open={open.bank}
                onToggle={() => toggle('bank')}
              >
                <BankRulesPanel
                  key={JSON.stringify(rules)}
                  examId={exam.id}
                  subjectId={exam.subject_id}
                  initialRules={rules}
                  onSaved={load}
                />
              </Section>
            )}

            {/* Questions */}
            <div className="flex items-center justify-between mt-8 mb-3">
              <h2 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] font-semibold">
                <ListChecks size={14} />
                {t('examEdit.questions')} ({questions.length})
              </h2>
              <span className="text-xs text-[var(--text-muted)] tabular-nums">
                {ownPoints} {t('questions.pts')}
              </span>
            </div>
            {questions.length === 0 ? (
              <div className="text-sm text-[var(--text-muted)] text-center py-10 px-4 rounded-xl border border-dashed border-[var(--border-default)]">
                {bankCount > 0 ? t('examEdit.emptyBank') : t('examEdit.empty')}
              </div>
            ) : (
              <div className="space-y-2">
                {questions.map((q, idx) => (
                  <QuestionItem
                    key={q.id}
                    q={q}
                    index={idx}
                    isOpen={expanded.has(q.id)}
                    draft={editDrafts[q.id]}
                    saving={savingEdit.has(q.id)}
                    onToggle={() => toggleExpand(q.id)}
                    onBeginEdit={() => beginEdit(q)}
                    onCancelEdit={() => cancelEdit(q.id)}
                    onSaveEdit={() => handleSaveEdit(q.id)}
                    onDelete={() => handleDeleteQuestion(q.id)}
                    patchDraft={(p) => patchDraft(q.id, p)}
                    patchDraftAnswers={(fn) => patchDraftAnswers(q.id, fn)}
                    updateCodeDraft={(snippet, language) =>
                      updateCodeDraft(q.id, snippet, language)
                    }
                  />
                ))}
              </div>
            )}

            {/* Add question */}
            <div className="mt-4">
              <Section
                icon={<Plus size={16} />}
                title={t('examEdit.addQuestion')}
                open={open.add}
                onToggle={() => toggle('add')}
              >
                <AddQuestionForm
                  examId={exam.id}
                  defaultLanguage={defaultLanguage}
                  onAdded={load}
                />
              </Section>
            </div>
          </div>
          <div className="mt-auto px-4 pb-6 pt-2 flex justify-center">
            <AppCopyright />
          </div>
        </main>
      </div>
    </div>
  );
}

// A collapsible card. The header is the toggle; `aside` is a short summary
// shown while it is closed, so a folded section still says what's inside.
function Section({
  icon,
  title,
  aside,
  open,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  aside?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-subtle)] mb-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-4 text-left"
      >
        <span className="text-accent">{icon}</span>
        <span className="text-sm font-medium text-[var(--text-primary)]">{title}</span>
        {aside && <span className="text-xs text-[var(--text-muted)] truncate">{aside}</span>}
        <ChevronDown
          size={16}
          className={`ml-auto text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </section>
  );
}
