import express, { Router, Request, Response } from 'express';
import {
  getOtisakExams,
  getExamsForUser,
  createOtisakExam,
  updateOtisakExamStatus,
  updateOtisakExam,
  setExamTagRules,
  getOtisakExamById,
  coerceExamMode,
  DemoExamLockedError,
} from '../db/otisak';
import { requireAuth, requireRole } from '../middleware';
import type { ExamImportInput } from '../lib/importExam';
import {
  ExamArchiveError,
  MAX_ZIP_BYTES,
  readExamZip,
  resolveArchiveImages,
  unresolvedImagePaths,
} from '../lib/examArchive';
import {
  canUserManageExam,
  getAssignedSubjectIds,
  isSubjectManageableByUser,
} from '../db/auth-helpers';
import { importExamFromJson } from '../lib/importExam';
import { finishExamForEveryone } from '../lib/finishExam';
import { normalizeExamTags } from '../db/otisak';

// Build the common filter set used by both admin and assistant `GET /exams` -
// status, statuses (CSV), subject_id, exam_mode, tags (CSV), scheduled_from,
// scheduled_to. Encapsulated here so admin and assistant paths can't drift.
function parseExamFilters(q: Record<string, unknown>) {
  const csv = (v: unknown): string[] =>
    typeof v === 'string' && v.length > 0 ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return {
    status: typeof q.status === 'string' && q.status ? q.status : undefined,
    statuses: csv(q.statuses),
    subject_id: typeof q.subject_id === 'string' && q.subject_id ? q.subject_id : undefined,
    exam_mode: typeof q.exam_mode === 'string' && q.exam_mode ? q.exam_mode : undefined,
    tags: normalizeExamTags(csv(q.tags)),
    scheduled_from: typeof q.scheduled_from === 'string' && q.scheduled_from ? q.scheduled_from : undefined,
    scheduled_to: typeof q.scheduled_to === 'string' && q.scheduled_to ? q.scheduled_to : undefined,
  };
}

const router = Router();

