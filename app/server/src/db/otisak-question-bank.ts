import type { PoolClient } from 'pg';
import { query, transaction } from './client';
import { internDataUrl } from '../lib/images';

export const BANK_QUESTION_TYPES = [
  'text',
  'code',
  'image',
  'open_text',
  'ordering',
  'matching',
  'fill_blank',
] as const;
export type OtisakQuestionBankType = (typeof BANK_QUESTION_TYPES)[number];

export interface OtisakQuestionBankAnswer {
  id: string;
  question_id: string;
  text: string;
  is_correct: boolean;
  position: number;
}

export interface OtisakQuestionBankQuestion {
  id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string | null;
  type: OtisakQuestionBankType;
  text: string;
  points: number;
  tags: string[];
  code_snippet: string | null;
  code_language: string | null;
  image_url: string | null;
  ai_grading_instructions: string | null;
  content: string | null;
  multi_answer: boolean | null;
  explanation: string | null;
  created_at: Date;
  updated_at: Date;
  answers: OtisakQuestionBankAnswer[];
}

export interface CreateOtisakQuestionBankQuestionInput {
  subject_id: string;
  type: OtisakQuestionBankType;
  text: string;
  points: number;
  tags: string[];
  code_snippet?: string | null;
  code_language?: string | null;
  image_url?: string | null;
  ai_grading_instructions?: string | null;
  content?: string | null;
  multi_answer?: boolean | null;
  explanation?: string | null;
  answers: Array<{
    text: string;
    is_correct: boolean;
    position?: number;
  }>;
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
}

async function getAnswersForQuestionIds(questionIds: string[]) {
  if (questionIds.length === 0) {
    return new Map<string, OtisakQuestionBankAnswer[]>();
  }

  const answersResult = await query<OtisakQuestionBankAnswer>(
    `SELECT id, question_id, text, is_correct, position
     FROM otisak_question_bank_answers
     WHERE question_id = ANY($1::uuid[])
     ORDER BY position ASC, id ASC`,
    [questionIds],
  );

  const byQuestionId = new Map<string, OtisakQuestionBankAnswer[]>();
  for (const answer of answersResult.rows) {
    const existing = byQuestionId.get(answer.question_id) || [];
    existing.push(answer);
    byQuestionId.set(answer.question_id, existing);
  }

  return byQuestionId;
}

// Re-export the canonical implementation from auth-helpers so the question
// bank code keeps its existing import surface while the gating logic lives
// in one place.
export { isSubjectManageableByUser } from './auth-helpers';

