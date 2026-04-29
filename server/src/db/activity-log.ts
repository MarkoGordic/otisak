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

// Replace ID-shaped fields in event_data with the actual content (question text / answer text)
// so reports are human-readable. Falls back to "(deleted)" when an id no longer resolves.
export async function enrichActivityEventData(
  examId: string,
  events: ActivityLogEntry[],
): Promise<Array<{ timestamp: Date; event_type: string; event_data: Record<string, unknown> }>> {
  const qRes = await query<{ id: string; text: string }>(
    'SELECT id, text FROM otisak_questions WHERE exam_id = $1',
    [examId],
  );
  const aRes = await query<{ id: string; text: string; question_id: string }>(
    'SELECT a.id, a.text, a.question_id FROM otisak_answers a JOIN otisak_questions q ON q.id = a.question_id WHERE q.exam_id = $1',
    [examId],
  );

  const questionTextById = new Map(qRes.rows.map((r) => [r.id, r.text]));
  const answerTextById = new Map(aRes.rows.map((r) => [r.id, r.text]));

  const truncate = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const formatQuestion = (id: unknown, idx?: unknown) => {
    const text = typeof id === 'string' ? questionTextById.get(id) : undefined;
    const num = typeof idx === 'number' ? idx + 1 : undefined;
    if (text) return num ? `${num}. ${truncate(text)}` : truncate(text);
    return `(obrisano pitanje)`;
  };
  const formatAnswer = (id: unknown) => {
    const text = typeof id === 'string' ? answerTextById.get(id) : undefined;
    return text ? truncate(text) : `(obrisan odgovor)`;
  };

  return events.map((e) => {
    const src = (e.event_data || {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    switch (e.event_type) {
      case 'answer_selected':
      case 'answer_deselected': {
        out.pitanje = formatQuestion(src.question_id, src.question_index);
        out.odgovor = formatAnswer(src.answer_id);
        break;
      }
      case 'question_next':
      case 'question_prev': {
        const from = typeof src.from === 'number' ? src.from + 1 : src.from;
        const to = typeof src.to === 'number' ? src.to + 1 : src.to;
        out.sa = from !== undefined ? `Pitanje ${from}` : '-';
        out.na = to !== undefined ? `Pitanje ${to}` : '-';
        break;
      }
      case 'exam_submit': {
        if (src.method) out.nacin = src.method;
        if (src.answered !== undefined) out.odgovoreno = src.answered;
        break;
      }
      case 'exam_view_started': {
        if (src.questions !== undefined) out.broj_pitanja = src.questions;
        break;
      }
      case 'copy_attempt': {
        if (typeof src.selection === 'string' && src.selection.length > 0) out.selekcija = truncate(src.selection, 60);
        break;
      }
      case 'paste_attempt': {
        if (src.length !== undefined) out.duzina = src.length;
        break;
      }
      case 'visibility_change': {
        if (src.state) out.stanje = src.state;
        break;
      }
      case 'window_resize': {
        if (src.width !== undefined && src.height !== undefined) out.dimenzije = `${src.width}×${src.height}`;
        break;
      }
      case 'keystroke_batch': {
        if (src.count !== undefined) out.brojac = src.count;
        if (src.lastKey) out.poslednji = src.lastKey;
        break;
      }
      case 'key_combo':
      case 'special_key':
      case 'devtools_attempt': {
        const parts: string[] = [];
        if (src.ctrl) parts.push('Ctrl');
        if (src.meta) parts.push('Cmd');
        if (src.alt) parts.push('Alt');
        if (src.shift) parts.push('Shift');
        if (src.key) parts.push(String(src.key));
        if (parts.length) out.taster = parts.join('+');
        break;
      }
      case 'right_click':
      case 'mouse_leave_window': {
        if (src.x !== undefined && src.y !== undefined) out.pozicija = `${src.x},${src.y}`;
        break;
      }
      default:
        // For everything else, keep all fields except raw IDs
        for (const [k, v] of Object.entries(src)) {
          if (k === 'ts' || k === 'question_id' || k === 'answer_id') continue;
          out[k] = v;
        }
    }

    return {
      timestamp: e.timestamp,
      event_type: e.event_type,
      event_data: out,
    };
  });
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
