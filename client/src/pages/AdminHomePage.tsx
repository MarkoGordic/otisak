import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Loader2, Settings as SettingsIcon, Users as UsersIcon, BookOpen, BookMarked,
  Plus, Radio, Clock, GraduationCap, FileText, Activity, ArrowRight,
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
  duration_minutes: number;
  question_count?: number;
  subject_name?: string | null;
};

type UserInfo = { name?: string; role?: string; avatar_url?: string };

export default function AdminHomePage() {
  const navigate = useNavigate();
  const { t } = useLang();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<ExamLite[]>([]);
  const [studentCount, setStudentCount] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sessionRes = await fetch('/api/auth/session', { credentials: 'include' });
        if (!sessionRes.ok) { navigate('/admin', { replace: true }); return; }
        const data = await sessionRes.json();
        if (!data.authenticated) { navigate('/admin', { replace: true }); return; }
        if (data.user?.role !== 'admin' && data.user?.role !== 'assistant') {
          navigate('/dashboard', { replace: true });
          return;
        }
        if (!mounted) return;
        setUser({ name: data.user?.name, role: data.user?.role, avatar_url: data.user?.avatar_url });

        const [examsRes, usersRes] = await Promise.all([
          fetch('/api/otisak/exams', { credentials: 'include' }),
          // Users endpoint is admin-only — assistants will silently fail (403), which is fine.
          data.user?.role === 'admin'
            ? fetch('/api/admin/users', { credentials: 'include' })
            : Promise.resolve(null),
        ]);
        if (mounted && examsRes.ok) {
          const ed = await examsRes.json();
          setExams((ed.exams || []) as ExamLite[]);
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

  const totalExams = exams.length;
  const activeExams = exams.filter((e) => e.status === 'active').length;
  const draftExams = exams.filter((e) => e.status === 'draft').length;
  const recentExams = [...exams]
    .sort((a, b) => (a.status === 'active' ? -1 : b.status === 'active' ? 1 : 0))
    .slice(0, 5);

  const actions: Array<{ id: string; href: string; icon: React.ReactNode; label: string; desc: string; show: boolean }> = [
    { id: 'manage', href: '/manage', icon: <SettingsIcon size={18} />, label: t('nav.manage'), desc: t('adminHome.action.manageDesc'), show: true },
    { id: 'subjects', href: '/subjects', icon: <BookMarked size={18} />, label: t('nav.subjects'), desc: t('adminHome.action.subjectsDesc'), show: true },
    { id: 'questions', href: '/questions', icon: <BookOpen size={18} />, label: t('nav.questionBank'), desc: t('adminHome.action.questionsDesc'), show: true },
    { id: 'users', href: '/admin/users', icon: <UsersIcon size={18} />, label: t('nav.users'), desc: t('adminHome.action.usersDesc'), show: isAdmin },
    { id: 'settings', href: '/admin/settings', icon: <SettingsIcon size={18} />, label: t('nav.settings'), desc: t('adminHome.action.settingsDesc'), show: isAdmin },
  ];

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
              <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => navigate('/manage')}>
                {t('manage.newExam')}
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <StatTile icon={<FileText size={18} />} value={totalExams} label={t('adminHome.stat.totalExams')} tone="accent" />
              <StatTile icon={<Radio size={18} />} value={activeExams} label={t('adminHome.stat.activeExams')} tone="success" />
              <StatTile icon={<Activity size={18} />} value={draftExams} label={t('adminHome.stat.draftExams')} tone="neutral" />
              <StatTile icon={<GraduationCap size={18} />} value={studentCount ?? '—'} label={t('adminHome.stat.students')} tone="info" />
            </div>

            {/* Quick actions */}
            <section className="mb-8">
              <h2 className="text-xs uppercase tracking-widest text-[var(--text-muted)] font-semibold mb-3">{t('adminHome.quickActions')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {actions.filter((a) => a.show).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => navigate(a.href)}
                    className="group flex items-start gap-3 p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] hover:border-accent transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-lg bg-accent-light text-accent flex items-center justify-center flex-shrink-0">
                      {a.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[var(--text-primary)]">{a.label}</div>
                      <div className="text-xs text-[var(--text-secondary)] mt-0.5">{a.desc}</div>
                    </div>
                    <ArrowRight size={16} className="text-[var(--text-muted)] group-hover:text-accent group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
                  </button>
                ))}
              </div>
            </section>

            {/* Recent exams */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs uppercase tracking-widest text-[var(--text-muted)] font-semibold">{t('adminHome.recentExams')}</h2>
                <button
                  type="button"
                  onClick={() => navigate('/manage')}
                  className="text-xs text-accent hover:text-accent-hover"
                >
                  {t('adminHome.viewAll')} &rarr;
                </button>
              </div>

              {recentExams.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-elevated)] p-10 text-center">
                  <p className="text-sm text-[var(--text-secondary)] mb-3">{t('adminHome.noExams')}</p>
                  <Button variant="primary" size="sm" leftIcon={<Plus size={14} />} onClick={() => navigate('/manage')}>
                    {t('manage.newExam')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentExams.map((exam, idx) => (
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
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
                          {exam.subject_name && <span>{exam.subject_name}</span>}
                          <span className="flex items-center gap-1"><Clock size={11} />{exam.duration_minutes} {t('manage.minShort')}</span>
                          {typeof exam.question_count === 'number' && (
                            <span className="flex items-center gap-1"><FileText size={11} />{exam.question_count} {t('manage.questionsShort')}</span>
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

function StatTile({ icon, value, label, tone }: { icon: React.ReactNode; value: number | string; label: string; tone: 'accent' | 'success' | 'info' | 'neutral' }) {
  const palette: Record<typeof tone, { iconBg: string; iconColor: string }> = {
    accent: { iconBg: 'var(--accent-light)', iconColor: 'var(--accent)' },
    success: { iconBg: 'var(--success-light)', iconColor: 'var(--success)' },
    info: { iconBg: 'var(--info-light)', iconColor: 'var(--info)' },
    neutral: { iconBg: 'var(--bg-tertiary)', iconColor: 'var(--text-muted)' },
  };
  const p = palette[tone];
  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: p.iconBg, color: p.iconColor }}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-display font-bold text-[var(--text-primary)] leading-none">{value}</div>
        <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider mt-1 truncate">{label}</div>
      </div>
    </div>
  );
}
