import { Router, Request, Response } from 'express';
import { getSelfServicePracticeExams, createPracticeInstance } from '../db/otisak';
import { getSetting } from '../db/settings';
import { requireAuth } from '../middleware';

const router = Router();

router.use(requireAuth);

// GET /practice
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { subject_id } = req.query;

    const exams = await getSelfServicePracticeExams(user.id, subject_id as string | undefined);

    // When practice mode is globally disabled we still expose public
    // practice exams (the built-in demo, anything an admin chose to leave
    // public) so the dashboard never goes completely empty. Private
    // practice exams stay hidden until the toggle is on.
    if (user.role === 'student') {
      const practiceEnabled = await getSetting('practice_mode_enabled');
      if (practiceEnabled === 'false') {
        const publicOnly = exams.filter((e) => e.is_public);
        return res.json({
          exams: publicOnly,
          practice_disabled: true,
          public_only: true,
        });
      }
    }

    return res.json({ exams });
  } catch (error) {
    console.error('Get practice exams error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /practice/start
router.post('/start', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { exam_id } = req.body;

    if (!exam_id) {
      return res.status(400).json({ error: 'exam_id is required' });
    }

    const result = await createPracticeInstance(exam_id, user.id, {
      ip_address: req.ip || undefined,
      user_agent: req.headers['user-agent'] || undefined,
    });

    return res.json(result);
  } catch (error) {
    console.error('Start practice error:', error);
    return res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

export default router;
