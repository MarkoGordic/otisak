// In-memory tracker mapping userId -> { sessionId, lastSeen }.
// Used to reject a second /join for the same index while the first device's
// session is still live. After STALE_MS of inactivity the entry is considered
// abandoned, so a student can recover from a crashed browser.
//
// State is process-local. For multi-process deployments this would need to
// move to Redis (or similar) - fine for the single-container setup.

const sessions = new Map<string, { sessionId: string; lastSeen: number }>();
// userId -> cutoff (ms). A session created before the cutoff was revoked by an
// admin and must not re-take the lock: the public /room-status heartbeat does
// not hit the DB, so without this a revoked lobby tab would keep the student
// locked out of every other device.
const revokedBefore = new Map<string, number>();
const STALE_MS = 5 * 60 * 1000; // 5 minutes

export function markSessionActive(
  userId: string,
  sessionId: string,
  sessionCreatedAt?: number,
): void {
  if (!userId || !sessionId) return;
  const cutoff = revokedBefore.get(userId);
  if (cutoff !== undefined && sessionCreatedAt !== undefined && sessionCreatedAt < cutoff) return;
  sessions.set(userId, { sessionId, lastSeen: Date.now() });
}

export function isLockedByOtherSession(
  userId: string,
  currentSessionId: string | null | undefined,
): boolean {
  const entry = sessions.get(userId);
  if (!entry) return false;
  if (entry.sessionId === currentSessionId) return false; // same browser/refresh
  if (Date.now() - entry.lastSeen > STALE_MS) return false; // abandoned
  return true;
}

export function clearSessionForUser(userId: string): void {
  sessions.delete(userId);
}

// Admin terminated the user's sessions: drop the lock and refuse heartbeats
// from any session created before `at`.
export function revokeTrackedSessions(userId: string, at: number): void {
  sessions.delete(userId);
  revokedBefore.set(userId, Math.max(revokedBefore.get(userId) ?? 0, at));
}

// Live (non-stale) entries, for the admin sessions page.
export function listTrackedSessions(): Array<{ userId: string; lastSeen: number }> {
  const now = Date.now();
  const out: Array<{ userId: string; lastSeen: number }> = [];
  for (const [userId, entry] of sessions) {
    if (now - entry.lastSeen <= STALE_MS) out.push({ userId, lastSeen: entry.lastSeen });
  }
  return out;
}
