import { useNavigate } from 'react-router-dom';
import { Compass, ArrowLeft } from 'lucide-react';
import { useTheme } from '../components/ThemeProvider';
import { useLang } from '../components/LangProvider';
import { AppCopyright } from '../components/AppCopyright';

// Catch-all page for unknown routes. Without this, an unmatched path (e.g. a
// stale link or a bad redirect) renders nothing at all — a blank screen.
export default function NotFoundPage() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { t } = useLang();
  const isDark = theme === 'dark';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg-secondary)]">
      <div className="w-full max-w-[420px] text-center">
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl border mb-6 ${isDark ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-200'}`}>
          <Compass className={`w-8 h-8 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} strokeWidth={1.5} />
        </div>
        <h1 className="text-5xl font-light tracking-tight text-[var(--text-primary)] mb-3">404</h1>
        <p className="text-base font-medium text-[var(--text-primary)] mb-1">{t('notfound.title')}</p>
        <p className="text-sm text-[var(--text-secondary)] mb-8">{t('notfound.desc')}</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors"
        >
          <ArrowLeft size={16} />
          {t('notfound.home')}
        </button>
        <AppCopyright className="mt-10" />
      </div>
    </div>
  );
}
