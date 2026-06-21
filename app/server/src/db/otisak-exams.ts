// OTISAK Database Operations
// ========================================

import { query } from './client';
import { ConflictError } from '../lib/errors';
import type {
  OtisakExam,
  OtisakExamWithSubject,
  CreateOtisakExamInput,
  OtisakExamAiSettings,
} from './otisak-types';

// ========================================
// EXAMS
// ========================================

export async function getOtisakExams(
  filters?: {
    status?: string;
    statuses?: string[];
    subject_id?: string;
    exam_mode?: string;
    subject_ids?: string[];
    tags?: string[];
    scheduled_from?: string;
    scheduled_to?: string;
  }
): Promise<OtisakExamWithSubject[]> {
  let sql = `
    SELECT e.*, s.name as subject_name, s.code as subject_code,
           (SELECT COUNT(*)::int FROM otisak_questions q WHERE q.exam_id = e.id) as question_count
    FROM otisak_exams e
    LEFT JOIN otisak_subjects s ON e.subject_id = s.id
  `;
  const conditions: string[] = ['e.parent_exam_id IS NULL'];
  const params: unknown[] = [];

  if (filters?.status) {
    conditions.push(`e.status = $${params.length + 1}`);
    params.push(filters.status);
  }
  // `statuses` is the multi-value variant - used by the manage page tabs
  // (Aktivni = draft|scheduled|active in one query). When both `status` and
  // `statuses` are set, `status` wins (the caller probably narrowed inside
  // a tab) and `statuses` is ignored.
  if (filters?.statuses && filters.statuses.length > 0 && !filters?.status) {
    conditions.push(`e.status = ANY($${params.length + 1}::text[])`);
    params.push(filters.statuses);
  }
  if (filters?.subject_id) {
    conditions.push(`e.subject_id = $${params.length + 1}`);
    params.push(filters.subject_id);
  }
  if (filters?.exam_mode) {
    conditions.push(`e.exam_mode = $${params.length + 1}`);
    params.push(filters.exam_mode);
  }
  // Array-overlap on the GIN-indexed tags column. Caller passes already-
  // normalised lowercase tags; we don't re-normalise here.
  if (filters?.tags && filters.tags.length > 0) {
    conditions.push(`e.tags && $${params.length + 1}::text[]`);
    params.push(filters.tags);
  }
  if (filters?.scheduled_from) {
    conditions.push(`e.scheduled_at >= $${params.length + 1}`);
    params.push(filters.scheduled_from);
  }
  if (filters?.scheduled_to) {
    conditions.push(`e.scheduled_at <= $${params.length + 1}`);
    params.push(filters.scheduled_to);
  }
  // Hard filter for assistants: only exams belonging to subjects the user
  // is assigned to. Empty array → no exams (the route layer is responsible
  // for short-circuiting when an assistant has zero assignments, but we
  // still guard here so a programmer error doesn't leak the whole table).
  if (filters?.subject_ids) {
    if (filters.subject_ids.length === 0) {
      conditions.push('FALSE');
    } else {
      conditions.push(`e.subject_id = ANY($${params.length + 1}::uuid[])`);
      params.push(filters.subject_ids);
    }
  }

  sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY e.created_at DESC';

  const result = await query<OtisakExamWithSubject>(sql, params);
  return result.rows;
}

