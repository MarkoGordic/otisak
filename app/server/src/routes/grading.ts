import { Router, Request, Response } from 'express';
import { getGradingSummary } from '../db/otisak';
import { requireAuth, requireRole } from '../middleware';

const router = Router();

// GET /grading/summary - exams with open-text answers still waiting for a
// grade. Admins see all; professors/assistants only their assigned subjects.
router.get('/summary', requireAuth, requireRole(['admin', 'assistant', 'professor']), async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const exams = await getGradingSummary(user.id, user.role === 'admin');
    return res.json({ exams });
  } catch (error) {
    console.error('Grading summary error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
