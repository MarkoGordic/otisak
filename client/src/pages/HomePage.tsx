import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, RefreshCw, Clock, BookOpen, ArrowRight, ShieldCheck } from 'lucide-react';
import { OtisakLogo, OtisakFooter } from '../components/otisak';
import { useLang } from '../components/LangProvider';

type ActiveExam = {
  id: string;
  title: string;
  duration_minutes: number;
  subject_name: string | null;
  subject_code: string | null;
  exam_started_at: string | null;
};

export default function HomePage() {
  const navigate = useNavigate();
  const { t } = useLang();
  const [exams, setExams] = useState<ActiveExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/otisak/exams/active');
      if (res.ok) {
        const data = await res.json();
        setExams(data.exams || []);
      }
    } catch { /* silent */ }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Admin/assistant: this isn't a meaningful screen — push them to the dashboard.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && data.authenticated && (data.user?.role === 'admin' || data.user?.role === 'assistant')) {
          navigate('/dashboard', { replace: true });
        }
      } catch { /* student or unauthenticated — stay on the picker */ }
    })();
    return () => { mounted = false; };
  }, [navigate]);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(), 5000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="min-h-screen w-full bg-[#0a0a14] flex flex-col items-center relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-blue-600/20 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-blue-600/15 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Admin login link */}
      <button
        onClick={() => navigate('/admin')}
        className="absolute top-4 right-4 z-20 flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all backdrop-blur-sm text-xs uppercase tracking-widest"
      >
        <ShieldCheck size={14} />
        {t('home.adminLogin')}
      </button>

      <div className="z-10 w-full max-w-3xl px-4 sm:px-6 pt-16 sm:pt-24 pb-12 flex flex-col items-center text-center">
        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <OtisakLogo className="w-16 h-16 sm:w-20 sm:h-20 drop-shadow-[0_0_15px_rgba(59,130,246,0.4)] mb-6" />
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.2 }} className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-light text-white mb-2 tracking-[0.2em] drop-shadow-lg">OTISAK</h1>
          <span className="text-xs text-blue-400/80 tracking-[0.4em] uppercase font-medium">v 2.0</span>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mb-8">
          <h2 className="text-xl sm:text-2xl text-white font-light tracking-wide mb-2">{t('home.title')}</h2>
          <p className="text-sm text-gray-400">{t('home.subtitle')}</p>
        </motion.div>

        <div className="w-full flex items-center justify-end mb-3">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all text-xs uppercase tracking-widest disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            {t('home.refresh')}
          </button>
        </div>

        {loading ? (
          <div className="w-full py-20 flex justify-center">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
        ) : exams.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full py-16 px-6 bg-[#131520]/60 border border-blue-500/10 rounded-xl text-center"
          >
            <BookOpen className="w-12 h-12 text-gray-600 mx-auto mb-4" strokeWidth={1.5} />
            <p className="text-gray-400 text-sm">{t('home.noActive')}</p>
          </motion.div>
        ) : (
          <div className="w-full space-y-3">
            {exams.map((exam, idx) => {
              const started = !!exam.exam_started_at;
              return (
                <motion.button
                  key={exam.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * idx }}
                  onClick={() => navigate(`/join/${exam.id}`)}
                  className="w-full group bg-[#131520]/80 hover:bg-[#1a1d2e]/80 border border-blue-500/20 hover:border-blue-500/50 rounded-xl px-5 py-4 backdrop-blur-sm transition-all text-left flex items-center gap-4 hover:shadow-[0_0_25px_rgba(59,130,246,0.15)]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span
                        className={`text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded-full border ${
                          started
                            ? 'bg-green-500/10 border-green-500/30 text-green-400'
                            : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                        }`}
                      >
                        {started ? t('home.inProgress') : t('home.waiting')}
                      </span>
                      {exam.subject_name && (
                        <span className="text-[10px] text-blue-400/70 uppercase tracking-widest">
                          {exam.subject_name}
                        </span>
                      )}
                    </div>
                    <div className="text-base sm:text-lg text-white font-light truncate">{exam.title}</div>
                    <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-500">
                      <Clock size={12} />
                      <span>{exam.duration_minutes} {t('home.minutes')}</span>
                    </div>
                  </div>
                  <ArrowRight
                    size={18}
                    className="text-blue-400/50 group-hover:text-blue-400 group-hover:translate-x-1 transition-all flex-shrink-0"
                  />
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      <div className="absolute bottom-0 w-full"><OtisakFooter /></div>
    </div>
  );
}
