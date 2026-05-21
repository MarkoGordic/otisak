import { Router, Request, Response } from 'express';
import {
  getOtisakExams,
  getExamsForUser,
  createOtisakExam,
  updateOtisakExamStatus,
  updateOtisakExam,
  deleteOtisakExam,
  setExamTagRules,
  DemoExamLockedError,
} from '../db/otisak';
import { requireAuth, requireRole } from '../middleware';
import {
  canUserManageExam,
  getAssignedSubjectIds,
  isSubjectManageableByUser,
} from '../db/auth-helpers';
import { importExamFromJson, resolveSubjectIdByName } from '../lib/importExam';

const router = Router();

// GET /exams/active - public, list active real exams for student picker
router.get('/active', async (_req: Request, res: Response) => {
  try {
    const exams = await getOtisakExams({ status: 'active', exam_mode: 'real' });
    const sanitized = exams.map((e) => ({
      id: e.id,
      title: e.title,
      duration_minutes: e.duration_minutes,
      subject_name: e.subject_name,
      subject_code: e.subject_code,
      exam_started_at: e.exam_started_at,
    }));
    return res.json({ exams: sanitized });
  } catch (error) {
    console.error('Get active exams error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /exams
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    if (user.role === 'admin') {
      const { status, subject_id, exam_mode } = req.query;
      const exams = await getOtisakExams({
        status: status as string | undefined,
        subject_id: subject_id as string | undefined,
        exam_mode: exam_mode as string | undefined,
      });
      return res.json({ exams });
    }
    if (user.role === 'assistant') {
      // Assistants only see exams attached to subjects they're assigned to.
      // Empty assignment list → empty result (the helper short-circuits
      // before hitting the DB on the worst case).
      const subjectIds = await getAssignedSubjectIds(user.id);
      const { status, subject_id, exam_mode } = req.query;
      const exams = await getOtisakExams({
        status: status as string | undefined,
        subject_id: subject_id as string | undefined,
        exam_mode: exam_mode as string | undefined,
        subject_ids: subjectIds,
      });
      return res.json({ exams });
    }
    const exams = await getExamsForUser(user.id);
    return res.json({ exams });
  } catch (error) {
    console.error('Get exams error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /exams
router.post('/', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const isAdmin = user.role === 'admin';
    const subjectId = typeof req.body?.subject_id === 'string' ? req.body.subject_id : null;

    // Assistants must own (be assigned to) the subject they're creating an
    // exam under. Without a subject, no scope to enforce — admin only.
    if (!isAdmin) {
      if (!subjectId) {
        return res.status(400).json({ error: 'subject_id is required for assistants' });
      }
      const ok = await isSubjectManageableByUser(user.id, subjectId, false);
      if (!ok) return res.status(403).json({ error: 'Not assigned to this subject' });
    }

    const exam = await createOtisakExam(req.body, user.id);

    if (req.body.tag_rules && Array.isArray(req.body.tag_rules)) {
      await setExamTagRules(exam.id, req.body.tag_rules);
    }

    return res.json(exam);
  } catch (error) {
    console.error('Create exam error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /exams
router.patch('/', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const { id, status, tag_rules, ...fields } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Exam id is required' });
    }

    const user = req.user!;
    const isAdmin = user.role === 'admin';
    const allowed = await canUserManageExam(user.id, id, isAdmin);
    if (!allowed) return res.status(403).json({ error: 'Not authorized to manage this exam' });

    // If an assistant is trying to MOVE this exam to a different subject,
    // they must also be assigned to the target subject — otherwise they
    // could lift an exam out of their scope.
    if (!isAdmin && typeof fields.subject_id === 'string' && fields.subject_id) {
      const ok = await isSubjectManageableByUser(user.id, fields.subject_id, false);
      if (!ok) return res.status(403).json({ error: 'Not assigned to target subject' });
    }

    let result = null;

    if (status) {
      result = await updateOtisakExamStatus(id, status);
    }

    if (Object.keys(fields).length > 0) {
      result = await updateOtisakExam(id, fields);
    }

    if (tag_rules && Array.isArray(tag_rules)) {
      await setExamTagRules(id, tag_rules);
    }

    if (!result) {
      return res.status(404).json({ error: 'Exam not found or no changes' });
    }

    return res.json(result);
  } catch (error) {
    if (error instanceof DemoExamLockedError) {
      return res.status(409).json({ error: 'DEMO_EXAM_LOCKED' });
    }
    console.error('Update exam error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /exams/import-json - admin/assistant, create a new exam from a JSON dump
// Mirrors the shape produced by GET /exams/:id/export-json:
//   { version: 1, exam: { title, ... }, questions: [{ type, text, ... answers: [...] }] }
// Subject resolution order:
//   1. Explicit `subject_id` on the request body (sent by the import dialog).
//      Wins over anything in the JSON payload itself. This lets the assistant
//      reassign on import without editing the file.
//   2. Otherwise fall back to matching `exam.subject_name` from the JSON
//      against an existing subject by name (case-insensitive).
//   3. Otherwise no subject (admin-only — assistants need a subject).
router.post('/import-json', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    if (typeof body !== 'object' || !body.exam || !Array.isArray(body.questions)) {
      return res.status(400).json({ error: 'Invalid exam JSON: missing exam or questions' });
    }

    const user = req.user!;
    const isAdmin = user.role === 'admin';

    const explicitSubjectId = typeof body.subject_id === 'string' && body.subject_id
      ? body.subject_id
      : null;
    const subjectId = explicitSubjectId
      ?? await resolveSubjectIdByName(body.exam.subject_name as string | undefined);

    if (!isAdmin) {
      if (!subjectId) {
        return res.status(400).json({ error: 'Assistants must import into a known subject (pick one in the dialog or set exam.subject_name)' });
      }
      const ok = await isSubjectManageableByUser(user.id, subjectId, false);
      if (!ok) return res.status(403).json({ error: 'Not assigned to this subject' });
    } else if (explicitSubjectId) {
      // For admins, still 400 if they passed a subject_id that doesn't exist —
      // otherwise the row would be silently dropped into "no subject".
      const ok = await isSubjectManageableByUser(user.id, explicitSubjectId, true);
      if (!ok) return res.status(400).json({ error: 'Selected subject does not exist' });
    }

    const result = await importExamFromJson(body, user.id, { subject_id: subjectId });
    return res.json({ exam: result.exam, questions: result.questions });
  } catch (error) {
    console.error('Import exam JSON error:', error);
    return res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// DELETE /exams
router.delete('/', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const id = (req.query.id as string | undefined) || req.body?.id;
    if (!id) {
      return res.status(400).json({ error: 'Exam id is required' });
    }

    const user = req.user!;
    const allowed = await canUserManageExam(user.id, id, user.role === 'admin');
    if (!allowed) return res.status(403).json({ error: 'Not authorized to manage this exam' });

    const deleted = await deleteOtisakExam(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    if (error instanceof DemoExamLockedError) {
      return res.status(409).json({ error: 'DEMO_EXAM_LOCKED' });
    }
    console.error('Delete exam error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
