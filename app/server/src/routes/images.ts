import express, { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireRole } from '../middleware';
import { storeImage, getImage, ImageError, MAX_UPLOAD_BYTES } from '../lib/images';

const router = Router();

// Each upload costs a decode + several encodes, so a runaway client is capped
// well above what anyone authoring an exam would hit. Mounted after
// requireAuth, so it buckets per user rather than per IP.
const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user!.id,
});

// POST /images - staff only. The body is the raw file (Content-Type image/*),
// not multipart and not JSON, so the 1 MB JSON limit never applies and the
// client sends a File as-is. Responds with the short URL to put in the
// question's `content` (or a bank question's `image_url`).
router.post(
  '/',
  requireAuth,
  requireRole(['admin', 'assistant', 'professor']),
  uploadLimiter,
  express.raw({ type: 'image/*', limit: MAX_UPLOAD_BYTES }),
  async (req: Request, res: Response) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({
        error: 'Send the image file as the request body with an image/* Content-Type',
        code: 'EMPTY_IMAGE',
      });
    }
    try {
      const stored = await storeImage(req.body, req.user!.id);
      return res.json(stored);
    } catch (err) {
      if (err instanceof ImageError) {
        const status = err.message === 'IMAGE_TOO_LARGE' ? 413 : 400;
        return res.status(status).json({ error: err.message, code: err.message });
      }
      console.error('Image upload error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// GET /images/:id - any signed-in user (students see them during the exam).
// Rows are content-addressed and never change, so browsers may cache forever.
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const img = await getImage(req.params.id);
    if (!img) return res.status(404).json({ error: 'Not found' });
    const etag = `"${img.sha256}"`;
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.type(img.mime);
    return res.send(img.data);
  } catch (err) {
    console.error('Image fetch error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
