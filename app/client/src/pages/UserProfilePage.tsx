import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Loader2, ArrowLeft, BarChart3, Trophy, Clock, BookMarked, User,
  FileText, CheckCircle2, ExternalLink,
} from 'lucide-react';

import { formatDateSr as formatDate, formatDurationLong as formatDuration } from '../lib/format';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import { Badge } from '../components/ui/Badge';
import { StatCard } from '../components/ui/StatCard';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import type { OtisakAttemptWithExam } from '../lib/types';

type Session = { id?: string; name?: string; role?: string; avatar_url?: string };

type ProfileUser = {
  id: string;
  name: string | null;
  email: string;
  index_number: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  avatar_url: string | null;
};

type ProfileStats = {
  attempts_total: number;
  attempts_submitted: number;
  passed_count: number;
  avg_percent: number;
  total_time_seconds: number;
  subjects_distinct: number;
};

type Profile = {
  user: ProfileUser;
  attempts: OtisakAttemptWithExam[];
  stats: ProfileStats;
};

export default function UserProfilePage() {
  const navigate = useNavigate();
  const { userId } = useParams();
  const { t } = useLang();

  const [me, setMe] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sres = await fetch('/api/auth/session', { credentials: 'include' });
        if (!sres.ok) { navigate('/admin', { replace: true }); return; }
        const sdata = await sres.json();
        if (!sdata.authenticated || (sdata.user?.role !== 'admin' && sdata.user?.role !== 'assistant')) {
          navigate('/dashboard', { replace: true });
          return;
        }
        if (!cancelled) setMe({ id: sdata.user.id, name: sdata.user.name, role: sdata.user.role, avatar_url: sdata.user.avatar_url });

        const res = await fetch(`/api/otisak/users/${userId}/profile`, { credentials: 'include' });
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 403) setError(t('userProfile.forbidden'));
          else if (res.status === 404) setError(t('userProfile.notFound'));
          else setError(t('userProfile.loadFailed'));
          setLoading(false);
          return;
        }
        const data: Profile = await res.json();
        setProfile(data);
      } catch {
        if (!cancelled) setError(t('userProfile.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, navigate, t]);

  if (loading || !me) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex">
      <Sidebar userName={me.name} userRole={me.role} userAvatar={me.avatar_url} />
      <MobileNav userName={me.name} userRole={me.role} />

      <div className="flex-1 lg:ml-[260px] flex flex-col min-h-screen pb-20 lg:pb-0">
        <header className="w-full bg-[var(--bg-elevated)] border-b border-[var(--border-default)] px-4 sm:px-6 py-4 z-20 sticky top-0">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center">
              <User className="w-5 h-5 text-accent" strokeWidth={1.75} />
            </div>
            <h1 className="text-lg font-display font-bold text-[var(--text-primary)]">{t('userProfile.title')}</h1>
          </div>
        </header>

        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
          {error ? (
            <EmptyState icon={<User size={32} strokeWidth={1.5} />} title={error} description={t('userProfile.loadFailed')} />
          ) : profile ? (
            <>
              {/* Identity card */}
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-6 mb-6">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl bg-accent-light flex items-center justify-center flex-shrink-0">
                    {profile.user.avatar_url ? (
                      <img src={profile.user.avatar_url} alt="" className="w-14 h-14 rounded-xl object-cover" />
                    ) : (
                      <span className="text-accent text-xl font-bold">{(profile.user.name || profile.user.email).charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h2 className="text-xl font-display font-bold text-[var(--text-primary)] truncate">{profile.user.name || profile.user.email}</h2>
                      <Badge variant={profile.user.is_active ? 'success' : 'neutral'} size="sm" dot>{profile.user.is_active ? t('userProfile.active') : t('userProfile.inactive')}</Badge>
                      <Badge variant="accent" size="sm">{profile.user.role}</Badge>
                    </div>
                    <div className="text-sm text-[var(--text-secondary)] truncate">{profile.user.email}</div>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-[var(--text-muted)]">
                      {profile.user.index_number && <span className="font-mono">{profile.user.index_number}</span>}
                      <span>&middot; {t('userProfile.memberSince')}: {formatDate(profile.user.created_at)}</span>
                      <span>&middot; {t('userProfile.lastLogin')}: {profile.user.last_login_at ? formatDate(profile.user.last_login_at) : '-'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stat tiles */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <StatCard icon={<BarChart3 size={20} strokeWidth={1.75} />} iconBg="var(--accent-light)" iconColor="var(--accent)" value={profile.stats.attempts_submitted} label={t('userProfile.stat.attempts')} />
                <StatCard icon={<Trophy size={20} strokeWidth={1.75} />} iconBg="var(--success-light)" iconColor="var(--success)" value={profile.stats.passed_count} label={t('userProfile.stat.passed')} />
                <StatCard icon={<CheckCircle2 size={20} strokeWidth={1.75} />} iconBg="var(--warning-light)" iconColor="var(--warning)" value={`${profile.stats.avg_percent}%`} label={t('userProfile.stat.avg')} />
                <StatCard icon={<Clock size={20} strokeWidth={1.75} />} iconBg="var(--info-light)" iconColor="var(--info)" value={formatDuration(profile.stats.total_time_seconds)} label={t('userProfile.stat.time')} />
                <StatCard icon={<BookMarked size={20} strokeWidth={1.75} />} iconBg="var(--accent-light)" iconColor="var(--accent)" value={profile.stats.subjects_distinct} label={t('userProfile.stat.subjects')} />
              </div>

              {/* History */}
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">{t('userProfile.history')}</h3>
                  <span className="text-xs text-[var(--text-muted)]">{profile.attempts.length} {t('userProfile.attempts')}</span>
                </div>
                {profile.attempts.length === 0 ? (
                  <div className="p-6 text-sm text-[var(--text-muted)] text-center">{t('userProfile.empty')}</div>
                ) : (
                  <div className="divide-y divide-[var(--border-subtle)]">
                    {profile.attempts.map((a) => {
                      const total = Number(a.total_points || 0);
                      const max = Number(a.max_points || 0);
                      const pct = max > 0 ? Math.round((total / max) * 100) : 0;
                      const noThreshold = a.has_pass_threshold === false;
                      const passed = !noThreshold && a.submitted && pct >= Number(a.pass_threshold ?? 50);
                      return (
                        <div key={a.id} className="flex items-center px-5 py-3 hover:bg-[var(--bg-tertiary)] transition-colors">
                          <div className="flex-1 min-w-0 pr-4">
                            <div className="flex items-center gap-2">
                              <FileText size={14} className="text-[var(--text-muted)] flex-shrink-0" />
                              <span className="text-sm font-medium text-[var(--text-primary)] truncate">{a.exam_title}</span>
                            </div>
                            <div className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                              {a.subject_name ?? '-'} &middot; {formatDate(a.started_at)} &middot; {formatDuration(Number(a.time_spent_seconds || 0))}
                            </div>
                          </div>
                          <div className="w-24 text-right">
                            {a.submitted ? (
                              <>
                                <div className={`text-base font-mono font-bold ${noThreshold ? 'text-accent' : passed ? 'text-success' : 'text-danger'}`}>{total}/{max}</div>
                                <div className="text-[11px] text-[var(--text-muted)]">{pct}%</div>
                              </>
                            ) : (
                              <span className="text-xs text-[var(--text-muted)]">{t('userProfile.notSubmitted')}</span>
                            )}
                          </div>
                          <div className="w-24 text-center hidden sm:block">
                            {!a.submitted
                              ? <Badge variant="warning" size="sm" dot>{t('userProfile.inProgress')}</Badge>
                              : noThreshold
                                ? <Badge variant="neutral" size="sm">&#8212;</Badge>
                                : <Badge variant={passed ? 'success' : 'danger'} size="sm">{passed ? t('userProfile.passed') : t('userProfile.failed')}</Badge>}
                          </div>
                          <div className="w-20 flex justify-end">
                            {a.submitted && (
                              <Button variant="ghost" size="sm" className="text-accent" rightIcon={<ExternalLink size={14} />} onClick={() => navigate(`/manage/${a.exam_id}/report/${profile.user.id}`)}>
                                {t('userProfile.openReport')}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
