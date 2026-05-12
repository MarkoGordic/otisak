import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useLang } from '../LangProvider';
import { useTheme } from '../ThemeProvider';
import { AppCopyright } from '../AppCopyright';

export function OtisakFooter() {
  const { t } = useLang();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <footer className="w-full py-4 px-6 mt-auto">
      <div className="max-w-4xl mx-auto flex flex-col items-center gap-1.5">
        <div className={`flex items-center justify-center gap-2 text-[11px] tracking-wider uppercase ${isDark ? 'text-red-400/50' : 'text-red-500/70'}`}>
          <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{t('footer.warning')}</span>
        </div>
        <AppCopyright className="text-center" />
      </div>
    </footer>
  );
}
