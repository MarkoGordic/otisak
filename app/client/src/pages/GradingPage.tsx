import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, ArrowLeft, ClipboardCheck, CheckCircle2, Save, Info } from 'lucide-react';

import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import { useToast } from '../components/Toast';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Tabs } from '../components/ui/Tabs';

type Session = { id?: string; name?: string; role?: string; avatar_url?: string };

type GradingItem = {
  attempt_id: string;
  question_id: string;
  question_text: string;
  question_position: number;
  grading_instructions: string | null;
  max_points: number;
  student_id: string;
  student_name: string | null;
  student_email: string;
  student_index: string | null;
  text_answer: string;
  points_awarded: number;
  status: 'pending' | 'graded';
  feedback: string | null;
  graded_at: string | null;
  graded_by_name: string | null;
};

type GradingData = {
  exam: { id: string; title: string; subject_name: string | null; status: string };
  items: GradingItem[];
};

type Filter = 'pending' | 'graded' | 'all';

const itemKey = (it: Pick<GradingItem, 'attempt_id' | 'question_id'>) => `${it.attempt_id}:${it.question_id}`;

// Manual grading of open-text answers for one exam. Answers are grouped by
// question so the grader reads one question's answers in a row; the header
// shows how many are left.
export default function GradingPage() {
  const navigate = useNavigate();
  const { examId } = useParams();
  const { t } = useLang();

  const [me, setMe] = useState<Session | null>(null);
  const [data, setData] = useState<GradingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');
  // Answers graded since the filter last changed stay on screen (shown as
  // graded) instead of vanishing from the "to grade" list mid-work.
  const [keepVisible, setKeepVisible] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sres = await fetch('/api/auth/session', { credentials: 'include' });
        if (!sres.ok) { navigate('/login', { replace: true }); return; }
        const sdata = await sres.json();
        if (!sdata.authenticated || (sdata.user?.role !== 'admin' && sdata.user?.role !== 'assistant' && sdata.user?.role !== 'professor')) {
          navigate('/dashboard', { replace: true });
          return;
        }
        if (!cancelled) setMe({ id: sdata.user.id, name: sdata.user.name, role: sdata.user.role, avatar_url: sdata.user.avatar_url });

        const res = await fetch(`/api/otisak/exams/${examId}/grading`, { credentials: 'include' });
        if (cancelled) return;
        if (!res.ok) {
          setError(res.status === 403 ? t('grading.forbidden') : res.status === 404 ? t('grading.notFound') : t('grading.loadFailed'));
          return;
        }
        setData(await res.json());
      } catch {
        if (!cancelled) setError(t('grading.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [examId, navigate, t]);

  const items = data?.items ?? [];
  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const gradedCount = items.length - pendingCount;

  // Filtered answers grouped by question, in exam order.
  const groups = useMemo(() => {
    const visible = items.filter((i) =>
      filter === 'all' || i.status === filter || keepVisible.has(itemKey(i)),
    );
    const byQuestion = new Map<string, { question: GradingItem; answers: GradingItem[] }>();
    for (const it of visible) {
      const g = byQuestion.get(it.question_id);
      if (g) g.answers.push(it);
      else byQuestion.set(it.question_id, { question: it, answers: [it] });
    }
    return [...byQuestion.values()];
  }, [items, filter, keepVisible]);

  const changeFilter = (f: string) => {
    setFilter(f as Filter);
    setKeepVisible(new Set());
  };

  const onGraded = (updated: GradingItem) => {
    setData((prev) => prev && {
      ...prev,
      items: prev.items.map((i) => (itemKey(i) === itemKey(updated) ? updated : i)),
    });
    setKeepVisible((prev) => new Set(prev).add(itemKey(updated)));
  };

  if (loading || !me) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  const progress = items.length > 0 ? Math.round((gradedCount / items.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex">
      <Sidebar userName={me.name} userRole={me.role} userAvatar={me.avatar_url} />
      <MobileNav userName={me.name} userRole={me.role} />

      <div className="flex-1 lg:ml-[260px] flex flex-col min-h-screen pb-20 lg:pb-0">
        <header className="w-full bg-[var(--bg-elevated)] border-b border-[var(--border-default)] px-4 sm:px-6 py-4 z-20 sticky top-0">
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            <button
              onClick={() => navigate(`/manage/${examId}`)}
              className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center flex-shrink-0">
              <ClipboardCheck className="w-5 h-5 text-accent" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-display font-bold text-[var(--text-primary)] truncate">
                {data?.exam.title || t('grading.title')}
              </h1>
              <div className="text-xs text-[var(--text-muted)] truncate">
                {t('grading.title')}{data?.exam.subject_name ? <> &middot; {data.exam.subject_name}</> : null}
              </div>
            </div>
            {items.length > 0 && (
              <div className="hidden sm:block text-right flex-shrink-0">
                <div className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                  {t('grading.progress', { graded: gradedCount, total: items.length })}
                </div>
                <div className="w-40 h-1.5 mt-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                  <div className="h-full bg-success transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6">
          {error ? (
            <EmptyState icon={<ClipboardCheck size={32} strokeWidth={1.5} />} title={error} description={t('grading.loadFailed')} />
          ) : items.length === 0 ? (
            <EmptyState icon={<ClipboardCheck size={32} strokeWidth={1.5} />} title={t('grading.empty')} description={t('grading.emptyDesc')} />
          ) : (
            <>
              {/* Mobile progress (the header one is hidden on small screens) */}
              <div className="sm:hidden mb-4">
                <div className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                  {t('grading.progress', { graded: gradedCount, total: items.length })}
                </div>
                <div className="w-full h-1.5 mt-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                  <div className="h-full bg-success transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>

              <div className="mb-5">
                <Tabs
                  activeTab={filter}
                  onChange={changeFilter}
                  tabs={[
                    { id: 'pending', label: `${t('grading.tab.pending')} (${pendingCount})` },
                    { id: 'graded', label: `${t('grading.tab.graded')} (${gradedCount})` },
                    { id: 'all', label: t('grading.tab.all') },
                  ]}
                />
              </div>

              {groups.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 size={32} strokeWidth={1.5} />}
                  title={filter === 'pending' ? t('grading.allDone') : t('grading.noneGraded')}
                  description={filter === 'pending' ? t('grading.allDoneDesc') : ''}
                />
              ) : (
                <div className="space-y-8">
                  {groups.map(({ question, answers }) => {
                    const left = items.filter((i) => i.question_id === question.question_id && i.status === 'pending').length;
                    return (
                      <section key={question.question_id}>
                        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 mb-3">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <Badge variant="neutral" size="sm">{t('grading.maxPoints', { points: question.max_points })}</Badge>
                            {left > 0
                              ? <Badge variant="warning" size="sm">{t('grading.leftForQuestion', { count: left })}</Badge>
                              : <Badge variant="success" size="sm">{t('grading.questionDone')}</Badge>}
                          </div>
                          <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{question.question_text}</p>
                          {question.grading_instructions && (
                            <div className="mt-3 flex gap-2 rounded-lg bg-[var(--bg-tertiary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                              <Info size={14} className="flex-shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold">{t('grading.instructions')}: </span>
                                <span className="whitespace-pre-wrap">{question.grading_instructions}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="space-y-3 sm:pl-4">
                          {answers.map((it) => (
                            <GradeCard key={itemKey(it)} examId={examId!} item={it} graderName={me.name ?? null} onGraded={onGraded} />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function GradeCard({ examId, item, graderName, onGraded }: {
  examId: string;
  item: GradingItem;
  graderName: string | null;
  onGraded: (it: GradingItem) => void;
}) {
  const { t } = useLang();
  const toast = useToast();
  const [points, setPoints] = useState(item.status === 'graded' ? String(item.points_awarded) : '');
  const [feedback, setFeedback] = useState(item.feedback ?? '');
  const [saving, setSaving] = useState(false);

  const graded = item.status === 'graded';
  const parsed = Number(points.replace(',', '.'));
  const valid = points.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= item.max_points;
  const dirty = !graded || parsed !== item.points_awarded || (feedback.trim() || null) !== (item.feedback || null);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/otisak/exams/${examId}/grading`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attempt_id: item.attempt_id, question_id: item.question_id, points: parsed, feedback }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('grading.saveFailed'));
        return;
      }
      onGraded({
        ...item,
        points_awarded: parsed,
        status: 'graded',
        feedback: feedback.trim() || null,
        graded_at: new Date().toISOString(),
        graded_by_name: graderName,
      });
      toast.success(t('grading.saved'));
    } catch {
      toast.error(t('grading.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-xl border p-4 bg-[var(--bg-elevated)] ${graded ? 'border-[var(--border-default)]' : 'border-[color-mix(in_srgb,var(--warning)_40%,transparent)]'}`}>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="min-w-0">
          <span className="text-sm font-medium text-[var(--text-primary)]">{item.student_name || item.student_email}</span>
          {item.student_index && <span className="ml-2 text-xs text-[var(--text-muted)]">{item.student_index}</span>}
        </div>
        {graded
          ? <Badge variant="success" size="sm">{t('grading.gradedBadge', { points: item.points_awarded, max: item.max_points })}</Badge>
          : <Badge variant="warning" size="sm">{t('grading.pendingBadge')}</Badge>}
      </div>

      <div className="rounded-lg bg-[var(--bg-tertiary)] px-3 py-2.5 text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words mb-3">
        {item.text_answer}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-start">
        <div className="flex items-center gap-2 flex-shrink-0">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={item.max_points}
            step="any"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            aria-label={t('grading.points')}
            placeholder={t('grading.points')}
            className="w-20 h-9 px-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] tabular-nums focus:outline-none focus:border-accent"
          />
          <span className="text-sm text-[var(--text-muted)]">/ {item.max_points}</span>
          <button
            type="button"
            onClick={() => setPoints('0')}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-default)] text-xs text-[var(--text-secondary)] hover:border-danger hover:text-danger transition-colors"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => setPoints(String(item.max_points))}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-default)] text-xs text-[var(--text-secondary)] hover:border-success hover:text-success transition-colors"
          >
            {t('grading.full')}
          </button>
        </div>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={1}
          placeholder={t('grading.feedbackPlaceholder')}
          className="flex-1 min-h-9 px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] resize-y focus:outline-none focus:border-accent"
        />
        <Button
          variant="primary"
          size="sm"
          leftIcon={saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          onClick={save}
          disabled={!valid || saving || !dirty}
        >
          {graded ? t('grading.update') : t('grading.save')}
        </Button>
      </div>

      {graded && item.graded_by_name && (
        <div className="mt-2 text-[11px] text-[var(--text-muted)]">
          {t('grading.gradedBy', { name: item.graded_by_name })}
        </div>
      )}
    </div>
  );
}
