import { Router, Request, Response } from 'express';
import {
  getOtisakExams,
  getExamsForUser,
  createOtisakExam,
  updateOtisakExamStatus,
  updateOtisakExam,
  deleteOtisakExam,
  setExamTagRules,
  createOtisakQuestion,
} from '../db/otisak';
import { query } from '../db/client';
import { requireAuth, requireRole } from '../middleware';

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
    if (user.role === 'admin' || user.role === 'assistant') {
      const { status, subject_id, exam_mode } = req.query;
      const exams = await getOtisakExams({
        status: status as string | undefined,
        subject_id: subject_id as string | undefined,
        exam_mode: exam_mode as string | undefined,
      });
      return res.json({ exams });
    } else {
      const exams = await getExamsForUser(user.id);
      return res.json({ exams });
    }
  } catch (error) {
    console.error('Get exams error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /exams
router.post('/', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const exam = await createOtisakExam(req.body, req.user!.id);

    // Set tag rules if provided
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
router.patch('/', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const { id, status, tag_rules, ...fields } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Exam id is required' });
    }

    let result = null;

    if (status) {
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
    console.error('Update exam error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /exams/import-json - admin/assistant, create a new exam from a JSON dump
// Mirrors the shape produced by GET /exams/:id/export-json:
//   { version: 1, exam: { title, ... }, questions: [{ type, text, ... answers: [...] }] }
// If exam.subject_name is provided we try to match an existing subject by name (case-insensitive),
// otherwise the new exam is created without a subject.
router.post('/import-json', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    if (typeof body !== 'object' || !body.exam || !Array.isArray(body.questions)) {
      return res.status(400).json({ error: 'Invalid exam JSON: missing exam or questions' });
    }
    const examIn = body.exam;
    if (typeof examIn.title !== 'string' || !examIn.title.trim()) {
      return res.status(400).json({ error: 'exam.title is required' });
    }

    // Resolve subject_id from subject_name if present.
    let subjectId: string | null = null;
    if (typeof examIn.subject_name === 'string' && examIn.subject_name.trim()) {
      const sub = await query<{ id: string }>(
        'SELECT id FROM otisak_subjects WHERE LOWER(name) = LOWER($1) LIMIT 1',
        [examIn.subject_name.trim()]
      );
      subjectId = sub.rows[0]?.id ?? null;
    }

    const exam = await createOtisakExam({
      title: examIn.title.trim(),
      description: typeof examIn.description === 'string' ? examIn.description : null,
      duration_minutes: Number(examIn.duration_minutes) || 60,
      pass_threshold: Number(examIn.pass_threshold) || 50,
      exam_mode: examIn.exam_mode === 'practice' ? 'practice' : 'real',
      allow_review: !!examIn.allow_review,
      shuffle_questions: !!examIn.shuffle_questions,
      shuffle_answers: !!examIn.shuffle_answers,
      partial_scoring: !!examIn.partial_scoring,
      negative_points_enabled: !!examIn.negative_points_enabled,
      negative_points_value: Number(examIn.negative_points_value) || 0,
      negative_points_threshold: Number(examIn.negative_points_threshold) || 0,
      subject_id: subjectId,
    } as never, req.user!.id);

    let createdQuestions = 0;
    for (const q of body.questions) {
      if (!q || typeof q.type !== 'string' || typeof q.text !== 'string') continue;
      await createOtisakQuestion(exam.id, {
        type: q.type,
        text: q.text,
        content: q.content ?? null,
        points: Number(q.points) || 0,
        position: typeof q.position === 'number' ? q.position : undefined,
        explanation: q.explanation ?? null,
        ai_grading_instructions: q.ai_grading_instructions ?? null,
        answers: Array.isArray(q.answers)
          ? q.answers
              .filter((a: unknown): a is { text: string; is_correct?: boolean; position?: number } =>
                typeof a === 'object' && a !== null && typeof (a as { text?: unknown }).text === 'string')
              .map((a: { text: string; is_correct?: boolean; position?: number }, i: number) => ({
                text: a.text,
                is_correct: !!a.is_correct,
                position: typeof a.position === 'number' ? a.position : i,
              }))
          : [],
      } as never);
      createdQuestions++;
    }

    return res.json({ exam, questions: createdQuestions });
  } catch (error) {
    console.error('Import exam JSON error:', error);
    return res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// DELETE /exams
router.delete('/', requireAuth, requireRole(['admin', 'assistant']), async (req: Request, res: Response) => {
  try {
    const id = (req.query.id as string | undefined) || req.body?.id;
    if (!id) {
      return res.status(400).json({ error: 'Exam id is required' });
    }

    const deleted = await deleteOtisakExam(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete exam error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
