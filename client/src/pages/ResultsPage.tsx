import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, Clock, Target } from 'lucide-react';
import { OtisakHeader, OtisakFooter } from '../components/otisak';
import { useLang } from '../components/LangProvider';
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

  // Poll for AI grading
  useEffect(() => {
    if (!pollingAi || !results?.attempt?.id) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/otisak/exams/${examId}/results`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const status = data.results?.attempt?.ai_grading_status;
          setAiGradingStatus(status);
          if (status === 'graded' || status === 'partial') {
            setPollingAi(false);
            setResults(data.results);
          }
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [pollingAi, results?.attempt?.id, examId]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center">
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
    <div className="min-h-screen bg-[#0a0a14] flex flex-col relative overflow-hidden">
      {/* Soft white ambient glow — terminal "finished" screen */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] bg-white/[0.06] rounded-full blur-[180px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[70vw] h-[70vw] bg-white/[0.04] rounded-full blur-[180px]" />
        <div className="absolute top-[40%] right-[30%] w-[35vw] h-[35vw] bg-white/[0.025] rounded-full blur-[140px]" />
      </div>

      <OtisakHeader
        user={user ? { name: user.name || null, index_number: user.index_number || null, avatar_url: user.avatar_url || null } : null}
        centerContent={
          results ? (
            <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className={`text-2xl sm:text-3xl font-light tracking-[0.2em] uppercase drop-shadow-lg ${
                passed ? 'text-green-500 drop-shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.4)]'
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
            <p className="text-gray-300 text-lg mb-2">{t('results.notAvailable')}</p>
            <p className="text-gray-500 text-sm">{t('results.processing')}</p>
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
              <p className="text-[11px] sm:text-xs uppercase tracking-[0.35em] text-white/50 mb-3">{t('results.finishedKicker')}</p>
              <h1 className="text-2xl sm:text-3xl font-light text-white tracking-wide leading-snug">
                {t('results.finishedTitle')}
              </h1>
              <p className="text-sm text-white/60 mt-3 max-w-md mx-auto">{t('results.finishedSubtitle')}</p>
            </motion.div>
            {/* Score Card */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
              className="bg-[#1a1c26]/90 border border-gray-800 rounded-xl p-4 sm:p-6 w-full mb-6 shadow-[0_0_30px_rgba(0,0,0,0.3)] backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4 gap-3">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-gray-400 text-[10px] sm:text-xs uppercase tracking-[0.2em] font-medium truncate">{results.exam.title}</span>
                  <span className="text-gray-500 text-[10px] sm:text-xs">
                    {percentage}% &#8226; {passed ? t('results.passedLabel') : t('results.notPassed')}
                    {Number(results.exam.pass_threshold) > 0 && <span className="text-gray-600"> (Threshold {results.exam.pass_threshold}%)</span>}
                  </span>
                </div>
                <div className={`text-3xl sm:text-5xl font-mono tracking-wider font-bold drop-shadow-lg flex-shrink-0 ${
                  passed ? 'text-green-500 drop-shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'text-red-400 drop-shadow-[0_0_15px_rgba(248,113,113,0.4)]'
                }`}>
                  {totalPoints}/{maxPoints}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 pt-3 border-t border-gray-800/50">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Target className="w-3.5 h-3.5 text-blue-400" />
                  <span>{correctCount}/{totalQuestions} {t('results.correct')}</span>
                </div>
                {timeSpent > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    <span>{Math.floor(timeSpent / 60)}m {timeSpent % 60}s</span>
                  </div>
                )}
              </div>
            </motion.div>

            {/* AI Grading Banner */}
            {aiGradingStatus && aiGradingStatus !== 'graded' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 w-full mb-4 flex items-center gap-3">
                {(aiGradingStatus === 'pending' || aiGradingStatus === 'grading') ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-purple-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-purple-300 font-medium">{t('results.aiGradingInProgress')}</p>
                      <p className="text-xs text-purple-400/60">{t('results.aiGradingWait')}</p>
                    </div>
                  </>
                ) : (
                  <div>
                    <p className="text-sm text-amber-300 font-medium">{t('results.aiGradingPartial')}</p>
                    <p className="text-xs text-amber-400/60">{t('results.aiGradingPartialHint')}</p>
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
                className="bg-[#1a1c26]/90 border border-gray-800 rounded-xl p-4 sm:p-5 w-full mb-6 backdrop-blur-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gray-400 text-[10px] sm:text-xs uppercase tracking-[0.2em] font-medium">{t('results.recap')}</span>
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest">{t('results.recapHint')}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {results.questions.map((q, i) => {
                    const awarded = Number(q.points_awarded ?? 0);
                    const max = Number(q.question.points ?? 0);
                    const pending = q.ai_grading_status === 'pending' || q.ai_grading_status === 'grading';
                    const tone = pending
                      ? 'border-purple-500/25 bg-purple-500/[0.06] text-purple-300'
                      : max > 0 && awarded === max
                        ? 'border-green-500/25 bg-green-500/[0.06] text-green-300'
                        : awarded > 0
                          ? 'border-amber-500/25 bg-amber-500/[0.06] text-amber-300'
                          : 'border-red-500/25 bg-red-500/[0.06] text-red-300';
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
              className="text-[10px] uppercase tracking-[0.3em] text-white/35 mt-4 mb-10"
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
