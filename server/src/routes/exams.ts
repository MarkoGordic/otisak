import { Router, Request, Response } from 'express';
import {
  getOtisakExams,
  getExamsForUser,
  createOtisakExam,
  updateOtisakExamStatus,
  updateOtisakExam,
  deleteOtisakExam,
  setExamTagRules,
} from '../db/otisak';
import { requireAuth, requireRole } from '../middleware';

const router = Router();

router.use(requireAuth);

// GET /exams
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    if (user.role === 'admin' || user.role === 'assistant') {
      const { status, subject_id, exam_mode } = req.query;
      const exams = await getOtisakExams({
        status: status as string | undefined,
        subject_id: subject_id as string | undefined,
        exam_mode: exam_mode as string | undefined,
      });
      return res.json(exams);
    } else {
      const exams = await getExamsForUser(user.id);
      return res.json(exams);
    }
  } catch (error) {
    console.error('Get exams error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /exams
router.post('/', requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const exam = await createOtisakExam(req.body, req.user!.id);

    // Set tag rules if provided
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
router.patch('/', requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const { id, status, tag_rules, ...fields } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Exam id is required' });
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
    console.error('Update exam error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /exams
router.delete('/', requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Exam id is required' });
    }

    const deleted = await deleteOtisakExam(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete exam error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
