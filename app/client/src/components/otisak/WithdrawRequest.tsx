import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Loader2, Clock } from 'lucide-react';
import { useLang } from '../LangProvider';
import { useTheme } from '../ThemeProvider';

// Student side of withdrawing from an exam. The student asks, an assistant in
// the room approves or denies; nothing happens to the attempt until then.

export function WithdrawButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  const { t } = useLang();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={onClick}
      title={t('withdraw.button')}
      className={`inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium transition-colors ${
        compact ? 'h-9 sm:h-10 px-3' : 'h-10 px-5 uppercase tracking-wider'
      } ${
        isDark
          ? 'border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/5'
          : 'border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50'
      }`}
    >
      <LogOut className="w-3.5 h-3.5" />
      <span className={compact ? 'hidden md:inline' : ''}>{t('withdraw.button')}</span>
    </button>
  );
}

// Shown instead of the button while the request waits for the assistant.
export function WithdrawPending({
  onCancel,
  cancelling,
}: {
  onCancel: () => void;
  cancelling: boolean;
}) {
  const { t } = useLang();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <div
      className={`inline-flex items-center gap-2 py-1.5 pl-3 pr-1.5 rounded-full border text-xs ${
        isDark
          ? 'bg-amber-500/[0.07] border-amber-500/20 text-amber-200/90'
          : 'bg-amber-50 border-amber-200 text-amber-800'
      }`}
    >
      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
      <span>{t('withdraw.pending')}</span>
      <button
        type="button"
        onClick={onCancel}
        disabled={cancelling}
        className={`px-2.5 py-1 rounded-full font-medium transition-colors disabled:opacity-50 ${
          isDark ? 'hover:bg-white/10' : 'hover:bg-amber-100'
        }`}
      >
        {cancelling ? <Loader2 className="w-3 h-3 animate-spin" /> : t('withdraw.cancelRequest')}
      </button>
    </div>
  );
}

export function WithdrawModal({
  open,
  inExam,
  sending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  inExam: boolean;
  sending: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const { t } = useLang();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [reason, setReason] = useState('');
  const titleText = isDark ? 'text-white' : 'text-slate-900';
  const subText = isDark ? 'text-gray-400' : 'text-slate-500';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !sending && onClose()}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 20 }}
            onClick={(e) => e.stopPropagation()}
            className={`rounded-2xl max-w-md w-full p-6 sm:p-8 border text-left ${isDark ? 'bg-[#131520] border-blue-500/30 shadow-[0_0_60px_rgba(59,130,246,0.2)]' : 'bg-white border-slate-200 shadow-xl'}`}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-10 h-10 rounded-xl border flex items-center justify-center ${isDark ? 'bg-red-500/15 border-red-500/30' : 'bg-red-50 border-red-200'}`}
              >
                <LogOut className={`w-5 h-5 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
              </div>
              <h3 className={`text-lg font-medium ${titleText}`}>{t('withdraw.title')}</h3>
            </div>
            <p className={`text-sm leading-relaxed mb-2 ${subText}`}>
              {t(inExam ? 'withdraw.bodyExam' : 'withdraw.bodyLobby')}
            </p>
            <p
              className={`text-xs leading-relaxed mb-4 ${isDark ? 'text-amber-400/80' : 'text-amber-700'}`}
            >
              {t('withdraw.warning')}
            </p>
            <label className={`block text-xs mb-1.5 ${subText}`}>{t('withdraw.reason')}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              className={`w-full rounded-xl px-3 py-2 text-sm mb-6 resize-none border focus:outline-none ${isDark ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-blue-500/50' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-400'}`}
              placeholder={t('withdraw.reasonPlaceholder')}
            />
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onClose}
                disabled={sending}
                className={`flex-1 h-11 font-medium rounded-xl border transition-all uppercase tracking-widest text-xs disabled:opacity-40 ${isDark ? 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'}`}
              >
                {t('withdraw.keep')}
              </button>
              <button
                onClick={() => onSubmit(reason)}
                disabled={sending}
                className="flex-1 h-11 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl transition-all uppercase tracking-widest text-xs disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {sending && <Loader2 size={14} className="animate-spin" />}
                {t('withdraw.send')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
