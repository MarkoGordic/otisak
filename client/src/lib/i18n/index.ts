import sr from './sr';
import srCyrl from './sr-cyrl';
import en from './en';

export type Locale = 'en' | 'sr-Latn' | 'sr-Cyrl';

const translations: Record<Locale, Record<string, string>> = {
  'en': en,
  'sr-Latn': sr,
  'sr-Cyrl': srCyrl,
};

export const LOCALES: Locale[] = ['en', 'sr-Latn', 'sr-Cyrl'];

// Accept legacy 'sr' values from older localStorage entries and map to sr-Latn.
export function normalizeLocale(value: string | null | undefined): Locale {
  if (value === 'sr-Latn' || value === 'sr-Cyrl' || value === 'en') return value;
  if (value === 'sr') return 'sr-Latn';
  return 'sr-Latn';
}

export function nextLocale(current: Locale): Locale {
  const idx = LOCALES.indexOf(current);
  return LOCALES[(idx + 1) % LOCALES.length];
}

export function t(key: string, locale: Locale = 'sr-Latn', params?: Record<string, string | number>): string {
  let text = translations[locale]?.[key] || translations['en']?.[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

export { sr, srCyrl, en };
