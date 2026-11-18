import express, { Router, Request, Response } from 'express';
import {
  getOtisakQuestionBankQuestions,
  getOtisakQuestionBankSummary,
  createOtisakQuestionBankQuestion,
  deleteOtisakQuestionBankQuestion,
  createOtisakQuestionBankQuestions,
  type OtisakQuestionBankType,
} from '../db/otisak-question-bank';
import { getOtisakSubjects } from '../db/otisak';
import { isSubjectManageableByUser, getAssignedSubjectIds } from '../db/auth-helpers';
import { query } from '../db/client';
import { requireAuth, requireRole } from '../middleware';
import { isStoredImageUrl } from '../lib/images';
import { parseBankFile, type BankImportIssue } from '../lib/importBank';
import {
  ExamArchiveError,
  MAX_ZIP_BYTES,
  readExamZip,
  resolveArchiveImages,
} from '../lib/examArchive';
import type { ExamImportInput } from '../lib/importExam';

const router = Router();

router.use(requireAuth, requireRole(['admin', 'assistant', 'professor']));

// GET /questions/subjects - the subjects whose bank this user may open. Admins
// see all of them, everyone else only the subjects they are assigned to.
router.get('/subjects', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const subjects = await getOtisakSubjects();
    if (user.role === 'admin') return res.json({ subjects });
    const assigned = new Set(await getAssignedSubjectIds(user.id));
    return res.json({ subjects: subjects.filter((s) => assigned.has(s.id)) });
  } catch (error) {
    console.error('Get bank subjects error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /questions
router.get('/', async (req: Request, res: Response) => {
  try {
    const { subject_id, search, type, tag, limit, offset } = req.query;

    if (!subject_id) {
      return res.status(400).json({ error: 'subject_id is required' });
    }
    // Same gate as POST and DELETE: the list carries every correct answer, so
    // reading a subject's bank is as sensitive as editing it.
    const user = req.user!;
    const allowed = await isSubjectManageableByUser(
      user.id,
      subject_id as string,
      user.role === 'admin',
    );
    if (!allowed) return res.status(403).json({ error: 'Not assigned to this subject' });

    const [result, summary] = await Promise.all([
      getOtisakQuestionBankQuestions({
        subjectId: subject_id as string,
        search: search as string | undefined,
        type: type as OtisakQuestionBankType | undefined,
        tag: tag as string | undefined,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      }),
      getOtisakQuestionBankSummary(subject_id as string),
    ]);

    return res.json({ ...result, ...summary });
  } catch (error) {
    console.error('Get questions error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Question bank import, same two shapes as the exam import:
//   POST /questions/import-json  body: { subject_id, questions: [...] }
//   POST /questions/import-zip?subject_id=..  body: the raw .zip (questions JSON + images)
// The file format is lib/importBank.ts. All or nothing: a file with any bad
// question is refused with the list of problems (index is 1-based).
export const BANK_IMPORT_JSON_PATH = '/api/otisak/questions/import-json';

class BankIssuesError extends Error {
  constructor(readonly issues: BankImportIssue[]) {
    super('INVALID_QUESTIONS');
  }
}

async function runBankImport(
  req: Request,
  res: Response,
  subjectIdIn: unknown,
  resolve: () => Promise<unknown>,
) {
  try {
    const user = req.user!;
    const subjectId = typeof subjectIdIn === 'string' && subjectIdIn ? subjectIdIn : null;
    if (!subjectId) {
      return res.status(400).json({ error: 'Subject is required', code: 'SUBJECT_REQUIRED' });
    }
    const allowed = await isSubjectManageableByUser(user.id, subjectId, user.role === 'admin');
    if (!allowed) return res.status(403).json({ error: 'Not assigned to this subject' });

    // Check every question before any image is stored, then resolve the zip's
    // images, then check again (an image path not in the zip is reported).
    const body = await resolve();
    const { inputs, issues } = parseBankFile(body, subjectId);
    if (issues.length > 0) {
      return res
        .status(400)
        .json({ error: 'Invalid questions', code: 'INVALID_QUESTIONS', issues });
    }
    const imported = await createOtisakQuestionBankQuestions(inputs, user.id);
    return res.json({ imported });
  } catch (error) {
    if (error instanceof BankIssuesError) {
      return res
        .status(400)
        .json({ error: 'Invalid questions', code: 'INVALID_QUESTIONS', issues: error.issues });
    }
    if (error instanceof ExamArchiveError) {
      return res.status(error.message === 'ZIP_TOO_LARGE' ? 413 : 400).json({
        error: error.message,
        code: error.message,
        details: error.details,
      });
    }
    console.error('Import question bank error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

router.post(
  '/import-json',
  express.json({ limit: '40mb' }),
  async (req: Request, res: Response) => {
    const body = req.body || {};
    return runBankImport(req, res, body.subject_id, async () => body);
  },
);

router.post(
  '/import-zip',
  express.raw({ type: () => true, limit: MAX_ZIP_BYTES }),
  async (req: Request, res: Response) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    return runBankImport(req, res, req.query.subject_id, async () => {
      const archive = readExamZip(buf);
      // Refuse a malformed file before storing any of its images.
      const pre = parseBankFile(
        { questions: (archive.body as unknown as { questions?: unknown }).questions },
        'x',
      );
      const real = pre.issues.filter((i) => i.code !== 'IMAGE_NOT_IN_ZIP');
      if (real.length > 0) throw new BankIssuesError(real);
      return resolveArchiveImages(
        { ...archive, body: archive.body as ExamImportInput },
        req.user!.id,
      );
    });
  },
);

// POST /questions
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const user = req.user!;
    const isAdmin = user.role === 'admin';
    if (typeof body.subject_id !== 'string' || !body.subject_id) {
      return res.status(400).json({ error: 'subject_id is required' });
    }
    const allowed = await isSubjectManageableByUser(user.id, body.subject_id, isAdmin);
    if (!allowed) return res.status(403).json({ error: 'Not assigned to this subject' });
    if (typeof body.image_url === 'string' && body.image_url.length > 0) {
      const v = validateImageUrl(body.image_url);
      if (!v.ok) return res.status(400).json({ error: v.error });
    }
    const question = await createOtisakQuestionBankQuestion(body, user.id);
    return res.json(question);
  } catch (error) {
    console.error('Create question error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Image URLs come from the bank-question editor: an uploaded image
// (/api/otisak/images/<id>), a remote http(s) URL, or a legacy base64 data URL
// (stored as an uploaded image on save). Anything else (javascript:,
// vbscript:, etc.) gets rejected.
function validateImageUrl(url: string): { ok: true } | { ok: false; error: string } {
  if (isStoredImageUrl(url)) return { ok: true };
  if (url.length > 800 * 1024)
    return { ok: false, error: 'Image URL too large (max ~600KB base64)' };
  if (/^https?:\/\//i.test(url)) return { ok: true };
  const dataUrlMatch = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/i.exec(
    url,
  );
  if (!dataUrlMatch)
    return { ok: false, error: 'image_url must be a http(s) URL or a data:image/* base64 payload' };
  return { ok: true };
}

// DELETE /questions
router.delete('/', async (req: Request, res: Response) => {
  try {
    const id = (req.query.id || req.body?.id) as string;
    if (!id) {
      return res.status(400).json({ error: 'Question id is required' });
    }

    const user = req.user!;
    const isAdmin = user.role === 'admin';
    // Look up the question's subject so we can confirm the deleter is
    // assigned to it. Avoids relying on the client to send the subject_id
    // (which would be trivially spoofable).
    const owning = await query<{ subject_id: string }>(
      'SELECT subject_id FROM otisak_question_bank WHERE id = $1 LIMIT 1',
      [id],
    );
    if (!owning.rows[0]) {
      return res.status(404).json({ error: 'Question not found' });
    }
    const allowed = await isSubjectManageableByUser(user.id, owning.rows[0].subject_id, isAdmin);
    if (!allowed) return res.status(403).json({ error: 'Not authorized to delete this question' });

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
