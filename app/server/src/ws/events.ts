import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { isSessionRevoked, parseSessionCookie } from '../session';
import { findUserById } from '../db/users';
import { logEvents } from '../db/activity-log';
import { query } from '../db/client';
import { markExamMonitored, unmarkExamMonitored, listMonitoredExams } from './liveStatsAggregator';
import { reportError } from '../lib/reportError';

// Map of examId -> Set of WebSocket connections (admin-only room broadcasts; legacy)
const roomSubscriptions = new Map<string, Set<WebSocket>>();

// Map of examId -> Set of WebSocket connections (any authenticated user; for admin command pushes)
const examSubscriptions = new Map<string, Set<WebSocket>>();

// Map of ws -> user info
const wsUserMap = new WeakMap<WebSocket, { userId: string; role: string }>();

// The live server instance, kept so session revocation can reach open sockets.
let activeWss: WebSocketServer | null = null;

// Drop every open socket belonging to a user whose sessions were just revoked
// (ELPIS ID webhook). New connection attempts with the old cookie are refused
// by the revocation check in the connection handler; this covers sockets that
// were already open when the cutoff was stamped.
export function terminateUserSockets(userId: string): void {
  if (!activeWss) return;
  for (const client of activeWss.clients) {
    if (wsUserMap.get(client)?.userId === userId) client.terminate();
  }
}

// Heartbeat: track liveness of each socket. Sockets that don't respond to a ping within
// the next interval are terminated. This catches silent connection drops caused by
// LAN proxies/NATs where neither side gets a clean close.
const HEARTBEAT_MS = 25_000;
type Heartbeatable = WebSocket & { isAlive?: boolean };

