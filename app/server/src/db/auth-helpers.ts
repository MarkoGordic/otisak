import { query } from './client';

// Permission helpers that bridge a user's role with the per-subject
// assignment table. The rule is the same everywhere:
//   - admin can manage everything
//   - assistant can manage the subject only if a row exists in
//     subject_assignments for (user_id, subject_id)
//   - everything else is denied
//
// These functions used to live inside otisak-question-bank.ts but the same
// gating now needs to apply to exam mutations and question writes, so they
// were lifted into a shared module.

export async function isSubjectManageableByUser(
  userId: string,
  subjectId: string,
  isAdmin: boolean
): Promise<boolean> {
  if (isAdmin) {
    const subject = await query<{ id: string }>(
      'SELECT id FROM otisak_subjects WHERE id = $1 LIMIT 1',
      [subjectId]
    );
    return subject.rows.length > 0;
  }

  const assignment = await query<{ id: string }>(
    `SELECT sa.id
     FROM subject_assignments sa
     WHERE sa.user_id = $1 AND sa.subject_id = $2
     LIMIT 1`,
    [userId, subjectId]
  );
  return assignment.rows.length > 0;
}

// Return subject ids the user is assigned to. Used to filter the exam list
// shown to assistants in the manage view.
export async function getAssignedSubjectIds(userId: string): Promise<string[]> {
  const result = await query<{ subject_id: string }>(
    'SELECT subject_id FROM subject_assignments WHERE user_id = $1',
    [userId]
  );
  return result.rows.map((r) => r.subject_id);
}

// Authoritative gate for "can this user mutate this exam?".
// Loads only the exam.subject_id then defers to isSubjectManageableByUser.
// Exams without a subject can only be touched by an admin — assistants need
// a subject assignment to act on something, otherwise the model has no
// scope to enforce.
export async function canUserManageExam(
  userId: string,
  examId: string,
  isAdmin: boolean
): Promise<boolean> {
  if (isAdmin) return true;
  const result = await query<{ subject_id: string | null }>(
    'SELECT subject_id FROM otisak_exams WHERE id = $1 LIMIT 1',
    [examId]
  );
  const row = result.rows[0];
  if (!row) return false;
  if (!row.subject_id) return false;
  return isSubjectManageableByUser(userId, row.subject_id, false);
}

// ----- subject_assignments CRUD -----

export type SubjectAssignmentRow = {
  user_id: string;
  subject_id: string;
  role: string;
  assigned_at: string;
  email: string;
  name: string | null;
  index_number: string | null;
};

export async function listSubjectAssignments(subjectId: string): Promise<SubjectAssignmentRow[]> {
  const result = await query<SubjectAssignmentRow>(
    `SELECT sa.user_id, sa.subject_id, sa.role, sa.assigned_at,
            u.email, u.name, u.index_number
     FROM subject_assignments sa
     JOIN users u ON u.id = sa.user_id
     WHERE sa.subject_id = $1
     ORDER BY u.name NULLS LAST, u.email`,
    [subjectId]
  );
  return result.rows;
}

export async function assignUserToSubject(
  userId: string,
  subjectId: string,
  role: 'professor' | 'assistant',
  assignedBy: string
): Promise<boolean> {
  const result = await query(
    `INSERT INTO subject_assignments (user_id, subject_id, role, assigned_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, subject_id) DO UPDATE SET role = EXCLUDED.role`,
    [userId, subjectId, role, assignedBy]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function unassignUserFromSubject(userId: string, subjectId: string): Promise<boolean> {
  const result = await query(
    'DELETE FROM subject_assignments WHERE user_id = $1 AND subject_id = $2',
    [userId, subjectId]
  );
  return (result.rowCount ?? 0) > 0;
}
