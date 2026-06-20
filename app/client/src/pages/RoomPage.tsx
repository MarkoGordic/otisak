import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Users, Play, Pause, Copy, Check, Link2, UserCheck, ArrowLeft,
  Fingerprint, Radio, ShieldOff, ShieldAlert, FileText,
  Plus, Minus, X, UserPlus, UserX, Timer as TimerIcon, AlertTriangle, Wifi, WifiOff,
  Trophy, User, BarChart3,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { formatElapsed } from '../lib/format';
import { useLang } from '../components/LangProvider';
import { useToast } from '../components/Toast';
import { useExamSocket } from '../lib/useExamSocket';
import { useExamTimer, formatTimer } from '../lib/useExamTimer';

type Participant = {
  user_id: string;
  name: string | null;
  email: string;
  index_number: string | null;
  enrolled_at: string;
};

type ExamData = {
  id: string;
  title: string;
  status: string;
  duration_minutes: number;
  exam_started_at: string | null;
  subject_name: string | null;
  question_count: number;
  negative_points_enabled: boolean;
};

type UserInfo = { id?: string; name?: string; role?: string; avatar_url?: string };

type LiveStudent = {
  user_id: string;
  user_name: string | null;
  user_email: string;
  index_number: string | null;
  submitted: boolean;
  answered_count: number;
  current_points: number;
  started_at: string | null;
  finished_at: string | null;
  time_spent_seconds: number;
  suspicious_count: number;
};

type LiveStats = {
  total_participants: number;
  finished_count: number;
  total_questions: number;
  max_points: number;
  room_average_points: number;
  room_average_percent: number;
  per_student: LiveStudent[];
};

const SUSPICIOUS_BADGE_THRESHOLD = 5;

