// OTISAK Database Operations
// ========================================

import { query } from './client';
import { getOtisakExamById } from './otisak-exams';
import { enrollUserInExam } from './otisak-enrollments';
import type {
  OtisakExam,
} from './otisak-types';

// ========================================
// ROOM / LIVE EXAM CONTROL
// ========================================

export async function startExamTimer(examId: string): Promise<OtisakExam | null> {
  // Auto-activate scheduled/draft exams when the admin clicks Start. Idempotent
  // for already-active exams (COALESCE preserves an existing exam_started_at
  // so a second click doesn't reset every student's timer).
  // Completed and archived exams are intentionally NOT eligible - once an exam
  // ends it stays ended.
  const result = await query<OtisakExam>(
    `UPDATE otisak_exams
     SET status = 'active',
         exam_started_at = COALESCE(exam_started_at, NOW())
     WHERE id = $1
       AND status IN ('draft', 'scheduled', 'active')
     RETURNING *`,
    [examId]
  );
  return result.rows[0] || null;
}

export async function joinExamByIndex(examId: string, indexNumber: string): Promise<{
  user: { id: string; name: string | null; index_number: string | null } | null;
  error?: string;
}> {
  const normalized = indexNumber.trim().toLowerCase().replace(/\s+/g, '');
  const userResult = await query<{ id: string; name: string | null; index_number: string | null }>(
    `SELECT id, name, index_number FROM users
     WHERE LOWER(REPLACE(index_number, ' ', '')) = $1 AND is_active = TRUE LIMIT 1`,
    [normalized]
  );
  const user = userResult.rows[0];
  if (!user) return { user: null, error: 'Index number not found. Contact your administrator.' };

  const exam = await getOtisakExamById(examId);
  if (!exam) return { user: null, error: 'Exam not found.' };
  if (exam.status !== 'active') return { user: null, error: 'Exam is not active.' };

  await enrollUserInExam(examId, user.id);
  return { user };
}