export async function getOtisakQuestionBankQuestions(params: {
  subjectId: string;
  search?: string;
  type?: OtisakQuestionBankType;
  tag?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  questions: OtisakQuestionBankQuestion[];
  total: number;
  limit: number;
  offset: number;
}> {
  const values: unknown[] = [params.subjectId];
  const conditions = ['q.subject_id = $1'];

  if (params.search && params.search.trim()) {
    values.push(`%${params.search.trim()}%`);
    const idx = values.length;
    conditions.push(`(
      q.text ILIKE $${idx}
      OR EXISTS (SELECT 1 FROM unnest(q.tags) AS tag WHERE tag ILIKE $${idx})
    )`);
  }

  if (params.type) {
    values.push(params.type);
    const idx = values.length;
    conditions.push(`q.type = $${idx}`);
  }

  if (params.tag) {
    values.push(params.tag);
    const idx = values.length;
    conditions.push(`$${idx} = ANY(q.tags)`);
  }

  const safeLimit = Math.max(20, Math.min(250, Math.floor(params.limit || 100)));
  const safeOffset = Math.max(0, Math.floor(params.offset || 0));

  const countResult = await query<{ total: string }>(
    `SELECT COUNT(*)::text as total
     FROM otisak_question_bank q
     WHERE ${conditions.join(' AND ')}`,
    values,
  );

  const total = Number(countResult.rows[0]?.total || 0);

  const selectValues = [...values, safeLimit, safeOffset];
  const limitIndex = selectValues.length - 1;
  const offsetIndex = selectValues.length;

  const questionRows = await query<{
    id: string;
    subject_id: string;
    subject_name: string;
    subject_code: string | null;
    type: OtisakQuestionBankType;
    text: string;
    points: number;
    tags: string[] | null;
    code_snippet: string | null;
    code_language: string | null;
    image_url: string | null;
    ai_grading_instructions: string | null;
    content: string | null;
    multi_answer: boolean | null;
    explanation: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT
      q.id,
      q.subject_id,
      s.name as subject_name,
      s.code as subject_code,
      q.type,
      q.text,
      q.points,
      q.tags,
      q.code_snippet,
      q.code_language,
      q.image_url,
      q.ai_grading_instructions,
      q.content,
      q.multi_answer,
      q.explanation,
      q.created_at,
      q.updated_at
     FROM otisak_question_bank q
     JOIN otisak_subjects s ON s.id = q.subject_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY q.updated_at DESC
     LIMIT $${limitIndex}
     OFFSET $${offsetIndex}`,
    selectValues,
  );

  const questionIds = questionRows.rows.map((row) => row.id);
  const answersByQuestionId = await getAnswersForQuestionIds(questionIds);

  const questions = questionRows.rows.map((row) => ({
    id: row.id,
    subject_id: row.subject_id,
    subject_name: row.subject_name,
    subject_code: row.subject_code,
    type: row.type,
    text: row.text,
    points: Number(row.points) || 0,
    tags: row.tags || [],
    code_snippet: row.code_snippet,
    code_language: row.code_language,
    image_url: row.image_url,
    ai_grading_instructions: row.ai_grading_instructions,
    content: row.content,
    multi_answer: row.multi_answer,
    explanation: row.explanation,
    created_at: row.created_at,
    updated_at: row.updated_at,
    answers: answersByQuestionId.get(row.id) || [],
  }));

  return {
    questions,
    total,
    limit: safeLimit,
    offset: safeOffset,
  };
}

// Subject-wide figures for the bank header and tag chips. They ignore the list
// filters on purpose: deriving them from the loaded page made the chips vanish
// mid-search and never showed tags that only appear past the first page.
export async function getOtisakQuestionBankSummary(
  subjectId: string,
): Promise<{ subject_total: number; tags: Array<{ tag: string; count: number }> }> {
  const [totalResult, tagResult] = await Promise.all([
    query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM otisak_question_bank WHERE subject_id = $1',
      [subjectId],
    ),
    query<{ tag: string; count: string }>(
      `SELECT tag, COUNT(*)::text AS count
       FROM otisak_question_bank, unnest(tags) AS tag
       WHERE subject_id = $1
       GROUP BY tag
       ORDER BY COUNT(*) DESC, tag ASC`,
      [subjectId],
    ),
  ]);
  return {
    subject_total: Number(totalResult.rows[0]?.total || 0),
    tags: tagResult.rows.map((r) => ({ tag: r.tag, count: Number(r.count) })),
  };
}

export async function createOtisakQuestionBankQuestion(
  input: CreateOtisakQuestionBankQuestionInput,
  actorUserId: string,
): Promise<OtisakQuestionBankQuestion> {
  input = { ...input, image_url: await internDataUrl(input.image_url, actorUserId) };
  return transaction((client) => insertBankQuestion(client, input, actorUserId));
}

// Many questions in one transaction (file import): all land or none do.
// Inline data: images are stored before the transaction opens.
export async function createOtisakQuestionBankQuestions(
  inputs: CreateOtisakQuestionBankQuestionInput[],
  actorUserId: string,
): Promise<number> {
  const prepared: CreateOtisakQuestionBankQuestionInput[] = [];
  for (const input of inputs) {
    prepared.push({ ...input, image_url: await internDataUrl(input.image_url, actorUserId) });
  }
  return transaction(async (client) => {
    for (const input of prepared) await insertBankQuestion(client, input, actorUserId);
    return prepared.length;
  });
}

async function insertBankQuestion(
  client: PoolClient,
  input: CreateOtisakQuestionBankQuestionInput,
  actorUserId: string,
): Promise<OtisakQuestionBankQuestion> {
  const tags = normalizeTags(input.tags || []);

  const questionResult = await client.query<{
    id: string;
    subject_id: string;
    type: OtisakQuestionBankType;
    text: string;
    points: number;
    tags: string[] | null;
    code_snippet: string | null;
    code_language: string | null;
    image_url: string | null;
    ai_grading_instructions: string | null;
    content: string | null;
    multi_answer: boolean | null;
    explanation: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO otisak_question_bank (
      subject_id,
      type,
      text,
      points,
      tags,
      code_snippet,
      code_language,
      image_url,
      ai_grading_instructions,
      content,
      multi_answer,
      explanation,
      created_by,
      updated_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
    RETURNING *`,
    [
      input.subject_id,
      input.type,
      input.text,
      input.points,
      tags,
      input.code_snippet || null,
      input.code_language || null,
      input.image_url || null,
      input.ai_grading_instructions || null,
      input.content || null,
      typeof input.multi_answer === 'boolean' ? input.multi_answer : null,
      input.explanation || null,
      actorUserId,
    ],
  );

  const question = questionResult.rows[0];

  const answers: OtisakQuestionBankAnswer[] = [];
  for (let i = 0; i < input.answers.length; i++) {
    const answer = input.answers[i];
    const answerResult = await client.query<OtisakQuestionBankAnswer>(
      `INSERT INTO otisak_question_bank_answers (question_id, text, is_correct, position)
       VALUES ($1, $2, $3, $4)
       RETURNING id, question_id, text, is_correct, position`,
      [question.id, answer.text, answer.is_correct, answer.position ?? i],
    );
    answers.push(answerResult.rows[0]);
  }

  const subjectResult = await client.query<{ name: string; code: string | null }>(
    'SELECT name, code FROM otisak_subjects WHERE id = $1 LIMIT 1',
    [question.subject_id],
  );

  return {
    id: question.id,
    subject_id: question.subject_id,
    subject_name: subjectResult.rows[0]?.name || 'Unknown Subject',
    subject_code: subjectResult.rows[0]?.code || null,
    type: question.type,
    text: question.text,
    points: Number(question.points) || 0,
    tags: question.tags || [],
    code_snippet: question.code_snippet,
    code_language: question.code_language,
    image_url: question.image_url,
    ai_grading_instructions: question.ai_grading_instructions,
    content: question.content,
    multi_answer: question.multi_answer,
    explanation: question.explanation,
    created_at: question.created_at,
    updated_at: question.updated_at,
    answers,
  };
}

export async function deleteOtisakQuestionBankQuestion(questionId: string): Promise<boolean> {
  const result = await query('DELETE FROM otisak_question_bank WHERE id = $1', [questionId]);
  return (result.rowCount || 0) > 0;
}
