import { useEffect, useRef, useState } from 'react';

// Server-side WS message types we expect (loosely typed, runtime-validated by handlers).
export type ExamWsEvent =
  | { type: 'subscribed'; exam_id: string }
  | { type: 'subscribe_denied'; exam_id: string }
  | { type: 'exam.started'; exam_started_at: string; duration_minutes: number }
  | { type: 'lockdown.changed'; is_active: boolean; message: string | null }
  | { type: 'assistant.message'; message: string }
  | { type: 'timer.adjusted'; extra_seconds: number; effective_duration_seconds: number; delta_seconds: number }
  | { type: 'request.created'; request_id: string; request_type: string; user_id: string }
  | { type: 'request.decided'; request_id: string; request_type: string; user_id: string; status: 'approved' | 'denied' }
  | { type: 'exam.finished'; redirect: boolean; finished_count: number }
  | { type: 'exam.submitted'; user_id: string; finished_count: number; total_participants: number }
  | { type: 'exam.progress'; user_id: string; answered_count: number; total_questions: number; time_spent_seconds: number }
  | { type: 'student.joined'; user_id: string }
  | { type: 'student.kicked'; user_id: string };

export type UseExamSocketResult = {
  connected: boolean;
};

type UseExamSocketOptions = {
  // Called after a successful *reconnect* (not the initial connection). Use to refetch
  // server state and backfill any events missed while the socket was down.
  onReconnect?: () => void;
};

// Shared WebSocket per (exam_id) so multiple components can subscribe without spawning extra sockets.
// Clients install onEvent handlers; the hook automatically reconnects with backoff if the socket drops.
//
// Beyond the basics, this hook adds:
// - a watchdog timer that force-closes the socket if no message arrives for SILENCE_TIMEOUT_MS
//   (catches half-open sockets behind LAN proxies where the close event never fires)
// - a connected state for the UI to show "Live" vs "Reconnecting…" indicators
// - an onReconnect callback so consumers can refetch state after the gap
export function useExamSocket(
  examId: string | undefined,
  onEvent: (e: ExamWsEvent) => void,
  options?: UseExamSocketOptions
): UseExamSocketResult {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const onReconnectRef = useRef(options?.onReconnect);
  onReconnectRef.current = options?.onReconnect;

  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!examId) {
      setConnected(false);
      return;
    }
    let stopped = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    // Track whether we've successfully connected at least once during this mount; the
    // first onopen is "initial connect" (no refetch), every subsequent one is "reconnect".
    let everConnected = false;

    // Server pings every 25s; we should hear *something* (ping, event, subscribed-ack)
    // every minute at worst. If we don't, the socket is silently dead - force-close to
    // trigger the reconnect path.
    const SILENCE_TIMEOUT_MS = 45_000;
    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        try { ws?.close(); } catch { /* ignore */ }
      }, SILENCE_TIMEOUT_MS);
    };

    const open = () => {
      if (stopped) return;
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${proto}://${window.location.host}/ws`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        if (stopped) { try { ws?.close(); } catch { /* ignore */ } return; }
        attempt = 0;
        setConnected(true);
        ws?.send(JSON.stringify({ type: 'subscribe_exam', exam_id: examId }));
        resetSilenceTimer();
        if (everConnected) {
          // Reconnect: any events between the disconnect and now are gone. Ask the
          // consumer to resync its state from the server.
          try { onReconnectRef.current?.(); } catch { /* consumer error shouldn't crash hook */ }
        }
        everConnected = true;
      };

      ws.onmessage = (msg) => {
        // A message can arrive in the brief window between unmount and the
        // socket actually closing. Skip dispatch so the handler doesn't fire
        // on a tear-down consumer that may have already freed its state.
        if (stopped) return;
        resetSilenceTimer();
        try {
          const data = JSON.parse(msg.data) as ExamWsEvent;
          handlerRef.current(data);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = (e) => {
        if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
        if (stopped) return;
        setConnected(false);
        // 4001 = server rejected the session (unauthenticated or remotely
        // revoked). Deliberate and permanent for this session - reconnecting
        // would just loop rejected sockets forever.
        if (e.code === 4001) return;
        attempt = Math.min(attempt + 1, 6);
        const delay = Math.min(15000, 500 * 2 ** attempt);
        reconnectTimer = setTimeout(open, delay);
      };

      ws.onerror = () => {
        // Close triggers reconnect via onclose; just nudge it.
        try { ws?.close(); } catch { /* already broken */ }
      };
    };

    open();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (silenceTimer) clearTimeout(silenceTimer);
      // Close in any state but CLOSED/CLOSING. WebSocket.close() during CONNECTING
      // is legal and aborts the handshake - the previous check missed that case
      // and would leave the socket dangling until the browser timed it out.
      if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
        try { ws.close(1000, 'unmount'); } catch { /* ignore */ }
      }
    };
  }, [examId]);

  return { connected };
}