export default function ExamRoomPage() {
  const navigate = useNavigate();
  const { examId } = useParams();
  const { t } = useLang();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [exam, setExam] = useState<ExamData | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [started, setStarted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [locking, setLocking] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [finishRedirect, setFinishRedirect] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [requests, setRequests] = useState<Array<{
    id: string; user_id: string; type: string; created_at: string;
    user_name: string | null; user_email: string; user_index_number: string | null;
  }>>([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [extraSeconds, setExtraSeconds] = useState(0);
  const [pausedSeconds, setPausedSeconds] = useState(0);
  const [adjusting, setAdjusting] = useState(false);
  const [liveStats, setLiveStats] = useState<LiveStats>({ total_participants: 0, finished_count: 0, total_questions: 0, max_points: 0, room_average_points: 0, room_average_percent: 0, per_student: [] });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const joinLink = `${window.location.origin}/join/${examId}`;

  // Load current admin/assistant user (for Sidebar).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.authenticated) {
          setUser({
            id: data.user?.id,
            name: data.user?.name,
            role: data.user?.role,
            avatar_url: data.user?.avatar_url,
          });
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadLiveStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/otisak/exams/${examId}/live-stats`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setLiveStats(data);
      }
    } catch { /* silent */ }
  }, [examId]);

  const loadRoom = useCallback(async () => {
    try {
      const res = await fetch(`/api/otisak/exams/${examId}/room`, { credentials: 'include' });
      if (!res.ok) { navigate('/manage'); return; }
      const data = await res.json();
      setExam(data.exam);
      setParticipants(data.participants || []);
      if (data.exam?.exam_started_at) setStarted(true);
      // Closed exams render the slim read-only view - skip lockdown / room-status /
      // requests since none of those controls apply anymore. Still load live-stats
      // so the per-student report list shows scores.
      const isClosed = data.exam?.status === 'completed' || data.exam?.status === 'archived';
      if (!isClosed) {
        try {
          const [lockRes, statusRes, reqRes] = await Promise.all([
            fetch(`/api/otisak/exams/${examId}/lockdown`),
            fetch(`/api/otisak/exams/${examId}/room-status`),
            fetch(`/api/otisak/exams/${examId}/requests`, { credentials: 'include' }),
          ]);
          if (lockRes.ok) { const ld = await lockRes.json(); setLocked(!!ld.lockdown?.is_active); }
          if (statusRes.ok) {
            const st = await statusRes.json();
            setExtraSeconds(Number(st.extra_seconds || 0));
            setPausedSeconds(Number(st.paused_seconds || 0));
          }
          if (reqRes.ok) { const rq = await reqRes.json(); setRequests(rq.requests || []); }
        } catch {}
      }
      // Live stats only matters when exam has started, but cheap to call always.
      loadLiveStats();
    } catch { navigate('/manage'); }
    finally { setLoading(false); }
  }, [examId, navigate, loadLiveStats]);

  useEffect(() => { loadRoom(); }, [loadRoom]);

  // WebSocket: realtime channel for admin-side events (requests, lockdown, timer, started).
  // Stats are deliberately NOT pushed via this socket - see the polling effect below for why.
  // exam.submitted is the one exception: it's a hint to immediately re-poll stats so the
  // "X of Y submitted" counter ticks up without waiting up to 5s for the next poll cycle.
  const { connected } = useExamSocket(examId, useCallback((evt) => {
    if (
      evt.type === 'student.joined' ||
      evt.type === 'request.created' ||
      evt.type === 'request.decided' ||
      evt.type === 'lockdown.changed' ||
      evt.type === 'exam.started'
    ) {
      // Any of these change the participant list / requests / lockdown / start state.
      loadRoom();
    } else if (evt.type === 'timer.adjusted') {
      setExtraSeconds(Number(evt.extra_seconds || 0));
    } else if (evt.type === 'exam.submitted') {
      // Server already refreshed its cache before broadcasting; poll once now to pick it up.
      loadLiveStats();
    }
  }, [loadRoom, loadLiveStats]), {
    // After a reconnect, refetch room + stats so anything missed during the gap is restored.
    onReconnect: useCallback(() => { loadRoom(); }, [loadRoom]),
  });

  // Live-stats polling. The server runs a 5s background aggregator and caches the result;
  // the admin pulls from that cache. This is the source of truth for per-student progress
  // and the finished/total counter - *not* the websocket. Polling is independent of socket
  // state so a flaky WS doesn't kill the live UI.
  useEffect(() => {
    if (!started) return;
    const id = setInterval(loadLiveStats, 5000);
    return () => clearInterval(id);
  }, [started, loadLiveStats]);

  // Lightweight room polling for participants list + lockdown + requests, as a safety
  // net when the websocket isn't connected. The stats polling above always runs.
  useEffect(() => {
    if (connected) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(loadRoom, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [connected, loadRoom]);

  // Live exam timer (admin view) - same algorithm as student timer so the two stay in sync.
  const timer = useExamTimer({
    startedAt: exam?.exam_started_at ?? null,
    durationSeconds: (exam?.duration_minutes ?? 0) * 60,
    extraSeconds,
    pausedSeconds,
    paused: locked,
  });

  const handleCopyLink = () => {
    navigator.clipboard.writeText(joinLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFinishAll = async () => {
    setFinishing(true);
    try {
      const res = await fetch(`/api/otisak/exams/${examId}/finish-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ redirect_students: finishRedirect }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error === 'DEMO_EXAM_LOCKED' ? t('manage.demoLocked') : (d.error || t('room.toast.finishFailed')));
        return;
      }
      const d = await res.json().catch(() => ({}));
      toast.success(t('room.toast.finishedAll', { count: Number(d.finished_count ?? 0) }));
      setShowFinishModal(false);
      navigate('/manage');
    } catch {
      toast.error(t('room.toast.finishFailed'));
    } finally {
      setFinishing(false);
    }
  };

  const handleKickStudent = async (userId: string, displayName: string) => {
    if (!confirm(t('room.kickConfirm', { name: displayName }))) return;
    try {
      const res = await fetch(`/api/otisak/exams/${examId}/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('room.kickFailed'));
        return;
      }
      toast.success(t('room.kickToast', { name: displayName }));
      loadRoom();
    } catch {
      toast.error(t('room.kickFailed'));
    }
  };

  const handleStartExam = async () => {
    if (starting || started) return;
    if (!confirm(t('room.startConfirm', { count: participants.length }))) return;

    setStarting(true);
    try {
      const res = await fetch(`/api/otisak/exams/${examId}/start`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setStarted(true);
        loadRoom();
        toast.success(t('room.toast.started'));
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t('room.startFailed'));
      }
    } catch {
      toast.error(t('room.startFailed'));
    } finally {
      setStarting(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  // Once an exam is completed (or archived) the live-room controls are no
  // longer meaningful. Render a slim export-and-reports view instead.
  if (exam && (exam.status === 'completed' || exam.status === 'archived')) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex">
        <Sidebar userName={user.name} userRole={user.role} userAvatar={user.avatar_url} />
        <MobileNav userName={user.name} userRole={user.role} />

        <div className="flex-1 lg:ml-[260px] flex flex-col min-h-screen pb-20 lg:pb-0">
          <header className="w-full bg-[var(--bg-elevated)] border-b border-[var(--border-default)] px-4 sm:px-6 py-4 z-20 sticky top-0">
            <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <button
                  onClick={() => navigate('/manage')}
                  className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                  aria-label="Back"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[var(--bg-tertiary)] flex items-center justify-center flex-shrink-0">
                    <Fingerprint className="w-5 h-5 text-[var(--text-muted)]" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-lg font-display font-bold text-[var(--text-primary)] truncate">
                      {exam.title}
                    </h1>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] truncate">
                      {exam.subject_name && <span className="truncate">{exam.subject_name}</span>}
                      <span>·</span>
                      <span>{exam.duration_minutes}min</span>
                      <span>·</span>
                      <span>{exam.question_count} {t('questions.title').toLowerCase()}</span>
                    </div>
                  </div>
                </div>
              </div>
              <Badge variant="neutral" size="md">{t('manage.completed')}</Badge>
            </div>
          </header>

          <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
            <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-6 mb-6">
              <div className="flex items-start gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-display font-bold text-[var(--text-primary)]">{t('room.readOnly.title')}</h2>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">{t('room.readOnly.desc')}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">{t('room.readOnly.exportTitle')}</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{t('room.readOnly.exportDesc')}</p>
                  </div>
                </div>
                <a
                  href={`/api/otisak/exams/${examId}/export-results`}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
                >
                  <FileText size={16} />
                  {t('room.readOnly.downloadZip')}
                </a>
              </div>
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">{t('room.readOnly.statsTitle')}</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{t('room.readOnly.statsDesc')}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/manage/${examId}/stats`)}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-accent-light text-accent border border-accent/30 text-sm font-medium hover:bg-accent hover:text-white transition-colors"
                >
                  <BarChart3 size={16} />
                  {t('room.readOnly.openStats')}
                </button>
              </div>
            </div>

            <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-6">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-4">{t('room.readOnly.studentsTitle')}</h3>
              {liveStats.per_student.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">{t('room.readOnly.noStudents')}</p>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)]">
                  {liveStats.per_student.map((p) => (
                    <div key={p.user_id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[var(--text-primary)] truncate">{p.user_name || p.user_email}</div>
                        <div className="text-xs text-[var(--text-muted)] truncate">
                          {p.index_number && <span className="font-mono">{p.index_number} · </span>}
                          {p.user_email}
                          {p.submitted && <> · <span className="text-success">{t('manage.completed').toLowerCase()}</span></>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => navigate(`/users/${p.user_id}`)}
                          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] text-sm font-medium hover:border-accent hover:text-accent transition-colors"
                          title={t('room.viewProfile')}
                        >
                          <User size={14} />
                        </button>
                        <button
                          onClick={() => navigate(`/manage/${examId}/report/${p.user_id}`)}
                          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] text-sm font-medium hover:border-accent hover:text-accent transition-colors"
                        >
                          {t('room.readOnly.openReport')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Index per_student by user_id for quick lookup when rendering participant rows.
  const statsByUser = new Map(liveStats.per_student.map((s) => [s.user_id, s] as const));

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex">
      <Sidebar userName={user.name} userRole={user.role} userAvatar={user.avatar_url} />
      <MobileNav userName={user.name} userRole={user.role} />

      <div className="flex-1 lg:ml-[260px] flex flex-col min-h-screen pb-20 lg:pb-0">
        {/* Header */}
        <header className="w-full bg-[var(--bg-elevated)] border-b border-[var(--border-default)] px-4 sm:px-6 py-4 z-20 sticky top-0">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <button
                onClick={() => navigate('/manage')}
                className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                aria-label="Back"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center flex-shrink-0">
                  <Fingerprint className="w-5 h-5 text-accent" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg font-display font-bold text-[var(--text-primary)] truncate">
                    {exam?.title || t('room.title')}
                  </h1>
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] truncate">
                    {exam?.subject_name && <span className="truncate">{exam.subject_name}</span>}
                    <span>·</span>
                    <span>{exam?.duration_minutes}min</span>
                    <span>·</span>
                    <span>{exam?.question_count} {t('questions.title').toLowerCase()}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              {/* Connection indicator: visible only when not connected so we don't add noise during normal operation. */}
              {!connected && (
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-warning-light text-warning text-[11px] uppercase tracking-wider font-medium">
                  <WifiOff size={12} />
                  {t('live.reconnecting')}
                </span>
              )}
              {connected && started && (
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-success-light text-success text-[11px] uppercase tracking-wider font-medium">
                  <Wifi size={12} />
                  {t('live.connected')}
                </span>
              )}
              {started ? (
                <Badge variant="success" size="md" dot>{t('room.running')}</Badge>
              ) : (
                <Badge variant="warning" size="md" dot>{t('room.waiting')}</Badge>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 z-10">
          {/* Join Link Card - hidden once the exam is running */}
          {!started && (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-5 mb-6"
            >
              <div className="flex items-center gap-2 mb-3">
                <Link2 size={16} className="text-accent" />
                <span className="text-sm font-medium text-[var(--text-primary)]">{t('room.joinLink')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-4 py-3 font-mono text-sm text-accent truncate">
                  {joinLink}
                </div>
                <button
                  onClick={handleCopyLink}
                  className={`px-4 py-3 rounded-lg font-medium text-sm transition-all flex items-center gap-2 border ${
                    copied
                      ? 'bg-success-light border-[var(--border-default)] text-success'
                      : 'bg-accent border-accent hover:bg-accent-hover text-white'
                  }`}
                >
                  {copied ? <><Check size={16} />{t('room.copied')}</> : <><Copy size={16} />{t('room.copy')}</>}
                </button>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-2">{t('room.joinLinkDesc')}</p>
            </motion.div>
          )}

          {/* Stats + Start */}
          <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg">
                <Users size={16} className="text-accent" />
                <span className="text-[var(--text-primary)] font-mono text-lg font-bold">{participants.length}</span>
                <span className="text-[var(--text-muted)] text-sm">{t('room.joined')}</span>
              </div>
              {started && (
                <div className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg">
                  <UserCheck size={16} className="text-success" />
                  <span className="text-[var(--text-primary)] font-mono text-lg font-bold">{liveStats.finished_count}</span>
                  <span className="text-[var(--text-muted)] text-sm">/ {Math.max(liveStats.total_participants, participants.length)} {t('room.stats.finished')}</span>
                </div>
              )}
              {/* Live room-wide score. Hidden until at least one student has
                  started so the tile doesn't flash 0/X during the lobby. */}
              {started && liveStats.max_points > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg">
                  <Trophy size={16} className="text-accent" />
                  <span className="text-[var(--text-primary)] font-mono text-lg font-bold">
                    {liveStats.room_average_points}/{liveStats.max_points}
                  </span>
                  <span className="text-[var(--text-muted)] text-sm">{liveStats.room_average_percent}% {t('room.stats.roomAverage')}</span>
                </div>
              )}
              {!started && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <Radio size={12} className="text-success animate-pulse" />
                  {t('room.liveRefresh')}
                </div>
              )}
            </div>

            {!started && (
              <Button
                variant="primary"
                size="lg"
                leftIcon={<Play size={18} className="fill-current" />}
                loading={starting}
                onClick={handleStartExam}
              >
                {t('room.startExam')}
              </Button>
            )}
          </div>

          {/* Live exam timer - only meaningful while the exam is running. Same algorithm as student timer. */}
          {started && exam?.exam_started_at && (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className={`mb-6 bg-[var(--bg-elevated)] border rounded-xl p-5 flex items-center justify-between ${
                timer.expired
                  ? 'border-danger/40'
                  : timer.totalSeconds <= 5 * 60
                    ? 'border-warning/40'
                    : 'border-[var(--border-default)]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                  timer.expired
                    ? 'bg-danger-light text-danger'
                    : timer.totalSeconds <= 5 * 60
                      ? 'bg-warning-light text-warning'
                      : 'bg-accent-light text-accent'
                }`}>
                  <TimerIcon size={20} />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] font-semibold">{t('room.stats.timeLeft')}</p>
                  <p className={`font-mono text-3xl font-bold tabular-nums ${
                    timer.expired
                      ? 'text-danger'
                      : timer.totalSeconds <= 5 * 60
                        ? 'text-warning'
                        : 'text-[var(--text-primary)]'
                  }`}>
                    {timer.expired ? t('room.stats.timeUp') : formatTimer(timer)}
                  </p>
                </div>
              </div>
              {locked && (
                <Badge variant="warning" size="md" dot>{t('lockdown.timerPaused')}</Badge>
              )}
              {extraSeconds !== 0 && (
                <span className={`text-xs font-mono ${extraSeconds > 0 ? 'text-success' : 'text-danger'}`}>
                  {extraSeconds > 0 ? '+' : ''}{Math.round(extraSeconds / 60)}min
                </span>
              )}
            </motion.div>
          )}

          {/* Participants list - when running, each row shows live progress + suspicious counter */}
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl overflow-hidden">
            <div className="flex items-center px-5 py-3 bg-[var(--bg-tertiary)] border-b border-[var(--border-default)] text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <div className="w-8">#</div>
              <div className="flex-1">{t('room.student')}</div>
              <div className="w-40 hidden sm:block">{t('room.indexNumber')}</div>
              {!started && <div className="w-32 hidden md:block">{t('room.joinedAt')}</div>}
              {started && <div className="w-56 hidden md:block">{t('room.stats.title')}</div>}
              <div className="w-20 text-center">{t('room.status')}</div>
              {started && <div className="w-10" />}
            </div>

            {participants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Users className="w-12 h-12 text-[var(--text-muted)] mb-3" />
                <p className="text-[var(--text-secondary)] text-sm mb-1">{t('room.noStudents')}</p>
                <p className="text-[var(--text-muted)] text-xs">{t('room.noStudentsDesc')}</p>
              </div>
            ) : (
              <AnimatePresence>
                {participants.map((p, idx) => {
                  const s = statsByUser.get(p.user_id);
                  const total = liveStats.total_questions || exam?.question_count || 0;
                  const answered = s?.answered_count ?? 0;
                  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
                  const submitted = !!s?.submitted;
                  const suspicious = s?.suspicious_count ?? 0;
                  // Running points come from the same poll as answered_count.
                  // Bands: green ≥70%, orange 40–70%, red <40%; grey when the
                  // student hasn't accumulated any score yet.
                  const currentPoints = Number(s?.current_points ?? 0);
                  const maxPoints = liveStats.max_points || 0;
                  const scorePct = maxPoints > 0 ? Math.round((currentPoints / maxPoints) * 100) : 0;
                  const scoreColor = currentPoints === 0
                    ? 'text-[var(--text-muted)] bg-[var(--bg-tertiary)]'
                    : scorePct >= 70
                      ? 'text-success bg-success-light'
                      : scorePct >= 40
                        ? 'text-warning bg-warning-light'
                        : 'text-danger bg-danger-light';
                  return (
                    <motion.div
                      key={p.user_id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className="flex items-center px-5 py-3 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                      <div className="w-8 text-[var(--text-muted)] font-mono text-xs">{idx + 1}</div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-[var(--text-primary)] truncate block">{p.name || p.email}</span>
                        {p.name && <span className="text-[11px] text-[var(--text-muted)] block">{p.email}</span>}
                      </div>
                      <div className="w-40 hidden sm:block">
                        <span className="font-mono text-xs text-accent">{p.index_number || '-'}</span>
                      </div>
                      {!started && (
                        <div className="w-32 hidden md:block text-[11px] text-[var(--text-muted)]">
                          {new Date(p.enrolled_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                      )}
                      {started && (
                        <div className="w-56 hidden md:block">
                          {/* Mini progress bar + answered/total + elapsed + suspicious badge */}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                              <div
                                className={`h-full transition-all ${submitted ? 'bg-success' : 'bg-accent'}`}
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-mono text-[var(--text-muted)] whitespace-nowrap">
                              {answered}/{total}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-[var(--text-muted)] font-mono">{formatElapsed(s?.time_spent_seconds ?? 0)}</span>
                            {/* Live score chip - populates as soon as the
                                first auto-save lands. Colour band reflects
                                running % so the admin can scan for stragglers. */}
                            {maxPoints > 0 && (
                              <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${scoreColor}`}>
                                {currentPoints}/{maxPoints} ({scorePct}%)
                              </span>
                            )}
                            {suspicious > 0 && (
                              <span
                                className={`flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                  suspicious >= SUSPICIOUS_BADGE_THRESHOLD
                                    ? 'bg-danger-light text-danger'
                                    : 'bg-warning-light text-warning'
                                }`}
                                title={t('room.stats.suspicious', { count: suspicious })}
                              >
                                <AlertTriangle size={10} />
                                {suspicious}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="w-20 flex justify-center">
                        {started && submitted ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-success" />
                            <span className="text-[10px] text-success uppercase font-medium">{t('room.stats.statusFinished')}</span>
                          </div>
                        ) : started ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                            <span className="text-[10px] text-accent uppercase font-medium">{t('room.stats.statusActive')}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                            <span className="text-[10px] text-success uppercase font-medium">{t('room.ready')}</span>
                          </div>
                        )}
                      </div>
                      <div className="w-20 flex justify-end items-center gap-1">
                        <button
                          onClick={() => navigate(`/users/${p.user_id}`)}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-accent hover:bg-accent-light transition-colors"
                          title={t('room.viewProfile')}
                        >
                          <User size={14} />
                        </button>
                        {started && (
                          <button
                            onClick={() => navigate(`/manage/${examId}/report/${p.user_id}`)}
                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-accent hover:bg-accent-light transition-colors"
                            title={t('room.viewReport')}
                          >
                            <FileText size={14} />
                          </button>
                        )}
                        {/* Kick is available while a student is on-screen: from the
                            moment they join through the running exam, but not after
                            they've already submitted (no point) or before they joined
                            (no row in the participants list anyway). */}
                        {!submitted && (
                          <button
                            onClick={() => handleKickStudent(p.user_id, p.name || p.email)}
                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-danger hover:bg-danger-light transition-colors"
                            title={t('room.kick')}
                          >
                            <UserX size={14} />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          {/* Started notice + Finish-for-all action */}
          {started && (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="mt-6 bg-success-light border border-[var(--border-default)] rounded-xl p-5 flex items-center gap-4 flex-wrap"
            >
              <div className="w-10 h-10 rounded-full bg-success/15 flex items-center justify-center flex-shrink-0">
                <Play size={20} className="text-success fill-current" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-success font-medium">{t('room.examRunning')}</p>
                <p className="text-[var(--text-secondary)] text-xs">
                  {t('room.startedAt', { time: exam?.exam_started_at ? new Date(exam.exam_started_at).toLocaleTimeString() : '-' })}
                </p>
              </div>
              <Button
                variant="danger"
                size="md"
                leftIcon={<Pause size={16} />}
                onClick={() => { setFinishRedirect(false); setShowFinishModal(true); }}
              >
                {t('room.finishAll')}
              </Button>
            </motion.div>
          )}

          {/* Finish-all confirmation modal */}
          <AnimatePresence>
            {showFinishModal && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={() => !finishing && setShowFinishModal(false)}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl shadow-2xl max-w-md w-full p-6"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-danger-light flex items-center justify-center">
                      <Pause size={18} className="text-danger" />
                    </div>
                    <h3 className="text-lg font-display font-semibold text-[var(--text-primary)]">{t('room.finishAll.title')}</h3>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">{t('room.finishAll.body')}</p>
                  <p className="text-xs text-warning mb-4 leading-relaxed">{t('room.finishAll.warning')}</p>

                  <label className="flex items-start gap-3 mb-5 p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-tertiary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={finishRedirect}
                      onChange={(e) => setFinishRedirect(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-[var(--accent)]"
                    />
                    <span className="text-sm text-[var(--text-primary)]">
                      <span className="block font-medium">{t('room.finishAll.redirectLabel')}</span>
                      <span className="block text-xs text-[var(--text-muted)] mt-0.5">{t('room.finishAll.redirectHint')}</span>
                    </span>
                  </label>

                  <div className="flex items-center justify-end gap-3">
                    <Button variant="secondary" onClick={() => setShowFinishModal(false)} disabled={finishing}>
                      {t('common.cancel')}
                    </Button>
                    <Button variant="danger" loading={finishing} onClick={handleFinishAll}>
                      {t('room.finishAll.confirm')}
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Lockdown Controls */}
          {started && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className={`mt-4 rounded-xl border p-5 flex items-center justify-between ${
                locked
                  ? 'bg-accent-light border-[var(--border-default)]'
                  : 'bg-[var(--bg-elevated)] border-[var(--border-default)]'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  locked ? 'bg-accent/15' : 'bg-[var(--bg-tertiary)]'
                }`}>
                  {locked
                    ? <ShieldAlert size={20} className="text-accent" />
                    : <ShieldOff size={20} className="text-[var(--text-muted)]" />
                  }
                </div>
                <div>
                  <p className={`font-medium ${locked ? 'text-accent' : 'text-[var(--text-primary)]'}`}>
                    {t('lockdown.title.short')}
                  </p>
                  <p className={`text-xs ${locked ? 'text-accent-muted' : 'text-[var(--text-muted)]'}`}>
                    {locked ? t('lockdown.desc.active') : t('lockdown.desc.idle')}
                  </p>
                </div>
              </div>
              <Button
                variant={locked ? 'secondary' : 'danger'}
                size="md"
                loading={locking}
                leftIcon={locked ? <ShieldOff size={16} /> : <ShieldAlert size={16} />}
                onClick={async () => {
                  setLocking(true);
                  const next = !locked;
                  try {
                    const res = await fetch(`/api/otisak/exams/${examId}/lockdown`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({
                        lock: next,
                        message: t('lockdown.adminMessage'),
                      }),
                    });
                    if (!res.ok) {
                      const d = await res.json().catch(() => ({}));
                      toast.error(d.error || t('common.error'));
                    } else {
                      setLocked(next);
                      toast.info(t(next ? 'room.toast.lockOn' : 'room.toast.lockOff'));
                    }
                  } catch {
                    toast.error(t('common.error'));
                  } finally { setLocking(false); }
                }}
              >
                {locked ? t('lockdown.button.resume') : t('lockdown.button.pause')}
              </Button>
            </motion.div>
          )}

          {/* Pending requests + timer adjust - only useful once exam has started */}
          {started && (
            <>
              {/* REQUESTS */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="mt-6 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-accent-light flex items-center justify-center">
                    <UserPlus size={16} className="text-accent" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{t('room.requests.title')}</p>
                    <p className="text-xs text-[var(--text-muted)]">{requests.length === 0 ? t('room.requests.empty') : `${requests.length}`}</p>
                  </div>
                </div>

                {requests.length > 0 && (
                  <div className="space-y-2">
                    {requests.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-[var(--text-primary)] truncate">{r.user_name || r.user_email}</span>
                            {r.user_index_number && (
                              <span className="text-[11px] font-mono text-accent">{r.user_index_number}</span>
                            )}
                            <span className="text-[10px] uppercase tracking-widest text-accent px-2 py-0.5 rounded-full bg-accent-light border border-[var(--border-default)]">
                              {t(`room.requests.${r.type}`) || r.type}
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{new Date(r.created_at).toLocaleTimeString('sr-RS')}</p>
                        </div>
                        <Button
                          variant="primary"
                          size="sm"
                          loading={decidingId === r.id}
                          leftIcon={<Check size={14} />}
                          onClick={async () => {
                            setDecidingId(r.id);
                            try {
                              const res = await fetch(`/api/otisak/exams/${examId}/requests/${r.id}/decide`, {
                                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                                body: JSON.stringify({ decision: 'approved' }),
                              });
                              if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error || t('common.error')); }
                              else { setRequests((rs) => rs.filter((x) => x.id !== r.id)); loadRoom(); }
                            } finally { setDecidingId(null); }
                          }}
                        >
                          {t('room.requests.approve')}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          loading={decidingId === r.id}
                          leftIcon={<X size={14} />}
                          onClick={async () => {
                            setDecidingId(r.id);
                            try {
                              const res = await fetch(`/api/otisak/exams/${examId}/requests/${r.id}/decide`, {
                                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                                body: JSON.stringify({ decision: 'denied' }),
                              });
                              if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error || t('common.error')); }
                              else { setRequests((rs) => rs.filter((x) => x.id !== r.id)); }
                            } finally { setDecidingId(null); }
                          }}
                        >
                          {t('room.requests.deny')}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* TIMER ADJUSTMENT */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mt-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5"
              >
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-9 h-9 rounded-lg bg-accent-light flex items-center justify-center">
                    <TimerIcon size={16} className="text-accent" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{t('room.timer.title')}</p>
                    <p className="text-xs text-[var(--text-muted)]">{t('room.timer.desc')}</p>
                  </div>
                  <span className={`text-[11px] font-mono whitespace-nowrap ${extraSeconds === 0 ? 'text-[var(--text-muted)]' : extraSeconds > 0 ? 'text-success' : 'text-danger'}`}>
                    {t('room.timer.currentExtra', { value: extraSeconds })}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: '−5', delta: -5 * 60, variant: 'danger' as const, icon: <Minus size={14} /> },
                    { label: '−1', delta: -1 * 60, variant: 'danger' as const, icon: <Minus size={14} /> },
                    { label: '+1', delta: +1 * 60, variant: 'primary' as const, icon: <Plus size={14} /> },
                    { label: '+5', delta: +5 * 60, variant: 'primary' as const, icon: <Plus size={14} /> },
                  ].map((b) => (
                    <Button
                      key={b.label}
                      variant={b.variant}
                      size="md"
                      loading={adjusting}
                      leftIcon={b.icon}
                      onClick={async () => {
                        setAdjusting(true);
                        try {
                          const res = await fetch(`/api/otisak/exams/${examId}/adjust-timer`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                            body: JSON.stringify({ delta_seconds: b.delta }),
                          });
                          if (!res.ok) {
                            const d = await res.json().catch(() => ({}));
                            toast.error(d.error || t('room.timer.failed'));
                          } else {
                            const d = await res.json();
                            setExtraSeconds(Number(d.extra_seconds || 0));
                            const minutes = b.delta / 60;
                            toast.success(
                              t(minutes > 0 ? 'room.timer.toast.added' : 'room.timer.toast.removed', { minutes: Math.abs(minutes) })
                            );
                          }
                        } finally { setAdjusting(false); }
                      }}
                    >
                      {b.label} {t('room.timer.minute')}
                    </Button>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
