import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, RefreshCw, Clock, BookOpen, ArrowRight, ShieldCheck } from 'lucide-react';
import { OtisakLogo, OtisakFooter } from '../components/otisak';
import { useLang } from '../components/LangProvider';
import { useTheme } from '../components/ThemeProvider';
import { ToggleCluster } from '../components/ToggleCluster';

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
  const { theme } = useTheme();
  const isDark = theme === 'dark';
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

  // Admin/assistant: this isn't a meaningful screen - push them to the dashboard.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && data.authenticated && (data.user?.role === 'admin' || data.user?.role === 'assistant')) {
          navigate('/admin/home', { replace: true });
        }
      } catch { /* student or unauthenticated - stay on the picker */ }
    })();
    return () => { mounted = false; };
  }, [navigate]);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(), 5000);
    return () => clearInterval(interval);
  }, [load]);

  // Theme-aware palette helpers - keeps the JSX readable.
  const pageBg = isDark ? 'bg-[#0a0a14]' : 'bg-[#F8FAFC]';
  const titleClass = isDark ? 'text-white drop-shadow-lg' : 'text-slate-900';
  const subtitleClass = isDark ? 'text-gray-400' : 'text-slate-600';
  const versionClass = isDark ? 'text-blue-400/80' : 'text-blue-600/70';
  const sectionTitleClass = isDark ? 'text-white' : 'text-slate-900';
  const togglePillClass = isDark
    ? 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-white/20'
    : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 shadow-sm';
  const cardEmptyBg = isDark
    ? 'bg-[#131520]/60 border-blue-500/10'
    : 'bg-white border-slate-200 shadow-sm';
  const cardItemBg = isDark
    ? 'bg-[#131520]/80 hover:bg-[#1a1d2e]/80 border-blue-500/20 hover:border-blue-500/50 hover:shadow-[0_0_25px_rgba(59,130,246,0.15)]'
    : 'bg-white hover:bg-blue-50 border-slate-200 hover:border-blue-400 shadow-sm hover:shadow-md';
  const examTitleClass = isDark ? 'text-white' : 'text-slate-900';
  const examMetaClass = isDark ? 'text-gray-500' : 'text-slate-500';
  const subjectChipClass = isDark ? 'text-blue-400/70' : 'text-blue-600';
  const arrowClass = isDark
    ? 'text-blue-400/50 group-hover:text-blue-400'
    : 'text-blue-500 group-hover:text-blue-700';
  const emptyIconClass = isDark ? 'text-gray-600' : 'text-slate-400';
  const emptyTextClass = isDark ? 'text-gray-400' : 'text-slate-500';

  return (
    <div className={`min-h-screen w-full ${pageBg} flex flex-col items-center relative overflow-hidden transition-colors`}>
      {/* Background glows - softer in light mode so they don't blow out the page */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] animate-pulse ${isDark ? 'bg-blue-600/20' : 'bg-blue-400/30'}`} />
        <div className={`absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] animate-pulse ${isDark ? 'bg-blue-600/15' : 'bg-indigo-300/30'}`} style={{ animationDelay: '1s' }} />
      </div>

      {/* Top-right cluster: theme toggle, language toggle, admin login */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <ToggleCluster position="static" variant="glass" />
        <button
          onClick={() => navigate('/admin')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border backdrop-blur-sm transition-colors text-xs uppercase tracking-widest ${togglePillClass}`}
        >
          <ShieldCheck size={14} />
          {t('home.adminLogin')}
        </button>
      </div>

      <div className="z-10 w-full max-w-3xl px-4 sm:px-6 pt-16 sm:pt-24 pb-12 flex flex-col items-center text-center">
        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <OtisakLogo className="w-16 h-16 sm:w-20 sm:h-20 drop-shadow-[0_0_15px_rgba(59,130,246,0.4)] mb-6" />
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.2 }} className="mb-10">
          <h1 className={`text-3xl sm:text-4xl font-light mb-2 tracking-[0.2em] ${titleClass}`}>OTISAK</h1>
          <span className={`text-xs tracking-[0.4em] uppercase font-medium ${versionClass}`}>v 2.0</span>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mb-8">
          <h2 className={`text-xl sm:text-2xl font-light tracking-wide mb-2 ${sectionTitleClass}`}>{t('home.title')}</h2>
          <p className={`text-sm ${subtitleClass}`}>{t('home.subtitle')}</p>
        </motion.div>

        <div className="w-full flex items-center justify-end mb-3">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border backdrop-blur-sm transition-all text-xs uppercase tracking-widest disabled:opacity-50 ${togglePillClass}`}
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            {t('home.refresh')}
          </button>
        </div>

        {loading ? (
          <div className="w-full py-20 flex justify-center">
            <Loader2 className={`w-8 h-8 animate-spin ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
          </div>
        ) : exams.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`w-full py-16 px-6 rounded-xl text-center border ${cardEmptyBg}`}
          >
            <BookOpen className={`w-12 h-12 mx-auto mb-4 ${emptyIconClass}`} strokeWidth={1.5} />
            <p className={`text-sm ${emptyTextClass}`}>{t('home.noActive')}</p>
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
                  className={`w-full group rounded-xl px-5 py-4 backdrop-blur-sm transition-all text-left flex items-center gap-4 border ${cardItemBg}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span
                        className={`text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded-full border ${
                          started
                            ? isDark
                              ? 'bg-green-500/10 border-green-500/30 text-green-400'
                              : 'bg-green-50 border-green-300 text-green-700'
                            : isDark
                              ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                              : 'bg-amber-50 border-amber-300 text-amber-700'
                        }`}
                      >
                        {started ? t('home.inProgress') : t('home.waiting')}
                      </span>
                      {exam.subject_name && (
                        <span className={`text-[10px] uppercase tracking-widest ${subjectChipClass}`}>
                          {exam.subject_name}
                        </span>
                      )}
                    </div>
                    <div className={`text-base sm:text-lg font-light truncate ${examTitleClass}`}>{exam.title}</div>
                    <div className={`flex items-center gap-1.5 mt-1.5 text-xs ${examMetaClass}`}>
                      <Clock size={12} />
                      <span>{exam.duration_minutes} {t('home.minutes')}</span>
                    </div>
                  </div>
                  <ArrowRight
                    size={18}
                    className={`group-hover:translate-x-1 transition-all flex-shrink-0 ${arrowClass}`}
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
