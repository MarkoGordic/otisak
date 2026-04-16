import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { parseSessionCookie } from '../session';
import { findUserById } from '../db/users';
import { logEvents } from '../db/activity-log';

// Map of examId -> Set of WebSocket connections (for admin room broadcasts)
const roomSubscriptions = new Map<string, Set<WebSocket>>();

// Map of ws -> user info
const wsUserMap = new WeakMap<WebSocket, { userId: string; role: string }>();

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

export function setupWebSocket(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
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
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      });

      ws.on('close', () => {
        // Clean up room subscriptions
        for (const [examId, subscribers] of roomSubscriptions.entries()) {
          subscribers.delete(ws);
          if (subscribers.size === 0) {
            roomSubscriptions.delete(examId);
          }
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.close(4000, 'Internal error');
    }
  });

  return wss;
}
