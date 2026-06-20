// In-memory tracker mapping userId -> { sessionId, lastSeen }.
// Used to reject a second /join for the same index while the first device's
// session is still live. After STALE_MS of inactivity the entry is considered
// abandoned, so a student can recover from a crashed browser.
//
// State is process-local. For multi-process deployments this would need to
// move to Redis (or similar) — fine for the single-container setup.

const sessions = new Map<string, { sessionId: string; lastSeen: number }>();
const STALE_MS = 5 * 60 * 1000; // 5 minutes

export function markSessionActive(userId: string, sessionId: string): void {
  if (!userId || !sessionId) return;
  sessions.set(userId, { sessionId, lastSeen: Date.now() });
}

export function isLockedByOtherSession(userId: string, currentSessionId: string | null | undefined): boolean {
  const entry = sessions.get(userId);
  if (!entry) return false;
  if (entry.sessionId === currentSessionId) return false; // same browser/refresh
  if (Date.now() - entry.lastSeen > STALE_MS) return false; // abandoned
  return true;
}

export function clearSessionForUser(userId: string): void {
  sessions.delete(userId);
}
