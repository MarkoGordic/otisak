import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware';
import { findUserById } from '../db/users';
import { getUserAttempts } from '../db/otisak';
import { getAssignedSubjectIds } from '../db/auth-helpers';

const router = Router();

router.use(requireAuth);

// GET /users/:userId/profile - admin/assistant, per-student aggregate.
//
// Admin sees every attempt the student has on file. Assistants see only the
// attempts tied to subjects they're assigned to (so an assistant in subject A
// doesn't peek at scores the student earned in subject B). If the assistant
// has no overlap, the response is a 403 — matches the manage-page scoping.
//
// Stats are derived in-process from the same attempt list the response
// returns, so the client can re-derive them or trust the server's pre-rolled
// numbers. Threshold-having exams are the only ones counted toward the
// "passed" tally — keeps the metric meaningful when an exam opts out of a
// pass / fail verdict.
router.get('/:userId/profile', requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.userId;
    const requester = req.user!;
    const isAdmin = requester.role === 'admin';

    const user = await findUserById(targetUserId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let attempts = await getUserAttempts(targetUserId);

    // Assistant scope check. OtisakAttemptWithExam doesn't carry subject_id
    // (only subject_name from the join), so resolve subject_id per exam in
    // one round-trip and intersect with the assistant's assignments.
    if (!isAdmin) {
      const assignedSubjectIds = await getAssignedSubjectIds(requester.id);
      if (assignedSubjectIds.length === 0) {
        return res.status(403).json({ error: 'No assigned subjects' });
      }
      const assignedSet = new Set(assignedSubjectIds);
      const examIds = attempts.map((a) => a.exam_id);
      const { query } = await import('../db/client');
      const subjMap = examIds.length > 0
        ? await query<{ id: string; subject_id: string | null }>(
            `SELECT id, subject_id FROM otisak_exams WHERE id = ANY($1::uuid[])`,
            [examIds]
          )
        : { rows: [] as Array<{ id: string; subject_id: string | null }> };
      const subjectByExam = new Map(subjMap.rows.map((r) => [r.id, r.subject_id]));
      attempts = attempts.filter((a) => {
        const sid = subjectByExam.get(a.exam_id);
        return !!sid && assignedSet.has(sid);
      });
      if (attempts.length === 0) {
        return res.status(403).json({ error: 'No overlap with this student' });
      }
    }

    // Stats. Mirrors the dashboard's per-user aggregation pattern.
    const submitted = attempts.filter((a) => a.submitted);
    const attempts_total = attempts.length;
    const attempts_submitted = submitted.length;

    let sumPoints = 0;
    let sumMax = 0;
    let sumTime = 0;
    let passedCount = 0;
    const subjects = new Set<string>();
    for (const a of submitted) {
      const total = Number(a.total_points || 0);
      const max = Number(a.max_points || 0);
      const pct = max > 0 ? (total / max) * 100 : 0;
      sumPoints += total;
      sumMax += max;
      sumTime += Number(a.time_spent_seconds || 0);
      if (a.subject_name) subjects.add(a.subject_name);
      if (a.has_pass_threshold !== false && pct >= Number(a.pass_threshold || 50)) passedCount++;
    }
    const avg_percent = sumMax > 0 ? Math.round((sumPoints / sumMax) * 100) : 0;

    // Strip the password hash; everything else on `users` is safe to surface.
    const { password_hash: _pw, ...safeUser } = user;
    void _pw;

    return res.json({
      user: safeUser,
      attempts,
      stats: {
        attempts_total,
        attempts_submitted,
        passed_count: passedCount,
        avg_percent,
        total_time_seconds: sumTime,
        subjects_distinct: subjects.size,
      },
    });
  } catch (error) {
    console.error('User profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
