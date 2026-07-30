import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Loader2, ArrowLeft, BarChart3, TrendingDown, TrendingUp, Clock, Trophy,
  CheckCircle2, ChevronDown, ChevronRight, FileText,
} from 'lucide-react';

import { formatDurationLong as formatDuration } from '../lib/format';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import { Badge } from '../components/ui/Badge';
import { StatCard } from '../components/ui/StatCard';
import { EmptyState } from '../components/ui/EmptyState';

type Session = { id?: string; name?: string; role?: string; avatar_url?: string };

type ExamStats = {
  exam: {
    id: string;
    title: string;
    subject_name: string | null;
    status: string;
    total_questions: number;
    has_pass_threshold: boolean;
    pass_threshold: number;
  };
  overall: {
    attempts_submitted: number;
    avg_percent: number;
    median_percent: number;
    min_percent: number;
    max_percent: number;
    pass_rate: number | null;
    avg_time_seconds: number;
    score_buckets: Array<{ from: number; to: number; count: number }>;
  };
  per_question: Array<{
    question_id: string;
    position: number;
    type: string;
    text_preview: string;
    points: number;
    attempts: number;
    correct_count: number;
    partial_count: number;
    zero_count: number;
    success_rate: number;
    avg_points: number;
    pick_distribution: Array<{ answer_id: string; text: string; is_correct: boolean; count: number }> | null;
  }>;
};

type SortKey = 'position' | 'success' | 'avg' | 'attempts';

