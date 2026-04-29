import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';

interface TimerProps {
  durationSeconds: number;
  startedAt: string;
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
    const startMs = new Date(startedAt).getTime();
    const endMs = startMs + durationSeconds * 1000;
    const elapsed = Math.max(0, Date.now() - startMs - pausedSeconds * 1000);
    return Math.max(0, Math.floor((endMs - startMs - elapsed) / 1000));
  }, [durationSeconds, startedAt, pausedSeconds]);

  const [timeLeft, setTimeLeft] = useState(calculateRemaining);

  useEffect(() => {
    if (paused) return;
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
  }, [timeLeft, calculateRemaining, paused]);

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

  const isLow = !paused && timeLeft < 60;
  const digitColor = paused
    ? 'text-amber-400'
    : isLow
      ? 'text-red-500 animate-pulse'
      : 'text-green-500';
  const sepColor = paused
    ? 'text-amber-400/70'
    : isLow
      ? 'text-red-500/70'
      : 'text-green-500/70';
  const glow = paused
    ? 'drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]'
    : isLow
      ? 'drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]'
      : 'drop-shadow-[0_0_8px_rgba(34,197,94,0.6)]';

  const DigitBox = ({ value }: { value: string }) => (
    <div className="relative bg-[#0a0c10]/80 border border-green-900/30 rounded px-1.5 sm:px-2 py-0.5 sm:py-1 min-w-[1.8rem] sm:min-w-[2.2rem] flex justify-center items-center shadow-inner">
      <span
        className={`font-mono text-lg sm:text-2xl md:text-3xl font-bold tracking-widest tabular-nums ${glow} ${digitColor}`}
      >
        {value}
      </span>
    </div>
  );

  const Separator = () => (
    <motion.span
      animate={paused ? { opacity: 0.6 } : { opacity: [1, 0.4, 1] }}
      transition={paused ? { duration: 0 } : { duration: 1, repeat: Infinity }}
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
        <span className="ml-2 text-[10px] uppercase tracking-widest text-amber-400/80 font-medium">
          PAUZA
        </span>
      )}
    </div>
  );
}