async function isUserAllowedOnExam(examId: string, userId: string, role: string): Promise<boolean> {
  // Privileged roles see every exam.
  if (role === 'admin' || role === 'assistant') return true;
  // Students must be linked to the exam in some legitimate way.
  const result = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM otisak_enrollments WHERE exam_id = $1 AND user_id = $2
     ) OR EXISTS (
       SELECT 1 FROM otisak_attempts WHERE exam_id = $1 AND user_id = $2
     ) OR EXISTS (
       SELECT 1 FROM exam_requests WHERE exam_id = $1 AND user_id = $2 AND status = 'pending'
     ) AS ok`,
    [examId, userId]
  );
  return !!result.rows[0]?.ok;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) {
      cookies[name.trim()] = decodeURIComponent(rest.join('=').trim());
    }
  });
  return cookies;
}

export function broadcastToRoom(examId: string, data: unknown) {
  const subscribers = roomSubscriptions.get(examId);
  if (!subscribers) return;
  const message = JSON.stringify(data);
  for (const ws of subscribers) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

// Push to anyone (student or admin) subscribed to this exam.
// Used for "everyone reacts" admin commands: start, lockdown, timer adjust, request decisions.
export function broadcastExamEvent(examId: string, event: { type: string; [k: string]: unknown }) {
  const subscribers = examSubscriptions.get(examId);
  if (!subscribers) return;
  const message = JSON.stringify(event);
  for (const ws of subscribers) {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  }
}

// Push to every socket of a single user within one exam (a student may have more
// than one tab open). Used for assistant->one-student direct messages.
export function broadcastToExamUser(examId: string, userId: string, event: { type: string; [k: string]: unknown }) {
  const subscribers = examSubscriptions.get(examId);
  if (!subscribers) return;
  const message = JSON.stringify(event);
  for (const ws of subscribers) {
    if (ws.readyState === WebSocket.OPEN && wsUserMap.get(ws)?.userId === userId) ws.send(message);
  }
}

export function setupWebSocket(server: http.Server): WebSocketServer {
  // No origin allow-list: this app is deployed on local networks where the
  // server's IP is whatever the host machine has, and a strict allow-list
  // would lock out students on the LAN. The connection is still
  // authenticated via the signed session cookie inside the upgrade request,
  // so an attacker who can't forge a cookie can't open a session.
  //
  // maxPayload caps a single inbound frame at 256 KB. Legitimate traffic is
  // small JSON (events batches, subscribe messages). Without a cap, a hostile
  // client could send a multi-MB frame and we'd buffer it before parsing.
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 });
  activeWss = wss;

  // Server-driven heartbeat. Each tick: terminate sockets that didn't pong since the
  // previous tick; then ping the rest. Browsers auto-respond to pings, so this works
  // without any client-side ping handling.
  const heartbeat = setInterval(() => {
    wss.clients.forEach((client) => {
      const ws = client as Heartbeatable;
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* socket already broken */ }
    });
  }, HEARTBEAT_MS);

  wss.on('close', () => clearInterval(heartbeat));

  wss.on('connection', async (rawWs, req) => {
    const ws = rawWs as Heartbeatable;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    try {
      const cookies = parseCookies(req.headers.cookie);
      const sessionCookie = cookies['otisak_session'];
      const session = parseSessionCookie(sessionCookie);

      if (!session) {
        ws.close(4001, 'Unauthorized');
        return;
      }

      const user = await findUserById(session.user.id);
      if (!user) {
        ws.close(4001, 'User not found');
        return;
      }

      // Same remote-revocation cutoff as requireAuth: a still-signed cookie
      // minted before sessions_revoked_at must not open a socket either.
      if (isSessionRevoked(session, user.sessions_revoked_at)) {
        ws.close(4001, 'Session revoked');
        return;
      }

      wsUserMap.set(ws, { userId: user.id, role: user.role });

      ws.on('message', async (raw) => {
        try {
          const data = JSON.parse(raw.toString());

          if (data.type === 'events' && data.attempt_id && data.exam_id && Array.isArray(data.events)) {
            await logEvents(data.attempt_id, user.id, data.exam_id, data.events);

            // Broadcast to admin room subscribers
            broadcastToRoom(data.exam_id, {
              type: 'activity_update',
              exam_id: data.exam_id,
              user_id: user.id,
              event_count: data.events.length,
            });
          }

          if (data.type === 'subscribe_room' && data.exam_id) {
            if (user.role === 'admin' || user.role === 'assistant') {
              const examId = data.exam_id;
              if (!roomSubscriptions.has(examId)) {
                roomSubscriptions.set(examId, new Set());
              }
              roomSubscriptions.get(examId)!.add(ws);
            }
          }

          // Generic per-exam subscription used for admin-pushed events (start, lockdown, timer, request decisions).
          // SECURITY: only allow subscription if the user is privileged OR has a legitimate connection to this exam
          // (enrollment, active attempt, or pending request). Verified server-side every time - never trust the client.
          if (data.type === 'subscribe_exam' && typeof data.exam_id === 'string') {
            const examId = data.exam_id;
            const allowed = await isUserAllowedOnExam(examId, user.id, user.role);
            if (allowed) {
              if (!examSubscriptions.has(examId)) examSubscriptions.set(examId, new Set());
              examSubscriptions.get(examId)!.add(ws);
              // Admin/assistant subscriptions also "wake up" the live-stats aggregator for this exam.
              // Students don't trigger this - they don't poll /live-stats.
              if (user.role === 'admin' || user.role === 'assistant') {
                markExamMonitored(examId);
              }
              ws.send(JSON.stringify({ type: 'subscribed', exam_id: examId }));
            } else {
              ws.send(JSON.stringify({ type: 'subscribe_denied', exam_id: examId }));
            }
          }
        } catch (error) {
          reportError(error, { source: 'ws', userId: user.id, context: { phase: 'message' } });
        }
      });

      ws.on('close', () => {
        for (const [examId, subscribers] of roomSubscriptions.entries()) {
          subscribers.delete(ws);
          if (subscribers.size === 0) roomSubscriptions.delete(examId);
        }
        for (const [examId, subscribers] of examSubscriptions.entries()) {
          subscribers.delete(ws);
          if (subscribers.size === 0) examSubscriptions.delete(examId);
        }
        // If no admin/assistant is still watching any of the monitored exams,
        // unmark them so the 5s aggregator stops doing DB work for them.
        if (user.role === 'admin' || user.role === 'assistant') {
          for (const examId of listMonitoredExams()) {
            const subs = examSubscriptions.get(examId);
            if (!subs || subs.size === 0) {
              unmarkExamMonitored(examId);
              continue;
            }
            const stillAdmin = Array.from(subs).some((other) => {
              const meta = wsUserMap.get(other);
              return meta && (meta.role === 'admin' || meta.role === 'assistant');
            });
            if (!stillAdmin) unmarkExamMonitored(examId);
          }
        }
      });

      ws.on('error', (error) => {
        reportError(error, { source: 'ws', userId: user.id, context: { phase: 'socket' } });
      });
    } catch (error) {
      reportError(error, { source: 'ws', context: { phase: 'connection' } });
      ws.close(4000, 'Internal error');
    }
  });

  return wss;
}
