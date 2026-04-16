import { Router, Request, Response } from 'express';
import { getUserAttempts } from '../db/otisak';
import { requireAuth } from '../middleware';

const router = Router();

router.use(requireAuth);

// GET /history
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { mode } = req.query;
    const attempts = await getUserAttempts(user.id, mode as string | undefined);
    return res.json(attempts);
  } catch (error) {
    console.error('Get history error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
