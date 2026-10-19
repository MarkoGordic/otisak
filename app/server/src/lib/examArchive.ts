import path from 'path';
import { unzipSync, zipSync, strToU8, type Zippable } from 'fflate';
import { getOtisakQuestions } from '../db/otisak-questions';
import type { OtisakExamWithSubject } from '../db/otisak-types';
import type { ExamImportInput } from './importExam';
import { storeImage, getImage, isStoredImageUrl, inlineStoredImage, IMAGE_URL_PREFIX, ImageError } from './images';

// Exam export/import as a file. Two shapes:
//
//   exam.json                  plain JSON, images as URLs or inline data: URLs
//   exam.zip                   exam.json + image files next to it
//     exam.json                  an image question's `content` is a path
//     images/01.webp             relative to exam.json ("images/01.webp")
//
// The zip is what export produces once an exam has uploaded images, and the
// easiest thing for a person to assemble by hand: write the JSON, drop the
// pictures in a folder, compress. Zips made by macOS Finder ("Compress")
// wrap everything in a top-level folder and add __MACOSX/ resource forks;
// both are handled.

// Upload cap for the zip itself, and how much it may claim to inflate to.
// Images are already compressed, so a legitimate archive barely shrinks; the
// inflate cap is what stops a zip bomb.
export const MAX_ZIP_BYTES = 100 * 1024 * 1024;
const MAX_UNZIPPED_BYTES = 300 * 1024 * 1024;
const MAX_ENTRIES = 2000;

export class ExamArchiveError extends Error {
  constructor(code: string, readonly details?: string[]) {
    super(code);
  }
}

type ExportPayload = {
  version: 1;
  exam: Record<string, unknown>;
  questions: Array<Record<string, unknown> & { type: string; content: string | null }>;
};

// The file shape shared by every export flavour. Uploaded images are left as
// their server URLs here; each flavour decides how to carry them.
//
// exam_mode is deliberately NOT exported: real vs practice is decided by the
// page you import on, so a file that carried it would be asserting something
// the importer ignores. Same reason subject_id isn't here.
export async function buildExportPayload(exam: OtisakExamWithSubject): Promise<ExportPayload> {
  const questions = await getOtisakQuestions(exam.id);
  return {
    version: 1,
    exam: {
      title: exam.title,
      description: exam.description,
      duration_minutes: Number(exam.duration_minutes),
      pass_threshold: Number(exam.pass_threshold),
      has_pass_threshold: !!exam.has_pass_threshold,
      allow_review: exam.allow_review,
      shuffle_questions: exam.shuffle_questions,
      shuffle_answers: exam.shuffle_answers,
      partial_scoring: exam.partial_scoring,
      negative_points_enabled: exam.negative_points_enabled,
      negative_points_value: Number(exam.negative_points_value),
      negative_points_threshold: Number(exam.negative_points_threshold),
      // Informational only. Import ignores both; the caller picks the subject.
      subject_name: exam.subject_name,
      subject_code: exam.subject_code,
    },
    questions: questions.map((q) => ({
      type: q.type,
      text: q.text,
      content: q.content,
      points: Number(q.points),
      position: q.position,
      explanation: q.explanation,
      ai_grading_instructions: q.ai_grading_instructions,
      // Carry the single/multi distinction in the export so a round-trip
      // (export → re-import) preserves authoring intent - not just whatever
      // is_correct count happens to be on disk.
      multi_answer: q.multi_answer,
      answers: q.answers.map((a) => ({
        text: a.text,
        is_correct: a.is_correct,
        position: a.position,
      })),
    })),
  };
}

export function hasUploadedImages(payload: ExportPayload): boolean {
  return payload.questions.some((q) => q.type === 'image' && !!q.content && isStoredImageUrl(q.content));
}

// Single-file flavour: uploaded images inlined as data: URLs.
export async function inlinePayloadImages(payload: ExportPayload): Promise<ExportPayload> {
  const questions = await Promise.all(payload.questions.map(async (q) => (
    q.type === 'image' ? { ...q, content: await inlineStoredImage(q.content) } : q
  )));
  return { ...payload, questions };
}

// Zip flavour: each uploaded image becomes images/NN.<ext>, numbered in
// question order. An image used by several questions is written once.
export async function buildExamZip(payload: ExportPayload): Promise<Uint8Array> {
  const files: Zippable = {};
  const byId = new Map<string, string>();
  const questions = [];
  for (const q of payload.questions) {
    if (q.type !== 'image' || !q.content || !isStoredImageUrl(q.content)) {
      questions.push(q);
      continue;
    }
    const id = q.content.slice(IMAGE_URL_PREFIX.length);
    let name = byId.get(id);
    if (!name) {
      const img = await getImage(id);
      if (!img) { questions.push(q); continue; }
      const ext = img.mime.split('/')[1] || 'bin';
      name = `images/${String(byId.size + 1).padStart(2, '0')}.${ext}`;
      byId.set(id, name);
      // Already compressed: storing beats burning CPU on deflate.
      files[name] = [new Uint8Array(img.data), { level: 0 }];
    }
    questions.push({ ...q, content: name });
  }
  files['exam.json'] = strToU8(JSON.stringify({ ...payload, questions }, null, 2));
  return zipSync(files, { level: 6 });
}

