import { Router, Request, Response } from 'express';
import {
  getOtisakSubjects,
  createOtisakSubject,
  updateOtisakSubject,
  deleteOtisakSubject,
} from '../db/otisak';
import { requireAuth, requireRole } from '../middleware';

const router = Router();

// All routes require auth
router.use(requireAuth);

// GET /subjects
router.get('/', async (_req: Request, res: Response) => {
  try {
    const subjects = await getOtisakSubjects();
    return res.json({ subjects });
  } catch (error) {
    console.error('Get subjects error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /subjects
router.post('/', requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const { name, code, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Subject name is required' });
    }

    const subject = await createOtisakSubject({ name, code, description }, req.user!.id);
    return res.json(subject);
  } catch (error) {
    console.error('Create subject error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /subjects
router.patch('/', requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const { id, name, code, description } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Subject id is required' });
    }

    const updated = await updateOtisakSubject(id, { name, code, description });
    if (!updated) {
      return res.status(404).json({ error: 'Subject not found or no changes' });
    }
    return res.json(updated);
  } catch (error) {
    console.error('Update subject error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /subjects
router.delete('/', requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const id = (req.query.id as string | undefined) || req.body?.id;
    if (!id) {
      return res.status(400).json({ error: 'Subject id is required' });
    }

    await deleteOtisakSubject(id);
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete subject error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
