import { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../ThemeProvider';

interface TimerProps {
  durationSeconds: number;
  // ISO timestamp of when the admin started the exam (exam.exam_started_at).
  // Null while the exam is in the lobby phase. While null the timer shows the
  // full configured duration as a static placeholder and does NOT count down.
  // Never substitute attempt.started_at here - that would start the countdown
  // the moment the student joins, not when the exam actually starts.
  startedAt: string | null;
  pausedSeconds?: number;
  paused?: boolean;
  onExpire?: () => void;
  className?: string;
}

export function OtisakTimer({
  durationSeconds,
  startedAt,
  pausedSeconds = 0,
  paused = false,
  onExpire,
  className = '',
}: TimerProps) {
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const calculateRemaining = useCallback(() => {
    // Exam hasn't started. Display the configured duration as a static
    // placeholder and don't tick or expire.
    if (!startedAt) return durationSeconds;
    const startMs = new Date(startedAt).getTime();
    if (!Number.isFinite(startMs)) return durationSeconds;
    const endMs = startMs + durationSeconds * 1000;
    const elapsed = Math.max(0, Date.now() - startMs - pausedSeconds * 1000);
    return Math.max(0, Math.floor((endMs - startMs - elapsed) / 1000));
  }, [durationSeconds, startedAt, pausedSeconds]);

  const [timeLeft, setTimeLeft] = useState(calculateRemaining);

  useEffect(() => {
    if (paused) return;
    // Pre-start: keep the display synced to the configured duration (in case
    // duration changes from above) but don't tick and don't fire expiry.
    if (!startedAt) {
      setTimeLeft(calculateRemaining());
      return;
    }
    if (timeLeft <= 0) {
      onExpireRef.current?.();
      return;
    }
    const id = setInterval(() => {
      const remaining = calculateRemaining();
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(id);
        onExpireRef.current?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [timeLeft, calculateRemaining, paused, startedAt]);

  // When paused, recompute once and freeze the display at the current value
  useEffect(() => {
    if (paused) {
      setTimeLeft(calculateRemaining());
    }
  }, [paused, calculateRemaining]);

  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;
  const fmt = (n: number) => n.toString().padStart(2, '0');

  const notStarted = !startedAt;
  const isLow = !paused && !notStarted && timeLeft < 60;
  const digitColor = notStarted
    ? 'text-slate-400'
    : paused
      ? 'text-sky-300'
      : isLow
        ? 'text-red-500 animate-pulse'
        : 'text-green-500';
  const sepColor = notStarted
    ? 'text-slate-400/70'
    : paused
      ? 'text-sky-300/70'
      : isLow
        ? 'text-red-500/70'
        : 'text-green-500/70';
  const glow = notStarted
    ? 'drop-shadow-[0_0_8px_rgba(148,163,184,0.35)]'
    : paused
      ? 'drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]'
      : isLow
        ? 'drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]'
        : 'drop-shadow-[0_0_8px_rgba(34,197,94,0.6)]';

  // Local theme - only used to swap the digit-box surface; the foreground color is
  // already encoded in `digitColor` (green/red/sky) and works against both surfaces.
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const digitBoxSurface = isDark
    ? 'bg-[#0a0c10]/80 border-green-900/30'
    : 'bg-white border-slate-200';

  const DigitBox = ({ value }: { value: string }) => (
    <div className={`relative rounded px-1.5 sm:px-2 py-0.5 sm:py-1 min-w-[1.8rem] sm:min-w-[2.2rem] flex justify-center items-center shadow-inner border ${digitBoxSurface}`}>
      <span
        className={`font-mono text-lg sm:text-2xl md:text-3xl font-bold tracking-widest tabular-nums ${glow} ${digitColor}`}
      >
        {value}
      </span>
    </div>
  );

  const Separator = () => (
    <motion.span
      animate={(paused || notStarted) ? { opacity: 0.6 } : { opacity: [1, 0.4, 1] }}
      transition={(paused || notStarted) ? { duration: 0 } : { duration: 1, repeat: Infinity }}
      className={`text-lg sm:text-2xl font-bold pb-1 ${sepColor}`}
    >
      :
    </motion.span>
  );

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {hours > 0 && (
        <>
          <DigitBox value={fmt(hours)} />
          <Separator />
        </>
      )}
      <DigitBox value={fmt(minutes)} />
      <Separator />
      <DigitBox value={fmt(seconds)} />
      {paused && (
        <span className="ml-2 text-[10px] uppercase tracking-widest text-sky-300/80 font-medium">
          PAUZA
        </span>
      )}
    </div>
  );
}
