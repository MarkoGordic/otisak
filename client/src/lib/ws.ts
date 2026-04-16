let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

type EventPayload = { type: string; data?: Record<string, unknown>; timestamp: string };

let eventBuffer: EventPayload[] = [];
let attemptId: string | null = null;
let examId: string | null = null;

function getWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

export function connectWs(aId: string, eId: string): void {
  attemptId = aId;
  examId = eId;

  if (ws && ws.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(getWsUrl());

  ws.onopen = () => {
    // Send any buffered events
    flushBuffer();
  };

  ws.onclose = () => {
    // Reconnect after 2 seconds
    reconnectTimer = setTimeout(() => connectWs(aId, eId), 2000);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

export function disconnectWs(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  flushBuffer();
  ws?.close();
  ws = null;
  attemptId = null;
  examId = null;
}

export function trackEvent(type: string, data?: Record<string, unknown>): void {
  eventBuffer.push({
    type,
    data: { ...data, ts: Date.now() },
    timestamp: new Date().toISOString(),
  });

  // Auto-flush every 20 events
  if (eventBuffer.length >= 20) flushBuffer();
}

function flushBuffer(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN || eventBuffer.length === 0 || !attemptId || !examId) return;

  ws.send(JSON.stringify({
    type: 'events',
    attempt_id: attemptId,
    exam_id: examId,
    events: eventBuffer,
  }));
  eventBuffer = [];
}

// Flush every 3 seconds
setInterval(flushBuffer, 3000);
