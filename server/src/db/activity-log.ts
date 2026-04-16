import { query } from './client';

export interface ActivityEvent {
  type: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface ActivityLogEntry {
  id: string;
  attempt_id: string;
  user_id: string;
  exam_id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  timestamp: Date;
}

export async function logEvents(
  attemptId: string,
  userId: string,
  examId: string,
  events: ActivityEvent[]
): Promise<void> {
  if (events.length === 0) return;

  const values: unknown[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < events.length; i++) {
    const base = i * 5;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
    values.push(attemptId, userId, examId, events[i].type, JSON.stringify(events[i].data || {}));
  }

  await query(
    `INSERT INTO exam_activity_log (attempt_id, user_id, exam_id, event_type, event_data)
     VALUES ${placeholders.join(', ')}`,
    values
  );
}

export async function getActivityLog(
  attemptId: string
): Promise<ActivityLogEntry[]> {
  const result = await query<ActivityLogEntry>(
    'SELECT * FROM exam_activity_log WHERE attempt_id = $1 ORDER BY timestamp ASC',
    [attemptId]
  );
  return result.rows;
}

export async function getActivityLogForExam(
  examId: string,
  userId: string
): Promise<ActivityLogEntry[]> {
  const result = await query<ActivityLogEntry>(
    `SELECT al.* FROM exam_activity_log al
     JOIN otisak_attempts a ON al.attempt_id = a.id
     WHERE a.exam_id = $1 AND a.user_id = $2
     ORDER BY al.timestamp ASC`,
    [examId, userId]
  );
  return result.rows;
}

export async function getActivityStats(attemptId: string): Promise<{
  totalEvents: number;
  eventCounts: Record<string, number>;
  firstEvent: Date | null;
  lastEvent: Date | null;
  keystrokes: number;
  answerChanges: number;
  tabSwitches: number;
  copyAttempts: number;
  rightClicks: number;
}> {
  const events = await getActivityLog(attemptId);

  const stats = {
    totalEvents: events.length,
    eventCounts: {} as Record<string, number>,
    firstEvent: events.length > 0 ? events[0].timestamp : null,
    lastEvent: events.length > 0 ? events[events.length - 1].timestamp : null,
    keystrokes: 0,
    answerChanges: 0,
    tabSwitches: 0,
    copyAttempts: 0,
    rightClicks: 0,
  };

  for (const event of events) {
    stats.eventCounts[event.event_type] = (stats.eventCounts[event.event_type] || 0) + 1;

    if (event.event_type === 'keystroke') stats.keystrokes++;
    if (event.event_type === 'answer_selected' || event.event_type === 'answer_deselected') stats.answerChanges++;
    if (event.event_type === 'tab_switch' || event.event_type === 'page_blur') stats.tabSwitches++;
    if (event.event_type === 'copy_attempt') stats.copyAttempts++;
    if (event.event_type === 'right_click') stats.rightClicks++;
  }

  return stats;
}
