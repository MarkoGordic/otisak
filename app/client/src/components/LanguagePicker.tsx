import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useLang } from './LangProvider';
import { useTheme } from './ThemeProvider';
import type { Locale } from '../lib/i18n';
import { Flag, type FlagCode } from './ui/Flag';

type LangOption = { code: Locale; label: string; short: string; flag: FlagCode };

// Order matches LOCALES. Labels are fixed (not localized) so the menu always
// reads the same regardless of the active UI language.
const LANGUAGES: LangOption[] = [
  { code: 'en', label: 'English', short: 'EN', flag: 'us' },
  { code: 'sr-Latn', label: 'Serbian (Latin)', short: 'SR', flag: 'rs' },
  { code: 'sr-Cyrl', label: 'Serbian (Cyrillic)', short: 'СР', flag: 'rs' },
  // Serbian Cyrillic ijekavica (Republika Srpska). Same label as above by
  // request; the Republika Srpska flag is the differentiator.
  { code: 'bs', label: 'Serbian (Cyrillic)', short: 'СР', flag: 'srpska' },
];

type Variant = 'glass' | 'solid' | 'sidebar';

// Dropdown language picker with country flags. Replaces the old cycle button.
// 'glass'/'solid' render the compact pill used by ToggleCluster on public
// pages; 'sidebar' renders the full-width row used inside the app shell.
export function LanguagePicker({
  variant = 'glass',
  placement = 'bottom',
  className = '',
}: {
  variant?: Variant;
  placement?: 'bottom' | 'top';
  className?: string;
}) {
  const { locale, setLocale } = useLang();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];

  const glassPill = isDark
    ? 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:border-white/20'
    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 shadow-sm';
  const solidPill =
    'bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]';

  let triggerClass: string;
  if (variant === 'sidebar') {
    triggerClass =
      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors';
  } else {
    const pill = variant === 'glass' ? glassPill : solidPill;
    triggerClass = `p-2.5 rounded-xl border ${variant === 'glass' ? 'backdrop-blur-sm' : ''} transition-colors flex items-center gap-1.5 ${pill}`;
  }

  const menuClass = `absolute z-50 min-w-[190px] py-1 rounded-xl border shadow-lg ${
    isDark ? 'bg-[#13131c] border-white/10' : 'bg-white border-slate-200'
  } ${placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} ${
    variant === 'sidebar' ? 'left-0' : 'right-0'
  }`;

  return (
    <div ref={ref} className={`relative ${variant === 'sidebar' ? 'w-full' : ''} ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={triggerClass}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${current.label}`}
      >
        <Flag code={current.flag} size={variant === 'sidebar' ? 18 : 16} />
        {variant === 'sidebar' ? (
          <>
            <span className="flex-1 text-left">{current.label}</span>
            <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </>
        ) : (
          <span className="text-xs font-semibold tracking-wider">{current.short}</span>
        )}
      </button>

      {open && (
        <div className={menuClass} role="listbox">
          {LANGUAGES.map((l) => {
            const active = l.code === locale;
            return (
              <button
                key={l.code}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setLocale(l.code);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                  isDark ? 'text-gray-200 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-100'
                } ${active ? 'font-semibold' : ''}`}
              >
                <Flag code={l.flag} size={18} />
                <span className="flex-1 text-left whitespace-nowrap">{l.label}</span>
                {active && <Check size={15} className="text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
