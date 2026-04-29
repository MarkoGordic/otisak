import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  Fingerprint,
  Loader2,
  Clock,
  Trophy,
  CalendarIcon,
  HashIcon,
  TargetIcon,
  PlayIcon,
  CalendarX,
  ExternalLink,
  BookOpen,
  AlertTriangle,
  FileText,
  User,
} from 'lucide-react';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Dropdown } from '../components/ui/Dropdown';
import { StatCard } from '../components/ui/StatCard';
import { EmptyState } from '../components/ui/EmptyState';
import { Tabs } from '../components/ui/Tabs';
import type { OtisakExamWithSubject, OtisakAttemptWithExam } from '../lib/types';

type UserInfo = {
  name?: string;
  email?: string;
  index_number?: string;
  role?: string;
};

const SUBJECT_PALETTE = [
  { bg: 'var(--success-light)', color: 'var(--success)', strip: 'var(--success)' },
  { bg: 'var(--info-light)', color: 'var(--info)', strip: 'var(--info)' },
  { bg: 'var(--warning-light)', color: 'var(--warning)', strip: 'var(--warning)' },
  { bg: 'var(--accent-light)', color: 'var(--accent)', strip: 'var(--accent)' },
  { bg: 'var(--danger-light)', color: 'var(--danger)', strip: 'var(--danger)' },
];

