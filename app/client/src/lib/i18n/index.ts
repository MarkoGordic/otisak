import sr from './sr';
import srCyrl from './sr-cyrl';
import bs from './bs';
import en, { type I18nKey } from './en';

export type Locale = 'en' | 'sr-Latn' | 'sr-Cyrl' | 'bs';
export type { I18nKey };

const translations: Record<Locale, Record<I18nKey, string>> = {
  'en': en,
  'sr-Latn': sr,
  'sr-Cyrl': srCyrl,
  'bs': bs,
};

export const LOCALES: Locale[] = ['en', 'sr-Latn', 'sr-Cyrl', 'bs'];

// Accept legacy 'sr' values from older localStorage entries and map to sr-Latn.
export function normalizeLocale(value: string | null | undefined): Locale {
  if (value === 'sr-Latn' || value === 'sr-Cyrl' || value === 'en' || value === 'bs') return value;
  if (value === 'sr') return 'sr-Latn';
  return 'sr-Latn';
}

export function nextLocale(current: Locale): Locale {
  const idx = LOCALES.indexOf(current);
  return LOCALES[(idx + 1) % LOCALES.length];
}

export function t(key: string, locale: Locale = 'sr-Latn', params?: Record<string, string | number>): string {
  // Cast: callers historically pass plain strings, and runtime fallback to the
  // key itself is desirable when a key is missing. The strong typing happens
  // inside the locale files (Record<I18nKey, string>), which is what catches
  // drift at build time.
  const k = key as I18nKey;
  let text = translations[locale]?.[k] || translations['en']?.[k] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

export { sr, srCyrl, bs, en };
