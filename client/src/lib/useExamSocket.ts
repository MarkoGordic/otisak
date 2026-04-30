import { useEffect, useRef } from 'react';

// Server-side WS message types we expect (loosely typed, runtime-validated by handlers).
export type ExamWsEvent =
  | { type: 'subscribed'; exam_id: string }
  | { type: 'subscribe_denied'; exam_id: string }
  | { type: 'exam.started'; exam_started_at: string; duration_minutes: number }
  | { type: 'lockdown.changed'; is_active: boolean; message: string | null }
  | { type: 'timer.adjusted'; extra_seconds: number; effective_duration_seconds: number; delta_seconds: number }
  | { type: 'request.created'; request_id: string; request_type: string; user_id: string }
  | { type: 'request.decided'; request_id: string; request_type: string; user_id: string; status: 'approved' | 'denied' };

// Shared WebSocket per (exam_id) so multiple components can subscribe without spawning extra sockets.
// Clients install onEvent handlers; the hook automatically reconnects with backoff if the socket drops.
export function useExamSocket(examId: string | undefined, onEvent: (e: ExamWsEvent) => void) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!examId) return;
    let stopped = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const open = () => {
      if (stopped) return;
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${proto}://${window.location.host}/ws`;
      ws = new WebSocket(url);
      ws.onopen = () => {
        attempt = 0;
        ws?.send(JSON.stringify({ type: 'subscribe_exam', exam_id: examId }));
      };
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data) as ExamWsEvent;
          handlerRef.current(data);
        } catch {
          // ignore malformed messages
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        attempt = Math.min(attempt + 1, 6);
        const delay = Math.min(15000, 500 * 2 ** attempt);
        reconnectTimer = setTimeout(open, delay);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    open();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws && ws.readyState === WebSocket.OPEN) ws.close(1000, 'unmount');
    };
  }, [examId]);
}
