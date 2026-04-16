import { query, transaction } from './client';

export type OtisakQuestionBankType = 'text' | 'code' | 'image' | 'open_text';

export interface ManageableOtisakSubject {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  assignment_role: 'professor' | 'assistant' | null;
}

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
  answers: Array<{
    text: string;
    is_correct: boolean;
    position?: number;
  }>;
}

export interface UpdateOtisakQuestionBankQuestionInput {
  subject_id: string;
  type: OtisakQuestionBankType;
  text: string;
  points: number;
  tags: string[];
  code_snippet?: string | null;
  code_language?: string | null;
  image_url?: string | null;
  ai_grading_instructions?: string | null;
  answers: Array<{
    text: string;
    is_correct: boolean;
    position?: number;
  }>;
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
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
    [questionIds]
  );

  const byQuestionId = new Map<string, OtisakQuestionBankAnswer[]>();
  for (const answer of answersResult.rows) {
    const existing = byQuestionId.get(answer.question_id) || [];
    existing.push(answer);
    byQuestionId.set(answer.question_id, existing);
  }

  return byQuestionId;
}

export async function getManageableOtisakSubjects(userId: string, isAdmin: boolean): Promise<ManageableOtisakSubject[]> {
  if (isAdmin) {
    const result = await query<ManageableOtisakSubject>(
      `SELECT s.id, s.name, s.code, s.description, NULL::text as assignment_role,
              (SELECT COUNT(*)::int FROM otisak_question_bank q WHERE q.subject_id = s.id) AS question_count
       FROM otisak_subjects s
       ORDER BY s.name ASC`
    );
    return result.rows;
  }

  const result = await query<ManageableOtisakSubject>(
    `SELECT s.id, s.name, s.code, s.description, sa.role as assignment_role,
            (SELECT COUNT(*)::int FROM otisak_question_bank q WHERE q.subject_id = s.id) AS question_count
     FROM subject_assignments sa
     JOIN otisak_subjects s ON s.id = sa.subject_id
     WHERE sa.user_id = $1
     ORDER BY s.name ASC`,
    [userId]
  );
  return result.rows;
}

export async function isSubjectManageableByUser(userId: string, subjectId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) {
    const subject = await query<{ id: string }>(
      'SELECT id FROM otisak_subjects WHERE id = $1 LIMIT 1',
      [subjectId]
    );
    return subject.rows.length > 0;
  }

  const assignment = await query<{ id: string }>(
    `SELECT sa.id
     FROM subject_assignments sa
     WHERE sa.user_id = $1 AND sa.subject_id = $2
     LIMIT 1`,
    [userId, subjectId]
  );

  return assignment.rows.length > 0;
}

export async function getOtisakQuestionBankQuestions(params: {
  subjectId: string;
  search?: string;
  type?: OtisakQuestionBankType;
  tag?: string;
  limit?: number;
  offset?: number;
}): Promise<{ questions: OtisakQuestionBankQuestion[]; total: number; limit: number; offset: number }> {
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
    values
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
      q.created_at,
      q.updated_at
     FROM otisak_question_bank q
     JOIN otisak_subjects s ON s.id = q.subject_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY q.updated_at DESC
     LIMIT $${limitIndex}
     OFFSET $${offsetIndex}`,
    selectValues
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

export async function getOtisakQuestionBankQuestionById(questionId: string): Promise<OtisakQuestionBankQuestion | null> {
  const result = await query<{
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
      q.created_at,
      q.updated_at
     FROM otisak_question_bank q
     JOIN otisak_subjects s ON s.id = q.subject_id
     WHERE q.id = $1
     LIMIT 1`,
    [questionId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const answersByQuestionId = await getAnswersForQuestionIds([row.id]);

  return {
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
    created_at: row.created_at,
    updated_at: row.updated_at,
    answers: answersByQuestionId.get(row.id) || [],
  };
}

export async function createOtisakQuestionBankQuestion(
  input: CreateOtisakQuestionBankQuestionInput,
  actorUserId: string
): Promise<OtisakQuestionBankQuestion> {
  return transaction(async (client) => {
    const tags = normalizeTags(input.tags);

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
        created_by,
        updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
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
        actorUserId,
      ]
    );

    const question = questionResult.rows[0];

    const answers: OtisakQuestionBankAnswer[] = [];
    for (let i = 0; i < input.answers.length; i++) {
      const answer = input.answers[i];
      const answerResult = await client.query<OtisakQuestionBankAnswer>(
        `INSERT INTO otisak_question_bank_answers (question_id, text, is_correct, position)
         VALUES ($1, $2, $3, $4)
         RETURNING id, question_id, text, is_correct, position`,
        [question.id, answer.text, answer.is_correct, answer.position ?? i]
      );
      answers.push(answerResult.rows[0]);
    }

    const subjectResult = await client.query<{ name: string; code: string | null }>(
      'SELECT name, code FROM otisak_subjects WHERE id = $1 LIMIT 1',
      [question.subject_id]
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
      created_at: question.created_at,
      updated_at: question.updated_at,
      answers,
    };
  });
}

