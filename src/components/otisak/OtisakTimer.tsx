'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';

interface TimerProps {
  durationSeconds: number;
  startedAt: string;
  onExpire?: () => void;
  className?: string;
}

export function OtisakTimer({ durationSeconds, startedAt, onExpire, className = '' }: TimerProps) {
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const calculateRemaining = useCallback(() => {
    const startMs = new Date(startedAt).getTime();
    const endMs = startMs + durationSeconds * 1000;
    return Math.max(0, Math.floor((endMs - Date.now()) / 1000));
  }, [durationSeconds, startedAt]);

  const [timeLeft, setTimeLeft] = useState(calculateRemaining);

  useEffect(() => {
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
  }, [timeLeft, calculateRemaining]);

  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;
  const fmt = (n: number) => n.toString().padStart(2, '0');

  const isLow = timeLeft < 60;

  const DigitBox = ({ value }: { value: string }) => (
    <div className="relative bg-[#0a0c10]/80 border border-green-900/30 rounded px-1.5 sm:px-2 py-0.5 sm:py-1 min-w-[1.8rem] sm:min-w-[2.2rem] flex justify-center items-center shadow-inner">
      <span
        className={`font-mono text-lg sm:text-2xl md:text-3xl font-bold tracking-widest tabular-nums drop-shadow-[0_0_8px_rgba(34,197,94,0.6)] ${
          isLow ? 'text-red-500 animate-pulse' : 'text-green-500'
        }`}
      >
        {value}
      </span>
    </div>
  );

  const Separator = () => (
    <motion.span
      animate={{ opacity: [1, 0.4, 1] }}
      transition={{ duration: 1, repeat: Infinity }}
      className={`text-lg sm:text-2xl font-bold pb-1 ${isLow ? 'text-red-500/70' : 'text-green-500/70'}`}
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
    </div>
  );
}
