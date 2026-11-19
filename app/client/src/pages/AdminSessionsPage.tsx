import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, MonitorSmartphone, Search, RefreshCw, LogOut } from 'lucide-react';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { PageCopyright } from '../components/AppCopyright';
import { Button } from '../components/ui/Button';
import { useLang } from '../components/LangProvider';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';

type UserInfo = { name?: string; role?: string };

type SessionRow = {
  user_id: string;
  name: string | null;
  email: string;
  index_number: string | null;
  last_seen: string | null;
  exams: Array<{
    exam_id: string;
    title: string;
    attempt_started_at: string | null;
    exam_started: boolean;
  }>;
};

function fmtTime(s: string): string {
  return new Date(s).toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' });
}

// Admin view of students who are signed in right now or mid-way through an
// active exam. Terminating their sessions frees the device lock so they can
// sign in to another exam (or from another computer).
export default function AdminSessionsPage() {
  const navigate = useNavigate();
  const { t } = useLang();
  const toast = useToast();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [finishAttempts, setFinishAttempts] = useState(false);
  const [terminating, setTerminating] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/session', { credentials: 'include' });
      const data = await res.json();
      if (!data.authenticated || data.user?.role !== 'admin') {
        navigate('/dashboard', { replace: true });
        return;
      }
      setUser({ name: data.user?.name, role: data.user?.role });
    })();
  }, [navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ sessions: SessionRow[] }>('/api/admin/sessions');
      const list = data.sessions || [];
      setRows(list);
      // Drop selections for students who are no longer listed.
      setSelected((prev) => new Set([...prev].filter((id) => list.some((r) => r.user_id === id))));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.name || '').toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.index_number || '').toLowerCase().includes(q) ||
        r.exams.some((e) => e.title.toLowerCase().includes(q)),
    );
  }, [rows, filter]);

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.user_id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((r) => next.delete(r.user_id));
      else visible.forEach((r) => next.add(r.user_id));
      return next;
    });

  const terminate = async (ids: string[]) => {
    if (ids.length === 0) return;
    const msg = finishAttempts
      ? t('sessions.confirmFinish', { count: ids.length })
      : t('sessions.confirm', { count: ids.length });
    if (!confirm(msg)) return;
    setTerminating(true);
    try {
      const res = await api.post<{ revoked: number; finished_attempts: number }>(
        '/api/admin/sessions/terminate',
        { user_ids: ids, finish_attempts: finishAttempts },
      );
      toast.success(
        finishAttempts
          ? t('sessions.toast.doneFinished', {
              count: res.revoked,
              finished: res.finished_attempts,
            })
          : t('sessions.toast.done', { count: res.revoked }),
      );
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error((e as Error).message || t('common.error'));
    } finally {
      setTerminating(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex">
      <Sidebar userName={user.name} userRole={user.role} />
      <MobileNav userName={user.name} userRole={user.role} />

      <div className="flex-1 min-w-0 lg:ml-[260px] flex flex-col min-h-screen">
        <main className="flex-1 flex flex-col pb-20 lg:pb-8">
          <div className="p-4 sm:p-6 lg:p-8 max-w-[1100px] mx-auto w-full">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-11 h-11 rounded-xl bg-accent-light flex items-center justify-center">
                <MonitorSmartphone className="w-6 h-6 text-accent" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-display font-bold text-[var(--text-primary)]">
                  {t('sessions.title')}
                </h1>
                <p className="text-sm text-[var(--text-secondary)]">{t('sessions.subtitle')}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t('sessions.search')}
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm"
                />
              </div>
              <button
                onClick={load}
                className="h-10 px-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> {t('sessions.refresh')}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4 px-4 py-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)]">
              <span className="text-sm text-[var(--text-secondary)]">
                {t('sessions.selected', { count: selected.size })}
              </span>
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={finishAttempts}
                  onChange={(e) => setFinishAttempts(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                {t('sessions.finishAttempts')}
              </label>
              <div className="flex-1" />
              <Button
                variant="danger"
                size="sm"
                loading={terminating}
                disabled={selected.size === 0}
                leftIcon={<LogOut size={14} />}
                onClick={() => terminate([...selected])}
              >
                {t('sessions.terminate')}
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-7 h-7 animate-spin text-accent" />
              </div>
            ) : visible.length === 0 ? (
              <div className="text-center py-16 text-[var(--text-muted)] text-sm">
                {t('sessions.empty')}
              </div>
            ) : (
              <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] overflow-hidden">
                <label className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border-subtle)] text-xs uppercase tracking-wider text-[var(--text-muted)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    className="accent-[var(--accent)]"
                  />
                  {t('sessions.selectAll')}
                </label>
                {visible.map((r) => (
                  <div
                    key={r.user_id}
                    className="flex items-start gap-3 px-4 py-3 border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(r.user_id)}
                      onChange={() => toggle(r.user_id)}
                      className="mt-1 accent-[var(--accent)]"
                      aria-label={r.name || r.email}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {r.name || r.email}
                        </span>
                        {r.index_number && (
                          <span className="text-[11px] font-mono text-accent">
                            {r.index_number}
                          </span>
                        )}
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {r.last_seen
                            ? t('sessions.lastSeen', { time: fmtTime(r.last_seen) })
                            : t('sessions.idle')}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {r.exams.length === 0 ? (
                          <span className="text-xs text-[var(--text-muted)]">
                            {t('sessions.noExam')}
                          </span>
                        ) : (
                          r.exams.map((e) => (
                            <span
                              key={e.exam_id}
                              className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-secondary)]"
                            >
                              {e.title}
                              <span className="text-[var(--text-muted)]">
                                {' · '}
                                {e.attempt_started_at
                                  ? t('sessions.inProgress', {
                                      time: fmtTime(e.attempt_started_at),
                                    })
                                  : e.exam_started
                                    ? t('sessions.awaitingApproval')
                                    : t('sessions.lobby')}
                              </span>
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={terminating}
                      leftIcon={<LogOut size={14} />}
                      onClick={() => terminate([r.user_id])}
                    >
                      {t('sessions.terminateOne')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <PageCopyright />
        </main>
      </div>
    </div>
  );
}
