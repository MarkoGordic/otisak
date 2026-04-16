'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Fingerprint, AlertTriangle, Power, Hash } from 'lucide-react';
import { OtisakLogo, OtisakFooter } from '@/components/otisak';
import { useLang } from '@/components/LangProvider';

type Phase = 'index-entry' | 'waiting' | 'starting' | 'error';

type ExamInfo = {
  title: string;
  status: string;
  exam_started_at: string | null;
  duration_minutes: number;
  subject_name: string | null;
};

export default function JoinExamPage() {
  const router = useRouter();
  const { examId } = useParams<{ examId: string }>()!;
  const { t } = useLang();

  const [phase, setPhase] = useState<Phase>('index-entry');
  const [indexNumber, setIndexNumber] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [userName, setUserName] = useState('');
  const [userIndex, setUserIndex] = useState('');
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

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

  // Join with index number
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!indexNumber.trim()) return;
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
        setError(data.error || 'Failed to join.');
        return;
      }

      setUserName(data.user?.name || '');
      setUserIndex(data.user?.index_number || indexNumber);
      setPhase('waiting');
    } catch {
      setError(t('join.networkError'));
    } finally {
      setJoining(false);
    }
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
          router.push(`/exam/${examId}`);
        }, 1500);
      }
    } catch { /* silent */ }
  }, [examId, router]);

  useEffect(() => {
    if (phase !== 'waiting') return;
    pollRef.current = setInterval(pollForStart, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [phase, pollForStart]);

  // ========================================
  // ERROR
  // ========================================
  if (phase === 'error') {
    return (
      <div className="min-h-screen w-full bg-[#0a0a14] flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-400/60 mx-auto mb-4" />
          <h1 className="text-xl text-white font-light mb-2">{t('join.cannotJoin')}</h1>
          <p className="text-gray-400 text-sm mb-6">{error}</p>
          <button onClick={() => window.history.back()} className="text-blue-400 hover:text-blue-300 text-sm">{t('join.goBack')}</button>
        </div>
      </div>
    );
  }

  // ========================================
  // INDEX ENTRY SCREEN
  // ========================================
  if (phase === 'index-entry') {
    return (
      <div className="min-h-screen w-full bg-[#0a0a14] flex flex-col items-center justify-center relative overflow-hidden">
        {/* Background glows */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-blue-600/20 rounded-full blur-[150px] animate-pulse" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-blue-600/15 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        <div className="z-10 w-full max-w-md px-4 sm:px-6 flex flex-col items-center text-center">
          {/* Logo */}
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <OtisakLogo className="w-16 h-16 sm:w-20 sm:h-20 drop-shadow-[0_0_15px_rgba(59,130,246,0.4)] mb-6" />
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.2 }} className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-light text-white mb-2 tracking-[0.2em] drop-shadow-lg">OTISAK</h1>
            <span className="text-xs text-blue-400/80 tracking-[0.4em] uppercase font-medium">v 2.0</span>
          </motion.div>

          {/* Exam info */}
          {examInfo && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mb-8 w-full">
              <div className="bg-[#131520]/80 border border-blue-500/20 rounded-xl px-5 py-4 backdrop-blur-sm">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">{t('join.joiningExam')}</p>
                <p className="text-lg text-white font-light">{examInfo.title}</p>
                {examInfo.subject_name && <p className="text-xs text-blue-400/60 mt-1">{examInfo.subject_name}</p>}
                <p className="text-[11px] text-gray-500 mt-2">{examInfo.duration_minutes} {t('join.minutes')}</p>
              </div>
            </motion.div>
          )}

          {/* Index number form */}
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            onSubmit={handleJoin}
            className="w-full space-y-4"
          >
            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-widest mb-2 text-left font-medium">
                {t('join.enterIndex')}
              </label>
              <div className="relative">
                <Hash size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400/40" />
                <input
                  type="text"
                  value={indexNumber}
                  onChange={(e) => setIndexNumber(e.target.value)}
                  placeholder={t('join.indexPlaceholder')}
                  required
                  autoFocus
                  className="w-full h-14 pl-11 pr-4 bg-[#131520]/80 border border-blue-500/20 rounded-xl text-white text-lg font-mono placeholder-white/15 focus:outline-none focus:border-blue-500/50 focus:shadow-[0_0_20px_rgba(59,130,246,0.15)] transition-all"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <AlertTriangle size={14} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={joining || !indexNumber.trim()}
              className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-[0_0_25px_rgba(37,99,235,0.4)] hover:shadow-[0_0_35px_rgba(37,99,235,0.6)] transition-all uppercase tracking-widest text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {joining ? (
                <><Loader2 size={16} className="animate-spin" />{t('join.joining')}</>
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
  // STARTING (brief transition)
  // ========================================
  if (phase === 'starting') {
    return (
      <div className="min-h-screen w-full bg-[#0a0a14] flex flex-col items-center justify-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <Fingerprint className="w-10 h-10 text-green-400" strokeWidth={1.5} />
          </div>
          <h2 className="text-2xl text-green-400 font-light tracking-[0.2em] uppercase mb-2">{t('join.examStarting')}</h2>
          <p className="text-gray-400 text-sm">{t('join.redirecting')}</p>
        </motion.div>
      </div>
    );
  }

  // ========================================
  // WAITING LOBBY
  // ========================================
  return (
    <div className="min-h-screen w-full bg-[#0a0a14] flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-blue-600/20 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-blue-600/15 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="z-10 w-full max-w-2xl px-4 sm:px-6 flex flex-col items-center text-center">
        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="mb-8 sm:mb-12">
          <OtisakLogo className="w-14 h-14 sm:w-20 sm:h-20 drop-shadow-[0_0_15px_rgba(59,130,246,0.4)]" />
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.2 }} className="flex flex-col items-center mb-8 sm:mb-14">
          <h1 className="text-3xl sm:text-5xl font-light text-white mb-2 tracking-[0.2em] drop-shadow-lg">OTISAK</h1>
          <span className="text-xs text-blue-400/80 tracking-[0.4em] uppercase font-medium">v 2.0</span>
        </motion.div>

        {/* User Info */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.4 }} className="flex flex-col items-center mb-8 sm:mb-14 w-full">
          <div className="mb-3 text-gray-400 text-xs sm:text-sm uppercase tracking-widest font-medium">{t('join.loggedInAs')}</div>
          <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-8 py-3 sm:py-4 bg-[#131520]/80 border border-blue-500/20 rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.3)] backdrop-blur-sm max-w-full">
            <span className="text-base sm:text-2xl text-white font-light tracking-wide truncate">
              {userName || t('exam.student')}
              <span className="text-blue-500/50 mx-1 sm:mx-2">|</span>
              <span className="font-mono text-blue-300">{userIndex}</span>
            </span>
          </div>
        </motion.div>

        {/* Loading bar */}
        <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: '100%' }} transition={{ duration: 0.8, delay: 0.6 }} className="w-full max-w-sm sm:max-w-lg mb-10 relative">
          <div className="h-2 bg-gray-800/50 rounded-full overflow-hidden border border-gray-700/50 shadow-inner">
            <div className="h-full bg-gradient-to-r from-blue-600 via-blue-400 to-blue-600 w-full origin-left animate-[otisak-progress_2s_ease-in-out_infinite] shadow-[0_0_15px_rgba(59,130,246,0.6)]" />
          </div>
          <div className="absolute -bottom-6 left-0 w-full text-center">
            <span className="text-blue-400/60 text-[10px] uppercase tracking-widest animate-pulse">{t('join.waitingForInstructor')}</span>
          </div>
        </motion.div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.8 }} className="text-gray-300 text-xs sm:text-sm mb-10 sm:mb-16 mt-8 max-w-md leading-relaxed font-light px-2">
          {t('join.waitingDesc')}
        </motion.p>

        {/* Exam info */}
        {examInfo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="mb-8 px-6 py-4 bg-[#131520]/60 border border-blue-500/10 rounded-xl">
            <p className="text-white font-light text-lg">{examInfo.title}</p>
            <p className="text-gray-500 text-xs mt-1">{examInfo.duration_minutes} {t('join.minutes')} {examInfo.subject_name ? `| ${examInfo.subject_name}` : ''}</p>
          </motion.div>
        )}

        {/* Warning */}
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
