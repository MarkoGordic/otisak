
import { Sun, Moon, Languages } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { useLang } from './LangProvider';
import { nextLocale } from '../lib/i18n';

type ToggleClusterProps = {
  // 'glass' = backdrop-blur over background glows (HomePage/LoginPage style).
  // 'solid' = solid surface, for places where blur looks washed out (ExamPage during lockdown, etc.).
  variant?: 'glass' | 'solid';
  // 'absolute' / 'fixed' anchor to the top-right corner; 'static' lets the parent control layout.
  position?: 'absolute' | 'fixed' | 'static';
  className?: string;
};

export function ToggleCluster({ variant = 'glass', position = 'absolute', className = '' }: ToggleClusterProps) {
  const { theme, toggle } = useTheme();
  const { locale, cycleLocale, t } = useLang();
  const isDark = theme === 'dark';

  // Match HomePage/LoginPage pill stylings so existing pages look identical after refactor.
  const glassPill = isDark
    ? 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-white/20'
    : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 shadow-sm';
  const solidPill = 'bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]';
  const pillClass = `p-2.5 rounded-xl border ${variant === 'glass' ? 'backdrop-blur-sm' : ''} transition-colors ${variant === 'glass' ? glassPill : solidPill}`;

  const next = nextLocale(locale);
  const nextLabel = t(`lang.next.${next}`);
  const currentShort = t(`lang.short.${locale}`);

  let wrapperClass: string;
  if (position === 'absolute') wrapperClass = `absolute top-4 right-4 z-20 flex items-center gap-2 ${className}`;
  else if (position === 'fixed') wrapperClass = `fixed top-4 right-4 z-20 flex items-center gap-2 ${className}`;
  else wrapperClass = `flex items-center gap-2 ${className}`;

  return (
    <div className={wrapperClass}>
      <button
        type="button"
        onClick={toggle}
        className={pillClass}
        title={isDark ? t('login.switchLight') : t('login.switchDark')}
        aria-label={isDark ? t('login.switchLight') : t('login.switchDark')}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <button
        type="button"
        onClick={cycleLocale}
        className={`${pillClass} flex items-center gap-1.5`}
        title={nextLabel}
        aria-label={nextLabel}
      >
        <Languages size={16} />
        <span className="text-xs font-semibold tracking-wider">{currentShort}</span>
      </button>
    </div>
  );
}
