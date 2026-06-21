import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Info, AlertTriangle, Megaphone, X as XIcon } from 'lucide-react';

// 'message' is a prominent, sticky variant used for assistant-to-student
// broadcasts; the others are the everyday app feedback toasts.
export type ToastKind = 'success' | 'info' | 'warning' | 'error' | 'message';

export type Toast = {
  id: number;
  kind: ToastKind;
  title?: string;
  message: string;
  // duration in ms; 0 = sticky (no auto-dismiss).
  duration?: number;
};

type ToastInput = Omit<Toast, 'id'> | string;

type Ctx = {
  push: (input: ToastInput) => number;
  success: (msg: string, opts?: Omit<Toast, 'id' | 'kind' | 'message'>) => number;
  info:    (msg: string, opts?: Omit<Toast, 'id' | 'kind' | 'message'>) => number;
  warning: (msg: string, opts?: Omit<Toast, 'id' | 'kind' | 'message'>) => number;
  error:   (msg: string, opts?: Omit<Toast, 'id' | 'kind' | 'message'>) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<Ctx | null>(null);

export function useToast(): Ctx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast() must be used inside <ToastProvider>');
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const t = timersRef.current.get(id);
    if (t) { clearTimeout(t); timersRef.current.delete(id); }
    setToasts((arr) => arr.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((input: ToastInput): number => {
    const t: Toast =
      typeof input === 'string'
        ? { id: nextId++, kind: 'info', message: input, duration: 3500 }
        : { id: nextId++, kind: input.kind ?? 'info', duration: input.duration ?? 3500, message: input.message, title: input.title };
    setToasts((arr) => [...arr, t]);
    if (t.duration && t.duration > 0) {
      const handle = setTimeout(() => dismiss(t.id), t.duration);
      timersRef.current.set(t.id, handle);
    }
    return t.id;
  }, [dismiss]);

  const success = useCallback((message: string, opts?: Omit<Toast, 'id' | 'kind' | 'message'>) => push({ ...opts, kind: 'success', message }), [push]);
  const info    = useCallback((message: string, opts?: Omit<Toast, 'id' | 'kind' | 'message'>) => push({ ...opts, kind: 'info',    message }), [push]);
  const warning = useCallback((message: string, opts?: Omit<Toast, 'id' | 'kind' | 'message'>) => push({ ...opts, kind: 'warning', message }), [push]);
  const error   = useCallback((message: string, opts?: Omit<Toast, 'id' | 'kind' | 'message'>) => push({ ...opts, kind: 'error',   message }), [push]);

  // Cleanup all timers on unmount.
  useEffect(() => {
    const map = timersRef.current;
    return () => {
      for (const h of map.values()) clearTimeout(h);
      map.clear();
    };
  }, []);

  const value: Ctx = { push, success, info, warning, error, dismiss };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  // Top-centre: the most visible spot, and where students expect an assistant
  // message to land. Newest toast sits on top; the rest cascade below it.
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[1000] flex flex-col items-center gap-2.5 px-4 pt-4 sm:pt-5">
      <AnimatePresence initial={false}>
        {[...toasts].reverse().map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

const KIND_STYLES: Record<ToastKind, { iconBg: string; iconColor: string; ring: string; icon: React.ReactNode }> = {
  success: { iconBg: 'var(--success-light)', iconColor: 'var(--success)', ring: 'var(--success)', icon: <CheckCircle2 size={18} /> },
  info:    { iconBg: 'var(--accent-light)',  iconColor: 'var(--accent)',  ring: 'var(--accent)',  icon: <Info size={18} /> },
  warning: { iconBg: 'var(--warning-light)', iconColor: 'var(--warning)', ring: 'var(--warning)', icon: <AlertTriangle size={18} /> },
  error:   { iconBg: 'var(--danger-light)',  iconColor: 'var(--danger)',  ring: 'var(--danger)',  icon: <XCircle size={18} /> },
  message: { iconBg: 'var(--accent-light)',  iconColor: 'var(--accent)',  ring: 'var(--accent)',  icon: <Megaphone size={18} /> },
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const s = KIND_STYLES[toast.kind];
  const isMessage = toast.kind === 'message';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className={`pointer-events-auto relative w-full overflow-hidden rounded-2xl border bg-[var(--bg-elevated)]/95 backdrop-blur-sm ${isMessage ? 'max-w-md' : 'max-w-sm'}`}
      style={{ borderColor: 'var(--border-default)', boxShadow: '0 12px 36px rgba(0,0,0,0.18)' }}
      role={isMessage ? 'alert' : 'status'}
    >
      {/* Left accent rail */}
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: s.ring }} />
      <div className="flex items-start gap-3 p-3.5 pl-4">
        <div className="mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: s.iconBg, color: s.iconColor }}>
          {s.icon}
        </div>
        <div className="flex-1 min-w-0 pt-px">
          {toast.title && <div className="text-[13px] font-semibold text-[var(--text-primary)] mb-0.5">{toast.title}</div>}
          <div className={`text-[13px] leading-snug break-words whitespace-pre-wrap ${toast.title ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>
            {toast.message}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 -mt-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] p-1.5 rounded-lg flex-shrink-0 transition-colors"
          aria-label="Dismiss"
        >
          <XIcon size={15} />
        </button>
      </div>
      {/* Auto-dismiss countdown bar */}
      {toast.duration && toast.duration > 0 ? (
        <motion.div
          className="absolute bottom-0 left-0 h-[3px] w-full origin-left"
          style={{ background: s.ring, opacity: 0.55 }}
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: toast.duration / 1000, ease: 'linear' }}
        />
      ) : null}
    </motion.div>
  );
}
