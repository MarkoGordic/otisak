import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Loader2, Plus, Radio, Clock, GraduationCap, FileText, Activity,
  ArrowRight, AlertTriangle, CalendarIcon, Upload, ClipboardCheck,
} from 'lucide-react';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import { AppCopyright } from '../components/AppCopyright';
import { Button } from '../components/ui/Button';

type ExamLite = {
  id: string;
  title: string;
  status: string;
  exam_started_at: string | null;
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

export default function AdminHomePage() {
  const navigate = useNavigate();
  const { t } = useLang();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<ExamLite[]>([]);
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [toGrade, setToGrade] = useState<GradingSummary[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sessionRes = await fetch('/api/auth/session', { credentials: 'include' });
        if (!sessionRes.ok) { navigate('/login', { replace: true }); return; }
        const data = await sessionRes.json();
        if (!data.authenticated) { navigate('/login', { replace: true }); return; }
        if (data.user?.role !== 'admin' && data.user?.role !== 'assistant' && data.user?.role !== 'professor') {
          navigate('/dashboard', { replace: true });
          return;
        }
        if (!mounted) return;
        setUser({ name: data.user?.name, role: data.user?.role, avatar_url: data.user?.avatar_url });

        const [examsRes, usersRes, gradingRes] = await Promise.all([
          fetch('/api/otisak/exams', { credentials: 'include' }),
          // Users endpoint is admin-only - assistants will silently fail (403), which is fine.
          data.user?.role === 'admin'
            ? fetch('/api/admin/users', { credentials: 'include' })
            : Promise.resolve(null),
          fetch('/api/otisak/grading/summary', { credentials: 'include' }),
        ]);
        if (mounted && examsRes.ok) {
          const ed = await examsRes.json();
          setExams((ed.exams || []) as ExamLite[]);
        }
        if (mounted && gradingRes.ok) {
          const gd = await gradingRes.json();
          setToGrade((gd.exams || []) as GradingSummary[]);
        }
        if (mounted && usersRes && usersRes.ok) {
          const ud = await usersRes.json();
          const students = (ud.users || []).filter((u: { role: string }) => u.role === 'student');
          setStudentCount(students.length);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [navigate]);

  if (!user || loading) {
    return <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  const isAdmin = user.role === 'admin';
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return t('dashboard.greeting.morning');
    if (h < 18) return t('dashboard.greeting.afternoon');
    return t('dashboard.greeting.evening');
  })();

  const activeExamList = exams.filter((e) => e.status === 'active');
  const activeExams = activeExamList.length;
  const draftExams = exams.filter((e) => e.status === 'draft').length;
  const completedExams = exams.filter((e) => e.status === 'completed').length;
  // Drafts that exist but have no questions yet - gentle nudge to finish.
  const emptyDrafts = exams.filter((e) => e.status === 'draft' && (e.question_count ?? 0) === 0);

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex">
      <Sidebar userName={user.name} userRole={user.role} userAvatar={user.avatar_url} />
      <MobileNav userName={user.name} userRole={user.role} />

      <div className="flex-1 lg:ml-[260px] flex flex-col min-h-screen">
        <main className="flex-1 pb-20 lg:pb-8">
          <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto bg-[var(--bg-primary)] min-h-full">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="text-2xl sm:text-3xl font-display font-bold text-[var(--text-primary)] leading-tight">
                  {greeting}, {user.name?.split(' ')[0] || t(isAdmin ? 'users.admin' : 'users.assistant')}
                </h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  {t('adminHome.subtitle')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" leftIcon={<Upload size={14} />} onClick={() => navigate('/manage')}>
                  {t('manage.importJson')}
                </Button>
                <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => navigate('/manage')}>
                  {t('manage.newExam')}
                </Button>
              </div>
            </div>

            {/* Stats - clickable deep-links into the relevant manage view. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <StatTile
                icon={<Radio size={18} />}
                value={activeExams}
                label={t('adminHome.stat.activeExams')}
                tone="success"
                onClick={() => navigate('/manage')}
              />
              <StatTile
                icon={<Activity size={18} />}
                value={draftExams}
                label={t('adminHome.stat.draftExams')}
                tone="neutral"
                onClick={() => navigate('/manage')}
              />
              <StatTile
                icon={<FileText size={18} />}
                value={completedExams}
                label={t('adminHome.stat.completedExams')}
                tone="info"
                onClick={() => navigate('/manage')}
              />
              <StatTile
                icon={<GraduationCap size={18} />}
                value={studentCount ?? '-'}
                label={t('adminHome.stat.students')}
                tone="accent"
                onClick={isAdmin ? () => navigate('/admin/users') : undefined}
              />
            </div>

            {/* Empty-draft callout - only renders when there's work to finish. */}
            {emptyDrafts.length > 0 && (
              <div className="mb-6 rounded-xl border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-warning-light/40 p-4 flex items-start gap-3">
                <AlertTriangle size={18} className="text-warning flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    {t('adminHome.emptyDraftsTitle')}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {t('adminHome.emptyDraftsDesc', { count: emptyDrafts.length })}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {emptyDrafts.slice(0, 4).map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => navigate(`/manage/${e.id}/edit`)}
                        className="text-xs px-2 py-1 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] hover:border-accent hover:text-accent transition-colors max-w-[200px] truncate"
                      >
                        {e.title}
                      </button>
                    ))}
                    {emptyDrafts.length > 4 && (
                      <span className="text-xs text-[var(--text-muted)]">+{emptyDrafts.length - 4}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Open-text answers waiting for a grade - only renders when there's work. */}
            {toGrade.length > 0 && (
              <section className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs uppercase tracking-widest text-[var(--text-muted)] font-semibold">
                    {t('adminHome.toGrade')}
                  </h2>
                  <span className="text-xs text-[var(--text-muted)]">
                    {t('adminHome.toGradeTotal', { count: toGrade.reduce((s, e) => s + e.pending, 0) })}
                  </span>
                </div>
                <div className="space-y-2">
                  {toGrade.map((g) => {
                    const total = g.pending + g.graded;
                    const pct = total > 0 ? Math.round((g.graded / total) * 100) : 0;
                    return (
                      <button
                        key={g.exam_id}
                        type="button"
                        onClick={() => navigate(`/manage/${g.exam_id}/grading`)}
                        className="w-full flex items-center gap-3 p-4 rounded-xl border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[var(--bg-elevated)] hover:border-warning transition-colors text-left"
                      >
                        <div className="w-9 h-9 rounded-lg bg-warning-light flex items-center justify-center flex-shrink-0">
                          <ClipboardCheck size={16} className="text-warning" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[var(--text-primary)] truncate">{g.title}</div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)] mt-0.5">
                            {g.subject_name && <span>{g.subject_name}</span>}
                            <span className="text-warning font-medium">{t('adminHome.toGradeAnswers', { count: g.pending })}</span>
                            <span>{t('adminHome.toGradeStudents', { count: g.students_pending })}</span>
                          </div>
                          <div className="w-full max-w-[240px] h-1 mt-2 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                            <div className="h-full bg-success" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <span className="text-xs text-accent flex-shrink-0">{t('adminHome.gradeNow')}</span>
                        <ArrowRight size={14} className="text-[var(--text-muted)] flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Currently active exams */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs uppercase tracking-widest text-[var(--text-muted)] font-semibold">{t('adminHome.activeExams')}</h2>
                <button
                  type="button"
                  onClick={() => navigate('/manage')}
                  className="text-xs text-accent hover:text-accent-hover"
                >
                  {t('adminHome.viewAll')} &rarr;
                </button>
              </div>

              {activeExamList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-elevated)] p-10 text-center">
                  <p className="text-sm text-[var(--text-secondary)] mb-3">{t('adminHome.noActiveExams')}</p>
                  <Button variant="primary" size="sm" leftIcon={<Plus size={14} />} onClick={() => navigate('/manage')}>
                    {t('manage.newExam')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeExamList.map((exam, idx) => (
                    <motion.button
                      key={exam.id}
                      type="button"
                      onClick={() => navigate(`/manage/${exam.id}/edit`)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className="w-full flex items-center gap-3 p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] hover:border-accent transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-medium text-[var(--text-primary)] truncate">{exam.title}</span>
                          <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                            exam.status === 'active' ? 'bg-success-light text-success border-[var(--border-default)]' :
                            exam.status === 'draft' ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-[var(--border-default)]' :
                            exam.status === 'scheduled' ? 'bg-warning-light text-warning border-[var(--border-default)]' :
                            'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-[var(--border-default)]'
                          }`}>{t(`manage.${exam.status}`) || exam.status}</span>
                          {Array.isArray(exam.tags) && exam.tags.slice(0, 3).map((tg) => (
                            <span key={tg} className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-[10px]">
                              {tg}
                            </span>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
                          {exam.subject_name && <span>{exam.subject_name}</span>}
                          <span className="flex items-center gap-1"><Clock size={11} />{exam.duration_minutes} {t('manage.minShort')}</span>
                          {typeof exam.question_count === 'number' && (
                            <span className="flex items-center gap-1"><FileText size={11} />{exam.question_count} {t('manage.questionsShort')}</span>
                          )}
                          {exam.scheduled_at && (
                            <span className="flex items-center gap-1">
                              <CalendarIcon size={11} />
                              {new Date(exam.scheduled_at).toLocaleString('sr-RS', {
                                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-2">
                        {exam.status === 'active' && (
                          <span
                            role="button"
                            onClick={(e) => { e.stopPropagation(); navigate(`/manage/${exam.id}`); }}
                            className="text-xs text-accent hover:text-accent-hover px-2 py-1 rounded hover:bg-accent-light"
                          >
                            {t('manage.room')}
                          </span>
                        )}
                        <ArrowRight size={14} className="text-[var(--text-muted)]" />
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </section>
          </div>
          <div className="px-4 pb-6 pt-2 flex justify-center"><AppCopyright /></div>
        </main>
      </div>
    </div>
  );
}

// Clickable stat counter. When `onClick` is omitted it renders as a plain
// display tile (used for the assistant role's student count, which they can't
// drill into).
function StatTile({
  icon, value, label, tone, onClick,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  tone: 'accent' | 'success' | 'info' | 'neutral';
  onClick?: () => void;
}) {
  const palette: Record<typeof tone, { iconBg: string; iconColor: string }> = {
    accent: { iconBg: 'var(--accent-light)', iconColor: 'var(--accent)' },
    success: { iconBg: 'var(--success-light)', iconColor: 'var(--success)' },
    info: { iconBg: 'var(--info-light)', iconColor: 'var(--info)' },
    neutral: { iconBg: 'var(--bg-tertiary)', iconColor: 'var(--text-muted)' },
  };
  const p = palette[tone];
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={`bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] p-4 flex items-center gap-3 text-left ${onClick ? 'hover:border-accent transition-colors cursor-pointer' : ''}`}
    >
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: p.iconBg, color: p.iconColor }}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-display font-bold text-[var(--text-primary)] leading-none">{value}</div>
        <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider mt-1 truncate">{label}</div>
      </div>
    </Comp>
  );
}
