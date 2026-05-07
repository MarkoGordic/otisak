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
    const body = req.body || {};
    if (typeof body.image_url === 'string' && body.image_url.length > 0) {
      const v = validateImageUrl(body.image_url);
      if (!v.ok) return res.status(400).json({ error: v.error });
    }
    const question = await createOtisakQuestionBankQuestion(body, req.user!.id);
    return res.json(question);
  } catch (error) {
    console.error('Create question error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Image URLs come from the bank-question editor: either a remote http(s) URL
// or a base64 data URL embedded by the file picker. Anything else (javascript:,
// vbscript:, etc.) gets rejected, and base64 payloads bigger than ~600 KB are
// refused so a single question can't bloat the DB or PDF render.
function validateImageUrl(url: string): { ok: true } | { ok: false; error: string } {
  if (url.length > 800 * 1024) return { ok: false, error: 'Image URL too large (max ~600KB base64)' };
  if (/^https?:\/\//i.test(url)) return { ok: true };
  const dataUrlMatch = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/i.exec(url);
  if (!dataUrlMatch) return { ok: false, error: 'image_url must be a http(s) URL or a data:image/* base64 payload' };
  return { ok: true };
}

// DELETE /questions
router.delete('/', async (req: Request, res: Response) => {
  try {
    const id = (req.query.id || req.body?.id) as string;
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
