// Generic admin-approval queue for student requests during an exam.
// New request types: register a handler in REQUEST_HANDLERS below — that's it.
// All checks (whitelist, status, exam-validity) are enforced server-side.

import { query, transaction } from './client';
import type { PoolClient } from 'pg';
import { getOtisakExamById, enrollUserInExam, startExamAttempt, getActiveAttempt } from './otisak';

export type ExamRequestType = 'late_join';
export type ExamRequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled';

export interface ExamRequestRow {
  id: string;
  exam_id: string;
  user_id: string;
  type: ExamRequestType;
  payload: Record<string, unknown>;
  status: ExamRequestStatus;
  decided_by: string | null;
  decided_at: Date | null;
  decision_note: string | null;
  created_at: Date;
}

export interface ExamRequestWithUser extends ExamRequestRow {
  user_name: string | null;
  user_email: string;
  user_index_number: string | null;
}

// ----- Validation: which types can students submit? -----
const STUDENT_SUBMITTABLE_TYPES: ReadonlyArray<ExamRequestType> = ['late_join'];

export function isSubmittableByStudent(type: string): type is ExamRequestType {
  return (STUDENT_SUBMITTABLE_TYPES as ReadonlyArray<string>).includes(type);
}

// ----- Per-type guards run on creation, server-side only -----
type GuardContext = {
  examId: string;
  userId: string;
  payload: Record<string, unknown>;
};

const REQUEST_GUARDS: Record<ExamRequestType, (ctx: GuardContext) => Promise<{ ok: true } | { ok: false; error: string }>> = {
  late_join: async ({ examId, userId }) => {
    const exam = await getOtisakExamById(examId);
    if (!exam) return { ok: false, error: 'Exam not found' };
    if (exam.status !== 'active') return { ok: false, error: 'Exam is not active' };
    if (!exam.exam_started_at) return { ok: false, error: 'Exam has not started yet — no late-join needed' };
    const existing = await getActiveAttempt(examId, userId);
    if (existing) return { ok: false, error: 'You already have an active attempt' };
    return { ok: true };
  },
};

// ----- Per-type approval handlers — run inside the decide transaction. -----
type HandlerContext = {
  client: PoolClient;
  request: ExamRequestRow;
  decidedBy: string;
};

const REQUEST_HANDLERS: Record<ExamRequestType, (ctx: HandlerContext) => Promise<void>> = {
  late_join: async ({ request }) => {
    const exam = await getOtisakExamById(request.exam_id);
    if (!exam) throw new Error('Exam no longer exists');
    if (exam.status !== 'active') throw new Error('Exam is no longer active');
    await enrollUserInExam(request.exam_id, request.user_id);
    const existing = await getActiveAttempt(request.exam_id, request.user_id);
    if (!existing) {
      await startExamAttempt(request.exam_id, request.user_id, {});
    }
  },
};

// ----- API -----

export async function createExamRequest(input: {
  examId: string;
  userId: string;
  type: ExamRequestType;
  payload?: Record<string, unknown>;
}): Promise<{ request: ExamRequestRow } | { error: string }> {
  const guard = REQUEST_GUARDS[input.type];
  if (!guard) return { error: 'Unsupported request type' };
  const guardResult = await guard({ examId: input.examId, userId: input.userId, payload: input.payload || {} });
  if (!guardResult.ok) return { error: guardResult.error };

  // Reuse existing pending request of the same type rather than 23505 on the unique partial index.
  const existing = await query<ExamRequestRow>(
    `SELECT * FROM exam_requests
     WHERE exam_id = $1 AND user_id = $2 AND type = $3 AND status = 'pending'
     LIMIT 1`,
    [input.examId, input.userId, input.type]
  );
  if (existing.rows[0]) return { request: existing.rows[0] };

  const result = await query<ExamRequestRow>(
    `INSERT INTO exam_requests (exam_id, user_id, type, payload)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.examId, input.userId, input.type, input.payload || {}]
  );
  return { request: result.rows[0] };
}

export async function listPendingRequestsForExam(examId: string): Promise<ExamRequestWithUser[]> {
  const result = await query<ExamRequestWithUser>(
    `SELECT r.*, u.name AS user_name, u.email AS user_email, u.index_number AS user_index_number
     FROM exam_requests r
     JOIN users u ON u.id = r.user_id
     WHERE r.exam_id = $1 AND r.status = 'pending'
     ORDER BY r.created_at ASC`,
    [examId]
  );
  return result.rows;
}

export async function listRequestsForUser(examId: string, userId: string): Promise<ExamRequestRow[]> {
  const result = await query<ExamRequestRow>(
    `SELECT * FROM exam_requests WHERE exam_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 20`,
    [examId, userId]
  );
  return result.rows;
}

export async function decideExamRequest(input: {
  requestId: string;
  examId: string;
  decidedBy: string;
  decision: 'approved' | 'denied';
  note?: string;
}): Promise<{ request: ExamRequestRow } | { error: string }> {
  return transaction(async (client) => {
    // Lock the row so concurrent decisions don't race.
    const lockedResult = await client.query<ExamRequestRow>(
      `SELECT * FROM exam_requests WHERE id = $1 AND exam_id = $2 FOR UPDATE`,
      [input.requestId, input.examId]
    );
    const row = lockedResult.rows[0];
    if (!row) return { error: 'Request not found' };
    if (row.status !== 'pending') return { error: `Request is already ${row.status}` };

    if (input.decision === 'approved') {
      const handler = REQUEST_HANDLERS[row.type];
      if (!handler) return { error: 'No handler for this request type' };
      try {
        await handler({ client, request: row, decidedBy: input.decidedBy });
      } catch (e) {
        return { error: (e as Error).message || 'Handler failed' };
      }
    }

    const updated = await client.query<ExamRequestRow>(
      `UPDATE exam_requests
         SET status = $1, decided_by = $2, decided_at = NOW(), decision_note = $3
       WHERE id = $4
       RETURNING *`,
      [input.decision, input.decidedBy, input.note || null, input.requestId]
    );
    return { request: updated.rows[0] };
  });
}
