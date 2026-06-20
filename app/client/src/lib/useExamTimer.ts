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
  // True when the exam hasn't been started yet (startedAt is null). The
  // display reflects the configured duration but is not ticking.
  notStarted: boolean;
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
    // Exam hasn't started yet (admin hasn't clicked "Pokreni tajmer"). Show
    // the configured duration as a static placeholder instead of 00:00. The
    // expiry callback is also gated below so it can't fire in this state.
    if (!startedAt) return Math.max(0, durationSeconds + extraSeconds);
    const startMs = new Date(startedAt).getTime();
    if (!Number.isFinite(startMs)) return Math.max(0, durationSeconds + extraSeconds);
    const totalMs = (durationSeconds + extraSeconds) * 1000;
    const elapsed = Math.max(0, Date.now() - startMs - pausedSeconds * 1000);
    return Math.max(0, Math.floor((totalMs - elapsed) / 1000));
  }, [startedAt, durationSeconds, extraSeconds, pausedSeconds]);

  const [totalSeconds, setTotalSeconds] = useState(calculate);

  useEffect(() => {
    if (paused) return;
    // Don't fire onExpire when the exam hasn't started yet. Without this guard
    // a freshly-mounted timer with startedAt=null reads totalSeconds=0 and
    // would trigger a premature submission via the consumer's onExpire.
    if (!startedAt) return;
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

  // Defensive clamp: if a producer manages to seed a NaN/negative, render zero
  // instead of "NaN:NaN" which the user can't make sense of.
  const safeTotal = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  return {
    hours: Math.floor(safeTotal / 3600),
    minutes: Math.floor((safeTotal % 3600) / 60),
    seconds: safeTotal % 60,
    totalSeconds: safeTotal,
    // Only count as expired if the exam actually started. Before start, the
    // display shows the configured duration but is not "expired".
    expired: safeTotal <= 0 && !!startedAt,
    paused,
    notStarted: !startedAt,
  };
}

export function formatTimer({ hours, minutes, seconds }: Pick<ExamTimerState, 'hours' | 'minutes' | 'seconds'>): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
