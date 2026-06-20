import { getLiveExamStats } from '../db/otisak';
import { reportError } from '../lib/reportError';

type LiveStats = Awaited<ReturnType<typeof getLiveExamStats>>;

// Background aggregator for live exam stats.
//
// Why: previously each admin's RoomPage made an on-demand DB call. With multiple
// admins watching, that compounds. Worse, the per-student progress was pushed
// via WS on every autosave — which only fires every 30s on the student side, so
// the admin saw 30s+ stale numbers. The new model:
//
//   1. Server keeps a small set of "monitored" exam IDs (set when an admin
//      subscribes via WS or hits /live-stats; pruned when no admin is watching).
//   2. A single setInterval(5s) recomputes stats for every monitored exam and
//      stores the result in a cache.
//   3. /live-stats serves the cache. Admin polls every 5s.
//
// Result: admin sees fresh-within-5s data without N admins × M polls hitting DB.

const liveStatsCache = new Map<string, LiveStats>();
const monitoredExams = new Set<string>();

let aggregatorTimer: ReturnType<typeof setInterval> | null = null;
const AGGREGATE_INTERVAL_MS = 5000;

export function markExamMonitored(examId: string): void {
  monitoredExams.add(examId);
}

export function unmarkExamMonitored(examId: string): void {
  monitoredExams.delete(examId);
  liveStatsCache.delete(examId);
}

export function isExamMonitored(examId: string): boolean {
  return monitoredExams.has(examId);
}

export function listMonitoredExams(): string[] {
  return Array.from(monitoredExams);
}

export function getCachedLiveStats(examId: string): LiveStats | null {
  return liveStatsCache.get(examId) ?? null;
}

// Force a fresh aggregate now (e.g., right after a student submits — caller
// wants the next /live-stats to reflect that without waiting up to 5s).
export async function refreshLiveStatsNow(examId: string): Promise<LiveStats | null> {
  try {
    const stats = await getLiveExamStats(examId);
    liveStatsCache.set(examId, stats);
    monitoredExams.add(examId);
    return stats;
  } catch (err) {
    reportError(err, { source: 'job', context: { job: 'refreshLiveStatsNow', examId } });
    return null;
  }
}

export function startLiveStatsAggregator(): void {
  if (aggregatorTimer) return;
  aggregatorTimer = setInterval(async () => {
    // Snapshot the set to iterate without mutating during the loop.
    const ids = Array.from(monitoredExams);
    if (ids.length === 0) return;
    await Promise.all(
      ids.map(async (examId) => {
        try {
          const stats = await getLiveExamStats(examId);
          liveStatsCache.set(examId, stats);
        } catch (err) {
          reportError(err, { source: 'job', context: { job: 'liveStatsAggregator', examId } });
        }
      })
    );
  }, AGGREGATE_INTERVAL_MS);
}

export function stopLiveStatsAggregator(): void {
  if (aggregatorTimer) {
    clearInterval(aggregatorTimer);
    aggregatorTimer = null;
  }
  liveStatsCache.clear();
  monitoredExams.clear();
}
