import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useLang } from '../LangProvider';

export function OtisakFooter() {
  const { t } = useLang();
  return (
    <footer className="w-full py-4 px-6 mt-auto">
      <div className="max-w-4xl mx-auto flex items-center justify-center gap-2 text-[11px] text-red-400/50 tracking-wider uppercase">
        <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
        <span>{t('footer.warning')}</span>
      </div>
    </footer>
  );
}
