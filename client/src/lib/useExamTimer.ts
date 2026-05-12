import { useCallback, useEffect, useRef, useState } from 'react';

type UseExamTimerArgs = {
  // ISO string for when the exam timer was started (or when the per-student attempt started).
  startedAt: string | null | undefined;
  // Base exam duration in seconds (NOT including extra/pause adjustments).
  durationSeconds: number;
  // Seconds added by admin via /adjust-timer. Positive or negative.
  extraSeconds?: number;
  // Cumulative pause seconds when admin toggled lockdown. Frozen while paused.
  pausedSeconds?: number;
  // True while admin lockdown is active. Display is frozen at the current value.
  paused?: boolean;
  // Called the first time the timer hits 0. Fires at most once per mount.
  onExpire?: () => void;
};

export type ExamTimerState = {
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  expired: boolean;
  paused: boolean;
};

// Single source of truth for the exam timer used by ExamPage (student view) and RoomPage
// (admin view). Both must agree to the second, otherwise admin sees stale time.
export function useExamTimer({
  startedAt,
  durationSeconds,
  extraSeconds = 0,
  pausedSeconds = 0,
  paused = false,
  onExpire,
}: UseExamTimerArgs): ExamTimerState {
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const firedExpiryRef = useRef(false);

  const calculate = useCallback(() => {
    if (!startedAt) return 0;
    const startMs = new Date(startedAt).getTime();
    const totalMs = (durationSeconds + extraSeconds) * 1000;
    const elapsed = Math.max(0, Date.now() - startMs - pausedSeconds * 1000);
    return Math.max(0, Math.floor((totalMs - elapsed) / 1000));
  }, [startedAt, durationSeconds, extraSeconds, pausedSeconds]);

  const [totalSeconds, setTotalSeconds] = useState(calculate);

  useEffect(() => {
    if (paused) return;
    if (totalSeconds <= 0) {
      if (!firedExpiryRef.current) {
        firedExpiryRef.current = true;
        onExpireRef.current?.();
      }
      return;
    }
    const id = setInterval(() => {
      const remaining = calculate();
      setTotalSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(id);
        if (!firedExpiryRef.current) {
          firedExpiryRef.current = true;
          onExpireRef.current?.();
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [totalSeconds, calculate, paused]);

  // When admin toggles pause/extra/etc, recompute once so the display reflects the change.
  useEffect(() => {
    setTotalSeconds(calculate());
  }, [calculate, paused]);

  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalSeconds,
    expired: totalSeconds <= 0 && !!startedAt,
    paused,
  };
}

export function formatTimer({ hours, minutes, seconds }: Pick<ExamTimerState, 'hours' | 'minutes' | 'seconds'>): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
