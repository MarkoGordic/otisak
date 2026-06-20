import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { t as translate, type Locale, normalizeLocale, nextLocale } from '../lib/i18n';

const LangContext = createContext<{
  locale: Locale;
  setLocale: (l: Locale) => void;
  cycleLocale: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}>({
  locale: 'sr-Latn',
  setLocale: () => {},
  cycleLocale: () => {},
  t: (key) => key,
});

export function useLang() {
  return useContext(LangContext);
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('sr-Latn');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('otisak-lang');
    setLocaleState(normalizeLocale(stored));
    setMounted(true);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('otisak-lang', l);
  }, []);

  const cycleLocale = useCallback(() => {
    setLocaleState((prev) => {
      const next = nextLocale(prev);
      localStorage.setItem('otisak-lang', next);
      return next;
    });
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    return translate(key, locale, params);
  }, [locale]);

  if (!mounted) return null;

  return (
    <LangContext.Provider value={{ locale, setLocale, cycleLocale, t }}>
      {children}
    </LangContext.Provider>
  );
}