// GET /exams/active - public, list active real exams for student picker
router.get('/active', async (_req: Request, res: Response) => {
  try {
    const exams = await getOtisakExams({ status: 'active', exam_mode: 'real' });
    const sanitized = exams.map((e) => ({
      id: e.id,
      title: e.title,
      duration_minutes: e.duration_minutes,
      subject_name: e.subject_name,
      subject_code: e.subject_code,
      exam_started_at: e.exam_started_at,
    }));
    return res.json({ exams: sanitized });
  } catch (error) {
    console.error('Get active exams error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /exams
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    if (user.role === 'admin') {
      const exams = await getOtisakExams(parseExamFilters(req.query as Record<string, unknown>));
      return res.json({ exams });
    }
    if (user.role === 'assistant' || user.role === 'professor') {
      // Assistants and professors only see exams attached to subjects they're assigned to.
      // Empty assignment list → empty result (the helper short-circuits
      // before hitting the DB on the worst case).
      const subjectIds = await getAssignedSubjectIds(user.id);
      const exams = await getOtisakExams({
        ...parseExamFilters(req.query as Record<string, unknown>),
        subject_ids: subjectIds,
      });
      return res.json({ exams });
    }
    const exams = await getExamsForUser(user.id);
    return res.json({ exams });
  } catch (error) {
    console.error('Get exams error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /exams
router.post('/', requireAuth, requireRole(['admin', 'assistant', 'professor']), async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const isAdmin = user.role === 'admin';
    const subjectId = typeof req.body?.subject_id === 'string' ? req.body.subject_id : null;

    // Assistants must own (be assigned to) the subject they're creating an
    // exam under. Without a subject, no scope to enforce - admin only.
    if (!isAdmin) {
      if (!subjectId) {
        return res.status(400).json({ error: 'subject_id is required for assistants' });
      }
      const ok = await isSubjectManageableByUser(user.id, subjectId, false);
      if (!ok) return res.status(403).json({ error: 'Not assigned to this subject' });
    }

    const exam = await createOtisakExam(req.body, user.id);

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
router.patch('/', requireAuth, requireRole(['admin', 'assistant', 'professor']), async (req: Request, res: Response) => {
  try {
    const { id, status, tag_rules, ...fields } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Exam id is required' });
    }

    const user = req.user!;
    const isAdmin = user.role === 'admin';
    const allowed = await canUserManageExam(user.id, id, isAdmin);
    if (!allowed) return res.status(403).json({ error: 'Not authorized to manage this exam' });

    // If an assistant is trying to MOVE this exam to a different subject,
    // they must also be assigned to the target subject - otherwise they
    // could lift an exam out of their scope.
    if (!isAdmin && typeof fields.subject_id === 'string' && fields.subject_id) {
      const ok = await isSubjectManageableByUser(user.id, fields.subject_id, false);
      if (!ok) return res.status(403).json({ error: 'Not assigned to target subject' });
    }

    let result = null;

    if (status === 'completed' || status === 'archived') {
      // Flipping to completed/archived implies "exam is over". Auto-submit
      // every still-open attempt so the live-stats table doesn't keep
      // showing students as "in progress" after the exam is officially
      // closed. finishExamForEveryone also ends any active lockdown and
      // broadcasts exam.finished so connected clients drop out of the
      // exam UI. For 'archived' we suppress the broadcast (the exam is
      // already being put away; no need to spam everyone) and then flip
      // the status from 'completed' to 'archived' as a second step.
      const fin = await finishExamForEveryone(id, {
        redirectStudents: false,
        broadcast: status === 'completed',
      });
      if (!fin.ok) {
        if (fin.error === 'DEMO_EXAM_LOCKED') {
          return res.status(409).json({ error: 'DEMO_EXAM_LOCKED' });
        }
        return res.status(fin.status).json({ error: fin.error });
      }
      if (status === 'archived') {
        result = await updateOtisakExamStatus(id, 'archived');
      } else {
        // finishExamForEveryone has already set status to 'completed'.
        // Re-fetch so the response carries the canonical row.
        result = await getOtisakExamById(id);
      }
    } else if (status) {
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
    if (error instanceof DemoExamLockedError) {
      return res.status(409).json({ error: 'DEMO_EXAM_LOCKED' });
    }
    console.error('Update exam error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Exam import. Two endpoints, one flow:
//   POST /exams/import-json  body: { subject_id, exam_mode, exam, questions }
//   POST /exams/import-zip?subject_id=..&exam_mode=..  body: the raw .zip
// The file shapes are documented in lib/examArchive.ts and docs/*/json-format.md.
//
// Two things come from the REQUEST, not the file, because both are placement
// decisions owned by the page doing the import rather than properties of the
// content:
//   - `subject_id` - mandatory for every caller. 400 SUBJECT_REQUIRED without it.
//   - `exam_mode`  - 'real' from /manage, 'practice' from /practice.
// The file's own `exam_mode` and `subject_name` are ignored. `version` is
// never read.
export const IMPORT_JSON_PATH = '/api/otisak/exams/import-json';
const IMPORT_JSON_LIMIT = '40mb';

const ARCHIVE_ERROR_STATUS: Record<string, number> = { ZIP_TOO_LARGE: 413 };

// Shared tail of both import endpoints. `resolve` runs only after the subject
// check passes, so a rejected caller never gets images stored.
async function runImport(
  req: Request,
  res: Response,
  subjectIdIn: unknown,
  examModeIn: unknown,
  resolve: () => Promise<ExamImportInput>,
) {
  try {
    const user = req.user!;

    // Subject is now mandatory for every caller. The previous "fall back to
    // exam.subject_name from the JSON" path made it possible for an admin to
    // import an exam without realising which subject it landed under -
    // forcing an explicit pick removes that whole class of mistake.
    const subjectId = typeof subjectIdIn === 'string' && subjectIdIn ? subjectIdIn : null;
    if (!subjectId) {
      return res.status(400).json({ error: 'Subject is required', code: 'SUBJECT_REQUIRED' });
    }

    // Same authority check for admin and assistant. For admin this catches
    // a typo / stale subject id (would otherwise silently create the exam
    // with no subject); for assistant it enforces the assignment check.
    const isAdmin = user.role === 'admin';
    const ok = await isSubjectManageableByUser(user.id, subjectId, isAdmin);
    if (!ok) {
      return res.status(isAdmin ? 400 : 403).json({
        error: isAdmin ? 'Selected subject does not exist' : 'Not assigned to this subject',
      });
    }

    const body = await resolve();
    if (!body || typeof body !== 'object' || !body.exam || !Array.isArray(body.questions)) {
      return res.status(400).json({ error: 'Invalid exam JSON: missing exam or questions' });
    }

    // self_service / is_public are deliberately not passed: createOtisakExam
    // derives them from the mode, so a practice import lands visible to
    // students instead of silently missing from their practice list.
    const result = await importExamFromJson(body, user.id, {
      subject_id: subjectId,
      exam_mode: coerceExamMode(examModeIn),
    });
    return res.json({
      exam: result.exam,
      questions: result.questions,
      // Lets the dialog warn about what the file asserted but did not decide.
      exam_mode_ignored: typeof body.exam === 'object' && 'exam_mode' in body.exam,
      // Image paths only mean something inside a zip. In a plain JSON import
      // they are kept as-is (the images can be uploaded in the editor) but
      // reported, since they will show as broken images until then.
      unresolved_images: unresolvedImagePaths(body),
    });
  } catch (error) {
    if (error instanceof ExamArchiveError) {
      return res.status(ARCHIVE_ERROR_STATUS[error.message] ?? 400).json({
        error: error.message,
        code: error.message,
        details: error.details,
      });
    }
    console.error('Import exam error:', error);
    return res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
}

router.post('/import-json', requireAuth, requireRole(['admin', 'assistant', 'professor']), express.json({ limit: IMPORT_JSON_LIMIT }), async (req: Request, res: Response) => {
  const body = req.body || {};
  return runImport(req, res, body.subject_id, body.exam_mode, async () => body);
});

router.post(
  '/import-zip',
  requireAuth,
  requireRole(['admin', 'assistant', 'professor']),
  // Any Content-Type: browsers label .zip files inconsistently
  // (application/zip, application/x-zip-compressed, or nothing at all).
  express.raw({ type: () => true, limit: MAX_ZIP_BYTES }),
  async (req: Request, res: Response) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    return runImport(req, res, req.query.subject_id, req.query.exam_mode, () =>
      resolveArchiveImages(readExamZip(buf), req.user!.id));
  }
);

// DELETE /exams - disabled. Exams are not deletable, period. Once an exam
// has any attempts, deletion would silently destroy student data and audit
// trail; for empty drafts the saved-up clicks aren't worth the risk either.
// Use 'archived' status (PATCH) to take an exam out of the active list.
//
// The route is left in place so a stray client request gets a clean 410
// instead of a confusing 404. The actual DB function is no longer reached.
router.delete('/', requireAuth, requireRole(['admin', 'assistant', 'professor']), async (_req: Request, res: Response) => {
  return res.status(410).json({ error: 'EXAM_DELETE_DISABLED' });
});

export default router;
