import crypto from 'crypto';
import sharp from 'sharp';
import { query } from '../db/client';

// Uploaded question images. Every upload is normalised server-side, whatever
// the client sent: EXIF-rotated, scaled down to fit MAX_DIM, metadata stripped
// (phone photos carry GPS), and re-encoded as WebP under TARGET_BYTES. A 12 MB
// phone photo lands as a few hundred KB; a small screenshot stays crisp.
//
// Bytes live in Postgres (otisak_images) rather than on disk: the container
// never writes to its filesystem, and the pgdata volume plus pg_dump already
// cover persistence and backups. Rows are content-addressed by the SHA-256 of
// the encoded output, so re-uploading or re-importing the same image reuses
// the existing row. Questions reference an image by IMAGE_URL_PREFIX + id.

export const IMAGE_URL_PREFIX = '/api/otisak/images/';

// What we accept on the wire. Big enough for any phone photo or scan; the
// output is a fraction of this.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Longest edge after scaling. The exam page shows images at most ~670 CSS px
// wide, so 1920 covers 2x/3x displays and still leaves room to zoom into a
// diagram with small labels.
const MAX_DIM = 1920;
const FALLBACK_DIM = 1280;
const TARGET_BYTES = 500 * 1024;
const LOSSY_QUALITIES = [82, 72, 62];

// Decompression-bomb guard: a tiny file that decodes to gigapixels is refused
// before libvips allocates the pixel buffer.
const MAX_INPUT_PIXELS = 120_000_000;

// libvips keeps an operation cache and spins up a thread pool per image. On a
// small server several parallel 25 MB uploads would otherwise compete for RAM,
// so the cache is off and at most MAX_PARALLEL images are decoded at once.
sharp.cache(false);
sharp.concurrency(2);
const MAX_PARALLEL = 2;
let running = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

export class ImageError extends Error {}

type Encoded = { data: Buffer; width: number; height: number };

async function encode(input: Buffer, dim: number, opts: sharp.WebpOptions): Promise<Encoded> {
  const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: dim, height: dim, fit: 'inside', withoutEnlargement: true })
    .webp({ effort: 4, ...opts })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// Screenshots, diagrams and anything with transparency try lossless first:
// lossy compression smears thin lines and small text, and flat-colour images
// usually compress well losslessly anyway. Photos go straight to the lossy
// ladder. Whatever wins the ladder is kept even if it is still over budget,
// after one last step down in size.
async function processImage(input: Buffer): Promise<Encoded> {
  let meta: sharp.Metadata;
  try {
    // Header only, no pixel decode, so the pixel limit is checked by hand
    // below to report it as its own error.
    meta = await sharp(input, { limitInputPixels: false }).metadata();
  } catch {
    throw new ImageError('UNSUPPORTED_IMAGE');
  }
  if (!meta.width || !meta.height) throw new ImageError('UNSUPPORTED_IMAGE');
  if (meta.width * meta.height > MAX_INPUT_PIXELS) throw new ImageError('IMAGE_TOO_MANY_PIXELS');

  // Already in the shape this pipeline produces (typically one of our own
  // images coming back through an export/import round trip): keep the bytes.
  // Re-encoding would cost quality on every round trip and, with different
  // bytes, defeat the content-addressed dedupe.
  const clean = !meta.exif && !meta.xmp && !meta.icc && (meta.orientation ?? 1) === 1 && (meta.pages ?? 1) === 1;
  if (meta.format === 'webp' && clean && input.length <= TARGET_BYTES && Math.max(meta.width, meta.height) <= MAX_DIM) {
    return { data: input, width: meta.width, height: meta.height };
  }

  const graphic = meta.hasAlpha || meta.format === 'png' || meta.format === 'gif' || meta.format === 'svg';
  if (graphic) {
    const lossless = await encode(input, MAX_DIM, { lossless: true });
    if (lossless.data.length <= TARGET_BYTES) return lossless;
  }

  for (const quality of LOSSY_QUALITIES) {
    const out = await encode(input, MAX_DIM, { quality, alphaQuality: 90 });
    if (out.data.length <= TARGET_BYTES) return out;
  }
  return encode(input, FALLBACK_DIM, { quality: LOSSY_QUALITIES[LOSSY_QUALITIES.length - 1], alphaQuality: 90 });
}

export type StoredImage = {
  id: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  original_bytes: number;
};

export async function storeImage(input: Buffer, createdBy: string | null): Promise<StoredImage> {
  if (input.length === 0) throw new ImageError('EMPTY_IMAGE');
  if (input.length > MAX_UPLOAD_BYTES) throw new ImageError('IMAGE_TOO_LARGE');

  let enc: Encoded;
  try {
    enc = await withSlot(() => processImage(input));
  } catch (err) {
    if (err instanceof ImageError) throw err;
    // libvips errors (truncated file, pixel limit, unsupported codec such as
    // HEIC/HEVC) all mean the same thing to the uploader.
    throw new ImageError('UNSUPPORTED_IMAGE');
  }

  const sha = crypto.createHash('sha256').update(enc.data).digest('hex');
  // DO UPDATE (a no-op) rather than DO NOTHING so RETURNING yields the
  // existing row's id on a duplicate.
  const r = await query<{ id: string }>(
    `INSERT INTO otisak_images (sha256, mime, width, height, bytes, data, created_by)
     VALUES ($1, 'image/webp', $2, $3, $4, $5, $6)
     ON CONFLICT (sha256) DO UPDATE SET sha256 = EXCLUDED.sha256
     RETURNING id`,
    [sha, enc.width, enc.height, enc.data.length, enc.data, createdBy]
  );
  const id = r.rows[0].id;
  return {
    id,
    url: IMAGE_URL_PREFIX + id,
    width: enc.width,
    height: enc.height,
    bytes: enc.data.length,
    original_bytes: input.length,
  };
}

export async function getImage(id: string): Promise<{ data: Buffer; mime: string; sha256: string } | null> {
  if (!UUID_RE.test(id)) return null;
  const r = await query<{ data: Buffer; mime: string; sha256: string }>(
    'SELECT data, mime, sha256 FROM otisak_images WHERE id = $1',
    [id]
  );
  return r.rows[0] ?? null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_URL_RE = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i;

export function isStoredImageUrl(url: string): boolean {
  return url.startsWith(IMAGE_URL_PREFIX) && UUID_RE.test(url.slice(IMAGE_URL_PREFIX.length));
}

// Authoring paths (editor save, JSON import, bank) can still carry an inline
// data: URL from an older client or an exported file. Store it like an upload
// and hand back the short URL, so the question row never holds image bytes.
// Anything that is not a data: URL passes through untouched.
export async function internDataUrl<T extends string | null | undefined>(value: T, createdBy: string | null): Promise<T | string> {
  if (typeof value !== 'string') return value;
  const m = DATA_URL_RE.exec(value.trim());
  if (!m) return value;
  const stored = await storeImage(Buffer.from(m[1], 'base64'), createdBy);
  return stored.url;
}

// The reverse, for places that leave this server: JSON export (the file must
// import on another instance) and the PDF renderer (headless Chromium has no
// session cookie). Unknown ids and foreign URLs pass through untouched.
export async function inlineStoredImage(value: string | null): Promise<string | null> {
  if (!value || !isStoredImageUrl(value)) return value;
  const img = await getImage(value.slice(IMAGE_URL_PREFIX.length));
  if (!img) return value;
  return `data:${img.mime};base64,${img.data.toString('base64')}`;
}
