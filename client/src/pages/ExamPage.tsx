import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Power, AlertTriangle, StickyNote, X, PauseCircle } from 'lucide-react';
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
import { useTheme } from '../components/ThemeProvider';
import { useExamSocket } from '../lib/useExamSocket';
import { useToast } from '../components/Toast';
import { ToggleCluster } from '../components/ToggleCluster';
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

type Phase = 'loading' | 'lobby' | 'awaitingApproval' | 'exam' | 'submitting';

const ANSWER_LABELS = 'ABCDEFGHIJ';

export default function ExamPage() {
  const navigate = useNavigate();
  const { examId } = useParams();
  const { t } = useLang();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const toast = useToast();

  // Centralized theme tokens used across loading/awaiting/lobby + main exam render.
  // Each value is the same idea (bg surface, body text, accent text, etc.) — they just
  // resolve to dark-themed values when `isDark` is true and light values otherwise.
  const pageBg = isDark ? 'bg-[#0a0a14]' : 'bg-[#F8FAFC]';
  const titleText = isDark ? 'text-white' : 'text-slate-900';
  const subText = isDark ? 'text-gray-400' : 'text-slate-500';
  const subTextStrong = isDark ? 'text-gray-300' : 'text-slate-600';
  const blueLabel = isDark ? 'text-blue-400/80' : 'text-blue-600/80';
  const surfaceCard = isDark
    ? 'bg-[#131520]/80 border-blue-500/20'
    : 'bg-white border-slate-200 shadow-sm';

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
  const [pausedSeconds, setPausedSeconds] = useState(0);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  // Sync re-entry guard for handleFinish. The phase==='submitting' check is
  // racy because setState lands a frame late: timer expiry + manual submit
  // landing on the same tick can both pass it. Refs are read/written
  // synchronously, so this catches the duplicate before the second POST.
  const submittingRef = useRef(false);
  // Tracks whether the component is still mounted. Used to skip setState
  // calls in long-running async chains (submit retry, navigation races).
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

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
        if (!sessionRes.ok) { navigate(`/join/${examId}`, { replace: true }); return; }
        const sessionData = await sessionRes.json();
        if (!sessionData.authenticated) { navigate(`/join/${examId}`, { replace: true }); return; }

        if (mounted) {
          setUser({
            name: sessionData.user?.name,
            email: sessionData.user?.email,
            avatar_url: sessionData.user?.avatar_url,
            index_number: sessionData.user?.index_number,
          });
        }

        const examRes = await fetch(`/api/otisak/exams/${examId}`, { credentials: 'include' });
        if (!examRes.ok) { if (mounted) navigate('/'); return; }
        const examData = await examRes.json();

        if (mounted) {
          setExam(examData.exam);

          if (examData.alreadySubmitted) {
            navigate(`/exam/${examId}/results`, { replace: true });
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
              const restoredText: Record<string, string> = {};
              for (const sa of examData.savedAnswers) {
                if (!sa.question_id) continue;
                if (Array.isArray(sa.selected_answer_ids) && sa.selected_answer_ids.length > 0) {
                  restored[sa.question_id] = sa.selected_answer_ids;
                }
                if (typeof sa.text_answer === 'string' && sa.text_answer.length > 0) {
                  restoredText[sa.question_id] = sa.text_answer;
                }
              }
              setAnswers(restored);
              setTextAnswers(restoredText);
            }

            // If exam hasn't been started by admin yet, show lobby
            if (examData.exam.status === 'active' && !examData.exam.exam_started_at) {
              setPhase('lobby');
            } else {
              setPhase('exam');
            }
          } else if (examData.pendingRequest?.type === 'late_join') {
            // Late joiner: server has created a request, awaiting admin approval.
            setPhase('awaitingApproval');
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
        if (mounted) navigate('/');
      }
    })();
    return () => { mounted = false; };
  }, [examId, navigate]);

  // Poll while awaiting admin approval of a late_join request
  useEffect(() => {
    if (phase !== 'awaitingApproval') return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/otisak/exams/${examId}`, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.alreadySubmitted) { navigate(`/exam/${examId}/results`, { replace: true }); return; }
        if (data.attempt) {
          // Approved! Load the exam and start.
          setExam(data.exam);
          setQuestions(data.questions || []);
          setAttempt(data.attempt);
          if (Array.isArray(data.savedAnswers)) {
            const restored: Record<string, string[]> = {};
            const restoredText: Record<string, string> = {};
            for (const sa of data.savedAnswers) {
              if (!sa.question_id) continue;
              if (Array.isArray(sa.selected_answer_ids) && sa.selected_answer_ids.length > 0) {
                restored[sa.question_id] = sa.selected_answer_ids;
              }
              if (typeof sa.text_answer === 'string' && sa.text_answer.length > 0) {
                restoredText[sa.question_id] = sa.text_answer;
              }
            }
            setAnswers(restored);
            setTextAnswers(restoredText);
          }
          const tStart = data.exam.exam_started_at ? new Date(data.exam.exam_started_at).getTime() : new Date(data.attempt.started_at).getTime();
          startTimeRef.current = tStart;
          setPhase('exam');
        } else if (!data.pendingRequest) {
          // Request denied or removed by admin — kick back to home.
          navigate('/', { replace: true });
        }
      } catch { /* silent */ }
    }, 2000);
    return () => clearInterval(poll);
  }, [phase, examId, navigate]);

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
        if (!data.exam_started_at) return;

        clearInterval(pollInterval);
        // Reload exam data so we know whether the student now has an attempt,
        // is awaiting late-join approval, or has already submitted.
        const examRes = await fetch(`/api/otisak/exams/${examId}`, { credentials: 'include' });
        if (!examRes.ok) return;
        const examData = await examRes.json();
        if (examData.alreadySubmitted) {
          navigate(`/exam/${examId}/results`, { replace: true });
          return;
        }
        if (examData.exam) setExam(examData.exam);
        if (examData.attempt) {
          setQuestions(examData.questions || []);
          setAttempt(examData.attempt);
          startTimeRef.current = new Date(examData.exam.exam_started_at || data.exam_started_at).getTime();
          setPhase('exam');
        } else if (examData.pendingRequest?.type === 'late_join') {
          setPhase('awaitingApproval');
        }
        // else: stay in lobby; the next poll cycle will retry.
      } catch { /* silent */ }
    }, 2000);
    return () => clearInterval(pollInterval);
  }, [phase, exam, examId, navigate]);

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
        body: JSON.stringify({ answers: payload }),
        keepalive: true,
      });
    } catch { /* best effort */ }
  }, [examId, buildSavePayload]);

  // ============================================================================
  // WebSocket: live push channel for admin commands.
  // The HTTP polls below remain as a fallback so the UI keeps working if the
  // socket drops or the server hasn't broadcasted yet.
  // ============================================================================
  useExamSocket(examId, useCallback((evt) => {
    if (evt.type === 'lockdown.changed') {
      setLockdown(!!evt.is_active);
      if (evt.is_active && evt.message) setLockdownMessage(evt.message);
    } else if (evt.type === 'timer.adjusted') {
      setExam((prev) => (prev && prev.extra_seconds !== evt.extra_seconds ? { ...prev, extra_seconds: evt.extra_seconds } : prev));
      const minutes = Math.round(Number(evt.delta_seconds || 0) / 60);
      if (minutes !== 0) {
        toast.info(t(minutes > 0 ? 'exam.toast.timerAdded' : 'exam.toast.timerRemoved', { minutes: Math.abs(minutes) }));
      }
    } else if (evt.type === 'exam.finished') {
      // Admin closed the exam for everyone. If they asked us to redirect,
      // bounce home; otherwise drop into the results screen which the
      // server-side finishAllAttempts will have created.
      const redirect = (evt as unknown as { redirect?: boolean }).redirect === true;
      if (redirect) {
        toast.warning(t('exam.toast.finishedRedirect'));
        navigate('/', { replace: true });
      } else {
        toast.info(t('exam.toast.finishedByAdmin'));
        navigate(`/exam/${examId}/results`, { replace: true });
      }
    } else if (evt.type === 'exam.started' || evt.type === 'request.decided') {
      // Trigger a refetch of /exams/:id so the lobby/awaiting-approval flow advances immediately.
      // Done via a small ping flag so we don't duplicate the load logic here.
      (async () => {
        try {
          const res = await fetch(`/api/otisak/exams/${examId}`, { credentials: 'include' });
          if (!res.ok) return;
          const data = await res.json();
          if (data.alreadySubmitted) { navigate(`/exam/${examId}/results`, { replace: true }); return; }
          if (data.exam) setExam(data.exam);
          if (Array.isArray(data.questions) && data.questions.length > 0) setQuestions(data.questions);
          if (data.attempt) {
            setAttempt(data.attempt);
            const tStart = data.exam?.exam_started_at ? new Date(data.exam.exam_started_at).getTime() : new Date(data.attempt.started_at).getTime();
            startTimeRef.current = tStart;
            if (Array.isArray(data.savedAnswers)) {
              const restored: Record<string, string[]> = {};
              const restoredText: Record<string, string> = {};
              for (const sa of data.savedAnswers) {
                if (!sa.question_id) continue;
                if (Array.isArray(sa.selected_answer_ids) && sa.selected_answer_ids.length > 0) restored[sa.question_id] = sa.selected_answer_ids;
                if (typeof sa.text_answer === 'string' && sa.text_answer.length > 0) restoredText[sa.question_id] = sa.text_answer;
              }
              setAnswers(restored);
              setTextAnswers(restoredText);
            }
            if (phase !== 'exam') setPhase('exam');
          } else if (data.pendingRequest) {
            if (phase !== 'awaitingApproval') setPhase('awaitingApproval');
          } else if (phase === 'awaitingApproval') {
            // No attempt and no pending request anymore = denied or cancelled.
            navigate('/', { replace: true });
          }
        } catch { /* fallback to polling */ }
      })();
    }
  }, [examId, navigate, phase, t, toast]));

  // Warn before leaving + save on unload
  useEffect(() => {
    if (phase !== 'exam') return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = t('exam.leaveWarning');
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

  // Auto-save every 5s. Tighter than the old 30s cadence so admin's live-stats poll
  // (also 5s) sees up-to-date `answered_count` per student instead of 30s-stale data.
  useEffect(() => {
    if (phase !== 'exam' || !attempt) return;
    const interval = setInterval(() => {
      const payload = buildSavePayload();
      if (payload.length === 0) return;
      fetch(`/api/otisak/exams/${examId}/attempt`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: payload }),
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [phase, attempt, examId, buildSavePayload]);

  // Poll for lockdown every 3 seconds (also returns total paused seconds)
  useEffect(() => {
    if (phase !== 'exam') return;
    const fetchOnce = async () => {
      try {
        const res = await fetch(`/api/otisak/exams/${examId}/lockdown`);
        if (res.ok) {
          const data = await res.json();
          setLockdown(!!data.lockdown?.is_active);
          if (data.lockdown?.message) setLockdownMessage(data.lockdown.message);
          if (typeof data.paused_seconds === 'number') setPausedSeconds(data.paused_seconds);
          // Pick up admin-side timer adjustments live.
          if (typeof data.extra_seconds === 'number') {
            setExam((prev) => (prev && prev.extra_seconds !== data.extra_seconds ? { ...prev, extra_seconds: data.extra_seconds } : prev));
          }
        }
      } catch {}
    };
    fetchOnce();
    const poll = setInterval(fetchOnce, 3000);
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

  // Submit exam. Single source of truth for the final POST. Idempotent on
  // both sides: re-entry guard on the client + transactional finishAttempt
  // on the server (SELECT ... FOR UPDATE), so duplicate calls are harmless.
  const handleFinish = useCallback(async (method: 'manual' | 'timeout' = 'manual') => {
    if (submittingRef.current) return;
    submittingRef.current = true;
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

    const body = JSON.stringify({ submit: true, answers: answerPayload, time_spent_seconds: timeSpent });
    // keepalive: true lets the request complete even if the user navigates
    // away (or the browser kills the tab) immediately after firing it. Combined
    // with the retry below, the practical outcome is "always lands at least once".
    const doPost = () => fetch(`/api/otisak/exams/${examId}/attempt`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });

    let res: Response | null = null;
    try {
      res = await doPost();
    } catch (netErr) {
      console.warn('Submit network error, retrying once:', netErr);
      try {
        await new Promise((r) => setTimeout(r, 1000));
        res = await doPost();
      } catch (e) {
        console.error('Submit retry also failed:', e);
      }
    }

    if (res && res.ok) {
      navigate(`/exam/${examId}/results`);
      return;
    }

    // Both attempts failed (network or non-2xx). Hand the user back to the
    // exam UI so they can retry manually rather than getting stuck on a
    // submitting spinner. Skip the setState if we've unmounted in the meantime.
    if (mountedRef.current) {
      submittingRef.current = false;
      setPhase('exam');
    }
  }, [questions, answers, textAnswers, examId, navigate, trackEvent, flushEvents]);

  const handleTimerExpire = useCallback(() => {
    if (submittingRef.current) return;
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
      <div className={`min-h-screen ${pageBg} flex items-center justify-center transition-colors`}>
        <ToggleCluster variant="solid" position="fixed" />
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // ========================================
  // AWAITING APPROVAL (late join)
  // ========================================
  if (phase === 'awaitingApproval') {
    return (
      <div className={`min-h-screen w-full ${pageBg} flex flex-col items-center justify-center relative overflow-hidden transition-colors`}>
        <ToggleCluster variant="solid" position="fixed" />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className={`absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] animate-pulse ${isDark ? 'bg-sky-500/[0.09]' : 'bg-sky-300/20'}`} />
          <div className={`absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] animate-pulse ${isDark ? 'bg-blue-600/[0.10]' : 'bg-blue-400/20'}`} style={{ animationDelay: '1s' }} />
        </div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="z-10 w-full max-w-md px-6 flex flex-col items-center text-center">
          <OtisakLogo className="w-14 h-14 sm:w-16 sm:h-16 drop-shadow-[0_0_15px_rgba(59,130,246,0.4)] mb-8" />
          <div className={`w-20 h-20 rounded-2xl border flex items-center justify-center mb-6 ${isDark ? 'bg-sky-500/[0.08] border-sky-400/25 shadow-[0_0_40px_rgba(56,189,248,0.10)]' : 'bg-sky-50 border-sky-200 shadow-sm'}`}>
            <Loader2 className={`w-9 h-9 animate-spin ${isDark ? 'text-sky-300/85' : 'text-sky-600'}`} strokeWidth={1.5} />
          </div>
          <h1 className={`text-2xl sm:text-3xl font-light tracking-[0.2em] uppercase mb-3 ${titleText}`}>{t('exam.awaitingApproval.title')}</h1>
          <p className={`text-sm leading-relaxed mb-6 max-w-sm ${isDark ? 'text-slate-300/70' : 'text-slate-600'}`}>{t('exam.awaitingApproval.body')}</p>
          <div className={`flex items-center gap-3 px-5 py-2.5 rounded-full border ${isDark ? 'bg-sky-500/[0.06] border-sky-400/20' : 'bg-sky-50 border-sky-200'}`}>
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full rounded-full animate-ping ${isDark ? 'bg-sky-300/60' : 'bg-sky-500/70'}`} />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${isDark ? 'bg-sky-300' : 'bg-sky-600'}`} />
            </span>
            <span className={`text-[11px] uppercase tracking-[0.25em] font-medium ${isDark ? 'text-sky-200/85' : 'text-sky-700'}`}>{t('exam.awaitingApproval.pill')}</span>
          </div>
          <p className={`text-[10px] uppercase tracking-[0.2em] mt-12 ${isDark ? 'text-slate-500/60' : 'text-slate-500'}`}>{t('exam.awaitingApproval.dontClose')}</p>
        </motion.div>

        <div className="absolute bottom-0 w-full"><OtisakFooter /></div>
      </div>
    );
  }

  // ========================================
  // LOBBY
  // ========================================
  if (phase === 'lobby') {
    return (
      <div className={`min-h-screen w-full ${pageBg} flex flex-col items-center justify-center relative overflow-hidden transition-colors`}>
        <ToggleCluster variant="solid" position="fixed" />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className={`absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] animate-pulse ${isDark ? 'bg-blue-600/20' : 'bg-blue-400/30'}`} />
          <div className={`absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] animate-pulse ${isDark ? 'bg-blue-600/15' : 'bg-indigo-300/25'}`} style={{ animationDelay: '1s' }} />
        </div>

        <div className="z-10 w-full max-w-2xl px-4 sm:px-6 flex flex-col items-center text-center">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="flex items-center gap-6 sm:gap-10 mb-8 sm:mb-12 opacity-90">
            <OtisakLogo className="w-14 h-14 sm:w-20 sm:h-20 drop-shadow-[0_0_15px_rgba(59,130,246,0.4)]" />
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.2 }} className="flex flex-col items-center mb-8 sm:mb-14">
            <h1 className={`text-3xl sm:text-5xl font-light mb-2 tracking-[0.2em] ${titleText}`}>OTISAK</h1>
            <span className={`text-xs tracking-[0.4em] uppercase font-medium ${blueLabel}`}>v 2.0</span>
          </motion.div>

          {user && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.4 }} className="flex flex-col items-center mb-8 sm:mb-14 w-full">
              <div className={`mb-3 text-xs sm:text-sm uppercase tracking-widest font-medium ${subText}`}>{t('exam.loggedInAs')}</div>
              <div className={`flex items-center gap-3 sm:gap-4 px-4 sm:px-8 py-3 sm:py-4 rounded-xl backdrop-blur-sm max-w-full border ${surfaceCard}`}>
                <span className={`text-base sm:text-2xl font-light tracking-wide truncate ${titleText}`}>
                  {user.name || t('exam.student')}
                  {user.index_number && (
                    <><span className={`mx-1 sm:mx-2 ${isDark ? 'text-blue-500/50' : 'text-blue-400/60'}`}>|</span><span className={`font-mono ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>{user.index_number}</span></>
                  )}
                </span>
              </div>
            </motion.div>
          )}

          <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: '100%' }} transition={{ duration: 0.8, delay: 0.6 }} className="w-full max-w-sm sm:max-w-lg mb-10 relative">
            <div className={`h-2 rounded-full overflow-hidden border shadow-inner ${isDark ? 'bg-gray-800/50 border-gray-700/50' : 'bg-slate-200 border-slate-300'}`}>
              <div className="h-full bg-gradient-to-r from-blue-600 via-blue-400 to-blue-600 w-full origin-left animate-[otisak-progress_2s_ease-in-out_infinite] shadow-[0_0_15px_rgba(59,130,246,0.6)]" />
            </div>
            <div className="absolute -bottom-6 left-0 w-full text-center">
              <span className={`text-[10px] uppercase tracking-widest animate-pulse ${blueLabel}`}>{t('exam.waitingForInstructor')}</span>
            </div>
          </motion.div>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.8 }} className={`text-xs sm:text-sm mb-10 sm:mb-16 mt-6 max-w-md leading-relaxed font-light px-2 ${subTextStrong}`}>
            {t('exam.waitingDesc')}
          </motion.p>

          <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 1 }} onClick={() => navigate('/')}
            className={`flex items-center gap-2 px-6 sm:px-8 py-2.5 sm:py-3 text-xs font-medium rounded-lg transition-all border mb-12 sm:mb-20 uppercase tracking-wider ${isDark ? 'bg-red-500/5 hover:bg-red-500/10 text-red-400/80 hover:text-red-400 border-red-500/20 hover:border-red-500/40' : 'bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border-red-200 hover:border-red-300'}`}>
            <Power className="w-3 h-3" />{t('exam.back')}
          </motion.button>

          {exam?.negative_points_enabled && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 1.1 }} className="max-w-lg w-full mb-8">
              <div className={`relative overflow-hidden rounded-xl border backdrop-blur-sm ${isDark ? 'border-red-500/15 bg-red-500/[0.04]' : 'border-red-200 bg-red-50/60'}`}>
                <div className={`absolute left-0 top-0 bottom-0 w-[2px] ${isDark ? 'bg-gradient-to-b from-red-500/60 to-red-500/20' : 'bg-red-400/50'}`} />
                <div className="px-5 py-4 flex items-start gap-3.5">
                  <div className={`p-1.5 rounded-lg mt-0.5 ${isDark ? 'bg-red-500/10' : 'bg-red-100'}`}><AlertTriangle className={`w-3.5 h-3.5 ${isDark ? 'text-red-400/80' : 'text-red-600'}`} /></div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-red-300/90' : 'text-red-700'}`}>{t('exam.negativePoints')}</p>
                    <p className={`text-[12px] leading-relaxed ${isDark ? 'text-gray-400/80' : 'text-slate-600'}`}>{t('exam.negativePointsDesc', { threshold: exam.negative_points_threshold, value: exam.negative_points_value })}</p>
                    <div className={`flex items-center gap-3 mt-3 pt-3 border-t ${isDark ? 'border-red-500/10' : 'border-red-200'}`}>
                      <span className={`text-[10px] uppercase tracking-wider ${subText}`}>{t('exam.threshold', { value: exam.negative_points_threshold })}</span>
                      <div className={`w-px h-3 ${isDark ? 'bg-red-400/15' : 'bg-red-300'}`} />
                      <span className={`text-xs font-bold font-mono ${isDark ? 'text-red-400/70' : 'text-red-600'}`}>-{exam.negative_points_value} {t('questions.pts')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 1.2 }} className={`text-xs max-w-lg leading-relaxed border-t pt-6 ${isDark ? 'text-gray-500/60 border-gray-800/50' : 'text-slate-500 border-slate-200'}`}>
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

  return (
    <div className={`min-h-screen ${pageBg} flex flex-col relative overflow-hidden transition-colors`}
      onCopy={(e) => e.preventDefault()}
    >
      <div className="fixed inset-0 pointer-events-none">
        <div className={`absolute top-0 left-0 w-full h-full blur-[120px] ${isDark ? 'bg-[radial-gradient(circle_at_0%_50%,_rgba(59,130,246,0.15),_transparent_50%)]' : 'bg-[radial-gradient(circle_at_0%_50%,_rgba(96,165,250,0.18),_transparent_50%)]'}`} />
        <div className={`absolute bottom-0 right-0 w-full h-full blur-[120px] ${isDark ? 'bg-[radial-gradient(circle_at_100%_50%,_rgba(59,130,246,0.15),_transparent_50%)]' : 'bg-[radial-gradient(circle_at_100%_50%,_rgba(99,102,241,0.18),_transparent_50%)]'}`} />
      </div>

      <OtisakHeader
        user={user ? { name: user.name || null, index_number: user.index_number || null, avatar_url: user.avatar_url || null } : null}
        centerContent={
          attempt && exam ? (
            <OtisakTimer
              durationSeconds={exam.duration_minutes * 60 + Number(exam.extra_seconds || 0)}
              // Source of truth is the exam's exam_started_at. Null until the
              // admin clicks "Pokreni tajmer". Don't fall back to
              // attempt.started_at — that would start the countdown the
              // moment the student joins, not when the exam starts.
              startedAt={exam.exam_started_at ? (exam.exam_started_at as unknown as string) : null}
              pausedSeconds={pausedSeconds}
              paused={lockdown}
              onExpire={handleTimerExpire}
            />
          ) : null
        }
      />

      <main className="flex-1 max-w-4xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 z-10 flex flex-col justify-center min-h-[400px] sm:min-h-[500px]">
        {exam?.negative_points_enabled && phase === 'exam' && (
          <div className="flex items-center justify-center mb-5">
            <div className={`inline-flex items-center gap-3 py-2 px-4 rounded-full border ${isDark ? 'bg-red-500/[0.06] border-red-500/10' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-1.5">
                <AlertTriangle className={`w-3 h-3 ${isDark ? 'text-red-400/50' : 'text-red-500'}`} />
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-red-300/40' : 'text-red-700'}`}>{t('exam.negativePoints')}</span>
              </div>
              <div className={`w-px h-3 ${isDark ? 'bg-red-400/15' : 'bg-red-300'}`} />
              <div className="flex items-center gap-2">
                <span className={`text-[10px] ${subText}`}>{t('exam.threshold', { value: exam.negative_points_threshold })}</span>
                <span className={`text-[11px] font-bold font-mono ${isDark ? 'text-red-400/60' : 'text-red-600'}`}>-{exam.negative_points_value}</span>
              </div>
            </div>
          </div>
        )}

        {phase === 'submitting' ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
            <p className={`text-sm ${subText}`}>{t('exam.submitting')}</p>
          </div>
        ) : currentQuestion ? (
          <>
            <AnimatePresence mode="wait">
              <motion.div key={currentQIndex} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="w-full">
                <div className={`text-[10px] sm:text-xs uppercase tracking-widest mb-3 sm:mb-4 font-medium ${blueLabel}`}>
                  {t('exam.question', { current: currentQIndex + 1, total: questions.length })}
                  {currentQuestion.points && <span className={`ml-2 ${subText}`}>&#8226; {currentQuestion.points} {currentQuestion.points === 1 ? t('exam.point') : t('exam.points')}</span>}
                </div>

                <h2 className={`text-lg sm:text-2xl mb-4 sm:mb-6 font-light leading-relaxed ${titleText}`}>
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
                          className={`w-full rounded-xl px-5 py-4 text-sm leading-relaxed focus:outline-none focus:border-purple-500/50 focus:shadow-[0_0_20px_rgba(168,85,247,0.1)] resize-none min-h-[180px] transition-all border ${isDark ? 'bg-[#131520]/80 border-purple-500/20 text-white placeholder-white/15' : 'bg-white border-purple-200 text-slate-900 placeholder:text-slate-400'}`}
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
                        <p className={`text-xs italic mb-2 ${blueLabel}`}>{t('exam.orderItems')}</p>
                        {currentOrder.map((item, i) => (
                          <div key={`${item}-${i}`} className={`flex items-center gap-2 rounded-lg px-4 py-3 border ${surfaceCard}`}>
                            <span className={`font-mono text-sm w-6 text-center flex-shrink-0 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{i + 1}.</span>
                            <span className={`text-sm flex-1 ${titleText}`}>{item}</span>
                            <div className="flex flex-col gap-0.5 flex-shrink-0">
                              <button type="button" disabled={i === 0} onClick={() => moveItem(i, i - 1)} className={`p-1 rounded disabled:opacity-20 transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}>
                                <svg className={`w-3.5 h-3.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                              </button>
                              <button type="button" disabled={i === currentOrder.length - 1} onClick={() => moveItem(i, i + 1)} className={`p-1 rounded disabled:opacity-20 transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}>
                                <svg className={`w-3.5 h-3.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
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
                        <p className={`text-xs italic mb-2 ${blueLabel}`}>{t('exam.matchItems')}</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            {left.map((item, i) => {
                              const matched = curMatches[item] !== undefined;
                              const active = selLeft === item;
                              // Three styling states (active/matched/idle) × two themes = six combinations.
                              const baseIdle = isDark
                                ? 'border-gray-700 bg-[#131520]/80 text-white hover:border-blue-500/50'
                                : 'border-slate-300 bg-white text-slate-900 hover:border-blue-400';
                              const activeStyle = isDark
                                ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                                : 'border-blue-500 bg-blue-50 text-blue-700';
                              const matchedStyle = isDark
                                ? 'border-green-500/30 bg-green-500/[0.06] text-green-300'
                                : 'border-green-300 bg-green-50 text-green-700';
                              return (
                                <button key={`left-${i}`} type="button" onClick={() => {
                                  if (matched) { const nm = { ...curMatches }; delete nm[item]; setTextAnswers(prev => ({ ...prev, [currentQuestion.id]: JSON.stringify(nm) })); setMatchingSelectedLeft(null); }
                                  else { setMatchingSelectedLeft(active ? null : item); }
                                }} className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all ${active ? activeStyle : matched ? matchedStyle : baseIdle}`}>
                                  {item}{matched && <span className={`block text-[10px] mt-1 ${isDark ? 'text-green-400/60' : 'text-green-600/70'}`}>&#8594; {curMatches[item]}</span>}
                                </button>
                              );
                            })}
                          </div>
                          <div className="space-y-2">
                            {right.map((item, i) => {
                              const used = usedRight.has(item);
                              const usedStyle = isDark
                                ? 'border-green-500/30 bg-green-500/[0.06] text-green-300/50'
                                : 'border-green-200 bg-green-50/70 text-green-600/60';
                              const armedStyle = isDark
                                ? 'border-gray-600 bg-[#131520]/80 text-white hover:border-blue-500/50 cursor-pointer'
                                : 'border-slate-300 bg-white text-slate-900 hover:border-blue-400 cursor-pointer';
                              const idleStyle = isDark
                                ? 'border-gray-700 bg-[#131520]/80 text-gray-400'
                                : 'border-slate-200 bg-slate-50 text-slate-500';
                              return (
                                <button key={`right-${i}`} type="button" disabled={!selLeft || used} onClick={() => {
                                  if (selLeft && !used) { const nm = { ...curMatches, [selLeft]: item }; setTextAnswers(prev => ({ ...prev, [currentQuestion.id]: JSON.stringify(nm) })); setMatchingSelectedLeft(null); }
                                }} className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all ${used ? usedStyle : selLeft ? armedStyle : idleStyle}`}>
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
                        <div className={`rounded-xl px-5 py-4 text-sm leading-loose border ${surfaceCard} ${titleText}`}>
                          {parts.map((part, i) => {
                            const m = part.match(/^___([A-Z0-9_]+)___$/);
                            if (m) {
                              const bid = m[1];
                              return (<input key={`blank-${bid}-${i}`} type="text" value={curFills[bid] || ''} onChange={(e) => { const nf = { ...curFills, [bid]: e.target.value }; setTextAnswers(prev => ({ ...prev, [currentQuestion.id]: JSON.stringify(nf) })); }} className={`inline-block w-32 sm:w-40 mx-1 px-3 py-1 border-b-2 text-sm focus:outline-none focus:border-blue-500 transition-colors rounded-t ${isDark ? 'bg-blue-500/10 border-blue-500/40 text-blue-300 placeholder-blue-300/30' : 'bg-blue-50 border-blue-300 text-blue-700 placeholder:text-blue-400/40'}`} placeholder="..." />);
                            }
                            return <span key={`text-${i}`}>{part}</span>;
                          })}
                        </div>
                        <p className={`text-[10px] ${blueLabel}`}>{blanks.length} {t('exam.blanksToFill')}</p>
                      </div>
                    );
                  })() : (
                    <>
                      {currentQuestion.multi_answer && (
                        <p className={`text-xs italic mb-1 ${blueLabel}`}>{t('exam.selectAll')}</p>
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
              <button type="button" onClick={() => setShowFinishConfirm(true)}
                className="px-6 sm:px-8 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-[0_0_25px_rgba(37,99,235,0.4)] hover:shadow-[0_0_35px_rgba(37,99,235,0.6)] transition-all uppercase tracking-widest text-xs sm:text-sm hover:-translate-y-1">
                {t('exam.finishExam')}
              </button>
            </motion.div>
          </>
        ) : (
          <div className={`text-center py-20 ${subText}`}><p>{t('exam.noQuestions')}</p></div>
        )}
      </main>

      {/* Scratch Notes Toggle */}
      <button type="button" onClick={() => setShowNotes(!showNotes)}
        className={`fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-lg ${
          showNotes
            ? (isDark ? 'bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 shadow-[0_0_20px_rgba(234,179,8,0.2)]' : 'bg-yellow-100 border border-yellow-300 text-yellow-700 shadow-md')
            : scratchNotes
              ? (isDark ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-500/60 hover:text-yellow-400 hover:bg-yellow-500/20' : 'bg-yellow-50 border border-yellow-200 text-yellow-600 hover:text-yellow-700 hover:bg-yellow-100')
              : (isDark ? 'bg-white/5 border border-white/10 text-gray-500 hover:text-yellow-400 hover:bg-yellow-500/10 hover:border-yellow-500/20' : 'bg-white border border-slate-200 text-slate-500 hover:text-yellow-600 hover:bg-yellow-50 hover:border-yellow-200 shadow-sm')
        }`} title={t('exam.scratchNotes')}>
        <StickyNote className="w-4.5 h-4.5" />
        {scratchNotes && !showNotes && <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-yellow-500 border ${isDark ? 'border-[#0a0a14]' : 'border-[#F8FAFC]'}`} />}
      </button>

      {/* Scratch Notes Panel */}
      <AnimatePresence>
        {showNotes && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] sm:hidden" onClick={() => setShowNotes(false)} />
            <motion.div initial={{ opacity: 0, x: 300 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 300 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={`fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[340px] border-l backdrop-blur-xl shadow-[-20px_0_60px_rgba(0,0,0,0.5)] flex flex-col ${isDark ? 'bg-[#0d0d1a]/95 border-yellow-500/10' : 'bg-white/95 border-yellow-200'}`}>
              <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-yellow-500/10' : 'border-yellow-200'}`}>
                <div className="flex items-center gap-2">
                  <StickyNote className={`w-4 h-4 ${isDark ? 'text-yellow-500/60' : 'text-yellow-600'}`} />
                  <span className={`text-sm font-medium uppercase tracking-wider ${isDark ? 'text-yellow-200/80' : 'text-yellow-700'}`}>{t('exam.scratchNotes')}</span>
                </div>
                <button type="button" onClick={() => setShowNotes(false)} className={`p-1.5 rounded-md transition-colors ${isDark ? 'text-gray-500 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 p-3">
                <textarea value={scratchNotes} onChange={(e) => setScratchNotes(e.target.value)}
                  className={`w-full h-full rounded-lg px-4 py-3 text-xs font-mono leading-relaxed focus:outline-none resize-none border ${isDark ? 'bg-yellow-500/[0.02] border-yellow-500/10 text-yellow-100/70 focus:border-yellow-500/25 placeholder-yellow-500/20' : 'bg-yellow-50/30 border-yellow-200 text-yellow-900 focus:border-yellow-400 placeholder:text-yellow-600/40'}`}
                  placeholder={t('exam.scratchPlaceholder')} autoFocus />
              </div>
              <div className={`px-4 py-2.5 border-t ${isDark ? 'border-yellow-500/10' : 'border-yellow-200'}`}>
                <p className={`text-[9px] text-center ${isDark ? 'text-yellow-500/30' : 'text-yellow-700/60'}`}>{t('exam.scratchFooter')}</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <OtisakFooter />

      {/* FINISH CONFIRMATION MODAL */}
      <AnimatePresence>
        {showFinishConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => phase !== 'submitting' && setShowFinishConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 20 }}
              onClick={(e) => e.stopPropagation()}
              className={`rounded-2xl max-w-md w-full p-6 sm:p-8 border ${isDark ? 'bg-[#131520] border-blue-500/30 shadow-[0_0_60px_rgba(59,130,246,0.2)]' : 'bg-white border-slate-200 shadow-xl'}`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${isDark ? 'bg-amber-500/15 border-amber-500/30' : 'bg-amber-50 border-amber-200'}`}>
                  <AlertTriangle className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                </div>
                <h3 className={`text-lg font-medium ${titleText}`}>{t('exam.finishConfirmTitle')}</h3>
              </div>
              <p className={`text-sm leading-relaxed mb-2 ${subText}`}>
                {t('exam.finishConfirmBody')}
              </p>
              <p className={`text-xs leading-relaxed mb-6 ${isDark ? 'text-amber-400/80' : 'text-amber-700'}`}>
                {t('exam.finishConfirmWarning')}
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowFinishConfirm(false)}
                  disabled={phase === 'submitting'}
                  className={`flex-1 h-11 font-medium rounded-xl border transition-all uppercase tracking-widest text-xs disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border-white/10 hover:border-white/20' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-200 hover:border-slate-300'}`}
                >
                  {t('exam.finishConfirmCancel')}
                </button>
                <button
                  onClick={() => { setShowFinishConfirm(false); handleFinish('manual'); }}
                  disabled={phase === 'submitting'}
                  className="flex-1 h-11 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-[0_0_25px_rgba(37,99,235,0.4)] transition-all uppercase tracking-widest text-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {phase === 'submitting' ? (
                    <><Loader2 size={14} className="animate-spin" />{t('exam.submitting')}</>
                  ) : (
                    t('exam.finishConfirmYes')
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PAUSE / LOCKDOWN OVERLAY */}
      <AnimatePresence>
        {lockdown && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#0b0f17] flex flex-col items-center justify-center"
          >
            {/* Calm slate-blue ambient glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute top-[-15%] right-[-15%] w-[55vw] h-[55vw] bg-sky-500/[0.07] rounded-full blur-[160px]" />
              <div className="absolute bottom-[-15%] left-[-15%] w-[55vw] h-[55vw] bg-slate-500/[0.05] rounded-full blur-[160px]" />
              <div
                className="absolute inset-0 opacity-[0.025]"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(148,163,184,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.5) 1px, transparent 1px)',
                  backgroundSize: '60px 60px',
                }}
              />
            </div>

            <div className="z-10 flex flex-col items-center text-center px-6 max-w-lg">
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="w-24 h-24 rounded-2xl bg-sky-500/[0.08] border border-sky-400/25 flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(56,189,248,0.10)]"
              >
                <PauseCircle className="w-12 h-12 text-sky-300/85" strokeWidth={1.25} />
              </motion.div>

              <motion.h1
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="text-3xl sm:text-4xl font-light text-slate-100/90 tracking-[0.3em] uppercase mb-3"
              >
                {t('lockdown.title')}
              </motion.h1>

              <motion.p
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-slate-300/70 text-sm sm:text-base leading-relaxed mb-8 max-w-md"
              >
                {lockdownMessage || t('lockdown.body')}
              </motion.p>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45 }}
                className="flex items-center gap-3 px-5 py-2.5 bg-sky-500/[0.06] border border-sky-400/20 rounded-full"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-sky-300/60 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-300" />
                </span>
                <span className="text-sky-200/85 text-[11px] uppercase tracking-[0.25em] font-medium">
                  {t('lockdown.timerPaused')}
                </span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-14 text-slate-500/60 text-[10px] uppercase tracking-[0.2em]"
              >
                {t('lockdown.dontCloseWindow')}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