export async function updateOtisakQuestionBankQuestion(
  questionId: string,
  input: UpdateOtisakQuestionBankQuestionInput,
  actorUserId: string
): Promise<OtisakQuestionBankQuestion | null> {
  return transaction(async (client) => {
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM otisak_question_bank WHERE id = $1 LIMIT 1',
      [questionId]
    );

    if (!existing.rows[0]) {
      return null;
    }

    const tags = normalizeTags(input.tags);

    await client.query(
      `UPDATE otisak_question_bank
       SET subject_id = $2,
           type = $3,
           text = $4,
           points = $5,
           tags = $6,
           code_snippet = $7,
           code_language = $8,
           image_url = $9,
           ai_grading_instructions = $10,
           updated_by = $11,
           updated_at = NOW()
       WHERE id = $1`,
      [
        questionId,
        input.subject_id,
        input.type,
        input.text,
        input.points,
        tags,
        input.code_snippet || null,
        input.code_language || null,
        input.image_url || null,
        input.ai_grading_instructions || null,
        actorUserId,
      ]
    );

    await client.query(
      'DELETE FROM otisak_question_bank_answers WHERE question_id = $1',
      [questionId]
    );

    for (let i = 0; i < input.answers.length; i++) {
      const answer = input.answers[i];
      await client.query(
        `INSERT INTO otisak_question_bank_answers (question_id, text, is_correct, position)
         VALUES ($1, $2, $3, $4)`,
        [questionId, answer.text, answer.is_correct, answer.position ?? i]
      );
    }

    const updated = await client.query<{
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
        q.created_at,
        q.updated_at
       FROM otisak_question_bank q
       JOIN otisak_subjects s ON s.id = q.subject_id
       WHERE q.id = $1
       LIMIT 1`,
      [questionId]
    );

    const row = updated.rows[0];
    if (!row) {
      return null;
    }

    const answersResult = await client.query<OtisakQuestionBankAnswer>(
      `SELECT id, question_id, text, is_correct, position
       FROM otisak_question_bank_answers
       WHERE question_id = $1
       ORDER BY position ASC, id ASC`,
      [questionId]
    );

    return {
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
      created_at: row.created_at,
      updated_at: row.updated_at,
      answers: answersResult.rows,
    };
  });
}

export async function deleteOtisakQuestionBankQuestion(questionId: string): Promise<boolean> {
  const result = await query(
    'DELETE FROM otisak_question_bank WHERE id = $1',
    [questionId]
  );
  return (result.rowCount || 0) > 0;
}

export async function bulkDeleteOtisakQuestionBankQuestions(params: {
  subjectId: string;
  tag?: string;
  questionIds?: string[];
}): Promise<number> {
  const conditions = ['subject_id = $1'];
  const values: unknown[] = [params.subjectId];

  if (params.questionIds && params.questionIds.length > 0) {
    values.push(params.questionIds);
    conditions.push(`id = ANY($${values.length}::uuid[])`);
  }

  if (params.tag) {
    values.push(params.tag);
    conditions.push(`$${values.length} = ANY(tags)`);
  }

  const result = await query(
    `DELETE FROM otisak_question_bank WHERE ${conditions.join(' AND ')}`,
    values
  );
  return result.rowCount || 0;
}

export interface DuplicateGroup {
  normalized_text: string;
  question_ids: string[];
  questions: Array<{
    id: string;
    text: string;
    tags: string[];
    type: OtisakQuestionBankType;
    points: number;
    code_snippet: string | null;
    code_language: string | null;
    image_url: string | null;
    created_at: Date;
    updated_at: Date;
    answers: OtisakQuestionBankAnswer[];
  }>;
}

export type DuplicateMode = 'exact' | 'normalized' | 'fuzzy';

export async function findDuplicateQuestions(subjectId: string, mode: DuplicateMode = 'exact'): Promise<DuplicateGroup[]> {
  // Grouping expression based on detection mode:
  //   exact:      lowercase + trim
  //   normalized: + collapse whitespace
  //   fuzzy:      + strip punctuation
  let groupExpr: string;
  switch (mode) {
    case 'normalized':
      groupExpr = `LOWER(REGEXP_REPLACE(TRIM(q.text), '\\s+', ' ', 'g'))`;
      break;
    case 'fuzzy':
      groupExpr = `LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(q.text), '[^\\w\\s]', '', 'g'), '\\s+', ' ', 'g'))`;
      break;
    default:
      groupExpr = `LOWER(TRIM(q.text))`;
  }

  const result = await query<{
    normalized_text: string;
    ids: string[];
    texts: string[];
    tags_arr: string[][];
    types: string[];
    points_arr: number[];
    code_snippets: (string | null)[];
    code_languages: (string | null)[];
    image_urls: (string | null)[];
    created_ats: Date[];
    updated_ats: Date[];
  }>(
    `SELECT
      ${groupExpr} as normalized_text,
      ARRAY_AGG(q.id ORDER BY q.created_at ASC) as ids,
      ARRAY_AGG(q.text ORDER BY q.created_at ASC) as texts,
      ARRAY_AGG(q.tags ORDER BY q.created_at ASC) as tags_arr,
      ARRAY_AGG(q.type ORDER BY q.created_at ASC) as types,
      ARRAY_AGG(q.points ORDER BY q.created_at ASC) as points_arr,
      ARRAY_AGG(q.code_snippet ORDER BY q.created_at ASC) as code_snippets,
      ARRAY_AGG(q.code_language ORDER BY q.created_at ASC) as code_languages,
      ARRAY_AGG(q.image_url ORDER BY q.created_at ASC) as image_urls,
      ARRAY_AGG(q.created_at ORDER BY q.created_at ASC) as created_ats,
      ARRAY_AGG(q.updated_at ORDER BY q.created_at ASC) as updated_ats
     FROM otisak_question_bank q
     WHERE q.subject_id = $1
     GROUP BY ${groupExpr}
     HAVING COUNT(*) > 1
     ORDER BY COUNT(*) DESC`,
    [subjectId]
  );

  // Collect all question IDs to fetch answers in one query
  const allIds = result.rows.flatMap((row) => row.ids);
  const answersMap = await getAnswersForQuestionIds(allIds);

  return result.rows.map((row) => ({
    normalized_text: row.normalized_text,
    question_ids: row.ids,
    questions: row.ids.map((id, i) => ({
      id,
      text: row.texts[i],
      tags: row.tags_arr[i] || [],
      type: row.types[i] as OtisakQuestionBankType,
      points: row.points_arr[i] ?? 1,
      code_snippet: row.code_snippets[i] ?? null,
      code_language: row.code_languages[i] ?? null,
      image_url: row.image_urls[i] ?? null,
      created_at: row.created_ats[i],
      updated_at: row.updated_ats[i],
      answers: answersMap.get(id) || [],
    })),
  }));
}

export async function exportOtisakQuestionBankQuestions(params: {
  subjectId: string;
  tag?: string;
  search?: string;
  type?: OtisakQuestionBankType;
}): Promise<OtisakQuestionBankQuestion[]> {
  const values: unknown[] = [params.subjectId];
  const conditions = ['q.subject_id = $1'];

  if (params.tag) {
    values.push(params.tag);
    conditions.push(`$${values.length} = ANY(q.tags)`);
  }

  if (params.search && params.search.trim()) {
    values.push(`%${params.search.trim()}%`);
    conditions.push(`(
      q.text ILIKE $${values.length}
      OR EXISTS (SELECT 1 FROM unnest(q.tags) AS tag WHERE tag ILIKE $${values.length})
    )`);
  }

  if (params.type) {
    values.push(params.type);
    conditions.push(`q.type = $${values.length}`);
  }

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
      q.created_at,
      q.updated_at
     FROM otisak_question_bank q
     JOIN otisak_subjects s ON s.id = q.subject_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY q.updated_at DESC`,
    values
  );

  const questionIds = questionRows.rows.map((row) => row.id);
  const answersByQuestionId = await getAnswersForQuestionIds(questionIds);

  return questionRows.rows.map((row) => ({
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
    created_at: row.created_at,
    updated_at: row.updated_at,
    answers: answersByQuestionId.get(row.id) || [],
  }));
}
