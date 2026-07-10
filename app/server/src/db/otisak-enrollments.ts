// OTISAK Database Operations
// ========================================

import { query } from './client';
import type {
  OtisakExamWithSubject,
  OtisakEnrollment,
} from './otisak-types';

// ========================================
// ENROLLMENTS
// ========================================

export async function enrollUserInExam(examId: string, userId: string): Promise<OtisakEnrollment> {
  const result = await query<OtisakEnrollment>(
    `INSERT INTO otisak_enrollments (exam_id, user_id)
     VALUES ($1, $2) ON CONFLICT (exam_id, user_id) DO NOTHING RETURNING *`,
    [examId, userId]
  );
  if (!result.rows[0]) {
    const existing = await query<OtisakEnrollment>(
      'SELECT * FROM otisak_enrollments WHERE exam_id = $1 AND user_id = $2',
      [examId, userId]
    );
    return existing.rows[0];
  }
  return result.rows[0];
}

export async function getExamsForUser(userId: string): Promise<OtisakExamWithSubject[]> {
  const result = await query<OtisakExamWithSubject>(
    `SELECT e.*, s.name as subject_name, s.code as subject_code,
            (SELECT COUNT(*)::int FROM otisak_questions q WHERE q.exam_id = e.id) as question_count
     FROM otisak_exams e
     LEFT JOIN otisak_subjects s ON e.subject_id = s.id
     INNER JOIN otisak_enrollments en ON en.exam_id = e.id
     WHERE en.user_id = $1 AND e.status IN ('scheduled', 'active', 'completed')
       AND e.parent_exam_id IS NULL
       AND e.exam_mode = 'real'
     ORDER BY e.scheduled_at DESC NULLS LAST, e.created_at DESC`,
    [userId]
  );
  return result.rows;
}

// ========================================
// BULK ENROLLMENT
// ========================================

export async function enrollUsersByPattern(examId: string, pattern: string): Promise<number> {
  const result = await query(
    `INSERT INTO otisak_enrollments (exam_id, user_id)
     SELECT $1, u.id FROM users u
     WHERE u.index_number IS NOT NULL AND u.index_number ILIKE $2
     ON CONFLICT (exam_id, user_id) DO NOTHING`,
    [examId, `%${pattern}%`]
  );
  return result.rowCount ?? 0;
}

// Hard cap on how many index_number patterns we generate per call. A real
// student cohort is at most a few hundred per course/year; anything larger
// is almost certainly a typo'd range. The cap also keeps the patterns array
// (and ANY($2::text[]) Postgres parameter) from blowing up in pathological
// inputs like fromNumber=1, toNumber=999999.
const MAX_ENROLLMENT_RANGE = 2000;

export async function enrollByCourseAndYear(
  examId: string,
  courseCode: string,
  year: number,
  fromNumber?: number,
  toNumber?: number,
): Promise<number> {
  // courseCode is interpolated into LIKE / equality patterns below. It comes
  // from admin input and is parameterised, but we still constrain its shape
  // to avoid pattern-matching surprises (e.g. accidental wildcard chars).
  if (!/^[a-z0-9]{1,10}$/i.test(courseCode)) {
    throw new Error('Invalid course code (1-10 alphanumeric chars expected)');
  }
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error('Invalid year');
  }
  if (fromNumber !== undefined && toNumber !== undefined) {
    if (!Number.isInteger(fromNumber) || !Number.isInteger(toNumber)) {
      throw new Error('Range bounds must be integers');
    }
    if (fromNumber < 1 || toNumber < fromNumber) {
      throw new Error('Invalid range');
    }
    if (toNumber - fromNumber + 1 > MAX_ENROLLMENT_RANGE) {
      throw new Error(`Range exceeds maximum of ${MAX_ENROLLMENT_RANGE} students`);
    }
    // Canonical stored index format is "ra1-2025" (see normalizeIndexNumber
    // in db/users.ts); match it the same whitespace/case-tolerant way
    // findUserByIndexNumber does.
    const code = courseCode.toLowerCase();
    const patterns: string[] = [];
    for (let i = fromNumber; i <= toNumber; i++) {
      patterns.push(`${code}${i}-${year}`);
    }
    if (patterns.length === 0) return 0;
    const result = await query(
      `INSERT INTO otisak_enrollments (exam_id, user_id)
       SELECT $1, u.id FROM users u
       WHERE u.index_number IS NOT NULL
         AND LOWER(REPLACE(u.index_number, ' ', '')) = ANY($2::text[])
       ON CONFLICT (exam_id, user_id) DO NOTHING`,
      [examId, patterns]
    );
    return result.rowCount ?? 0;
  }

  const pattern = `${courseCode.toLowerCase()}%-${year}`;
  const result = await query(
    `INSERT INTO otisak_enrollments (exam_id, user_id)
     SELECT $1, u.id FROM users u
     WHERE u.index_number IS NOT NULL
       AND LOWER(REPLACE(u.index_number, ' ', '')) LIKE $2
     ON CONFLICT (exam_id, user_id) DO NOTHING`,
    [examId, pattern]
  );
  return result.rowCount ?? 0;
}

export async function getExamEnrollments(
  examId: string
): Promise<Array<{ user_id: string; name: string | null; email: string; index_number: string | null; enrolled_at: Date }>> {
  const result = await query(
    `SELECT en.user_id, u.name, u.email, u.index_number, en.enrolled_at
     FROM otisak_enrollments en
     JOIN users u ON en.user_id = u.id
     WHERE en.exam_id = $1
     ORDER BY u.name ASC`,
    [examId]
  );
  return result.rows as Array<{ user_id: string; name: string | null; email: string; index_number: string | null; enrolled_at: Date }>;
}
