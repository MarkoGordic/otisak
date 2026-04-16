import { Router, Request, Response } from 'express';
import { getAllUsers, updateUser } from '../db/users';
import { getAllSettings, setSetting } from '../db/settings';
import { requireAuth, requireRole } from '../middleware';

const router = Router();

// All admin routes require auth + admin role
router.use(requireAuth, requireRole(['admin']));

// GET /admin/users
router.get('/users', async (_req: Request, res: Response) => {
  try {
    const users = await getAllUsers();
    const sanitized = users.map(({ password_hash, ...rest }) => rest);
    return res.json(sanitized);
  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /admin/users
router.patch('/users', async (req: Request, res: Response) => {
  try {
    const { id, name, role, index_number, is_active } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'User id is required' });
    }

    const updated = await updateUser(id, { name, role, index_number, is_active });
    if (!updated) {
      return res.status(404).json({ error: 'User not found or no changes' });
    }

    const { password_hash, ...rest } = updated;
    return res.json(rest);
  } catch (error) {
    console.error('Update user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/settings
router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const settings = await getAllSettings();
    return res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /admin/settings
router.patch('/settings', async (req: Request, res: Response) => {
  try {
    const entries = req.body;
    if (!entries || typeof entries !== 'object') {
      return res.status(400).json({ error: 'Settings object is required' });
    }

    for (const [key, value] of Object.entries(entries)) {
      await setSetting(key, String(value));
    }

    const settings = await getAllSettings();
    return res.json(settings);
  } catch (error) {
    console.error('Update settings error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
