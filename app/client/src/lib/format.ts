// Shared date/time formatting helpers, extracted from copies that had drifted
// across pages. The variants are intentionally distinct (long vs short duration,
// Serbian vs relative-English date) so each call site keeps its exact output.

const NO_VALUE = '-';

// "Xh Ym" / "Xm Ys" / "Xs". Used in exam stats and the user profile.
export function formatDurationLong(s: number): string {
  if (!s || s <= 0) return '0s';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// "Xm Ys" / "Xs" (no hours bucket). Used on the student dashboard.
export function formatDurationShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// "mm:ss". Used for the live elapsed timer in the room view.
export function formatElapsed(secs: number): string {
  if (!secs || secs < 0) return '00:00';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// "DD.MM.YYYY" (Serbian). Used in the user profile.
export function formatDateSr(d: string | Date | null): string {
  if (!d) return NO_VALUE;
  const dt = new Date(d);
  return dt
    .toLocaleDateString('sr-RS', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .replace(/\//g, '.');
}

// Relative English date: "Today, HH:MM" for today, else "DD Mon YYYY". Used on
// the student dashboard.
export function formatDateRelativeEn(d: string | Date | null): string {
  if (!d) return NO_VALUE;
  const date = new Date(d);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `Today, ${date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Intl locale per app language. 'bs' is the Republika Srpska variant (Cyrillic).
const INTL_LOCALE: Record<string, string> = {
  en: 'en-GB',
  'sr-Latn': 'sr-Latn-RS',
  'sr-Cyrl': 'sr-Cyrl-RS',
  bs: 'sr-Cyrl-BA',
};

// formatDateRelativeEn in the user's language: "Danas, 10:41" or "1. nov 2026.".
export function formatDateRelative(
  d: string | Date | null,
  locale: string,
  todayLabel: string,
): string {
  if (!d) return NO_VALUE;
  const date = new Date(d);
  const intl = INTL_LOCALE[locale] || 'en-GB';
  if (date.toDateString() === new Date().toDateString()) {
    return `${todayLabel}, ${date.toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' });
}
