import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Loader2,
  Plus,
  Radio,
  Clock,
  CalendarClock,
  FileText,
  PenLine,
  ArrowRight,
  AlertTriangle,
  CalendarIcon,
  Upload,
  ClipboardCheck,
  GraduationCap,
  Dumbbell,
  BookOpen,
  BookMarked,
  Users,
} from 'lucide-react';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import { AppCopyright } from '../components/AppCopyright';
import { Button } from '../components/ui/Button';

type ExamLite = {
  id: string;
  title: string;
  status: string;
  scheduled_at: string | null;
  duration_minutes: number;
  question_count?: number;
  subject_name?: string | null;
  tags?: string[];
};

type UserInfo = { name?: string; role?: string; avatar_url?: string };

// Exam with open-text answers still waiting for a grade (from /grading/summary).
type GradingSummary = {
  exam_id: string;
  title: string;
  subject_name: string | null;
  pending: number;
  graded: number;
  students_pending: number;
};

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('sr-RS', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function AdminHomePage() {
  const navigate = useNavigate();
  const { t } = useLang();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<ExamLite[]>([]);
  const [publishedPractice, setPublishedPractice] = useState(0);
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [toGrade, setToGrade] = useState<GradingSummary[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sessionRes = await fetch('/api/auth/session', { credentials: 'include' });
        const data = sessionRes.ok ? await sessionRes.json() : null;
        if (!data?.authenticated) {
          navigate('/login', { replace: true });
          return;
        }
        if (!['admin', 'assistant', 'professor'].includes(data.user?.role)) {
          navigate('/dashboard', { replace: true });
          return;
        }
        if (!mounted) return;
        setUser({
          name: data.user?.name,
          role: data.user?.role,
          avatar_url: data.user?.avatar_url,
        });

        const isAdmin = data.user?.role === 'admin';
        const [examsRes, practiceRes, usersRes, gradingRes] = await Promise.all([
          // Real exams only: practice templates are 'active' for as long as they
          // are published, and counted here they inflated "active exams".
          fetch('/api/otisak/exams?exam_mode=real', { credentials: 'include' }),
          fetch('/api/otisak/exams?exam_mode=practice', { credentials: 'include' }),
          isAdmin ? fetch('/api/admin/users', { credentials: 'include' }) : Promise.resolve(null),
          fetch('/api/otisak/grading/summary', { credentials: 'include' }),
        ]);
        if (!mounted) return;
        if (examsRes.ok) setExams(((await examsRes.json()).exams || []) as ExamLite[]);
        if (practiceRes.ok) {
          const list = ((await practiceRes.json()).exams || []) as ExamLite[];
          setPublishedPractice(list.filter((e) => e.status === 'active').length);
        }
        if (gradingRes.ok) setToGrade(((await gradingRes.json()).exams || []) as GradingSummary[]);
        if (usersRes && usersRes.ok) {
          const ud = await usersRes.json();
          setStudentCount(
            (ud.users || []).filter(
              (u: { role: string; is_active: boolean }) => u.role === 'student' && u.is_active,
            ).length,
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  const isAdmin = user.role === 'admin';
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return t('dashboard.greeting.morning');
    if (h < 18) return t('dashboard.greeting.afternoon');
    return t('dashboard.greeting.evening');
  })();

  const active = exams.filter((e) => e.status === 'active');
  const scheduled = exams
    .filter((e) => e.status === 'scheduled')
    .sort((a, b) => (a.scheduled_at || '').localeCompare(b.scheduled_at || ''));
  const drafts = exams.filter((e) => e.status === 'draft');
  // Drafts that exist but have no questions yet - gentle nudge to finish.
  const emptyDrafts = drafts.filter((e) => (e.question_count ?? 0) === 0);
  const live = [...active, ...scheduled];

  const quickLinks = [
    {
      href: '/questions',
      icon: BookOpen,
      label: t('nav.questionBank'),
      desc: t('adminHome.action.questionsDesc'),
    },
    {
      href: '/practice',
      icon: Dumbbell,
      label: t('nav.practiceAdmin'),
      desc: t('adminHome.action.practiceDesc'),
    },
    {
      href: '/subjects',
      icon: BookMarked,
      label: t('nav.subjects'),
      desc: t('adminHome.action.subjectsDesc'),
    },
    ...(isAdmin
      ? [
          {
            href: '/admin/users',
            icon: Users,
            label: t('nav.users'),
            desc: t('adminHome.action.usersDesc'),
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex">
      <Sidebar userName={user.name} userRole={user.role} userAvatar={user.avatar_url} />
      <MobileNav userName={user.name} userRole={user.role} />

      <div className="flex-1 min-w-0 lg:ml-[260px] flex flex-col min-h-screen">
        <main className="flex-1 flex flex-col pb-20 lg:pb-8">
          <div className="p-4 sm:p-6 lg:p-8 max-w-[1100px] mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
              <div>
                <h1 className="text-2xl sm:text-3xl font-display font-bold text-[var(--text-primary)] leading-tight">
                  {greeting}, {user.name?.split(' ')[0] || t(`users.${user.role}`)}
                </h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  {t('adminHome.subtitle')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  leftIcon={<Upload size={14} />}
                  onClick={() => navigate('/manage?import=1')}
                >
                  {t('manage.importJson')}
                </Button>
                <Button
                  variant="primary"
                  leftIcon={<Plus size={16} />}
                  onClick={() => navigate('/manage?new=1')}
                >
                  {t('manage.newExam')}
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <StatTile
                icon={<Radio size={17} />}
                value={active.length}
                label={t('adminHome.stat.activeExams')}
                tone="success"
                to="/manage"
              />
              <StatTile
                icon={<CalendarClock size={17} />}
                value={scheduled.length}
                label={t('adminHome.stat.scheduled')}
                tone="warning"
                to="/manage"
              />
              <StatTile
                icon={<PenLine size={17} />}
                value={drafts.length}
                label={t('adminHome.stat.draftExams')}
                tone="neutral"
                to="/manage"
              />
              {isAdmin ? (
                <StatTile
                  icon={<GraduationCap size={17} />}
                  value={studentCount ?? '-'}
                  label={t('adminHome.stat.students')}
                  tone="accent"
                  to="/admin/users"
                />
              ) : (
                <StatTile
                  icon={<Dumbbell size={17} />}
                  value={publishedPractice}
                  label={t('adminHome.stat.practice')}
                  tone="accent"
                  to="/practice"
                />
              )}
            </div>

            {/* Empty-draft callout - only renders when there's work to finish. */}
            {emptyDrafts.length > 0 && (
              <div className="mb-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-warning-light flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={15} className="text-warning" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    {t('adminHome.emptyDraftsTitle')}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {t('adminHome.emptyDraftsDesc', { count: emptyDrafts.length })}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                    {emptyDrafts.slice(0, 4).map((e) => (
                      <Link
                        key={e.id}
                        to={`/manage/${e.id}/edit`}
                        className="text-xs px-2 py-1 rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:text-accent transition-colors max-w-[220px] truncate"
                      >
                        {e.title}
                      </Link>
                    ))}
                    {emptyDrafts.length > 4 && (
                      <span className="text-xs text-[var(--text-muted)]">
                        +{emptyDrafts.length - 4}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Open-text answers waiting for a grade - only renders when there's work. */}
            {toGrade.length > 0 && (
              <Section
                title={t('adminHome.toGrade')}
                aside={t('adminHome.toGradeTotal', {
                  count: toGrade.reduce((s, e) => s + e.pending, 0),
                })}
              >
                {toGrade.map((g) => {
                  const total = g.pending + g.graded;
                  const pct = total > 0 ? Math.round((g.graded / total) * 100) : 0;
                  return (
                    <Link
                      key={g.exam_id}
                      to={`/manage/${g.exam_id}/grading`}
                      className="flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                      <div className="w-9 h-9 rounded-lg bg-warning-light flex items-center justify-center flex-shrink-0">
                        <ClipboardCheck size={16} className="text-warning" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {g.title}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)] mt-0.5">
                          {g.subject_name && <span>{g.subject_name}</span>}
                          <span className="text-warning font-medium">
                            {t('adminHome.toGradeAnswers', { count: g.pending })}
                          </span>
                          <span>
                            {t('adminHome.toGradeStudents', { count: g.students_pending })}
                          </span>
                        </div>
                        <div className="w-full max-w-[240px] h-1 mt-2 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                          <div className="h-full bg-success" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className="text-xs font-medium text-accent flex-shrink-0">
                        {t('adminHome.gradeNow')}
                      </span>
                    </Link>
                  );
                })}
              </Section>
            )}

            {/* Running and upcoming exams */}
            <Section
              title={t('adminHome.liveAndScheduled')}
              aside={
                <Link to="/manage" className="text-xs text-accent hover:text-accent-hover">
                  {t('adminHome.viewAll')} &rarr;
                </Link>
              }
            >
              {live.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-sm text-[var(--text-secondary)] mb-3">
                    {t('adminHome.noActiveExams')}
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Plus size={14} />}
                    onClick={() => navigate('/manage?new=1')}
                  >
                    {t('manage.newExam')}
                  </Button>
                </div>
              ) : (
                live.map((exam, idx) => (
                  <motion.div
                    key={exam.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx, 8) * 0.03 }}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        exam.status === 'active' ? 'bg-success animate-pulse' : 'bg-warning'
                      }`}
                    />
                    <Link to={`/manage/${exam.id}/edit`} className="flex-1 min-w-0 group">
                      <div className="text-sm font-medium text-[var(--text-primary)] truncate group-hover:text-accent transition-colors">
                        {exam.title}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)] mt-0.5">
                        <span
                          className={exam.status === 'active' ? 'text-success' : 'text-warning'}
                        >
                          {t(`manage.${exam.status}`)}
                        </span>
                        {exam.subject_name && <span>{exam.subject_name}</span>}
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {exam.duration_minutes} {t('manage.minShort')}
                        </span>
                        {typeof exam.question_count === 'number' && (
                          <span className="flex items-center gap-1">
                            <FileText size={11} />
                            {exam.question_count} {t('manage.questionsShort')}
                          </span>
                        )}
                        {exam.scheduled_at && (
                          <span className="flex items-center gap-1">
                            <CalendarIcon size={11} />
                            {formatWhen(exam.scheduled_at)}
                          </span>
                        )}
                      </div>
                    </Link>
                    {exam.status === 'active' && (
                      <Link
                        to={`/manage/${exam.id}`}
                        className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-accent px-2.5 py-1.5 rounded-lg hover:bg-accent-light transition-colors"
                      >
                        {t('manage.room')}
                        <ArrowRight size={12} />
                      </Link>
                    )}
                  </motion.div>
                ))
              )}
            </Section>

            {/* Quick access */}
            <h2 className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] font-semibold mb-3 mt-8">
              {t('adminHome.quickActions')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {quickLinks.map((q) => (
                <Link
                  key={q.href}
                  to={q.href}
                  className="group rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  <q.icon size={18} className="text-accent mb-3" strokeWidth={1.75} />
                  <div className="text-sm font-medium text-[var(--text-primary)]">{q.label}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5 leading-snug">
                    {q.desc}
                  </div>
                </Link>
              ))}
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

// A titled panel whose rows share one surface, divided by hairlines.
function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] font-semibold">
          {title}
        </h2>
        {typeof aside === 'string' ? (
          <span className="text-xs text-[var(--text-muted)]">{aside}</span>
        ) : (
          aside
        )}
      </div>
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden divide-y divide-[var(--border-subtle)]">
        {children}
      </div>
    </section>
  );
}

function StatTile({
  icon,
  value,
  label,
  tone,
  to,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  tone: 'accent' | 'success' | 'warning' | 'neutral';
  to: string;
}) {
  const palette: Record<typeof tone, string> = {
    accent: 'bg-accent-light text-accent',
    success: 'bg-success-light text-success',
    warning: 'bg-warning-light text-warning',
    neutral: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
  };
  return (
    <Link
      to={to}
      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 hover:bg-[var(--bg-tertiary)] transition-colors"
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${palette[tone]}`}>
        {icon}
      </div>
      <div className="text-2xl font-display font-bold text-[var(--text-primary)] leading-none tabular-nums">
        {value}
      </div>
      <div className="text-xs text-[var(--text-muted)] mt-1.5 truncate">{label}</div>
    </Link>
  );
}
