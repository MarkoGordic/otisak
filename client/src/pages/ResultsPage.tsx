import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, Clock, Target } from 'lucide-react';
import { OtisakHeader, OtisakFooter } from '../components/otisak';
import { useLang } from '../components/LangProvider';
import { useTheme } from '../components/ThemeProvider';
import { ToggleCluster } from '../components/ToggleCluster';
import { useExamSocket } from '../lib/useExamSocket';
import type { OtisakExamResults } from '../lib/types';

type UserInfo = {
  name?: string;
  email?: string;
  avatar_url?: string;
  index_number?: string;
};

export default function ResultsPage() {
  const navigate = useNavigate();
  const { examId } = useParams();
  const { t } = useLang();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Centralized theme tokens — same idea as on ExamPage / JoinPage. Keeps the JSX
  // below readable and makes it easy to tweak the light-mode palette in one place.
  const pageBg = isDark ? 'bg-[#0a0a14]' : 'bg-[#F8FAFC]';
  const titleText = isDark ? 'text-white' : 'text-slate-900';
  const subText = isDark ? 'text-gray-400' : 'text-slate-500';
  const subSoft = isDark ? 'text-white/60' : 'text-slate-600';
  const kickerText = isDark ? 'text-white/50' : 'text-slate-500';
  const dividerBorder = isDark ? 'border-gray-800/50' : 'border-slate-200';
  const cardSurface = isDark
    ? 'bg-[#1a1c26]/90 border-gray-800 shadow-[0_0_30px_rgba(0,0,0,0.3)]'
    : 'bg-white border-slate-200 shadow-sm';

  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [results, setResults] = useState<OtisakExamResults | null>(null);
  const [aiGradingStatus, setAiGradingStatus] = useState<string | null>(null);
  const [pollingAi, setPollingAi] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sessionRes = await fetch('/api/auth/session', { credentials: 'include' });
        if (!sessionRes.ok) { navigate('/', { replace: true }); return; }
        const sessionData = await sessionRes.json();
        if (!sessionData.authenticated) { navigate('/', { replace: true }); return; }

        if (mounted) {
          setUser({
            name: sessionData.user?.name,
            email: sessionData.user?.email,
            avatar_url: sessionData.user?.avatar_url,
            index_number: sessionData.user?.index_number,
          });
        }

        const res = await fetch(`/api/otisak/exams/${examId}/results`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (mounted) {
            setResults(data.results);
            if (data.results?.attempt?.ai_grading_status === 'pending' || data.results?.attempt?.ai_grading_status === 'grading') {
              setAiGradingStatus(data.results.attempt.ai_grading_status);
              setPollingAi(true);
            } else if (data.results?.attempt?.ai_grading_status) {
              setAiGradingStatus(data.results.attempt.ai_grading_status);
            }
          }
        }
      } catch (e) {
        console.error('Failed to load results:', e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [examId, navigate]);

  // Even though the student is on the terminal "results" screen, admin's
  // "finish for everyone + redirect home" must still pull them off this page.
  // Without this subscription the redirect would silently fail for anyone who
  // had already submitted on their own.
  useExamSocket(examId, useCallback((evt) => {
    if (evt.type === 'exam.finished') {
      const redirect = (evt as unknown as { redirect?: boolean }).redirect === true;
      if (redirect) navigate('/', { replace: true });
    }
  }, [navigate]));

  // Poll for AI grading. Capped at 100 attempts (~5 minutes at 3s interval)
  // so a stuck AI backend doesn't leave the poll running indefinitely until
  // the student closes the tab — we instead set status to 'pending' and let
  // them refresh manually if/when grading finishes server-side.
  useEffect(() => {
    if (!pollingAi || !results?.attempt?.id) return;
    let tries = 0;
    const MAX_TRIES = 100;
    const interval = setInterval(async () => {
      tries++;
      try {
        const res = await fetch(`/api/otisak/exams/${examId}/results`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const status = data.results?.attempt?.ai_grading_status;
          setAiGradingStatus(status);
          if (status === 'graded' || status === 'partial') {
            setPollingAi(false);
            setResults(data.results);
            return;
          }
        }
      } catch { /* ignore */ }
      if (tries >= MAX_TRIES) {
        setPollingAi(false);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [pollingAi, results?.attempt?.id, examId]);

  if (isLoading) {
    return (
      <div className={`min-h-screen ${pageBg} flex items-center justify-center transition-colors`}>
        <ToggleCluster variant="solid" position="fixed" />
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const totalPoints = Number(results?.attempt?.total_points ?? 0);
  const maxPoints = Number(results?.attempt?.max_points ?? 0);
  const percentage = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
  const passed = results?.exam ? percentage >= Number(results.exam.pass_threshold) : false;
  const correctCount = results?.questions?.filter((q) => q.points_awarded > 0).length ?? 0;
  const totalQuestions = results?.questions?.length ?? 0;
  const timeSpent = results?.attempt?.time_spent_seconds ?? 0;

  return (
    <div className={`min-h-screen ${pageBg} flex flex-col relative overflow-hidden transition-colors`}>
      {/* Toggle cluster is rendered inside OtisakHeader (md+) below; on mobile, header avatar takes the space. */}
      <div className="md:hidden">
        <ToggleCluster variant="solid" position="fixed" />
      </div>
      {/* Soft ambient glow — terminal "finished" screen. In light mode we use blue
          tints instead of white so the page doesn't feel like an empty void. */}
      <div className="fixed inset-0 pointer-events-none">
        <div className={`absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full blur-[180px] ${isDark ? 'bg-white/[0.06]' : 'bg-blue-300/15'}`} />
        <div className={`absolute bottom-[-20%] right-[-10%] w-[70vw] h-[70vw] rounded-full blur-[180px] ${isDark ? 'bg-white/[0.04]' : 'bg-indigo-300/15'}`} />
        <div className={`absolute top-[40%] right-[30%] w-[35vw] h-[35vw] rounded-full blur-[140px] ${isDark ? 'bg-white/[0.025]' : 'bg-blue-200/10'}`} />
      </div>

      <OtisakHeader
        user={user ? { name: user.name || null, index_number: user.index_number || null, avatar_url: user.avatar_url || null } : null}
        centerContent={
          results ? (
            <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className={`text-2xl sm:text-3xl font-light tracking-[0.2em] uppercase ${
                passed
                  ? (isDark ? 'text-green-500 drop-shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'text-green-600')
                  : (isDark ? 'text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'text-amber-600')
              }`}>
              {passed ? t('results.passed') : t('results.title')}
            </motion.span>
          ) : null
        }
        showDate={false}
      />

      <main className="flex-1 max-w-3xl w-full mx-auto px-3 sm:px-6 py-6 sm:py-10 z-10 flex flex-col items-center">
        {!results ? (
          <div className="text-center py-20">
            <p className={`text-lg mb-2 ${titleText}`}>{t('results.notAvailable')}</p>
            <p className={`text-sm ${subText}`}>{t('results.processing')}</p>
          </div>
        ) : (
          <>
            {/* Terminal "exam finished" banner — student cannot navigate away */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-8 sm:mb-10"
            >
              <p className={`text-[11px] sm:text-xs uppercase tracking-[0.35em] mb-3 ${kickerText}`}>{t('results.finishedKicker')}</p>
              <h1 className={`text-2xl sm:text-3xl font-light tracking-wide leading-snug ${titleText}`}>
                {t('results.finishedTitle')}
              </h1>
              <p className={`text-sm mt-3 max-w-md mx-auto ${subSoft}`}>{t('results.finishedSubtitle')}</p>
            </motion.div>
            {/* Score Card */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
              className={`rounded-xl p-4 sm:p-6 w-full mb-6 backdrop-blur-sm border ${cardSurface}`}>
              <div className="flex items-center justify-between mb-4 gap-3">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className={`text-[10px] sm:text-xs uppercase tracking-[0.2em] font-medium truncate ${subText}`}>{results.exam.title}</span>
                  <span className={`text-[10px] sm:text-xs ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>
                    {percentage}% &#8226; {passed ? t('results.passedLabel') : t('results.notPassed')}
                    {Number(results.exam.pass_threshold) > 0 && <span className={isDark ? 'text-gray-600' : 'text-slate-400'}> ({t('results.thresholdLabel', { value: results.exam.pass_threshold })})</span>}
                  </span>
                </div>
                <div className={`text-3xl sm:text-5xl font-mono tracking-wider font-bold flex-shrink-0 ${
                  passed
                    ? (isDark ? 'text-green-500 drop-shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'text-green-600')
                    : (isDark ? 'text-red-400 drop-shadow-[0_0_15px_rgba(248,113,113,0.4)]' : 'text-red-600')
                }`}>
                  {totalPoints}/{maxPoints}
                </div>
              </div>
              <div className={`flex flex-wrap items-center gap-3 sm:gap-4 pt-3 border-t ${dividerBorder}`}>
                <div className={`flex items-center gap-1.5 text-xs ${subText}`}>
                  <Target className={`w-3.5 h-3.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                  <span>{correctCount}/{totalQuestions} {t('results.correct')}</span>
                </div>
                {timeSpent > 0 && (
                  <div className={`flex items-center gap-1.5 text-xs ${subText}`}>
                    <Clock className={`w-3.5 h-3.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                    <span>{Math.floor(timeSpent / 60)}m {timeSpent % 60}s</span>
                  </div>
                )}
              </div>
            </motion.div>

            {/* AI Grading Banner */}
            {aiGradingStatus && aiGradingStatus !== 'graded' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl p-4 w-full mb-4 flex items-center gap-3 border ${isDark ? 'bg-purple-500/10 border-purple-500/20' : 'bg-purple-50 border-purple-200'}`}>
                {(aiGradingStatus === 'pending' || aiGradingStatus === 'grading') ? (
                  <>
                    <Loader2 className={`w-5 h-5 animate-spin flex-shrink-0 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                    <div>
                      <p className={`text-sm font-medium ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>{t('results.aiGradingInProgress')}</p>
                      <p className={`text-xs ${isDark ? 'text-purple-400/60' : 'text-purple-600/70'}`}>{t('results.aiGradingWait')}</p>
                    </div>
                  </>
                ) : (
                  <div>
                    <p className={`text-sm font-medium ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>{t('results.aiGradingPartial')}</p>
                    <p className={`text-xs ${isDark ? 'text-amber-400/60' : 'text-amber-600/70'}`}>{t('results.aiGradingPartialHint')}</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* Per-question recap — points only, no text or answers */}
            {results.questions && results.questions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className={`rounded-xl p-4 sm:p-5 w-full mb-6 backdrop-blur-sm border ${cardSurface}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-[10px] sm:text-xs uppercase tracking-[0.2em] font-medium ${subText}`}>{t('results.recap')}</span>
                  <span className={`text-[10px] uppercase tracking-widest ${isDark ? 'text-gray-500' : 'text-slate-400'}`}>{t('results.recapHint')}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {results.questions.map((q, i) => {
                    const awarded = Number(q.points_awarded ?? 0);
                    const max = Number(q.question.points ?? 0);
                    const pending = q.ai_grading_status === 'pending' || q.ai_grading_status === 'grading';
                    // Each tone has a dark and light variant. Light mode uses solid pastel surfaces
                    // and darker text so the chips read clearly on a white page.
                    const tone = pending
                      ? (isDark ? 'border-purple-500/25 bg-purple-500/[0.06] text-purple-300' : 'border-purple-200 bg-purple-50 text-purple-700')
                      : max > 0 && awarded === max
                        ? (isDark ? 'border-green-500/25 bg-green-500/[0.06] text-green-300' : 'border-green-200 bg-green-50 text-green-700')
                        : awarded > 0
                          ? (isDark ? 'border-amber-500/25 bg-amber-500/[0.06] text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-700')
                          : (isDark ? 'border-red-500/25 bg-red-500/[0.06] text-red-300' : 'border-red-200 bg-red-50 text-red-700');
                    return (
                      <div key={q.question.id} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs ${tone}`}>
                        <span className="font-medium tabular-nums">{t('results.questionNumber', { number: i + 1 })}</span>
                        <span className="font-mono tabular-nums">
                          {pending ? '…' : awarded}/{max}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Intentionally no navigation button — once the exam is over,
                the student stays on this terminal screen. */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className={`text-[10px] uppercase tracking-[0.3em] mt-4 mb-10 ${isDark ? 'text-white/35' : 'text-slate-400'}`}
            >
              {t('results.finishedFooter')}
            </motion.p>
          </>
        )}
      </main>

      <OtisakFooter />
    </div>
  );
}