function getSubjectColor(subjectName: string | null) {
  if (!subjectName) return SUBJECT_PALETTE[3];
  let hash = 0;
  for (let i = 0; i < subjectName.length; i++) {
    hash = subjectName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SUBJECT_PALETTE[Math.abs(hash) % SUBJECT_PALETTE.length];
}

function formatDate(d: string | Date | null) {
  if (!d) return '\u2014';
  const date = new Date(d);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `Today, ${date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function getExamStatusInfo(exam: OtisakExamWithSubject) {
  const now = new Date();
  const scheduled = exam.scheduled_at ? new Date(exam.scheduled_at) : null;
  if (exam.status === 'active') {
    return { labelKey: 'dashboard.active', variant: 'success' as const, dot: true, canStart: true };
  }
  if (exam.status === 'scheduled' && scheduled) {
    const diff = scheduled.getTime() - now.getTime();
    if (diff <= 3600000 && diff > 0) return { labelKey: 'dashboard.startingSoon', variant: 'warning' as const, dot: true, canStart: false, countdown: diff };
    return { labelKey: 'dashboard.enrolled', variant: 'accent' as const, dot: false, canStart: false, countdown: diff > 0 ? diff : undefined };
  }
  if (exam.status === 'completed') return { labelKey: 'dashboard.completed', variant: 'neutral' as const, dot: false, canStart: false };
  if (exam.status === 'draft') return { labelKey: 'dashboard.draft', variant: 'neutral' as const, dot: false, canStart: false };
  if (exam.status === 'archived') return { labelKey: 'dashboard.archived', variant: 'neutral' as const, dot: false, canStart: false };
  return { labelKey: 'dashboard.unknown', variant: 'neutral' as const, dot: false, canStart: false };
}

function formatCountdown(ms: number) {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { t } = useLang();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [exams, setExams] = useState<OtisakExamWithSubject[]>([]);
  const [attempts, setAttempts] = useState<OtisakAttemptWithExam[]>([]);
  const [practiceExams, setPracticeExams] = useState<OtisakExamWithSubject[]>([]);
  const [startingPractice, setStartingPractice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [historySubject, setHistorySubject] = useState('all');
  const [historyStatus, setHistoryStatus] = useState<'all' | 'passed' | 'failed'>('all');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        const data = await res.json();
        if (!data.authenticated) { navigate('/admin', { replace: true }); return; }
        if (mounted) {
          setUser({
            name: data.user?.name,
            email: data.user?.email,
            index_number: data.user?.index_number,
            role: data.user?.role,
          });
        }
      } catch { navigate('/admin', { replace: true }); }
    })();
    return () => { mounted = false; };
  }, [navigate]);

  const loadData = useCallback(async () => {
    try {
      const [examsRes, historyRes, practiceRes] = await Promise.all([
        fetch('/api/otisak/exams', { credentials: 'include' }),
        fetch('/api/otisak/history', { credentials: 'include' }),
        fetch('/api/otisak/practice', { credentials: 'include' }),
      ]);
      if (examsRes.ok) { const d = await examsRes.json(); setExams(d.exams || []); }
      if (historyRes.ok) { const d = await historyRes.json(); setAttempts(d.attempts || []); }
      if (practiceRes.ok) { const d = await practiceRes.json(); setPracticeExams(d.exams || []); }
    } catch (e) { console.error('Failed to load data:', e); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { if (user) loadData(); }, [user, loadData]);

  const handleJoinExam = (examId: string) => navigate(`/exam/${examId}`);

  const handleStartPractice = async (examId: string) => {
    setStartingPractice(examId);
    try {
      const res = await fetch('/api/otisak/practice/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ exam_id: examId }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Error starting practice exam.');
        return;
      }
      const data = await res.json();
      const newExamId = data.exam?.id || data.child_exam?.id;
      if (!newExamId) { alert('Error starting practice exam.'); return; }
      navigate(`/exam/${newExamId}`);
    } catch {
      alert('Error starting practice exam.');
    } finally {
      setStartingPractice(null);
    }
  };

  const completedAttempts = attempts.filter(a => a.submitted);
  const totalPoints = completedAttempts.reduce((s, a) => s + Number(a.total_points), 0);
  const totalMaxPoints = completedAttempts.reduce((s, a) => s + Number(a.max_points), 0);
  const avgPercent = totalMaxPoints > 0 ? Math.round((totalPoints / totalMaxPoints) * 100) : 0;
  const passedCount = completedAttempts.filter(a => {
    const pct = Number(a.max_points) > 0 ? (Number(a.total_points) / Number(a.max_points)) * 100 : 0;
    return pct >= Number(a.pass_threshold ?? 50);
  }).length;
  const totalTimeSpent = completedAttempts.reduce((s, a) => s + Number(a.time_spent_seconds || 0), 0);

  const subjectOptions = (() => {
    const subjects = new Set<string>();
    attempts.forEach(a => { if (a.subject_name) subjects.add(a.subject_name); });
    return [
      { value: 'all', label: t('dashboard.allSubjects') },
      ...Array.from(subjects).map(s => ({ value: s, label: s })),
    ];
  })();

  const filteredHistory = attempts.filter(a => {
    if (!a.submitted) return false;
    if (historySubject !== 'all' && a.subject_name !== historySubject) return false;
    const pct = Number(a.max_points) > 0 ? Math.round((Number(a.total_points) / Number(a.max_points)) * 100) : 0;
    const passed = pct >= Number(a.pass_threshold ?? 50);
    if (historyStatus === 'passed' && !passed) return false;
    if (historyStatus === 'failed' && passed) return false;
    return true;
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  const isStaff = user.role === 'admin' || user.role === 'assistant';
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return t('dashboard.greeting.morning');
    if (h < 18) return t('dashboard.greeting.afternoon');
    return t('dashboard.greeting.evening');
  })();

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex">
      <Sidebar userName={user?.name} userRole={user?.role} />
      <MobileNav userName={user?.name} userRole={user?.role} />

      <div className="flex-1 lg:ml-[260px] flex flex-col min-h-screen">
        <main className="flex-1 pb-20 lg:pb-8">
          <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto bg-[var(--bg-primary)] min-h-full">
            {/* Header with greeting */}
            <div className="mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-accent-light flex items-center justify-center shrink-0">
                    <Fingerprint className="w-7 h-7 sm:w-8 sm:h-8 text-accent" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-2xl font-display font-bold text-[var(--text-primary)] leading-tight">
                      {greeting}, {user.name?.split(' ')[0] || 'Student'}
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                      {user.index_number && (
                        <span className="text-sm font-mono text-accent">{user.index_number}</span>
                      )}
                      {user.index_number && <span className="text-[var(--text-muted)]">&middot;</span>}
                      <span className="text-sm text-[var(--text-secondary)] capitalize">{user.role}</span>
                    </div>
                  </div>
                </div>
                {isStaff && (
                  <Button variant="secondary" size="sm" onClick={() => navigate('/manage')}>
                    {t('dashboard.manageExams')}
                  </Button>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <StatCard icon={<BarChart3 size={20} strokeWidth={1.75} />} iconBg="var(--accent-light)" iconColor="var(--accent)" value={completedAttempts.length} label={t('dashboard.stat.examsTaken')} />
              <StatCard icon={<Trophy size={20} strokeWidth={1.75} />} iconBg="var(--success-light)" iconColor="var(--success)" value={passedCount} label={t('dashboard.stat.passed')} />
              <StatCard icon={<TargetIcon size={20} strokeWidth={1.75} />} iconBg={avgPercent >= 50 ? 'var(--success-light)' : 'var(--danger-light)'} iconColor={avgPercent >= 50 ? 'var(--success)' : 'var(--danger)'} value={`${avgPercent}%`} label={t('dashboard.stat.avgScore')} />
              <StatCard icon={<Clock size={20} strokeWidth={1.75} />} iconBg="var(--warning-light)" iconColor="var(--warning)" value={formatDuration(totalTimeSpent)} label={t('dashboard.stat.totalTime')} />
            </div>

            {/* Tabs */}
            <div className="mb-8">
              <Tabs
                tabs={[
                  { id: 'upcoming', label: <span className="flex items-center gap-2">{t('dashboard.tab.exams')} {exams.length > 0 && <span className={`flex items-center justify-center h-5 px-1.5 rounded-full text-[11px] font-mono ${activeTab === 'upcoming' ? 'bg-accent text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}`}>{exams.length}</span>}</span> },
                  { id: 'practice', label: <span className="flex items-center gap-2">{t('dashboard.tab.practice')} {practiceExams.length > 0 && <span className={`flex items-center justify-center h-5 px-1.5 rounded-full text-[11px] font-mono ${activeTab === 'practice' ? 'bg-accent text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}`}>{practiceExams.length}</span>}</span> },
                  { id: 'history', label: t('dashboard.tab.history') },
                ]}
                activeTab={activeTab}
                onChange={setActiveTab}
              />
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-accent" />
              </div>
            ) : (
              <AnimatePresence mode="wait">
                {/* UPCOMING */}
                {activeTab === 'upcoming' && (
                  <motion.div key="upcoming" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                    {exams.length > 0 ? (
                      <div className="space-y-4">
                        {exams.map((exam, index) => {
                          const subjectColor = getSubjectColor(exam.subject_name);
                          const status = getExamStatusInfo(exam);
                          return (
                            <motion.div key={exam.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.06 }}
                              className="bg-[var(--bg-elevated)] rounded-[10px] border border-[var(--border-default)] p-5 relative overflow-hidden flex flex-col sm:flex-row sm:items-center gap-5 hover:border-[var(--text-muted)] transition-colors"
                            >
                              <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: subjectColor.strip }} />
                              <div className="flex-1 min-w-0 pl-2">
                                <div className="flex items-center justify-between mb-3">
                                  {exam.subject_name && <Badge variant="custom" customBg={subjectColor.bg} customColor={subjectColor.color} size="sm">{exam.subject_name}</Badge>}
                                  <Badge variant={status.variant} size="sm" dot={status.dot}>{t(status.labelKey)}</Badge>
                                </div>
                                <h3 className="text-lg font-display font-semibold text-[var(--text-primary)] mb-3">{exam.title}</h3>
                                <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--text-secondary)]">
                                  <div className="flex items-center gap-1.5"><CalendarIcon size={14} className="text-[var(--text-muted)]" />{formatDate(exam.scheduled_at)}</div>
                                  <div className="flex items-center gap-1.5"><Clock size={14} className="text-[var(--text-muted)]" />{exam.duration_minutes} {t('dashboard.min')}</div>
                                  <div className="flex items-center gap-1.5"><HashIcon size={14} className="text-[var(--text-muted)]" />{exam.question_count} {t('dashboard.questions')}</div>
                                  <div className="flex items-center gap-1.5"><TargetIcon size={14} className="text-[var(--text-muted)]" />{t('dashboard.pass')}: {exam.pass_threshold}%</div>
                                  {exam.negative_points_enabled && (
                                    <div className="flex items-center gap-1.5 text-danger"><AlertTriangle size={14} /><span className="text-xs">-{exam.negative_points_value} {t('dashboard.afterWrong', { count: exam.negative_points_threshold })}</span></div>
                                  )}
                                </div>
                              </div>
                              <div className="flex-shrink-0 flex flex-col items-end justify-center sm:w-48 pl-2 sm:pl-5 sm:border-l border-[var(--border-subtle)] mt-4 sm:mt-0">
                                {status.canStart ? (
                                  <Button variant="primary" size="md" className="w-full justify-center" onClick={() => handleJoinExam(exam.id)}>{t('dashboard.enterExam')}</Button>
                                ) : status.countdown && status.countdown > 0 ? (
                                  <div className="text-right">
                                    <div className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)] mb-1">{t('dashboard.startsIn')}</div>
                                    <div className="text-sm font-mono font-medium text-warning">{formatCountdown(status.countdown)}</div>
                                  </div>
                                ) : (
                                  <Badge variant={status.variant} size="md">{t(status.labelKey)}</Badge>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    ) : (
                      <EmptyState icon={<CalendarX size={32} strokeWidth={1.5} />} title={t('dashboard.noExams')} description={t('dashboard.noExamsDesc')} actionLabel={t('dashboard.tryPractice')} onAction={() => setActiveTab('practice')} />
                    )}
                  </motion.div>
                )}

                {/* PRACTICE */}
                {activeTab === 'practice' && (
                  <motion.div key="practice" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                    {practiceExams.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {practiceExams.map((exam, index) => {
                          const subjectColor = getSubjectColor(exam.subject_name);
                          return (
                            <motion.div key={exam.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}
                              className="bg-[var(--bg-elevated)] rounded-[10px] border border-[var(--border-default)] p-6 flex flex-col hover:border-[var(--text-muted)] transition-colors"
                            >
                              <div className="flex items-center gap-3 mb-1">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: subjectColor.bg, color: subjectColor.color }}>
                                  <BookOpen size={20} strokeWidth={2} />
                                </div>
                                <div>
                                  <h3 className="text-lg font-display font-semibold text-[var(--text-primary)] leading-tight">{exam.title}</h3>
                                  {exam.subject_name && <p className="text-sm text-[var(--text-secondary)] mt-0.5">{exam.subject_name}</p>}
                                </div>
                              </div>
                              {exam.description && <p className="text-xs text-[var(--text-muted)] mt-3 line-clamp-2">{exam.description}</p>}
                              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
                                <div className="flex items-center gap-1.5"><Clock size={14} className="text-[var(--text-muted)]" />{exam.duration_minutes} {t('dashboard.min')}</div>
                              </div>
                              <div className="mt-6 pt-5 border-t border-[var(--border-subtle)]">
                                <Button variant="primary" size="md" className="w-full justify-center" leftIcon={<PlayIcon size={16} className="fill-current" />} loading={startingPractice === exam.id} onClick={() => handleStartPractice(exam.id)}>
                                  {startingPractice === exam.id ? t('dashboard.starting') : t('dashboard.startPractice')}
                                </Button>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    ) : (
                      <EmptyState icon={<BookOpen size={32} strokeWidth={1.5} />} title={t('dashboard.noPractice')} description={t('dashboard.noPracticeDesc')} />
                    )}
                  </motion.div>
                )}

                {/* HISTORY */}
                {activeTab === 'history' && (
                  <motion.div key="history" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                      <div className="w-[180px]"><Dropdown options={subjectOptions} value={historySubject} onChange={setHistorySubject} /></div>
                      <div className="flex items-center bg-[var(--bg-tertiary)] rounded-full p-1">
                        {(['all', 'passed', 'failed'] as const).map((s) => (
                          <button key={s} onClick={() => setHistoryStatus(s)}
                            className={`px-4 h-8 rounded-full text-sm font-medium transition-colors ${historyStatus === s ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                            {s === 'all' ? t('dashboard.all') : s === 'passed' ? t('dashboard.passed') : t('dashboard.failed')}
                          </button>
                        ))}
                      </div>
                    </div>

                    {filteredHistory.length > 0 ? (
                      <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] overflow-hidden">
                        <div className="hidden sm:flex items-center px-5 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border-default)] text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          <div className="flex-1">{t('dashboard.exam')}</div>
                          <div className="w-32 hidden md:block">{t('dashboard.date')}</div>
                          <div className="w-24 text-center">{t('dashboard.score')}</div>
                          <div className="w-20 text-center hidden md:block">{t('dashboard.time')}</div>
                          <div className="w-24 text-center">{t('dashboard.status')}</div>
                          <div className="w-20"></div>
                        </div>
                        <div className="flex flex-col">
                          {filteredHistory.map((attempt) => {
                            const pct = Number(attempt.max_points) > 0 ? Math.round((Number(attempt.total_points) / Number(attempt.max_points)) * 100) : 0;
                            const passed = pct >= Number(attempt.pass_threshold ?? 50);
                            const subjectColor = getSubjectColor(attempt.subject_name);
                            return (
                              <div key={attempt.id}
                                className="hidden sm:flex items-center px-5 py-3 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-tertiary)] transition-colors h-14 cursor-pointer"
                                onClick={() => navigate(`/exam/${attempt.exam_id}/results`)}
                              >
                                <div className="flex-1 flex items-center gap-3 min-w-0 pr-4">
                                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: subjectColor.bg, color: subjectColor.color }}>
                                    <FileText size={14} strokeWidth={2} />
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-medium text-[var(--text-primary)] truncate">{attempt.exam_title}</span>
                                    <span className="text-[11px] text-[var(--text-muted)] mt-0.5">{attempt.is_practice ? 'Practice' : attempt.subject_name || '\u2014'}</span>
                                  </div>
                                </div>
                                <div className="w-32 hidden md:block text-[13px] text-[var(--text-muted)] truncate pr-4">{formatDate(attempt.started_at)}</div>
                                <div className="w-24 text-center"><span className={`text-base font-mono font-bold ${passed ? 'text-success' : 'text-danger'}`}>{pct}%</span></div>
                                <div className="w-20 text-center hidden md:block text-[13px] font-mono text-[var(--text-muted)]">{formatDuration(Number(attempt.time_spent_seconds || 0))}</div>
                                <div className="w-24 text-center"><Badge variant={passed ? 'success' : 'danger'} size="sm">{passed ? t('dashboard.passed') : t('dashboard.failed')}</Badge></div>
                                <div className="w-20 flex justify-end">
                                  <Button variant="ghost" size="sm" className="text-accent hover:text-accent-hover px-2" rightIcon={<ExternalLink size={14} />}>{t('dashboard.view')}</Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="px-5 py-3 border-t border-[var(--border-default)] bg-[var(--bg-secondary)]">
                          <span className="text-xs text-[var(--text-muted)]">{filteredHistory.length} {filteredHistory.length === 1 ? t('dashboard.result') : t('dashboard.results')}</span>
                        </div>
                      </div>
                    ) : (
                      <EmptyState icon={<Trophy size={32} strokeWidth={1.5} />} title={t('dashboard.noHistory')} description={t('dashboard.noHistoryDesc')} actionLabel={t('dashboard.tryPractice')} onAction={() => setActiveTab('practice')} />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