export async function getOtisakExamById(id: string): Promise<OtisakExamWithSubject | null> {
  const result = await query<OtisakExamWithSubject>(
    `SELECT e.*, s.name as subject_name, s.code as subject_code,
            (SELECT COUNT(*)::int FROM otisak_questions q WHERE q.exam_id = e.id) as question_count
     FROM otisak_exams e
     LEFT JOIN otisak_subjects s ON e.subject_id = s.id
     WHERE e.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function createOtisakExam(
  data: CreateOtisakExamInput,
  createdBy: string
): Promise<OtisakExam> {
  // Tags get normalised once on the way in: lowercased, trimmed, deduped,
  // empties dropped. Saves us from re-doing it on every read.
  const tags = normalizeExamTags(data.tags);
  const result = await query<OtisakExam>(
    `INSERT INTO otisak_exams (title, subject_id, description, duration_minutes, scheduled_at,
       allow_review, shuffle_questions, shuffle_answers, pass_threshold, has_pass_threshold, created_by,
       exam_mode, self_service, repeat_interval_minutes, auto_activate, uses_question_bank, is_public,
       negative_points_enabled, negative_points_value, negative_points_threshold, partial_scoring, tags,
       allow_notes, allow_calculator)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24) RETURNING *`,
    [
      data.title,
      data.subject_id || null,
      data.description || null,
      data.duration_minutes,
      data.scheduled_at || null,
      data.allow_review ?? false,
      data.shuffle_questions ?? false,
      data.shuffle_answers ?? false,
      data.pass_threshold ?? 50,
      data.has_pass_threshold ?? true,
      createdBy,
      data.exam_mode || 'real',
      data.self_service ?? false,
      data.repeat_interval_minutes || null,
      data.auto_activate ?? false,
      data.uses_question_bank ?? false,
      data.is_public ?? false,
      data.negative_points_enabled ?? false,
      data.negative_points_value ?? 0,
      data.negative_points_threshold ?? 1,
      data.partial_scoring ?? false,
      tags,
      data.allow_notes ?? true,
      data.allow_calculator ?? false,
    ]
  );
  return result.rows[0];
}

// Lowercase + trim + dedupe + drop empties. Public so the API layer can call it
// when accepting `?tags=foo,Bar,foo` query params and emit the same canonical
// form for filtering as we store on the row.
export function normalizeExamTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== 'string') continue;
    const v = t.trim().toLowerCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

// Title of the seeded demo exam (see server/src/bootstrap.ts:ensureDemoExam).
// Used to pin the demo: it must stay 'active' and undeletable so first-time
// students always have something to try, regardless of what an admin clicks
// in the room view. Identification is by title because the seed itself is
// the only thing that creates that exact string.
export const DEMO_EXAM_TITLE = 'Šaljivi test: crtani junaci';

// Sentinel thrown when a mutation touches the seeded demo exam. Extends
// ConflictError so the centralized error handler maps it to a 409 with the
// DEMO_EXAM_LOCKED code; the existing route-level catch keeps working too.
export class DemoExamLockedError extends ConflictError {
  constructor() { super('DEMO_EXAM_LOCKED', 'DEMO_EXAM_LOCKED'); }
}

export async function isDemoExamId(examId: string): Promise<boolean> {
  const r = await query<{ title: string }>('SELECT title FROM otisak_exams WHERE id = $1 LIMIT 1', [examId]);
  return r.rows[0]?.title === DEMO_EXAM_TITLE;
}

export async function updateOtisakExamStatus(
  examId: string,
  status: OtisakExam['status']
): Promise<OtisakExam | null> {
  // A finished exam stays finished. We block flips OUT of completed/archived
  // here at the DB layer so no UI button (or stray API call) can reopen them.
  // Allowed transitions: anything -> draft/scheduled/active/completed/archived
  // EXCEPT (completed|archived) -> active.
  //
  // Demo exam: pinned to 'active'. Any move to completed/archived throws so
  // the demo can't be accidentally retired by clicking "Završi" in the room.
  const cur = await query<{ status: string; title: string }>(
    'SELECT status, title FROM otisak_exams WHERE id = $1',
    [examId],
  );
  const row = cur.rows[0];
  if (!row) return null;

  if (row.title === DEMO_EXAM_TITLE && (status === 'completed' || status === 'archived')) {
    throw new DemoExamLockedError();
  }
  if (status === 'active' && (row.status === 'completed' || row.status === 'archived')) {
    return null;
  }
  const result = await query<OtisakExam>(
    `UPDATE otisak_exams SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [examId, status]
  );
  return result.rows[0] || null;
}

