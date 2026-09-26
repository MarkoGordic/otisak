

import { Heart } from 'lucide-react';
import { useLang } from './LangProvider';

const START_YEAR = 2026;

// Small footer line. Rendered inside the sidebar on admin pages and inline at
// the bottom of public pages (login, home). The author name is kept a touch
// more prominent, and follows the active script (Cyrillic locales render
// "Марко Гордић").
export function AppCopyright({ className = '' }: { className?: string }) {
  const { t } = useLang();
  const year = new Date().getFullYear();
  // Single year until the calendar rolls over, then a range ("2026–2027").
  const years = year > START_YEAR ? `${START_YEAR}–${year}` : `${START_YEAR}`;
  return (
    <div
      className={`text-[13px] tracking-wide text-[var(--text-secondary)] opacity-90 select-none ${className}`}
    >
      © {years} made by <span className="font-semibold">{t('app.author')}</span> with{' '}
      <Heart
        className="inline-block h-3.5 w-3.5 -mt-0.5 fill-red-500 text-red-500"
        aria-label="love"
      />{' '}
      | K.
    </div>
  );
}