export default function ExamStatsPage() {
  const navigate = useNavigate();
  const { examId } = useParams();
  const { t } = useLang();

  const [me, setMe] = useState<Session | null>(null);
  const [stats, setStats] = useState<ExamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('success');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sres = await fetch('/api/auth/session', { credentials: 'include' });
        if (!sres.ok) { navigate('/admin', { replace: true }); return; }
        const sdata = await sres.json();
        if (!sdata.authenticated || (sdata.user?.role !== 'admin' && sdata.user?.role !== 'assistant' && sdata.user?.role !== 'professor')) {
          navigate('/dashboard', { replace: true });
          return;
        }
        if (!cancelled) setMe({ id: sdata.user.id, name: sdata.user.name, role: sdata.user.role, avatar_url: sdata.user.avatar_url });

        const res = await fetch(`/api/otisak/exams/${examId}/stats`, { credentials: 'include' });
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 403) setError(t('examStats.forbidden'));
          else if (res.status === 404) setError(t('examStats.notFound'));
          else setError(t('examStats.loadFailed'));
          setLoading(false);
          return;
        }
        const data: ExamStats = await res.json();
        setStats(data);
      } catch {
        if (!cancelled) setError(t('examStats.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [examId, navigate, t]);

  const sortedQuestions = useMemo(() => {
    if (!stats) return [];
    const arr = [...stats.per_question];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'position') cmp = a.position - b.position;
      else if (sortBy === 'success') cmp = a.success_rate - b.success_rate;
      else if (sortBy === 'avg') cmp = a.avg_points - b.avg_points;
      else if (sortBy === 'attempts') cmp = a.attempts - b.attempts;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [stats, sortBy, sortDir]);

  const hardest = useMemo(() => {
    if (!stats || stats.per_question.length === 0) return null;
    return [...stats.per_question].sort((a, b) => a.success_rate - b.success_rate)[0];
  }, [stats]);

  const easiest = useMemo(() => {
    if (!stats || stats.per_question.length === 0) return null;
    return [...stats.per_question].sort((a, b) => b.success_rate - a.success_rate)[0];
  }, [stats]);

  if (loading || !me) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  const partial = stats && (stats.exam.status === 'draft' || stats.exam.status === 'scheduled' || stats.exam.status === 'active');
  const maxBucketCount = stats ? Math.max(1, ...stats.overall.score_buckets.map((b) => b.count)) : 1;

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir(key === 'position' ? 'asc' : 'asc'); }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex">
      <Sidebar userName={me.name} userRole={me.role} userAvatar={me.avatar_url} />
      <MobileNav userName={me.name} userRole={me.role} />

      <div className="flex-1 lg:ml-[260px] flex flex-col min-h-screen pb-20 lg:pb-0">
        <header className="w-full bg-[var(--bg-elevated)] border-b border-[var(--border-default)] px-4 sm:px-6 py-4 z-20 sticky top-0">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <button
              onClick={() => navigate(`/manage/${examId}`)}
              className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-accent" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-display font-bold text-[var(--text-primary)] truncate">{stats?.exam.title || t('examStats.title')}</h1>
              <div className="text-xs text-[var(--text-muted)] truncate">
                {stats?.exam.subject_name || '-'}
                {partial && <> &middot; <span className="text-warning">{t('examStats.partial')}</span></>}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
          {error ? (
            <EmptyState icon={<BarChart3 size={32} strokeWidth={1.5} />} title={error} description={t('examStats.loadFailed')} />
          ) : stats && stats.overall.attempts_submitted === 0 ? (
            <EmptyState icon={<BarChart3 size={32} strokeWidth={1.5} />} title={t('examStats.empty')} description={t('examStats.emptyDesc')} />
          ) : stats ? (
            <>
              {/* Overall stat tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                <StatCard icon={<FileText size={20} strokeWidth={1.75} />} iconBg="var(--accent-light)" iconColor="var(--accent)" value={stats.overall.attempts_submitted} label={t('examStats.stat.attempts')} />
                <StatCard icon={<CheckCircle2 size={20} strokeWidth={1.75} />} iconBg="var(--success-light)" iconColor="var(--success)" value={`${stats.overall.avg_percent}%`} label={t('examStats.stat.avg')} />
                <StatCard icon={<TrendingUp size={20} strokeWidth={1.75} />} iconBg="var(--info-light)" iconColor="var(--info)" value={`${stats.overall.max_percent}%`} label={t('examStats.stat.max')} />
                <StatCard icon={<TrendingDown size={20} strokeWidth={1.75} />} iconBg="var(--danger-light)" iconColor="var(--danger)" value={`${stats.overall.min_percent}%`} label={t('examStats.stat.min')} />
                <StatCard icon={<Trophy size={20} strokeWidth={1.75} />} iconBg="var(--warning-light)" iconColor="var(--warning)" value={stats.overall.pass_rate === null ? '-' : `${stats.overall.pass_rate}%`} label={t('examStats.stat.passRate')} />
                <StatCard icon={<Clock size={20} strokeWidth={1.75} />} iconBg="var(--accent-light)" iconColor="var(--accent)" value={formatDuration(stats.overall.avg_time_seconds)} label={t('examStats.stat.avgTime')} />
              </div>

              {/* Score distribution histogram */}
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-5 mb-6">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-4">{t('examStats.distribution')}</h3>
                <div className="flex items-end gap-1 h-32">
                  {stats.overall.score_buckets.map((b) => {
                    const pctHeight = Math.round((b.count / maxBucketCount) * 100);
                    return (
                      <div key={b.from} className="flex-1 flex flex-col items-center justify-end gap-1 group">
                        <span className="text-[10px] font-mono text-[var(--text-muted)] group-hover:text-[var(--text-primary)]">{b.count}</span>
                        <div
                          className="w-full bg-gradient-to-t from-accent to-accent-muted rounded-t transition-all"
                          style={{ height: `${pctHeight}%`, minHeight: b.count > 0 ? '4px' : '1px' }}
                        />
                        <span className="text-[9px] text-[var(--text-muted)] font-mono">{b.from}-{b.to}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hardest / Easiest call-out */}
              {(hardest || easiest) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                  {hardest && (
                    <div className="bg-[var(--bg-elevated)] border border-danger/30 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingDown className="w-4 h-4 text-danger" />
                        <span className="text-xs font-semibold text-danger uppercase tracking-wider">{t('examStats.hardest')}</span>
                      </div>
                      <div className="text-sm text-[var(--text-primary)] mb-1">#{hardest.position + 1} &middot; {hardest.text_preview.slice(0, 80)}{hardest.text_preview.length > 80 ? '…' : ''}</div>
                      <div className="text-xs text-[var(--text-muted)] font-mono">{hardest.success_rate}% &middot; {hardest.avg_points}/{hardest.points} {t('examStats.avgPts')}</div>
                    </div>
                  )}
                  {easiest && (
                    <div className="bg-[var(--bg-elevated)] border border-success/30 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-success" />
                        <span className="text-xs font-semibold text-success uppercase tracking-wider">{t('examStats.easiest')}</span>
                      </div>
                      <div className="text-sm text-[var(--text-primary)] mb-1">#{easiest.position + 1} &middot; {easiest.text_preview.slice(0, 80)}{easiest.text_preview.length > 80 ? '…' : ''}</div>
                      <div className="text-xs text-[var(--text-muted)] font-mono">{easiest.success_rate}% &middot; {easiest.avg_points}/{easiest.points} {t('examStats.avgPts')}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Per-question table */}
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">{t('examStats.perQuestion')}</h3>
                  <div className="text-xs text-[var(--text-muted)]">{t('examStats.sortHint')}</div>
                </div>
                <div className="flex items-center gap-2 px-5 py-2 border-b border-[var(--border-subtle)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  <button className="flex items-center gap-1 hover:text-[var(--text-primary)]" onClick={() => toggleSort('position')}>
                    <span>#</span>
                    {sortBy === 'position' && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                  <span className="flex-1">{t('examStats.col.question')}</span>
                  <button className="w-20 text-right hover:text-[var(--text-primary)]" onClick={() => toggleSort('attempts')}>
                    {t('examStats.col.attempts')}{sortBy === 'attempts' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                  </button>
                  <button className="w-24 text-right hover:text-[var(--text-primary)]" onClick={() => toggleSort('success')}>
                    {t('examStats.col.success')}{sortBy === 'success' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                  </button>
                  <button className="w-24 text-right hover:text-[var(--text-primary)]" onClick={() => toggleSort('avg')}>
                    {t('examStats.col.avgPts')}{sortBy === 'avg' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                  </button>
                  <span className="w-6" />
                </div>
                {sortedQuestions.map((q) => {
                  const isOpen = expanded.has(q.question_id);
                  const successColor = q.success_rate >= 70 ? 'text-success' : q.success_rate >= 40 ? 'text-warning' : 'text-danger';
                  return (
                    <div key={q.question_id} className="border-b border-[var(--border-subtle)] last:border-0">
                      <button
                        type="button"
                        onClick={() => toggleExpand(q.question_id)}
                        className="w-full flex items-center gap-2 px-5 py-3 hover:bg-[var(--bg-tertiary)] transition-colors text-left"
                      >
                        <span className="font-mono text-xs text-[var(--text-muted)] w-6">{q.position + 1}.</span>
                        <span className="flex-1 text-sm text-[var(--text-primary)] truncate">{q.text_preview}{q.text_preview.length >= 140 ? '…' : ''}</span>
                        <span className="w-20 text-right font-mono text-xs text-[var(--text-muted)]">{q.attempts}</span>
                        <span className={`w-24 text-right font-mono text-sm font-semibold ${successColor}`}>{q.success_rate}%</span>
                        <span className="w-24 text-right font-mono text-xs text-[var(--text-muted)]">{q.avg_points}/{q.points}</span>
                        <span className="w-6 flex justify-center text-[var(--text-muted)]">
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-4 pt-1 bg-[var(--bg-secondary)]">
                          <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mb-3">
                            <Badge variant="accent" size="sm">{q.type}</Badge>
                            <span>{t('examStats.correct')}: <span className="text-success font-mono">{q.correct_count}</span></span>
                            {q.partial_count > 0 && <span>{t('examStats.partial')}: <span className="text-warning font-mono">{q.partial_count}</span></span>}
                            <span>{t('examStats.wrong')}: <span className="text-danger font-mono">{q.zero_count}</span></span>
                          </div>
                          {q.pick_distribution !== null && q.pick_distribution.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{t('examStats.distributionPicks')}</div>
                              {(() => {
                                const max = Math.max(1, ...q.pick_distribution!.map((p) => p.count));
                                return q.pick_distribution!.map((p) => (
                                  <div key={p.answer_id} className="flex items-center gap-2">
                                    <span className={`text-xs flex-1 truncate ${p.is_correct ? 'text-success' : 'text-[var(--text-secondary)]'}`}>
                                      {p.is_correct && '✓ '}{p.text}
                                    </span>
                                    <div className="w-40 h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                                      <div
                                        className={`h-full ${p.is_correct ? 'bg-success' : 'bg-accent'}`}
                                        style={{ width: `${Math.round((p.count / max) * 100)}%` }}
                                      />
                                    </div>
                                    <span className="w-10 text-right text-xs font-mono text-[var(--text-muted)]">{p.count}</span>
                                  </div>
                                ));
                              })()}
                            </div>
                          )}
                          {q.pick_distribution === null && (
                            <div className="text-xs text-[var(--text-muted)]">{t('examStats.noPickDist')}</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
