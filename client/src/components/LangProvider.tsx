import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { t as translate, type Locale } from '../lib/i18n';

const LangContext = createContext<{
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}>({
  locale: 'sr',
  setLocale: () => {},
  t: (key) => key,
});

export function useLang() {
  return useContext(LangContext);
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('sr');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('otisak-lang') as Locale | null;
    if (stored === 'sr' || stored === 'en') {
      setLocaleState(stored);
    }
    setMounted(true);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('otisak-lang', l);
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    return translate(key, locale, params);
  }, [locale]);

  if (!mounted) return null;

  return (
    <LangContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LangContext.Provider>
  );
}
