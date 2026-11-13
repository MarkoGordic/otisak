import { Heart } from 'lucide-react';
import { useLang } from './LangProvider';

const START_YEAR = 2026;

// The copyright line. Where it shows:
//   - pinned to the bottom of the desktop Sidebar, so every signed-in page
//     carries it without taking any room from the content (compact variant);
//   - <PageCopyright /> at the end of a Sidebar page's content, mobile only
//     (the Sidebar is hidden there, and desktop already has it pinned);
//   - inline at the bottom of public and exam pages via OtisakFooter.
// К. is set apart in pink italic; on hover the heart beats. The author name follows the active script (Cyrillic locales render
// "Марко Гордић").
export function AppCopyright({
  className = '',
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { t } = useLang();
  const year = new Date().getFullYear();
  // Single year until the calendar rolls over, then a range ("2026–2027").
  const years = year > START_YEAR ? `${START_YEAR}–${year}` : `${START_YEAR}`;
  const heart = compact ? 'h-3 w-3' : 'h-3.5 w-3.5';
  return (
    <div
      className={`${compact ? 'text-[11px] text-[var(--text-muted)] whitespace-nowrap' : 'text-[13px] text-[var(--text-secondary)] opacity-90 tracking-wide'} select-none ${className}`}
    >
      © {years} made by <span className="font-semibold">{t('app.author')}</span>{' '}
      {/* Hover (or tap/focus) makes the heart beat; styles in index.css. */}
      <span className="k-group" tabIndex={0}>
        with
        <Heart
          className={`k-heart ${heart} self-center fill-red-500 text-red-500`}
          aria-label="love"
        />
        for <span className="k-sig">К.</span>
      </span>
    </div>
  );
}

// End-of-content copyright for pages that render the Sidebar. Hidden on
// desktop, where the Sidebar already shows it.
export function PageCopyright() {
  return (
    <div className="lg:hidden mt-auto px-4 pb-6 pt-2 flex justify-center">
      <AppCopyright className="text-center" />
    </div>
  );
}
