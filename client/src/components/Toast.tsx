import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Info, AlertTriangle, X as XIcon } from 'lucide-react';

export type ToastKind = 'success' | 'info' | 'warning' | 'error';

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
  return (
    <div className="pointer-events-none fixed inset-0 z-[1000] flex flex-col items-end justify-end gap-2 p-4 sm:p-6">
      <AnimatePresence>
        {toasts.map((t) => (
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
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const s = KIND_STYLES[toast.kind];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="pointer-events-auto w-full max-w-sm rounded-xl border bg-[var(--bg-elevated)] shadow-lg overflow-hidden"
      style={{ borderColor: 'var(--border-default)' }}
      role="status"
    >
      <div className="flex items-start gap-3 p-3 pr-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: s.iconBg, color: s.iconColor }}>
          {s.icon}
        </div>
        <div className="flex-1 min-w-0">
          {toast.title && <div className="text-sm font-medium text-[var(--text-primary)] truncate">{toast.title}</div>}
          <div className={`text-sm ${toast.title ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'} leading-snug`}>
            {toast.message}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-md flex-shrink-0"
          aria-label="Dismiss"
        >
          <XIcon size={14} />
        </button>
      </div>
      {/* Accent strip */}
      <div className="h-[2px] w-full" style={{ background: s.ring, opacity: 0.7 }} />
    </motion.div>
  );
}
