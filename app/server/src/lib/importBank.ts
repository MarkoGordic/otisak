import {
  BANK_QUESTION_TYPES,
  type CreateOtisakQuestionBankQuestionInput,
  type OtisakQuestionBankType,
} from '../db/otisak-question-bank';
import { fileBool } from './importExam';
import { isImagePath } from './examArchive';

// Question bank import. The file is the exam file's `questions` array, with an
// optional `tags` list per question, so one format serves both:
//
//   { "version": 1, "questions": [ { "type": "text", "text": "...", "tags": ["soa"], ... } ] }
//
// An exported or hand-written exam file (with an `exam` object) is accepted
// as is; `exam` is ignored. Unlike the exam import, this one is strict: every
// question is checked first and the whole file is refused, listing each bad
// question, rather than leaving a half-filled bank behind.

export type BankImportIssue = { index: number; code: string; detail?: string };

const CHOICE_TYPES = ['text', 'code', 'image'];
const MAX = { text: 8000, content: 16000, explanation: 4000, ai: 4000, answer: 2000 };
const BLANK_RE = /___([A-Z0-9_]+)___/g;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function parseJson(v: unknown): unknown {
  if (typeof v !== 'string') return v && typeof v === 'object' ? v : null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function distinct(list: string[]): boolean {
  return new Set(list.map((x) => x.trim().toLowerCase())).size === list.length;
}

function tagsOf(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  return Array.from(
    new Set(
      list
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  );
}

export function parseBankFile(
  body: unknown,
  subjectId: string,
): { inputs: CreateOtisakQuestionBankQuestionInput[]; issues: BankImportIssue[] } {
  const questions =
    body && typeof body === 'object' ? (body as { questions?: unknown }).questions : undefined;
  if (!Array.isArray(questions)) {
    return { inputs: [], issues: [{ index: 0, code: 'NO_QUESTIONS' }] };
  }
  if (questions.length === 0) return { inputs: [], issues: [{ index: 0, code: 'EMPTY' }] };

  const inputs: CreateOtisakQuestionBankQuestionInput[] = [];
  const issues: BankImportIssue[] = [];

  questions.forEach((raw, i) => {
    const index = i + 1;
    const bad = (code: string, detail?: string) => issues.push({ index, code, detail });
    const q = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

    const type = str(q.type) as OtisakQuestionBankType;
    if (!(BANK_QUESTION_TYPES as readonly string[]).includes(type)) return bad('TYPE', str(q.type));

    const text = str(q.text);
    if (!text) return bad('TEXT');
    if (text.length > MAX.text) return bad('TOO_LONG', 'text');

    // Bank points only matter when a question is used as is; tag rules set
    // their own. Missing means 1 (the bank default), not 0 as in an exam.
    const points = q.points === undefined || q.points === null ? 1 : Number(q.points);
    if (!Number.isFinite(points) || points < 0) return bad('POINTS');

    const explanation = str(q.explanation) || null;
    if (explanation && explanation.length > MAX.explanation) return bad('TOO_LONG', 'explanation');
    const ai = str(q.ai_grading_instructions) || null;
    if (ai && ai.length > MAX.ai) return bad('TOO_LONG', 'ai_grading_instructions');

    const answersIn = Array.isArray(q.answers) ? q.answers : [];
    const input: CreateOtisakQuestionBankQuestionInput = {
      subject_id: subjectId,
      type,
      text,
      points,
      tags: tagsOf(q.tags),
      explanation,
      ai_grading_instructions: type === 'open_text' ? ai : null,
      answers: [],
    };

    if (CHOICE_TYPES.includes(type)) {
      const answers = answersIn.map((a) => {
        const o = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
        return { text: str(o.text), is_correct: fileBool(o.is_correct) };
      });
      if (answers.length < 2) return bad('ANSWERS_MIN');
      if (answers.some((a) => !a.text)) return bad('ANSWER_TEXT');
      if (answers.some((a) => a.text.length > MAX.answer)) return bad('TOO_LONG', 'answers');
      const correct = answers.filter((a) => a.is_correct).length;
      if (correct === 0) return bad('NO_CORRECT');
      const multi =
        q.multi_answer === undefined || q.multi_answer === null
          ? correct > 1
          : fileBool(q.multi_answer);
      // false with several correct renders radios: the student can never get it right.
      if (!multi && correct > 1) return bad('MULTI_MISMATCH');
      input.answers = answers.map((a, position) => ({ ...a, position }));
      input.multi_answer = multi;
    } else if (answersIn.length > 0) {
      return bad('ANSWERS_NOT_ALLOWED');
    }

    const content = q.content;
    if (typeof content === 'string' && content.length > MAX.content)
      return bad('TOO_LONG', 'content');

    if (type === 'code') {
      const parsed = parseJson(content) as { snippet?: unknown; language?: unknown } | null;
      const snippet =
        parsed && typeof parsed.snippet === 'string'
          ? parsed.snippet
          : typeof content === 'string'
            ? content
            : '';
      if (!snippet.trim()) return bad('CODE');
      input.code_snippet = snippet;
      input.code_language =
        parsed && typeof parsed.language === 'string' && parsed.language.trim()
          ? parsed.language.trim()
          : null;
    } else if (type === 'image') {
      const url = str(content);
      if (!url) return bad('IMAGE');
      // A path is only meaningful inside a zip; by now a zip import has swapped
      // every path it could resolve for an uploaded image.
      if (isImagePath(url)) return bad('IMAGE_NOT_IN_ZIP', url);
      input.image_url = url;
    } else if (type === 'ordering') {
      const parsed = parseJson(content) as { items?: unknown } | null;
      const items = Array.isArray(parsed?.items) ? parsed!.items : null;
      if (!items || items.length < 2 || items.some((x) => typeof x !== 'string' || !x.trim()))
        return bad('ORDERING');
      if (!distinct(items as string[])) return bad('ORDERING_DUPLICATE');
      input.content = JSON.stringify({ items });
    } else if (type === 'matching') {
      const parsed = parseJson(content) as { left?: unknown; right?: unknown } | null;
      const left = Array.isArray(parsed?.left) ? (parsed!.left as unknown[]) : null;
      const right = Array.isArray(parsed?.right) ? (parsed!.right as unknown[]) : null;
      const ok = (l: unknown[] | null) =>
        !!l && l.every((x) => typeof x === 'string' && x.trim() !== '');
      if (!ok(left) || !ok(right) || left!.length < 2 || left!.length !== right!.length)
        return bad('MATCHING');
      if (!distinct(left as string[]) || !distinct(right as string[]))
        return bad('MATCHING_DUPLICATE');
      input.content = JSON.stringify({ left, right });
    } else if (type === 'fill_blank') {
      const parsed = parseJson(content) as { blanks?: unknown } | null;
      const blanks = Array.isArray(parsed?.blanks)
        ? (parsed!.blanks as Array<Record<string, unknown>>)
        : null;
      if (!blanks || blanks.length === 0) return bad('FILL_BLANK');
      const ids = blanks.map((b) => (typeof b?.id === 'string' ? b.id : ''));
      if (ids.some((id) => !/^[A-Z0-9_]+$/.test(id))) return bad('FILL_BLANK_ID');
      if (blanks.some((b) => typeof b.correct !== 'string' || !b.correct.trim()))
        return bad('FILL_BLANK');
      // ___b___ in lowercase is not a blank: it would render as plain text.
      if (/___[^_\s]*[a-z][^_\s]*___/.test(text)) return bad('FILL_BLANK_ID');
      const inText = [...text.matchAll(BLANK_RE)].map((m) => m[1]);
      const sameSet =
        inText.length === ids.length &&
        new Set(inText).size === inText.length &&
        ids.every((id) => inText.includes(id));
      if (!sameSet) return bad('FILL_BLANK_TEXT');
      input.content = JSON.stringify({
        blanks: blanks.map((b) => ({ id: b.id, correct: String(b.correct).trim() })),
      });
    }

    inputs.push(input);
  });

  return { inputs, issues };
}
