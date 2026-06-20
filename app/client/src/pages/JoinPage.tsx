import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, Fingerprint, AlertTriangle, Hash, ArrowLeft, Check, User as UserIcon } from 'lucide-react';
import { OtisakLogo, OtisakFooter } from '../components/otisak';
import { useLang } from '../components/LangProvider';
import { useTheme } from '../components/ThemeProvider';
import { useExamSocket } from '../lib/useExamSocket';
import { ToggleCluster } from '../components/ToggleCluster';

type Phase = 'index-entry' | 'confirm' | 'waiting' | 'starting' | 'error';

type ExamInfo = {
  title: string;
  status: string;
  exam_started_at: string | null;
  duration_minutes: number;
  subject_name: string | null;
};

export default function JoinExamPage() {
  const navigate = useNavigate();
  const { examId } = useParams();
  const { t } = useLang();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Pre-baked theme tokens used across the five phase returns below. Keeping them in one
  // place avoids 30 inline ternaries - and makes it obvious where each chunk of styling lives.
  const pageBg = isDark ? 'bg-[#0a0a14]' : 'bg-[#F8FAFC]';
  const titleClass = isDark ? 'text-white drop-shadow-lg' : 'text-slate-900';
  const subtitleClass = isDark ? 'text-blue-400/80' : 'text-blue-600/80';
  const bodyText = isDark ? 'text-gray-400' : 'text-slate-500';
  const bodyTextStrong = isDark ? 'text-gray-300' : 'text-slate-600';
  const cardBg = isDark ? 'bg-[#131520]/80 border-blue-500/20' : 'bg-white/90 border-slate-200';
  const inputBg = isDark
    ? 'bg-[#0d0f17] border-blue-500/20 text-white placeholder:text-gray-500'
    : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400';
  const indexChipBg = isDark
    ? 'bg-[#131520]/80 border-blue-500/20 shadow-[0_0_30px_rgba(0,0,0,0.3)]'
    : 'bg-white border-slate-200 shadow-sm';
  const indexNumberClass = isDark ? 'text-blue-300' : 'text-blue-600';
  const glow1 = isDark ? 'bg-blue-600/20' : 'bg-blue-400/30';
  const glow2 = isDark ? 'bg-blue-600/15' : 'bg-indigo-300/25';
  const errorIconClass = isDark ? 'text-red-400/60' : 'text-red-500/80';
  const errorMessageClass = isDark ? 'text-gray-400' : 'text-slate-600';
  const errorTitleClass = isDark ? 'text-white' : 'text-slate-900';
  const errorBackClass = isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-500';

  const [phase, setPhase] = useState<Phase>('index-entry');
  const [indexNumber, setIndexNumber] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [userName, setUserName] = useState('');
  const [userIndex, setUserIndex] = useState('');
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check exam exists on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/otisak/exams/${examId}/room-status`);
        if (!res.ok) { setPhase('error'); setError(t('join.examNotFound')); return; }
        const data = await res.json();
        setExamInfo(data);
        if (data.status !== 'active') {
          setPhase('error');
          setError(t('join.examNotActive'));
        }
      } catch {
        setPhase('error');
        setError(t('join.connectionError'));
      }
    })();
  }, [examId]);

  // Step 1: lookup user by index, then show confirmation screen
  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!indexNumber.trim()) return;
    setError('');
    setLookingUp(true);

    try {
      const res = await fetch(`/api/otisak/exams/${examId}/lookup-by-index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index_number: indexNumber.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('join.joinFailed'));
        return;
      }

      setUserName(data.user?.name || '');
      setUserIndex(data.user?.index_number || indexNumber);
      setPhase('confirm');
    } catch {
      setError(t('join.networkError'));
    } finally {
      setLookingUp(false);
    }
  };

  // Step 2: actually join (creates session)
  const handleConfirm = async () => {
    setError('');
    setJoining(true);

    try {
      const res = await fetch(`/api/otisak/exams/${examId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ index_number: indexNumber.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'INDEX_IN_USE') {
          setError(t('join.indexInUse'));
        } else {
          setError(data.error || t('join.joinFailed'));
        }
        setPhase('index-entry');
        return;
      }

      setUserName(data.user?.name || '');
      setUserIndex(data.user?.index_number || indexNumber);

      // Late join: admin already started - navigate into the exam page where
      // the "waiting for approval" state takes over.
      if (data.late_join) {
        navigate(`/exam/${examId}`);
        return;
      }

      setPhase('waiting');
    } catch {
      setError(t('join.networkError'));
      setPhase('index-entry');
    } finally {
      setJoining(false);
    }
  };

  const handleBackToIndex = () => {
    setError('');
    setPhase('index-entry');
  };

  // Poll for exam start
  const pollForStart = useCallback(async () => {
    try {
      const res = await fetch(`/api/otisak/exams/${examId}/room-status`);
      if (!res.ok) return;
      const data = await res.json();
      setExamInfo(data);

      if (data.exam_started_at) {
        // Exam has started! Redirect to exam page
        setPhase('starting');
        if (pollRef.current) clearInterval(pollRef.current);
        setTimeout(() => {
          navigate(`/exam/${examId}`);
        }, 1500);
      }
    } catch { /* silent */ }
  }, [examId, navigate]);

  useEffect(() => {
    if (phase !== 'waiting') return;
    pollRef.current = setInterval(pollForStart, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [phase, pollForStart]);

  // Live push channel: when the assistant starts the exam, jump to /exam
  // immediately instead of waiting for the next 2s poll. Also catches the
  // admin's "finish for everyone + redirect" action so students stuck in the
  // waiting lobby get bounced home like everyone else.
  useExamSocket(phase === 'waiting' ? examId : undefined, useCallback((evt) => {
    if (evt.type === 'exam.started') {
      setPhase('starting');
      if (pollRef.current) clearInterval(pollRef.current);
      setTimeout(() => navigate(`/exam/${examId}`), 800);
    } else if (evt.type === 'exam.finished') {
      const redirect = (evt as unknown as { redirect?: boolean }).redirect === true;
      if (redirect) {
        if (pollRef.current) clearInterval(pollRef.current);
        navigate('/', { replace: true });
      }
    }
  }, [examId, navigate]));

  // ========================================
  // ERROR
  // ========================================
  if (phase === 'error') {
    return (
      <div className={`min-h-screen w-full ${pageBg} flex flex-col items-center justify-center p-4 transition-colors`}>
        <ToggleCluster variant="solid" position="fixed" />
        <div className="text-center">
          <AlertTriangle className={`w-16 h-16 mx-auto mb-4 ${errorIconClass}`} />
          <h1 className={`text-xl font-light mb-2 ${errorTitleClass}`}>{t('join.cannotJoin')}</h1>
          <p className={`text-sm mb-6 ${errorMessageClass}`}>{error}</p>
          <button onClick={() => window.history.back()} className={`text-sm ${errorBackClass}`}>{t('join.goBack')}</button>
        </div>
      </div>
    );
  }

  // ========================================
  // INDEX ENTRY SCREEN
  // ========================================
  if (phase === 'index-entry') {
    return (
      <div className={`min-h-screen w-full ${pageBg} flex flex-col items-center justify-center relative overflow-hidden transition-colors`}>
        <ToggleCluster variant="solid" position="fixed" />
        {/* Background glows */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className={`absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] animate-pulse ${glow1}`} />
          <div className={`absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] animate-pulse ${glow2}`} style={{ animationDelay: '1s' }} />
        </div>

        <div className="z-10 w-full max-w-md px-4 sm:px-6 flex flex-col items-center text-center">
          {/* Logo */}
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <OtisakLogo className="w-16 h-16 sm:w-20 sm:h-20 drop-shadow-[0_0_15px_rgba(59,130,246,0.4)] mb-6" />
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.2 }} className="mb-8">
            <h1 className={`text-3xl sm:text-4xl font-light mb-2 tracking-[0.2em] ${titleClass}`}>OTISAK</h1>
            <span className={`text-xs tracking-[0.4em] uppercase font-medium ${subtitleClass}`}>v 2.0</span>
          </motion.div>

          {/* Exam info */}
          {examInfo && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mb-8 w-full">
              <div className={`rounded-xl px-5 py-4 backdrop-blur-sm border ${cardBg}`}>
                <p className={`text-[10px] uppercase tracking-widest mb-1 ${bodyText}`}>{t('join.joiningExam')}</p>
                <p className={`text-lg font-light ${titleClass}`}>{examInfo.title}</p>
                {examInfo.subject_name && <p className={`text-xs mt-1 ${subtitleClass}`}>{examInfo.subject_name}</p>}
                <p className={`text-[11px] mt-2 ${bodyText}`}>{examInfo.duration_minutes} {t('join.minutes')}</p>
              </div>
            </motion.div>
          )}

          {/* Index number form */}
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            onSubmit={handleLookup}
            className="w-full space-y-4"
          >
            <div>
              <label className={`block text-[10px] uppercase tracking-widest mb-2 text-left font-medium ${bodyText}`}>
                {t('join.enterIndex')}
              </label>
              <div className="relative">
                <Hash size={16} className={`absolute left-4 top-1/2 -translate-y-1/2 ${isDark ? 'text-blue-400/40' : 'text-blue-500/60'}`} />
                <input
                  type="text"
                  value={indexNumber}
                  onChange={(e) => setIndexNumber(e.target.value)}
                  placeholder={t('join.indexPlaceholder')}
                  required
                  autoFocus
                  className={`w-full h-14 pl-11 pr-4 border rounded-xl text-lg font-mono focus:outline-none focus:border-blue-500/50 focus:shadow-[0_0_20px_rgba(59,130,246,0.15)] transition-all ${inputBg}`}
                />
              </div>
            </div>

            {error && (
              <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${isDark ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-red-50 border-red-200 text-red-600'}`}>
                <AlertTriangle size={14} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={lookingUp || !indexNumber.trim()}
              className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-[0_0_25px_rgba(37,99,235,0.4)] hover:shadow-[0_0_35px_rgba(37,99,235,0.6)] transition-all uppercase tracking-widest text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {lookingUp ? (
                <><Loader2 size={16} className="animate-spin" />{t('join.lookingUp')}</>
              ) : (
                t('join.joinExam')
              )}
            </button>
          </motion.form>
        </div>

        <div className="absolute bottom-0 w-full"><OtisakFooter /></div>
      </div>
    );
  }

  // ========================================
  // CONFIRM SCREEN ("Is this you?")
  // ========================================
  if (phase === 'confirm') {
    return (
      <div className={`min-h-screen w-full ${pageBg} flex flex-col items-center justify-center relative overflow-hidden transition-colors`}>
        <ToggleCluster variant="solid" position="fixed" />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className={`absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] animate-pulse ${glow1}`} />
          <div className={`absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] animate-pulse ${glow2}`} style={{ animationDelay: '1s' }} />
        </div>

        <div className="z-10 w-full max-w-md px-4 sm:px-6 flex flex-col items-center text-center">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <OtisakLogo className="w-14 h-14 sm:w-16 sm:h-16 drop-shadow-[0_0_15px_rgba(59,130,246,0.4)] mb-6" />
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className={`text-xs uppercase tracking-[0.3em] mb-5 ${subtitleClass}`}
          >
            {t('join.confirmQuestion')}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className={`w-full rounded-xl px-6 py-7 mb-6 backdrop-blur-sm shadow-[0_0_30px_rgba(59,130,246,0.15)] border ${cardBg}`}
          >
            <UserIcon className={`w-10 h-10 mx-auto mb-4 ${isDark ? 'text-blue-400/70' : 'text-blue-500'}`} strokeWidth={1.5} />
            <div className={`text-2xl sm:text-3xl font-light mb-2 break-words ${titleClass}`}>
              {userName || t('exam.student')}
            </div>
            <div className={`font-mono text-sm ${indexNumberClass}`}>{userIndex}</div>
          </motion.div>

          {error && (
            <div className={`w-full flex items-center gap-2 p-3 mb-4 rounded-lg border text-sm ${isDark ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-red-50 border-red-200 text-red-600'}`}>
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="w-full flex flex-col sm:flex-row gap-3"
          >
            <button
              onClick={handleBackToIndex}
              disabled={joining}
              className={`flex-1 h-12 font-medium rounded-xl border transition-all uppercase tracking-widest text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${isDark ? 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border-white/10 hover:border-white/20' : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-200 hover:border-slate-300'}`}
            >
              <ArrowLeft size={16} />
              {t('join.confirmBack')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={joining}
              className="flex-1 h-12 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-[0_0_25px_rgba(37,99,235,0.4)] hover:shadow-[0_0_35px_rgba(37,99,235,0.6)] transition-all uppercase tracking-widest text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {joining ? (
                <><Loader2 size={16} className="animate-spin" />{t('join.joining')}</>
              ) : (
                <><Check size={16} />{t('join.confirmYes')}</>
              )}
            </button>
          </motion.div>
        </div>

        <div className="absolute bottom-0 w-full"><OtisakFooter /></div>
      </div>
    );
  }

  // ========================================
  // STARTING (brief transition)
  // ========================================
  if (phase === 'starting') {
    return (
      <div className={`min-h-screen w-full ${pageBg} flex flex-col items-center justify-center transition-colors`}>
        <ToggleCluster variant="solid" position="fixed" />
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${isDark ? 'bg-green-500/20' : 'bg-green-100'}`}>
            <Fingerprint className={`w-10 h-10 ${isDark ? 'text-green-400' : 'text-green-600'}`} strokeWidth={1.5} />
          </div>
          <h2 className={`text-2xl font-light tracking-[0.2em] uppercase mb-2 ${isDark ? 'text-green-400' : 'text-green-600'}`}>{t('join.examStarting')}</h2>
          <p className={`text-sm ${bodyText}`}>{t('join.redirecting')}</p>
        </motion.div>
      </div>
    );
  }

  // ========================================
  // WAITING LOBBY
  // ========================================
  return (
    <div className={`min-h-screen w-full ${pageBg} flex flex-col items-center justify-center relative overflow-hidden transition-colors`}>
      <ToggleCluster variant="solid" position="fixed" />
      {/* Background glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] animate-pulse ${glow1}`} />
        <div className={`absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] animate-pulse ${glow2}`} style={{ animationDelay: '1s' }} />
      </div>

      <div className="z-10 w-full max-w-2xl px-4 sm:px-6 flex flex-col items-center text-center">
        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="mb-8 sm:mb-12">
          <OtisakLogo className="w-14 h-14 sm:w-20 sm:h-20 drop-shadow-[0_0_15px_rgba(59,130,246,0.4)]" />
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.2 }} className="flex flex-col items-center mb-8 sm:mb-14">
          <h1 className={`text-3xl sm:text-5xl font-light mb-2 tracking-[0.2em] ${titleClass}`}>OTISAK</h1>
          <span className={`text-xs tracking-[0.4em] uppercase font-medium ${subtitleClass}`}>v 2.0</span>
        </motion.div>

        {/* User Info */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.4 }} className="flex flex-col items-center mb-8 sm:mb-14 w-full">
          <div className={`mb-3 text-xs sm:text-sm uppercase tracking-widest font-medium ${bodyText}`}>{t('join.loggedInAs')}</div>
          <div className={`flex items-center gap-3 sm:gap-4 px-4 sm:px-8 py-3 sm:py-4 rounded-xl backdrop-blur-sm max-w-full border ${indexChipBg}`}>
            <span className={`text-base sm:text-2xl font-light tracking-wide truncate ${titleClass}`}>
              {userName || t('exam.student')}
              <span className={`mx-1 sm:mx-2 ${isDark ? 'text-blue-500/50' : 'text-blue-400/60'}`}>|</span>
              <span className={`font-mono ${indexNumberClass}`}>{userIndex}</span>
            </span>
          </div>
        </motion.div>

        {/* Loading bar */}
        <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: '100%' }} transition={{ duration: 0.8, delay: 0.6 }} className="w-full max-w-sm sm:max-w-lg mb-10 relative">
          <div className={`h-2 rounded-full overflow-hidden border shadow-inner ${isDark ? 'bg-gray-800/50 border-gray-700/50' : 'bg-slate-200 border-slate-300'}`}>
            <div className="h-full bg-gradient-to-r from-blue-600 via-blue-400 to-blue-600 w-full origin-left animate-[otisak-progress_2s_ease-in-out_infinite] shadow-[0_0_15px_rgba(59,130,246,0.6)]" />
          </div>
          <div className="absolute -bottom-6 left-0 w-full text-center">
            <span className={`text-[10px] uppercase tracking-widest animate-pulse ${subtitleClass}`}>{t('join.waitingForInstructor')}</span>
          </div>
        </motion.div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.8 }} className={`text-xs sm:text-sm mb-10 sm:mb-16 mt-8 max-w-md leading-relaxed font-light px-2 ${bodyTextStrong}`}>
          {t('join.waitingDesc')}
        </motion.p>

        {/* Exam info */}
        {examInfo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className={`mb-8 px-6 py-4 rounded-xl border ${isDark ? 'bg-[#131520]/60 border-blue-500/10' : 'bg-white/80 border-slate-200'}`}>
            <p className={`font-light text-lg ${titleClass}`}>{examInfo.title}</p>
            <p className={`text-xs mt-1 ${bodyText}`}>{examInfo.duration_minutes} {t('join.minutes')} {examInfo.subject_name ? `| ${examInfo.subject_name}` : ''}</p>
          </motion.div>
        )}

        {/* Warning */}
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
