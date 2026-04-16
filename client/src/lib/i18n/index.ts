import sr from './sr';
import en from './en';

export type Locale = 'sr' | 'en';

const translations: Record<Locale, Record<string, string>> = { sr, en };

export function t(key: string, locale: Locale = 'sr', params?: Record<string, string | number>): string {
  let text = translations[locale]?.[key] || translations['en']?.[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

export { sr, en };
