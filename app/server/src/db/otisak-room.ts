// OTISAK Database Operations
// ========================================

import { query } from './client';
import { getOtisakExamById } from './otisak-exams';
import { enrollUserInExam } from './otisak-enrollments';
import { findOrProvisionStudentByIndex } from './users';
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
  // Exam first, so a join attempt on an inactive exam never creates an account.
  const exam = await getOtisakExamById(examId);
  if (!exam) return { user: null, error: 'Exam not found.' };
  if (exam.status !== 'active') return { user: null, error: 'Exam is not active.' };

  // The local account by index, or one created from FreeIPA for a student who never signed in.
  const found = await findOrProvisionStudentByIndex(indexNumber);
  if (!found.user) return { user: null, error: found.error };
  const user = { id: found.user.id, name: found.user.name, index_number: found.user.index_number };

  await enrollUserInExam(examId, user.id);
  return { user };
}
