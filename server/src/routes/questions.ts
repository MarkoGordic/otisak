import { Router, Request, Response } from 'express';
import {
  getOtisakQuestionBankQuestions,
  createOtisakQuestionBankQuestion,
  deleteOtisakQuestionBankQuestion,
} from '../db/otisak-question-bank';
import { requireAuth, requireRole } from '../middleware';

const router = Router();

router.use(requireAuth, requireRole(['admin', 'assistant']));

// GET /questions
router.get('/', async (req: Request, res: Response) => {
  try {
    const { subject_id, search, type, tag, limit, offset } = req.query;

    if (!subject_id) {
      return res.status(400).json({ error: 'subject_id is required' });
    }

    const result = await getOtisakQuestionBankQuestions({
      subjectId: subject_id as string,
      search: search as string | undefined,
      type: type as any,
      tag: tag as string | undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    return res.json(result);
  } catch (error) {
    console.error('Get questions error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /questions
router.post('/', async (req: Request, res: Response) => {
  try {
    const question = await createOtisakQuestionBankQuestion(req.body, req.user!.id);
    return res.json(question);
  } catch (error) {
    console.error('Create question error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /questions
router.delete('/', async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Question id is required' });
    }

    const deleted = await deleteOtisakQuestionBankQuestion(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Question not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete question error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