function isJunk(name: string): boolean {
  return name.endsWith('/') || name.startsWith('__MACOSX/') || path.posix.basename(name).startsWith('.');
}

type ReadArchive = { body: ExamImportInput; files: Map<string, Uint8Array>; baseDir: string };

export function readExamZip(buf: Buffer): ReadArchive {
  let entries = 0;
  let inflated = 0;
  let overLimit = false;
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(new Uint8Array(buf.buffer, buf.byteOffset, buf.length), {
      // Runs per entry before it is inflated, so a bomb is refused on its
      // declared size without ever allocating the output.
      filter: (f) => {
        if (isJunk(f.name)) return false;
        entries++;
        inflated += f.originalSize;
        if (entries > MAX_ENTRIES || inflated > MAX_UNZIPPED_BYTES) overLimit = true;
        return !overLimit;
      },
    });
  } catch {
    throw new ExamArchiveError('INVALID_ZIP');
  }
  if (overLimit) throw new ExamArchiveError('ZIP_TOO_LARGE');

  const files = new Map(Object.entries(raw));
  const jsons = [...files.keys()].filter((n) => n.toLowerCase().endsWith('.json'));
  const named = jsons.filter((n) => path.posix.basename(n).toLowerCase() === 'exam.json');
  const jsonName = jsons.length === 1 ? jsons[0] : named.length === 1 ? named[0] : null;
  if (!jsonName) throw new ExamArchiveError(jsons.length === 0 ? 'ZIP_NO_JSON' : 'ZIP_MANY_JSON', jsons);

  let body: ExamImportInput;
  try {
    body = JSON.parse(Buffer.from(files.get(jsonName)!).toString('utf8'));
  } catch {
    throw new ExamArchiveError('INVALID_JSON', [jsonName]);
  }
  const dir = path.posix.dirname(jsonName);
  return { body, files, baseDir: dir === '.' ? '' : dir };
}

// A question's image `content` that is neither a URL nor inline data is a
// file path, meant to be resolved against a zip.
export function isImagePath(content: unknown): content is string {
  return typeof content === 'string' && content.trim() !== ''
    && !/^(https?:|data:)/i.test(content.trim()) && !isStoredImageUrl(content.trim());
}

export function unresolvedImagePaths(body: ExamImportInput): string[] {
  return (body.questions || [])
    .filter((q) => q && q.type === 'image' && isImagePath(q.content))
    .map((q) => String(q.content));
}

// Swap every image path in the archive's JSON for an uploaded image. All
// paths are looked up before anything is stored, so a zip with a missing or
// broken picture fails as a whole, listing every bad name, instead of leaving
// half an import behind.
export async function resolveArchiveImages(archive: ReadArchive, createdBy: string): Promise<ExamImportInput> {
  const { body, files, baseDir } = archive;
  // Lookups, most to least exact: as written, ignoring case, then ignoring
  // the extension too (the JSON says 01.png, the person saved 01.jpg). The
  // last one only counts when exactly one file has that name.
  const lower = new Map([...files.keys()].map((k) => [k.toLowerCase(), k]));
  const stem = (n: string) => n.toLowerCase().replace(/\.[^./]*$/, '');
  const byStem = new Map<string, string[]>();
  for (const k of files.keys()) byStem.set(stem(k), [...(byStem.get(stem(k)) ?? []), k]);
  const find = (ref: string): string | null => {
    const rel = ref.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    const candidates = [path.posix.join(baseDir, rel), rel].map((c) => path.posix.normalize(c));
    for (const c of candidates) {
      if (files.has(c)) return c;
      const ci = lower.get(c.toLowerCase());
      if (ci) return ci;
    }
    for (const c of candidates) {
      const hits = byStem.get(stem(c));
      if (hits?.length === 1) return hits[0];
    }
    return null;
  };

  const questions = Array.isArray(body.questions) ? body.questions : [];
  const resolved = new Map<string, string>();
  const missing: string[] = [];
  for (const q of questions) {
    if (!q || q.type !== 'image' || !isImagePath(q.content)) continue;
    const hit = find(q.content);
    if (hit) resolved.set(q.content, hit);
    else missing.push(q.content);
  }
  if (missing.length) throw new ExamArchiveError('MISSING_IMAGES', missing);

  const urls = new Map<string, string>();
  for (const name of new Set(resolved.values())) {
    try {
      urls.set(name, (await storeImage(Buffer.from(files.get(name)!), createdBy)).url);
    } catch (err) {
      if (err instanceof ImageError) throw new ExamArchiveError('BAD_IMAGE', [name]);
      throw err;
    }
  }

  return {
    ...body,
    questions: questions.map((q) => (
      q && q.type === 'image' && typeof q.content === 'string' && resolved.has(q.content)
        ? { ...q, content: urls.get(resolved.get(q.content)!) }
        : q
    )),
  };
}
