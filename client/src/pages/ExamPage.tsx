import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Power, AlertTriangle, StickyNote, X, ShieldAlert } from 'lucide-react';
import {
  OtisakHeader,
  OtisakFooter,
  OtisakTimer,
  OtisakLogo,
  AnswerOption,
  CodeBlock,
  QuestionNav,
} from '../components/otisak';
import { useLang } from '../components/LangProvider';
import type {
  OtisakExamWithSubject,
  OtisakQuestionWithAnswers,
  OtisakAttempt,
} from '../lib/types';

type UserInfo = {
  name?: string;
  email?: string;
  avatar_url?: string;
  index_number?: string;
};

type Phase = 'loading' | 'lobby' | 'exam' | 'submitting';

const ANSWER_LABELS = 'ABCDEFGHIJ';

export default function ExamPage() {
  const navigate = useNavigate();
  const { examId } = useParams();
  const { t } = useLang();

  const [phase, setPhase] = useState<Phase>('loading');
  const [user, setUser] = useState<UserInfo | null>(null);
  const [exam, setExam] = useState<OtisakExamWithSubject | null>(null);
  const [questions, setQuestions] = useState<OtisakQuestionWithAnswers[]>([]);
  const [attempt, setAttempt] = useState<OtisakAttempt | null>(null);

  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  const [matchingSelectedLeft, setMatchingSelectedLeft] = useState<string | null>(null);
  const [scratchNotes, setScratchNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [lockdown, setLockdown] = useState(false);
  const [lockdownMessage, setLockdownMessage] = useState('');
  const startTimeRef = useRef<number>(Date.now());

  // ========================================
  // EVENT TRACKING SYSTEM
  // ========================================
  const eventQueueRef = useRef<Array<{ type: string; data?: Record<string, unknown>; timestamp: string }>>([]);
  const keystrokeBufferRef = useRef<{ count: number; lastKey: string; questionId: string }>({ count: 0, lastKey: '', questionId: '' });

  const trackEvent = useCallback((type: string, data?: Record<string, unknown>) => {
    eventQueueRef.current.push({
      type,
      data: { ...data, ts: Date.now() - startTimeRef.current },
      timestamp: new Date().toISOString(),
    });
  }, []);

  const flushEvents = useCallback(async () => {
    if (!attempt?.id || eventQueueRef.current.length === 0) return;
    const events = [...eventQueueRef.current];
    eventQueueRef.current = [];
    try {
      await fetch(`/api/otisak/exams/${examId}/events`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attempt_id: attempt.id, events }),
        keepalive: true,
      });
    } catch { /* silent */ }
  }, [attempt?.id, examId]);

  // Flush events every 5 seconds
  useEffect(() => {
    if (phase !== 'exam') return;
    const interval = setInterval(flushEvents, 5000);
    return () => { clearInterval(interval); flushEvents(); };
  }, [phase, flushEvents]);

  // Track global events during exam
  useEffect(() => {
    if (phase !== 'exam') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Buffer keystrokes - flush as batch every 2 seconds
      const buf = keystrokeBufferRef.current;
      buf.count++;
      buf.lastKey = e.key;

      // Track special keys immediately
      if (e.ctrlKey || e.metaKey) {
        trackEvent('key_combo', { key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey });
      }
      if (e.key === 'Tab' || e.key === 'Escape') {
        trackEvent('special_key', { key: e.key });
      }
    };

    const handleKeyUp = () => {
      const buf = keystrokeBufferRef.current;
      if (buf.count > 0) {
        // Flush keystroke buffer periodically (handled by interval below)
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      trackEvent('copy_attempt', { selection: window.getSelection()?.toString()?.substring(0, 100) });
    };
    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      trackEvent('cut_attempt');
    };
    const handlePaste = (e: ClipboardEvent) => {
      trackEvent('paste_attempt', { length: e.clipboardData?.getData('text')?.length || 0 });
    };
    const handleContextMenu = (e: MouseEvent) => {
      trackEvent('right_click', { x: e.clientX, y: e.clientY });
    };
    const handleBlur = () => {
      trackEvent('page_blur');
    };
    const handleFocus = () => {
      trackEvent('page_focus');
    };
    const handleVisibilityChange = () => {
      trackEvent('visibility_change', { state: document.visibilityState });
    };
    const handleResize = () => {
      trackEvent('window_resize', { width: window.innerWidth, height: window.innerHeight });
    };
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 || e.clientX <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        trackEvent('mouse_leave_window', { x: e.clientX, y: e.clientY });
      }
    };
    const handlePrint = () => {
      trackEvent('print_attempt');
    };
    const handleDevTools = (e: KeyboardEvent) => {
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C'))) {
        trackEvent('devtools_attempt', { key: e.key });
      }
    };

    // Keystroke buffer flusher
    const keystrokeInterval = setInterval(() => {
      const buf = keystrokeBufferRef.current;
      if (buf.count > 0) {
        trackEvent('keystroke_batch', { count: buf.count, lastKey: buf.lastKey });
        buf.count = 0;
      }
    }, 3000);

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keydown', handleDevTools);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCut);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('resize', handleResize);
    document.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('beforeprint', handlePrint);

    // Track exam started
    trackEvent('exam_view_started', { questions: questions.length });

    return () => {
      clearInterval(keystrokeInterval);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keydown', handleDevTools);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('cut', handleCut);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('beforeprint', handlePrint);
    };
  }, [phase, trackEvent, questions.length]);

  // 1. Auth + load exam data
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sessionRes = await fetch('/api/auth/session', { credentials: 'include' });
        if (!sessionRes.ok) { navigate('/login', { replace: true }); return; }
        const sessionData = await sessionRes.json();
        if (!sessionData.authenticated) { navigate('/login', { replace: true }); return; }

        if (mounted) {
          setUser({
            name: sessionData.user?.name,
            email: sessionData.user?.email,
            avatar_url: sessionData.user?.avatar_url,
            index_number: sessionData.user?.index_number,
          });
        }

        const examRes = await fetch(`/api/otisak/exams/${examId}`, { credentials: 'include' });
        if (!examRes.ok) { if (mounted) navigate('/dashboard'); return; }
        const examData = await examRes.json();

        if (mounted) {
          setExam(examData.exam);

          if (examData.expired && examData.attemptId) {
            navigate(`/exam/${examId}/results`);
            return;
          }

          setQuestions(examData.questions || []);

          if (examData.attempt) {
            setAttempt(examData.attempt);
            // Use exam_started_at as the reference time for the timer if available
            const timerStart = examData.exam.exam_started_at
              ? new Date(examData.exam.exam_started_at).getTime()
              : new Date(examData.attempt.started_at).getTime();
            startTimeRef.current = timerStart;

            if (Array.isArray(examData.savedAnswers)) {
              const restored: Record<string, string[]> = {};
              for (const sa of examData.savedAnswers) {
                if (sa.question_id && Array.isArray(sa.selected_answer_ids) && sa.selected_answer_ids.length > 0) {
                  restored[sa.question_id] = sa.selected_answer_ids;
                }
              }
              setAnswers(restored);
            }

            // If exam hasn't been started by admin yet, show lobby
            if (examData.exam.status === 'active' && !examData.exam.exam_started_at) {
              setPhase('lobby');
            } else {
              setPhase('exam');
            }
          } else if (examData.exam.status === 'active') {
            // No attempt yet - show lobby (will auto-start when admin triggers)
            setPhase('lobby');
          } else if (examData.exam.status === 'completed' || examData.exam.status === 'archived') {
            navigate(`/exam/${examId}/results`);
          } else {
            setPhase('lobby');
          }
        }
      } catch {
        if (mounted) navigate('/dashboard');
      }
    })();
    return () => { mounted = false; };
  }, [examId, navigate]);

  // Poll for admin to start the exam
  useEffect(() => {
    if (phase !== 'lobby' || !exam || exam.status !== 'active') return;
    // If exam already started, go directly
    if (exam.exam_started_at) { setPhase('exam'); return; }

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/otisak/exams/${examId}/room-status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.exam_started_at) {
          clearInterval(pollInterval);
          // Reload exam data to get attempt
          const examRes = await fetch(`/api/otisak/exams/${examId}`, { credentials: 'include' });
          if (examRes.ok) {
            const examData = await examRes.json();
            setExam(examData.exam);
            setQuestions(examData.questions || []);
            if (examData.attempt) {
              setAttempt(examData.attempt);
              startTimeRef.current = new Date(data.exam_started_at).getTime();
            }
          }
          setPhase('exam');
        }
      } catch { /* silent */ }
    }, 2000);
    return () => clearInterval(pollInterval);
  }, [phase, exam, examId]);

  // Build save payload
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const textAnswersRef = useRef(textAnswers);
  textAnswersRef.current = textAnswers;

  const buildSavePayload = useCallback(() => {
    const mcPayloads = Object.entries(answersRef.current)
      .map(([questionId, ids]) => ({
        question_id: questionId,
        selected_answer_id: ids[0] || null,
        selected_answer_ids: ids,
      }));
    const textPayloads = Object.entries(textAnswersRef.current)
      .filter(([, text]) => text.trim())
      .map(([questionId, text]) => ({
        question_id: questionId,
        selected_answer_id: null,
        selected_answer_ids: [] as string[],
        text_answer: text,
      }));
    return [...mcPayloads, ...textPayloads];
  }, []);

  const saveAnswersNow = useCallback(() => {
    const payload = buildSavePayload();
    if (payload.length === 0) return;
    try {
      fetch(`/api/otisak/exams/${examId}/attempt`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', answers: payload }),
        keepalive: true,
      });
    } catch { /* best effort */ }
  }, [examId, buildSavePayload]);

  // Warn before leaving + save on unload
  useEffect(() => {
    if (phase !== 'exam') return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'The exam is in progress. Are you sure you want to leave?';
      saveAnswersNow();
      return e.returnValue;
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveAnswersNow();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [phase, saveAnswersNow]);

  // Auto-save every 30s
  useEffect(() => {
    if (phase !== 'exam' || !attempt) return;
    const interval = setInterval(() => {
      const payload = buildSavePayload();
      if (payload.length === 0) return;
      fetch(`/api/otisak/exams/${examId}/attempt`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', answers: payload }),
      }).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [phase, attempt, examId, buildSavePayload]);

  // Poll for lockdown every 3 seconds
  useEffect(() => {
    if (phase !== 'exam') return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/otisak/exams/${examId}/lockdown`);
        if (res.ok) {
          const data = await res.json();
          setLockdown(!!data.lockdown?.is_active);
          if (data.lockdown?.message) setLockdownMessage(data.lockdown.message);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(poll);
  }, [phase, examId]);

  // Select answer
  const handleSelectAnswer = (answerId: string) => {
    const q = questions[currentQIndex];
    if (!q) return;
    if (q.multi_answer) {
      setAnswers((prev) => {
        const current = prev[q.id] || [];
        const deselecting = current.includes(answerId);
        trackEvent(deselecting ? 'answer_deselected' : 'answer_selected', { question_id: q.id, question_index: currentQIndex, answer_id: answerId });
        return { ...prev, [q.id]: deselecting ? current.filter((id) => id !== answerId) : [...current, answerId] };
      });
    } else {
      setAnswers((prev) => {
        const current = prev[q.id] || [];
        const deselecting = current.includes(answerId);
        trackEvent(deselecting ? 'answer_deselected' : 'answer_selected', { question_id: q.id, question_index: currentQIndex, answer_id: answerId });
        return { ...prev, [q.id]: deselecting ? [] : [answerId] };
      });
    }
  };

  const handleNext = () => {
    if (currentQIndex < questions.length - 1) {
      trackEvent('question_next', { from: currentQIndex, to: currentQIndex + 1 });
      setCurrentQIndex((p) => p + 1); setMatchingSelectedLeft(null);
    }
  };
  const handlePrev = () => {
    if (currentQIndex > 0) {
      trackEvent('question_prev', { from: currentQIndex, to: currentQIndex - 1 });
      setCurrentQIndex((p) => p - 1); setMatchingSelectedLeft(null);
    }
  };

  // Submit exam
  const handleFinish = useCallback(async (method: 'manual' | 'timeout' = 'manual') => {
    if (phase === 'submitting') return;
    trackEvent('exam_submit', { method, answered: Object.keys(answers).length + Object.keys(textAnswers).length });
    flushEvents();
    setPhase('submitting');

    const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const answerPayload = questions.map((q) => ({
      question_id: q.id,
      selected_answer_id: ['open_text', 'ordering', 'matching', 'fill_blank'].includes(q.type) ? null : (answers[q.id]?.[0] || null),
      selected_answer_ids: ['open_text', 'ordering', 'matching', 'fill_blank'].includes(q.type) ? [] : (answers[q.id] || []),
      ...(['open_text', 'ordering', 'matching', 'fill_blank'].includes(q.type) ? { text_answer: textAnswers[q.id] || '' } : {}),
    }));

    try {
      const res = await fetch(`/api/otisak/exams/${examId}/attempt`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', answers: answerPayload, time_spent_seconds: timeSpent }),
      });
      if (res.ok) navigate(`/exam/${examId}/results`);
    } catch (e) {
      console.error('Failed to submit:', e);
      setPhase('exam');
    }
  }, [phase, questions, answers, textAnswers, examId, navigate]);

  const handleTimerExpire = useCallback(() => {
    saveAnswersNow();
    handleFinish('timeout');
  }, [saveAnswersNow, handleFinish]);

  // Answered indices for nav
  const answeredIndices = new Set<number>();
  questions.forEach((q, i) => {
    if (['open_text', 'ordering', 'matching', 'fill_blank'].includes(q.type)) {
      if (textAnswers[q.id]?.trim()) answeredIndices.add(i);
    } else {
      if (answers[q.id]?.length) answeredIndices.add(i);
    }
  });

  // ========================================
  // LOADING
  // ========================================
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // ========================================
  // LOBBY
  // ========================================
  if (phase === 'lobby') {
    return (
      <div className="min-h-screen w-full bg-[#0a0a14] flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-blue-600/20 rounded-full blur-[150px] animate-pulse" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-blue-600/15 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        <div className="z-10 w-full max-w-2xl px-4 sm:px-6 flex flex-col items-center text-center">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="flex items-center gap-6 sm:gap-10 mb-8 sm:mb-12 opacity-90">
            <OtisakLogo className="w-14 h-14 sm:w-20 sm:h-20 drop-shadow-[0_0_15px_rgba(59,130,246,0.4)]" />
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.2 }} className="flex flex-col items-center mb-8 sm:mb-14">
            <h1 className="text-3xl sm:text-5xl font-light text-white mb-2 tracking-[0.2em] drop-shadow-lg">OTISAK</h1>
            <span className="text-xs text-blue-400/80 tracking-[0.4em] uppercase font-medium">v 2.0</span>
          </motion.div>

          {user && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.4 }} className="flex flex-col items-center mb-8 sm:mb-14 w-full">
              <div className="mb-3 text-gray-400 text-xs sm:text-sm uppercase tracking-widest font-medium">{t('exam.loggedInAs')}</div>
              <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-8 py-3 sm:py-4 bg-[#131520]/80 border border-blue-500/20 rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.3)] backdrop-blur-sm max-w-full">
                <span className="text-base sm:text-2xl text-white font-light tracking-wide truncate">
                  {user.name || t('exam.student')}
                  {user.index_number && (
                    <><span className="text-blue-500/50 mx-1 sm:mx-2">|</span><span className="font-mono text-blue-300">{user.index_number}</span></>
                  )}
                </span>
              </div>
            </motion.div>
          )}

          <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: '100%' }} transition={{ duration: 0.8, delay: 0.6 }} className="w-full max-w-sm sm:max-w-lg mb-10 relative">
            <div className="h-2 bg-gray-800/50 rounded-full overflow-hidden border border-gray-700/50 shadow-inner">
              <div className="h-full bg-gradient-to-r from-blue-600 via-blue-400 to-blue-600 w-full origin-left animate-[otisak-progress_2s_ease-in-out_infinite] shadow-[0_0_15px_rgba(59,130,246,0.6)]" />
            </div>
            <div className="absolute -bottom-6 left-0 w-full text-center">
              <span className="text-blue-400/60 text-[10px] uppercase tracking-widest animate-pulse">{t('exam.waitingForInstructor')}</span>
            </div>
          </motion.div>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.8 }} className="text-gray-300 text-xs sm:text-sm mb-10 sm:mb-16 mt-6 max-w-md leading-relaxed font-light px-2">
            {t('exam.waitingDesc')}
          </motion.p>

          <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 1 }} onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 px-6 sm:px-8 py-2.5 sm:py-3 bg-red-500/5 hover:bg-red-500/10 text-red-400/80 hover:text-red-400 text-xs font-medium rounded-lg transition-all border border-red-500/20 hover:border-red-500/40 mb-12 sm:mb-20 uppercase tracking-wider">
            <Power className="w-3 h-3" />{t('exam.back')}
          </motion.button>

          {exam?.negative_points_enabled && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 1.1 }} className="max-w-lg w-full mb-8">
              <div className="relative overflow-hidden rounded-xl border border-red-500/15 bg-red-500/[0.04] backdrop-blur-sm">
                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-red-500/60 to-red-500/20" />
                <div className="px-5 py-4 flex items-start gap-3.5">
                  <div className="p-1.5 rounded-lg bg-red-500/10 mt-0.5"><AlertTriangle className="w-3.5 h-3.5 text-red-400/80" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-red-300/90 uppercase tracking-wider mb-1.5">{t('exam.negativePoints')}</p>
                    <p className="text-[12px] text-gray-400/80 leading-relaxed">After {exam.negative_points_threshold} wrong answer(s), each additional wrong answer deducts {exam.negative_points_value} point(s).</p>
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-red-500/10">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Threshold: {exam.negative_points_threshold}</span>
                      <div className="w-px h-3 bg-red-400/15" />
                      <span className="text-xs font-bold text-red-400/70 font-mono">-{exam.negative_points_value} pts</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 1.2 }} className="text-xs text-gray-500/60 max-w-lg leading-relaxed border-t border-gray-800/50 pt-6">
            <p className="mb-2">{t('exam.cheatingWarning')}</p>
            <p>{t('exam.disciplinaryWarning')}</p>
          </motion.div>
        </div>

        <div className="absolute bottom-0 w-full"><OtisakFooter /></div>

        <style>{`
          @keyframes otisak-progress {
            0% { transform: scaleX(0); opacity: 0.5; }
            50% { transform: scaleX(0.7); opacity: 1; }
            100% { transform: scaleX(1); opacity: 0; }
          }
        `}</style>
      </div>
    );
  }

  // ========================================
  // EXAM
  // ========================================
  const currentQuestion = questions[currentQIndex];
  const answeredCount = Object.values(answers).filter((v) => v.length > 0).length +
    Object.values(textAnswers).filter((v) => v.trim()).length;

  return (
    <div className="min-h-screen bg-[#0a0a14] flex flex-col relative overflow-hidden"
      onCopy={(e) => e.preventDefault()}
    >
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_0%_50%,_rgba(59,130,246,0.15),_transparent_50%)] blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(circle_at_100%_50%,_rgba(59,130,246,0.15),_transparent_50%)] blur-[120px]" />
      </div>

      <OtisakHeader
        user={user ? { name: user.name || null, index_number: user.index_number || null, avatar_url: user.avatar_url || null } : null}
        centerContent={
          attempt && exam ? (
            <OtisakTimer
              durationSeconds={exam.duration_minutes * 60}
              startedAt={(exam.exam_started_at || attempt.started_at) as unknown as string}
              onExpire={handleTimerExpire}
            />
          ) : null
        }
      />

      <main className="flex-1 max-w-4xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 z-10 flex flex-col justify-center min-h-[400px] sm:min-h-[500px]">
        {exam?.negative_points_enabled && phase === 'exam' && (
          <div className="flex items-center justify-center mb-5">
            <div className="inline-flex items-center gap-3 py-2 px-4 rounded-full bg-red-500/[0.06] border border-red-500/10">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 text-red-400/50" />
                <span className="text-[10px] text-red-300/40 font-semibold uppercase tracking-wider">{t('exam.negativePoints')}</span>
              </div>
              <div className="w-px h-3 bg-red-400/15" />
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500">Threshold: {exam.negative_points_threshold}</span>
                <span className="text-[11px] font-bold text-red-400/60 font-mono">-{exam.negative_points_value}</span>
              </div>
            </div>
          </div>
        )}

        {phase === 'submitting' ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
            <p className="text-gray-400 text-sm">{t('exam.submitting')}</p>
          </div>
        ) : currentQuestion ? (
          <>
            <AnimatePresence mode="wait">
              <motion.div key={currentQIndex} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="w-full">
                <div className="text-blue-400/60 text-[10px] sm:text-xs uppercase tracking-widest mb-3 sm:mb-4 font-medium">
                  {t('exam.question', { current: currentQIndex + 1, total: questions.length })}
                  {currentQuestion.points && <span className="ml-2 text-gray-500">&#8226; {currentQuestion.points} {currentQuestion.points === 1 ? t('exam.point') : t('exam.points')}</span>}
                </div>

                <h2 className="text-lg sm:text-2xl text-white mb-4 sm:mb-6 font-light leading-relaxed drop-shadow-md">
                  {currentQuestion.text}
                </h2>

                {currentQuestion.type === 'image' && currentQuestion.content && (
                  <div className="mb-6 bg-white p-2 rounded-lg max-w-2xl mx-auto shadow-2xl">
                    <img src={currentQuestion.content} alt="Question content" className="w-full h-auto rounded" />
                  </div>
                )}

                {currentQuestion.type === 'code' && currentQuestion.content && (
                  <CodeBlock code={currentQuestion.content} />
                )}

                <div className="space-y-1.5 sm:space-y-2 mb-6 sm:mb-8">
                  {currentQuestion.type === 'open_text' ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-purple-500/15 flex items-center justify-center">
                            <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </div>
                          <p className="text-purple-300/80 text-xs font-medium uppercase tracking-wider">{t('exam.typeAnswer')}</p>
                        </div>
                        <span className="text-[10px] text-purple-400/40 font-mono">{t('exam.aiGraded')}</span>
                      </div>
                      <div className="relative">
                        <textarea
                          value={textAnswers[currentQuestion.id] || ''}
                          onChange={(e) => setTextAnswers(prev => ({ ...prev, [currentQuestion.id]: e.target.value }))}
                          className="w-full bg-[#131520]/80 border border-purple-500/20 rounded-xl px-5 py-4 text-white text-sm leading-relaxed focus:outline-none focus:border-purple-500/50 focus:shadow-[0_0_20px_rgba(168,85,247,0.1)] resize-none min-h-[180px] placeholder-white/15 transition-all"
                          placeholder={t('exam.answerPlaceholder')}
                          rows={8}
                        />
                        <div className="absolute bottom-3 right-4 text-[10px] text-purple-400/30 font-mono">
                          {(textAnswers[currentQuestion.id] || '').length} {t('exam.characters')}
                        </div>
                      </div>
                    </div>
                  ) : currentQuestion.type === 'ordering' ? (() => {
                    const cData = (() => { try { return JSON.parse(currentQuestion.content || '{}'); } catch { return {}; } })();
                    const items: string[] = cData.items || [];
                    const currentOrder: string[] = (() => {
                      try { const p = JSON.parse(textAnswers[currentQuestion.id] || ''); if (Array.isArray(p)) return p; } catch {}
                      const sh = [...items];
                      let s = 0;
                      for (let c = 0; c < currentQuestion.id.length; c++) s = ((s << 5) - s + currentQuestion.id.charCodeAt(c)) | 0;
                      for (let i = sh.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) & 0x7fffffff; const j = s % (i + 1); [sh[i], sh[j]] = [sh[j], sh[i]]; }
                      return sh;
                    })();
                    const moveItem = (from: number, to: number) => {
                      const o = [...currentOrder]; const [it] = o.splice(from, 1); o.splice(to, 0, it);
                      setTextAnswers(prev => ({ ...prev, [currentQuestion.id]: JSON.stringify(o) }));
                    };
                    return (
                      <div className="space-y-2">
                        <p className="text-blue-400/70 text-xs italic mb-2">{t('exam.orderItems')}</p>
                        {currentOrder.map((item, i) => (
                          <div key={`${item}-${i}`} className="flex items-center gap-2 bg-[#131520]/80 border border-blue-500/20 rounded-lg px-4 py-3">
                            <span className="text-blue-400 font-mono text-sm w-6 text-center flex-shrink-0">{i + 1}.</span>
                            <span className="text-white text-sm flex-1">{item}</span>
                            <div className="flex flex-col gap-0.5 flex-shrink-0">
                              <button type="button" disabled={i === 0} onClick={() => moveItem(i, i - 1)} className="p-1 rounded hover:bg-white/10 disabled:opacity-20 transition-colors">
                                <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                              </button>
                              <button type="button" disabled={i === currentOrder.length - 1} onClick={() => moveItem(i, i + 1)} className="p-1 rounded hover:bg-white/10 disabled:opacity-20 transition-colors">
                                <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })() : currentQuestion.type === 'matching' ? (() => {
                    const cData = (() => { try { return JSON.parse(currentQuestion.content || '{}'); } catch { return {}; } })();
                    const left: string[] = cData.left || [];
                    const right: string[] = cData.right || [];
                    const curMatches: Record<string, string> = (() => { try { return JSON.parse(textAnswers[currentQuestion.id] || '{}'); } catch { return {}; } })();
                    const selLeft = matchingSelectedLeft;
                    const usedRight = new Set(Object.values(curMatches));
                    return (
                      <div className="space-y-4">
                        <p className="text-blue-400/70 text-xs italic mb-2">{t('exam.matchItems')}</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            {left.map((item, i) => {
                              const matched = curMatches[item] !== undefined;
                              const active = selLeft === item;
                              return (
                                <button key={`left-${i}`} type="button" onClick={() => {
                                  if (matched) { const nm = { ...curMatches }; delete nm[item]; setTextAnswers(prev => ({ ...prev, [currentQuestion.id]: JSON.stringify(nm) })); setMatchingSelectedLeft(null); }
                                  else { setMatchingSelectedLeft(active ? null : item); }
                                }} className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all ${active ? 'border-blue-500 bg-blue-500/10 text-blue-300' : matched ? 'border-green-500/30 bg-green-500/[0.06] text-green-300' : 'border-gray-700 bg-[#131520]/80 text-white hover:border-blue-500/50'}`}>
                                  {item}{matched && <span className="block text-[10px] text-green-400/60 mt-1">&#8594; {curMatches[item]}</span>}
                                </button>
                              );
                            })}
                          </div>
                          <div className="space-y-2">
                            {right.map((item, i) => {
                              const used = usedRight.has(item);
                              return (
                                <button key={`right-${i}`} type="button" disabled={!selLeft || used} onClick={() => {
                                  if (selLeft && !used) { const nm = { ...curMatches, [selLeft]: item }; setTextAnswers(prev => ({ ...prev, [currentQuestion.id]: JSON.stringify(nm) })); setMatchingSelectedLeft(null); }
                                }} className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all ${used ? 'border-green-500/30 bg-green-500/[0.06] text-green-300/50' : selLeft ? 'border-gray-600 bg-[#131520]/80 text-white hover:border-blue-500/50 cursor-pointer' : 'border-gray-700 bg-[#131520]/80 text-gray-400'}`}>
                                  {item}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })() : currentQuestion.type === 'fill_blank' ? (() => {
                    const cData = (() => { try { return JSON.parse(currentQuestion.content || '{}'); } catch { return {}; } })();
                    const blanks: Array<{ id: string }> = cData.blanks || [];
                    const curFills: Record<string, string> = (() => { try { return JSON.parse(textAnswers[currentQuestion.id] || '{}'); } catch { return {}; } })();
                    const parts = currentQuestion.text.split(/(___[A-Z0-9_]+___)/g);
                    return (
                      <div className="space-y-4">
                        <div className="bg-[#131520]/80 border border-blue-500/20 rounded-xl px-5 py-4 text-white text-sm leading-loose">
                          {parts.map((part, i) => {
                            const m = part.match(/^___([A-Z0-9_]+)___$/);
                            if (m) {
                              const bid = m[1];
                              return (<input key={`blank-${bid}-${i}`} type="text" value={curFills[bid] || ''} onChange={(e) => { const nf = { ...curFills, [bid]: e.target.value }; setTextAnswers(prev => ({ ...prev, [currentQuestion.id]: JSON.stringify(nf) })); }} className="inline-block w-32 sm:w-40 mx-1 px-3 py-1 bg-blue-500/10 border-b-2 border-blue-500/40 text-blue-300 text-sm focus:outline-none focus:border-blue-500 transition-colors rounded-t placeholder-blue-300/30" placeholder="..." />);
                            }
                            return <span key={`text-${i}`}>{part}</span>;
                          })}
                        </div>
                        <p className="text-[10px] text-blue-400/40">{blanks.length} {t('exam.blanksToFill')}</p>
                      </div>
                    );
                  })() : (
                    <>
                      {currentQuestion.multi_answer && (
                        <p className="text-blue-400/70 text-xs italic mb-1">{t('exam.selectAll')}</p>
                      )}
                      {currentQuestion.answers.map((answer, i) => (
                        <AnswerOption
                          key={answer.id}
                          id={answer.id}
                          text={answer.text}
                          label={ANSWER_LABELS[i] || String(i + 1)}
                          selected={(answers[currentQuestion.id] || []).includes(answer.id)}
                          onSelect={handleSelectAnswer}
                          multiSelect={currentQuestion.multi_answer}
                        />
                      ))}
                    </>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>

            <QuestionNav
              totalQuestions={questions.length}
              currentIndex={currentQIndex}
              answeredQuestions={answeredIndices}
              onSelect={(i: number) => setCurrentQIndex(i)}
              onNext={handleNext}
              onPrev={handlePrev}
            />

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center mt-6">
              <button type="button" onClick={() => handleFinish('manual')}
                className="px-6 sm:px-8 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-[0_0_25px_rgba(37,99,235,0.4)] hover:shadow-[0_0_35px_rgba(37,99,235,0.6)] transition-all uppercase tracking-widest text-xs sm:text-sm hover:-translate-y-1">
                {t('exam.finishExam')}
              </button>
            </motion.div>
          </>
        ) : (
          <div className="text-center text-gray-400 py-20"><p>{t('exam.noQuestions')}</p></div>
        )}
      </main>

      {/* Scratch Notes Toggle */}
      <button type="button" onClick={() => setShowNotes(!showNotes)}
        className={`fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-lg ${
          showNotes ? 'bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 shadow-[0_0_20px_rgba(234,179,8,0.2)]'
            : scratchNotes ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-500/60 hover:text-yellow-400 hover:bg-yellow-500/20'
              : 'bg-white/5 border border-white/10 text-gray-500 hover:text-yellow-400 hover:bg-yellow-500/10 hover:border-yellow-500/20'
        }`} title={t('exam.scratchNotes')}>
        <StickyNote className="w-4.5 h-4.5" />
        {scratchNotes && !showNotes && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-yellow-500 border border-[#0a0a14]" />}
      </button>

      {/* Scratch Notes Panel */}
      <AnimatePresence>
        {showNotes && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] sm:hidden" onClick={() => setShowNotes(false)} />
            <motion.div initial={{ opacity: 0, x: 300 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 300 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[340px] bg-[#0d0d1a]/95 border-l border-yellow-500/10 backdrop-blur-xl shadow-[-20px_0_60px_rgba(0,0,0,0.5)] flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-yellow-500/10">
                <div className="flex items-center gap-2">
                  <StickyNote className="w-4 h-4 text-yellow-500/60" />
                  <span className="text-sm font-medium text-yellow-200/80 uppercase tracking-wider">{t('exam.scratchNotes')}</span>
                </div>
                <button type="button" onClick={() => setShowNotes(false)} className="p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 p-3">
                <textarea value={scratchNotes} onChange={(e) => setScratchNotes(e.target.value)}
                  className="w-full h-full bg-yellow-500/[0.02] border border-yellow-500/10 rounded-lg px-4 py-3 text-yellow-100/70 text-xs font-mono leading-relaxed focus:outline-none focus:border-yellow-500/25 resize-none placeholder-yellow-500/20"
                  placeholder={t('exam.scratchPlaceholder')} autoFocus />
              </div>
              <div className="px-4 py-2.5 border-t border-yellow-500/10">
                <p className="text-[9px] text-yellow-500/30 text-center">{t('exam.scratchFooter')}</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <OtisakFooter />

      {/* LOCKDOWN OVERLAY */}
      <AnimatePresence>
        {lockdown && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#1a0505] flex flex-col items-center justify-center"
          >
            {/* Red background glows */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-red-600/30 rounded-full blur-[150px] animate-pulse" />
              <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-red-600/20 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '1s' }} />
            </div>

            <div className="z-10 flex flex-col items-center text-center px-6 max-w-lg">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 15 }}
                className="w-24 h-24 rounded-full bg-red-500/20 border-2 border-red-500/40 flex items-center justify-center mb-8"
              >
                <ShieldAlert className="w-12 h-12 text-red-400" strokeWidth={1.5} />
              </motion.div>

              <motion.h1
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-3xl sm:text-4xl font-light text-red-400 tracking-[0.2em] uppercase mb-4 drop-shadow-[0_0_20px_rgba(239,68,68,0.4)]"
              >
                RAD ZABRANJEN
              </motion.h1>

              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-red-300/60 text-sm sm:text-base leading-relaxed mb-8"
              >
                {lockdownMessage || 'Administrator je zabranio rad na racunarima. Sacekajte dalju instrukciju.'}
              </motion.p>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="flex items-center gap-3 px-6 py-3 bg-red-500/10 border border-red-500/20 rounded-xl"
              >
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-red-400/80 text-xs uppercase tracking-widest font-medium">
                  Ispit je pauziran od strane administratora
                </span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="mt-12 text-red-500/30 text-[10px] uppercase tracking-widest"
              >
                Ne zatvarajte ovaj prozor. Rad ce biti nastavljen automatski.
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
