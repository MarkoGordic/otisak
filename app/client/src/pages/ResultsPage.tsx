import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, Clock, Target, ArrowLeft, Check, X } from 'lucide-react';
import { OtisakHeader, OtisakFooter } from '../components/otisak';
import { useLang } from '../components/LangProvider';
import { useTheme } from '../components/ThemeProvider';
import { ToggleCluster } from '../components/ToggleCluster';
import { useExamSocket } from '../lib/useExamSocket';
import { parseCodeContent } from '../lib/codeQuestion';
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

  // Centralized theme tokens - same idea as on ExamPage / JoinPage. Keeps the JSX
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
  // the student closes the tab - we instead set status to 'pending' and let
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

  // Practice results come back unstripped (full answers + correct flags) and
  // are not a terminal screen - the taker reviews everything and goes back.
  // Real-exam student payloads have no exam_mode field, so this stays false.
  const isPractice = results?.exam?.exam_mode === 'practice';
  const totalPoints = Number(results?.attempt?.total_points ?? 0);
  const maxPoints = Number(results?.attempt?.max_points ?? 0);
  const percentage = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
  // When the exam opts out of a pass threshold, results render as a neutral
  // "Done" verdict - no green/red, no Položio / Nije položio copy. Defaults
  // TRUE for back-compat with older payloads.
  const hasPassThreshold = (results?.exam as { has_pass_threshold?: boolean } | undefined)?.has_pass_threshold !== false;
  const passed = hasPassThreshold && results?.exam ? percentage >= Number(results.exam.pass_threshold) : false;
  const correctCount = results?.questions?.filter((q) => q.points_awarded > 0).length ?? 0;
  const totalQuestions = results?.questions?.length ?? 0;
  const timeSpent = results?.attempt?.time_spent_seconds ?? 0;

  return (
    <div className={`min-h-screen ${pageBg} flex flex-col relative overflow-hidden transition-colors`}>
      {/* Toggle cluster is rendered inside OtisakHeader (md+) below; on mobile, header avatar takes the space. */}
      <div className="md:hidden">
        <ToggleCluster variant="solid" position="fixed" />
      </div>
      {/* Soft ambient glow - terminal "finished" screen. In light mode we use blue
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
                !hasPassThreshold
                  ? (isDark ? 'text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.4)]' : 'text-blue-600')
                  : passed
                    ? (isDark ? 'text-green-500 drop-shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'text-green-600')
                    : (isDark ? 'text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'text-amber-600')
              }`}>
              {!hasPassThreshold ? t('results.title') : passed ? t('results.passed') : t('results.title')}
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
            {/* Banner. Real exams: terminal screen, the student stays put and
                waits for the assistant. Practice: a review screen they leave
                whenever they want. */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-8 sm:mb-10"
            >
              <p className={`text-[11px] sm:text-xs uppercase tracking-[0.35em] mb-3 ${kickerText}`}>{t(isPractice ? 'results.practiceKicker' : 'results.finishedKicker')}</p>
              <h1 className={`text-2xl sm:text-3xl font-light tracking-wide leading-snug ${titleText}`}>
                {t(isPractice ? 'results.practiceTitle' : 'results.finishedTitle')}
              </h1>
              <p className={`text-sm mt-3 max-w-md mx-auto ${subSoft}`}>{t(isPractice ? 'results.practiceSubtitle' : 'results.finishedSubtitle')}</p>
            </motion.div>
            {/* Score Card */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
              className={`rounded-xl p-4 sm:p-6 w-full mb-6 backdrop-blur-sm border ${cardSurface}`}>
              <div className="flex items-center justify-between mb-4 gap-3">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className={`text-[10px] sm:text-xs uppercase tracking-[0.2em] font-medium truncate ${subText}`}>{results.exam.title}</span>
                  <span className={`text-[10px] sm:text-xs ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>
                    {percentage}%
                    {hasPassThreshold && <> &#8226; {passed ? t('results.passedLabel') : t('results.notPassed')}</>}
                    {hasPassThreshold && Number(results.exam.pass_threshold) > 0 && (
                      <span className={isDark ? 'text-gray-600' : 'text-slate-400'}> ({t('results.thresholdLabel', { value: results.exam.pass_threshold })})</span>
                    )}
                  </span>
                </div>
                <div className={`text-3xl sm:text-5xl font-mono tracking-wider font-bold flex-shrink-0 ${
                  !hasPassThreshold
                    ? (isDark ? 'text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.4)]' : 'text-blue-600')
                    : passed
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

            {/* Practice: full answer review - question, all options, what the
                taker picked, what was correct, AI feedback. */}
            {isPractice && results.questions && results.questions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className={`rounded-xl p-4 sm:p-5 w-full mb-6 backdrop-blur-sm border ${cardSurface}`}
              >
                <span className={`block text-[10px] sm:text-xs uppercase tracking-[0.2em] font-medium mb-3 ${subText}`}>{t('results.review')}</span>
                <div className={`divide-y ${isDark ? 'divide-gray-800/60' : 'divide-slate-100'}`}>
                  {results.questions.map((item, i) => (
                    <ReviewQuestion key={item.question.id} item={item} index={i} isDark={isDark} t={t} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* Real exams: per-question recap - points only, no text or answers */}
            {!isPractice && results.questions && results.questions.length > 0 && (
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

            {isPractice ? (
              /* Practice is not terminal - offer the way back. */
              <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                onClick={() => navigate('/dashboard')}
                className={`inline-flex items-center gap-2 h-11 px-6 rounded-lg border text-sm font-medium mt-2 mb-10 transition-colors ${
                  isDark
                    ? 'border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20'
                    : 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
                {t('results.backToDashboard')}
              </motion.button>
            ) : (
              /* Intentionally no navigation button - once a real exam is over,
                  the student stays on this terminal screen. */
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className={`text-[10px] uppercase tracking-[0.3em] mt-4 mb-10 ${isDark ? 'text-white/35' : 'text-slate-400'}`}
              >
                {t('results.finishedFooter')}
              </motion.p>
            )}
          </>
        )}
      </main>

      <OtisakFooter />
    </div>
  );
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

type ReviewItem = OtisakExamResults['questions'][number];

// One question in the practice answer review: the full question, every option,
// what the taker picked, what was correct, and any AI feedback / explanation.
// Only rendered for practice results, where the server returns unstripped data.
function ReviewQuestion({ item, index, isDark, t }: {
  item: ReviewItem;
  index: number;
  isDark: boolean;
  t: ReturnType<typeof useLang>['t'];
}) {
  const q = item.question;
  const awarded = Number(item.points_awarded ?? 0);
  const max = Number(q.points ?? 0);
  const pending = item.ai_grading_status === 'pending' || item.ai_grading_status === 'grading';

  const titleText = isDark ? 'text-white' : 'text-slate-900';
  const subText = isDark ? 'text-gray-400' : 'text-slate-500';
  const pointsTone = pending
    ? (isDark ? 'border-purple-500/25 bg-purple-500/[0.06] text-purple-300' : 'border-purple-200 bg-purple-50 text-purple-700')
    : max > 0 && awarded === max
      ? (isDark ? 'border-green-500/25 bg-green-500/[0.06] text-green-300' : 'border-green-200 bg-green-50 text-green-700')
      : awarded > 0
        ? (isDark ? 'border-amber-500/25 bg-amber-500/[0.06] text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-700')
        : (isDark ? 'border-red-500/25 bg-red-500/[0.06] text-red-300' : 'border-red-200 bg-red-50 text-red-700');
  const goodRow = isDark ? 'border-green-500/30 bg-green-500/[0.06] text-green-300' : 'border-green-300 bg-green-50 text-green-700';
  const badRow = isDark ? 'border-red-500/30 bg-red-500/[0.06] text-red-300' : 'border-red-300 bg-red-50 text-red-700';
  const neutralRow = isDark ? 'border-gray-700/60 bg-white/[0.02] text-gray-300' : 'border-slate-200 bg-slate-50 text-slate-600';

  const selectedIds = item.selected_answer_ids?.length
    ? item.selected_answer_ids
    : item.selected_answer_id ? [item.selected_answer_id] : [];
  const notAnswered = <p className={`text-xs italic ${subText}`}>{t('results.noAnswer')}</p>;

  let body: ReactNode;
  if (q.type === 'ordering') {
    const correctOrder = parseJson<{ items?: string[] }>(q.content, {}).items ?? [];
    const studentOrder = parseJson<string[]>(item.text_answer, []);
    body = studentOrder.length === 0 ? notAnswered : (
      <div className="space-y-1.5">
        {correctOrder.map((correctItem, i) => {
          const studentItem = studentOrder[i];
          const ok = studentItem === correctItem;
          return (
            <div key={i} className={`rounded-lg border px-3 py-2 text-sm ${ok ? goodRow : badRow}`}>
              <span className="font-mono mr-2">{i + 1}.</span>{studentItem ?? '—'}
              {!ok && <span className="block text-[11px] mt-0.5 opacity-70">{t('results.correctAnswerLabel')}: {correctItem}</span>}
            </div>
          );
        })}
      </div>
    );
  } else if (q.type === 'matching') {
    const { left = [], right = [] } = parseJson<{ left?: string[]; right?: string[] }>(q.content, {});
    const matches = parseJson<Record<string, string>>(item.text_answer, {});
    body = (
      <div className="space-y-1.5">
        {left.map((l, i) => {
          const student = matches[l];
          const ok = student === right[i];
          return (
            <div key={i} className={`rounded-lg border px-3 py-2 text-sm ${student === undefined ? neutralRow : ok ? goodRow : badRow}`}>
              {l} <span className="opacity-60">&#8594;</span> {student ?? '—'}
              {!ok && <span className="block text-[11px] mt-0.5 opacity-70">{t('results.correctAnswerLabel')}: {right[i]}</span>}
            </div>
          );
        })}
      </div>
    );
  } else if (q.type === 'fill_blank') {
    const blanks = parseJson<{ blanks?: Array<{ id: string; correct: string }> }>(q.content, {}).blanks ?? [];
    const fills = parseJson<Record<string, string>>(item.text_answer, {});
    const correctById = new Map(blanks.map((b) => [b.id, b.correct || '']));
    const parts = q.text.split(/(___[A-Z0-9_]+___)/g);
    body = (
      <div className={`rounded-lg border px-4 py-3 text-sm leading-loose ${neutralRow}`}>
        {parts.map((part, i) => {
          const m = part.match(/^___([A-Z0-9_]+)___$/);
          if (!m) return <span key={i}>{part}</span>;
          const student = (fills[m[1]] || '').trim();
          const correct = (correctById.get(m[1]) || '').trim();
          const ok = student.toLowerCase() === correct.toLowerCase();
          return (
            <span key={i} className={`inline-flex items-baseline gap-1 mx-1 px-2 py-0.5 rounded border text-xs font-medium ${ok ? goodRow : badRow}`}>
              {student || '—'}
              {!ok && <span className="opacity-70">({correct})</span>}
            </span>
          );
        })}
      </div>
    );
  } else if (q.type === 'open_text') {
    body = (
      <div className="space-y-2">
        <div className={`rounded-lg border px-4 py-3 text-sm whitespace-pre-wrap ${neutralRow}`}>
          {item.text_answer?.trim() ? item.text_answer : <span className="italic opacity-70">{t('results.noAnswer')}</span>}
        </div>
        {item.ai_feedback && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${isDark ? 'border-purple-500/25 bg-purple-500/[0.06] text-purple-200' : 'border-purple-200 bg-purple-50 text-purple-800'}`}>
            <span className="block text-[10px] uppercase tracking-wider mb-1 opacity-70">{t('results.aiFeedback')}</span>
            {item.ai_feedback}
          </div>
        )}
      </div>
    );
  } else {
    // Choice questions: text / code / image.
    body = (
      <div className="space-y-1.5">
        {item.answers.map((a) => {
          const selected = selectedIds.includes(a.id);
          const tone = a.is_correct ? goodRow : selected ? badRow : neutralRow;
          return (
            <div key={a.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${tone}`}>
              {a.is_correct
                ? <Check className="w-3.5 h-3.5 flex-shrink-0" />
                : selected
                  ? <X className="w-3.5 h-3.5 flex-shrink-0" />
                  : <span className="w-3.5 flex-shrink-0" />}
              <span className="flex-1">{a.text}</span>
              {selected && <span className="text-[10px] uppercase tracking-wider opacity-70 flex-shrink-0">{t('results.yourAnswer')}</span>}
            </div>
          );
        })}
        {selectedIds.length === 0 && notAnswered}
      </div>
    );
  }

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className={`text-sm font-medium leading-snug ${titleText}`}>
          <span className={`font-mono mr-2 ${subText}`}>{index + 1}.</span>
          {/* fill_blank renders its text inline with the blanks below */}
          {q.type !== 'fill_blank' && q.text}
        </p>
        <span className={`flex-shrink-0 rounded-lg border px-2.5 py-1 text-xs font-mono tabular-nums ${pointsTone}`}>
          {pending ? '…' : awarded}/{max}
        </span>
      </div>
      {q.type === 'code' && q.content && (
        <pre className={`rounded-lg border px-4 py-3 text-xs font-mono overflow-x-auto mb-2 ${isDark ? 'bg-black/40 border-gray-800 text-gray-300' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>{parseCodeContent(q.content).snippet}</pre>
      )}
      {q.type === 'image' && q.content && (
        <img src={q.content} alt="" className={`max-w-full rounded-lg border mb-2 ${isDark ? 'border-gray-800' : 'border-slate-200'}`} />
      )}
      {body}
      {q.explanation && (
        <div className={`mt-2 rounded-lg border px-4 py-3 text-sm ${isDark ? 'border-blue-500/25 bg-blue-500/[0.06] text-blue-200' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
          <span className="block text-[10px] uppercase tracking-wider mb-1 opacity-70">{t('results.explanation')}</span>
          {q.explanation}
        </div>
      )}
    </div>
  );
}