export async function updateOtisakExam(
  examId: string,
  data: Partial<Pick<OtisakExam, 'title' | 'description' | 'duration_minutes' | 'pass_threshold' | 'has_pass_threshold' | 'allow_review' | 'allow_notes' | 'allow_calculator' | 'shuffle_questions' | 'shuffle_answers' | 'is_public' | 'self_service' | 'repeat_interval_minutes' | 'auto_activate' | 'negative_points_enabled' | 'negative_points_value' | 'negative_points_threshold' | 'partial_scoring' | 'exam_mode' | 'subject_id' | 'tags'>>
): Promise<OtisakExam | null> {
  // Block edits that would break the demo lock. The demo is identified by
  // its title, so renaming it would orphan the lock and let the demo be
  // finished or deleted. Moving it to a different subject would also break
  // the Demo subject scoping. Other fields stay editable so admins can tune
  // duration / pass-threshold / etc on the demo.
  if (data.title !== undefined || data.subject_id !== undefined) {
    if (await isDemoExamId(examId)) {
      throw new DemoExamLockedError();
    }
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.title !== undefined) { updates.push(`title = $${idx++}`); values.push(data.title); }
  if (data.description !== undefined) { updates.push(`description = $${idx++}`); values.push(data.description); }
  if (data.duration_minutes !== undefined) { updates.push(`duration_minutes = $${idx++}`); values.push(data.duration_minutes); }
  if (data.pass_threshold !== undefined) { updates.push(`pass_threshold = $${idx++}`); values.push(data.pass_threshold); }
  if (data.has_pass_threshold !== undefined) { updates.push(`has_pass_threshold = $${idx++}`); values.push(data.has_pass_threshold); }
  if (data.allow_review !== undefined) { updates.push(`allow_review = $${idx++}`); values.push(data.allow_review); }
  if (data.allow_notes !== undefined) { updates.push(`allow_notes = $${idx++}`); values.push(data.allow_notes); }
  if (data.allow_calculator !== undefined) { updates.push(`allow_calculator = $${idx++}`); values.push(data.allow_calculator); }
  if (data.shuffle_questions !== undefined) { updates.push(`shuffle_questions = $${idx++}`); values.push(data.shuffle_questions); }
  if (data.shuffle_answers !== undefined) { updates.push(`shuffle_answers = $${idx++}`); values.push(data.shuffle_answers); }
  if (data.is_public !== undefined) { updates.push(`is_public = $${idx++}`); values.push(data.is_public); }
  if (data.self_service !== undefined) { updates.push(`self_service = $${idx++}`); values.push(data.self_service); }
  if (data.repeat_interval_minutes !== undefined) { updates.push(`repeat_interval_minutes = $${idx++}`); values.push(data.repeat_interval_minutes); }
  if (data.auto_activate !== undefined) { updates.push(`auto_activate = $${idx++}`); values.push(data.auto_activate); }
  if (data.negative_points_enabled !== undefined) { updates.push(`negative_points_enabled = $${idx++}`); values.push(data.negative_points_enabled); }
  if (data.negative_points_value !== undefined) { updates.push(`negative_points_value = $${idx++}`); values.push(data.negative_points_value); }
  if (data.negative_points_threshold !== undefined) { updates.push(`negative_points_threshold = $${idx++}`); values.push(data.negative_points_threshold); }
  if (data.partial_scoring !== undefined) { updates.push(`partial_scoring = $${idx++}`); values.push(data.partial_scoring); }
  if (data.tags !== undefined) { updates.push(`tags = $${idx++}`); values.push(normalizeExamTags(data.tags)); }
  if (data.exam_mode !== undefined) {
    // Only allow the two known modes; don't trust the client to send anything else.
    const mode = data.exam_mode === 'practice' ? 'practice' : 'real';
    updates.push(`exam_mode = $${idx++}`); values.push(mode);
    // Keep the practice-side flags in sync - practice exams are self-service + public,
    // real exams are not. Skips when the caller explicitly set those fields above.
    if (data.self_service === undefined) {
      updates.push(`self_service = $${idx++}`); values.push(mode === 'practice');
    }
    if (data.is_public === undefined) {
      updates.push(`is_public = $${idx++}`); values.push(mode === 'practice');
    }
  }
  if (data.subject_id !== undefined) { updates.push(`subject_id = $${idx++}`); values.push(data.subject_id); }

  if (updates.length === 0) return null;
  values.push(examId);
  const result = await query<OtisakExam>(
    `UPDATE otisak_exams SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

// deleteOtisakExam used to live here. It was removed alongside the DELETE
// /api/otisak/exams route - exams are no longer deletable. Use the
// 'archived' status to take an exam out of the main listing.

// ========================================
// SELF-SERVICE PRACTICE LISTING
// ========================================

export async function getSelfServicePracticeExams(
  userId: string,
  subjectId?: string
): Promise<OtisakExamWithSubject[]> {
  let sql = `
    SELECT e.*, s.name as subject_name, s.code as subject_code,
           0 as question_count
    FROM otisak_exams e
    LEFT JOIN otisak_subjects s ON e.subject_id = s.id
    WHERE e.exam_mode = 'practice'
      AND e.self_service = TRUE
      AND e.parent_exam_id IS NULL
      AND e.status IN ('active', 'scheduled')
      AND (
        (e.is_public = TRUE)
        OR EXISTS (SELECT 1 FROM otisak_enrollments en WHERE en.exam_id = e.id AND en.user_id = $1)
      )
  `;
  const params: unknown[] = [userId];

  if (subjectId) {
    params.push(subjectId);
    sql += ` AND e.subject_id = $${params.length}`;
  }

  sql += ' ORDER BY e.created_at DESC';
  const result = await query<OtisakExamWithSubject>(sql, params);
  return result.rows;
}

// ========================================
// AI GRADING SETTINGS
// ========================================

export async function getExamAiSettings(examId: string): Promise<OtisakExamAiSettings | null> {
  const result = await query<OtisakExamAiSettings>(
    'SELECT * FROM otisak_exam_ai_settings WHERE exam_id = $1',
    [examId]
  );
  return result.rows[0] || null;
}

export async function upsertExamAiSettings(
  examId: string,
  data: {
    ai_provider?: string;
    api_key_encrypted?: string;
    grading_mode?: string;
    allow_student_api_keys?: boolean;
    max_student_credits?: number;
  }
): Promise<OtisakExamAiSettings> {
  const result = await query<OtisakExamAiSettings>(
    `INSERT INTO otisak_exam_ai_settings (exam_id, ai_provider, api_key_encrypted, grading_mode, allow_student_api_keys, max_student_credits)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (exam_id) DO UPDATE SET
       ai_provider = COALESCE($2, otisak_exam_ai_settings.ai_provider),
       api_key_encrypted = COALESCE($3, otisak_exam_ai_settings.api_key_encrypted),
       grading_mode = COALESCE($4, otisak_exam_ai_settings.grading_mode),
       allow_student_api_keys = COALESCE($5, otisak_exam_ai_settings.allow_student_api_keys),
       max_student_credits = COALESCE($6, otisak_exam_ai_settings.max_student_credits)
     RETURNING *`,
    [
      examId,
      data.ai_provider || 'claude',
      data.api_key_encrypted || null,
      data.grading_mode || 'deferred',
      data.allow_student_api_keys ?? false,
      data.max_student_credits ?? 0,
    ]
  );
  return result.rows[0];
}
