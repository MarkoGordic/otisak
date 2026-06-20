
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
        <div className={`max-w-2xl text-center text-sm leading-relaxed ${isDark ? 'text-red-400/80' : 'text-red-600/90'}`}>
          {t('footer.warning')}
        </div>
        <AppCopyright className="text-center" />
      </div>
    </footer>
  );
}
