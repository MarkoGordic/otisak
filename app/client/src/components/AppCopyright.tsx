

import { useLang } from './LangProvider';

// Small footer line. Rendered inside the sidebar on admin pages and inline at
// the bottom of public pages (login, home). The author name is kept a touch
// more prominent, and follows the active script (Cyrillic locales render
// "Марко Гордић").
export function AppCopyright({ className = '' }: { className?: string }) {
  const { t } = useLang();
  return (
    <div
      className={`text-[13px] tracking-wide text-[var(--text-secondary)] opacity-90 select-none ${className}`}
    >
      © <span className="font-semibold">{t('app.author')}</span>
    </div>
  );
}
