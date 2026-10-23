import crypto from 'crypto';
import { Jimp } from 'jimp';
import { imageSize } from 'image-size';
import { query } from '../db/client';

// Uploaded question images. Every upload is normalised server-side, whatever
// the client sent: EXIF-rotated, scaled down to fit MAX_DIM, metadata stripped
// (phone photos carry GPS), and re-encoded under TARGET_BYTES: photos as JPEG,
// screenshots, diagrams and anything with transparency as PNG. A 12 MB phone
// photo lands as a few hundred KB; a small screenshot stays crisp.
//
// Pure JavaScript on purpose (jimp + image-size, no native or WebAssembly
// code): OTISAK runs on old CPUs (Xeon E5420, no SSE4.2) where neither the
// prebuilt libvips of sharp nor its WebAssembly build (needs Wasm SIMD) loads.
// It is slower than libvips, which is fine for authoring-time uploads; at most
// MAX_PARALLEL images are decoded at once to bound RAM.
//
// WebP and GIF (WebP from exports made by older OTISAK versions, animated
// GIFs) cannot be re-encoded here; they are checked and stored as they are.
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

// Decompression-bomb guard: the pixel count is read from the header and a file
// that would decode to more than this is refused before any pixel buffer is
// allocated. Pure-JS decoding holds RGBA in memory (4 bytes per pixel), so the
// limit is lower than a libvips pipeline would need: 50 MP = 200 MB.
const MAX_INPUT_PIXELS = 50_000_000;

const MAX_PARALLEL = 1;
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

type Mime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
type Encoded = { data: Buffer; width: number; height: number; mime: Mime };

// Formats jimp decodes and re-encodes; WebP and GIF are stored as they are.
const DECODABLE = new Set(['jpg', 'png', 'bmp', 'tiff']);
const PASSTHROUGH: Record<string, Mime> = { webp: 'image/webp', gif: 'image/gif' };

// JPEG segments before the image data: APP1 carries EXIF and XMP (camera,
// GPS, orientation), APP2 an ICC profile. None of them -> already clean.
function jpegIsClean(buf: Buffer): boolean {
  let i = 2;
  while (i + 4 <= buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    if (marker === 0xda) return true; // start of scan, no more metadata
    if (marker === 0xe1 || marker === 0xe2) return false;
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return true;
}

// PNG chunks that carry EXIF or text metadata.
function pngIsClean(buf: Buffer): boolean {
  let i = 8;
  while (i + 8 <= buf.length) {
    const type = buf.toString('latin1', i + 4, i + 8);
    if (type === 'eXIf' || type === 'tEXt' || type === 'iTXt' || type === 'zTXt') return false;
    if (type === 'IDAT') return true;
    i += 12 + buf.readUInt32BE(i);
  }
  return true;
}

async function processImage(input: Buffer): Promise<Encoded> {
  let header: ReturnType<typeof imageSize>;
  try {
    header = imageSize(input);
  } catch {
    throw new ImageError('UNSUPPORTED_IMAGE');
  }
  const { type } = header;
  let width = header.width ?? 0;
  let height = header.height ?? 0;
  if (!type || !width || !height) throw new ImageError('UNSUPPORTED_IMAGE');
  if (width * height > MAX_INPUT_PIXELS) throw new ImageError('IMAGE_TOO_MANY_PIXELS');
  // EXIF orientations 5-8 swap the axes.
  if ((header.orientation ?? 1) >= 5) [width, height] = [height, width];

  if (PASSTHROUGH[type]) {
    return { data: input, width, height, mime: PASSTHROUGH[type] };
  }
  if (!DECODABLE.has(type)) throw new ImageError('UNSUPPORTED_IMAGE');

  // Already in the shape this pipeline produces (typically one of our own
  // images coming back through an export/import round trip): keep the bytes.
  // Re-encoding would cost quality on every round trip and, with different
  // bytes, defeat the content-addressed dedupe.
  const fits = input.length <= TARGET_BYTES && Math.max(width, height) <= MAX_DIM;
  if (fits && type === 'jpg' && jpegIsClean(input)) return { data: input, width, height, mime: 'image/jpeg' };
  if (fits && type === 'png' && pngIsClean(input)) return { data: input, width, height, mime: 'image/png' };

  // Decoding applies the EXIF orientation; re-encoding drops all metadata.
  const image = await Jimp.read(input);
  const fit = (dim: number) => {
    if (Math.max(image.width, image.height) > dim) image.scaleToFit({ w: dim, h: dim });
  };
  const out = async (mime: 'image/jpeg' | 'image/png', quality?: number): Promise<Encoded> => {
    const data = mime === 'image/jpeg'
      ? await image.getBuffer('image/jpeg', { quality })
      : await image.getBuffer('image/png');
    return { data, width: image.width, height: image.height, mime };
  };
  fit(MAX_DIM);

  // Screenshots, diagrams and anything with transparency try PNG (lossless)
  // first: lossy compression smears thin lines and small text, and flat-colour
  // images compress well losslessly anyway. Transparency has to stay PNG (JPEG
  // has none), one step smaller if needed. Photos go straight to the JPEG
  // ladder; whatever wins it is kept even if still over budget, after one last
  // step down in size.
  const alpha = image.hasAlpha();
  if (alpha || type !== 'jpg') {
    const png = await out('image/png');
    if (png.data.length <= TARGET_BYTES) return png;
    if (alpha) {
      fit(FALLBACK_DIM);
      return out('image/png');
    }
  }
  for (const quality of LOSSY_QUALITIES) {
    const jpg = await out('image/jpeg', quality);
    if (jpg.data.length <= TARGET_BYTES) return jpg;
  }
  fit(FALLBACK_DIM);
  return out('image/jpeg', LOSSY_QUALITIES[LOSSY_QUALITIES.length - 1]);
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
    // Decoder errors (truncated or corrupt file) mean the same thing to the
    // uploader as an unsupported format such as HEIC.
    throw new ImageError('UNSUPPORTED_IMAGE');
  }

  const sha = crypto.createHash('sha256').update(enc.data).digest('hex');
  // DO UPDATE (a no-op) rather than DO NOTHING so RETURNING yields the
  // existing row's id on a duplicate.
  const r = await query<{ id: string }>(
    `INSERT INTO otisak_images (sha256, mime, width, height, bytes, data, created_by)
     VALUES ($1, $7, $2, $3, $4, $5, $6)
     ON CONFLICT (sha256) DO UPDATE SET sha256 = EXCLUDED.sha256
     RETURNING id`,
    [sha, enc.width, enc.height, enc.data.length, enc.data, createdBy, enc.mime]
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
