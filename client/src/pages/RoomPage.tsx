import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Users, Play, Copy, Check, Clock, Link2, UserCheck, ArrowLeft,
  Fingerprint, AlertTriangle, Radio, ShieldOff, ShieldAlert, FileText,
  Plus, Minus, X, UserPlus, Timer as TimerIcon,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useLang } from '../components/LangProvider';
import { useExamSocket } from '../lib/useExamSocket';

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

export default function ExamRoomPage() {
  const navigate = useNavigate();
  const { examId } = useParams();
  const { t } = useLang();

  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<ExamData | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [started, setStarted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [locking, setLocking] = useState(false);
  const [requests, setRequests] = useState<Array<{
    id: string; user_id: string; type: string; created_at: string;
    user_name: string | null; user_email: string; user_index_number: string | null;
  }>>([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [extraSeconds, setExtraSeconds] = useState(0);
  const [adjusting, setAdjusting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const joinLink = `${window.location.origin}/join/${examId}`;

  const loadRoom = useCallback(async () => {
    try {
      const res = await fetch(`/api/otisak/exams/${examId}/room`, { credentials: 'include' });
      if (!res.ok) { navigate('/manage'); return; }
      const data = await res.json();
      setExam(data.exam);
      setParticipants(data.participants || []);
      if (data.exam?.exam_started_at) setStarted(true);
      // Check lockdown status + room-status (extra_seconds)
      try {
        const [lockRes, statusRes, reqRes] = await Promise.all([
          fetch(`/api/otisak/exams/${examId}/lockdown`),
          fetch(`/api/otisak/exams/${examId}/room-status`),
          fetch(`/api/otisak/exams/${examId}/requests`, { credentials: 'include' }),
        ]);
        if (lockRes.ok) { const ld = await lockRes.json(); setLocked(!!ld.lockdown?.is_active); }
        if (statusRes.ok) { const st = await statusRes.json(); setExtraSeconds(Number(st.extra_seconds || 0)); }
        if (reqRes.ok) { const rq = await reqRes.json(); setRequests(rq.requests || []); }
      } catch {}
    } catch { navigate('/manage'); }
    finally { setLoading(false); }
  }, [examId, navigate]);

  useEffect(() => { loadRoom(); }, [loadRoom]);

  // Live push channel: instant refresh on student requests, lockdown, timer changes.
  useExamSocket(examId, useCallback((evt) => {
    if (evt.type === 'request.created' || evt.type === 'request.decided' || evt.type === 'lockdown.changed' || evt.type === 'exam.started') {
      loadRoom();
    } else if (evt.type === 'timer.adjusted') {
      setExtraSeconds(Number(evt.extra_seconds || 0));
    }
  }, [loadRoom]));

  // Poll for new participants every 3 seconds
  useEffect(() => {
    pollRef.current = setInterval(loadRoom, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadRoom]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(joinLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      } else {
        const data = await res.json();
        alert(data.error || t('room.startFailed'));
      }
    } catch {
      alert(t('room.startFailed'));
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex flex-col">
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
            {started ? (
              <Badge variant="success" size="md" dot>{t('room.running')}</Badge>
            ) : (
              <Badge variant="warning" size="md" dot>{t('room.waiting')}</Badge>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 z-10 w-full">
        {/* Join Link Card */}
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

        {/* Participants List */}
        <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl overflow-hidden">
          <div className="flex items-center px-5 py-3 bg-[var(--bg-tertiary)] border-b border-[var(--border-default)] text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <div className="w-8">#</div>
            <div className="flex-1">{t('room.student')}</div>
            <div className="w-40 hidden sm:block">{t('room.indexNumber')}</div>
            <div className="w-32 hidden md:block">{t('room.joinedAt')}</div>
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
              {participants.map((p, idx) => (
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
                  <div className="w-32 hidden md:block text-[11px] text-[var(--text-muted)]">
                    {new Date(p.enrolled_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                  <div className="w-20 flex justify-center">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                      <span className="text-[10px] text-success uppercase font-medium">{t('room.ready')}</span>
                    </div>
                  </div>
                  {started && (
                    <div className="w-10 flex justify-center">
                      <button
                        onClick={() => navigate(`/manage/${examId}/report/${p.user_id}`)}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-accent hover:bg-accent-light transition-colors"
                        title={t('room.requests.title')}
                      >
                        <FileText size={14} />
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Started notice */}
        {started && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="mt-6 bg-success-light border border-[var(--border-default)] rounded-xl p-5 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-full bg-success/15 flex items-center justify-center flex-shrink-0">
              <Play size={20} className="text-success fill-current" />
            </div>
            <div className="flex-1">
              <p className="text-success font-medium">{t('room.examRunning')}</p>
              <p className="text-[var(--text-secondary)] text-xs">
                {t('room.startedAt', { time: exam?.exam_started_at ? new Date(exam.exam_started_at).toLocaleTimeString() : '—' })}
              </p>
            </div>
          </motion.div>
        )}

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
                try {
                  await fetch(`/api/otisak/exams/${examId}/lockdown`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                      lock: !locked,
                      message: t('lockdown.adminMessage'),
                    }),
                  });
                  setLocked(!locked);
                } catch {} finally { setLocking(false); }
              }}
            >
              {locked ? t('lockdown.button.resume') : t('lockdown.button.pause')}
            </Button>
          </motion.div>
        )}

        {/* Pending requests + timer adjust — only useful once exam has started */}
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
                            if (!res.ok) { const d = await res.json(); alert(d.error || 'Greska'); }
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
                            if (!res.ok) { const d = await res.json(); alert(d.error || 'Greska'); }
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
                        if (!res.ok) { const d = await res.json(); alert(d.error || t('room.timer.failed')); }
                        else { const d = await res.json(); setExtraSeconds(Number(d.extra_seconds || 0)); }
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
  );
}
