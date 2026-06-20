// Build-time bundling of every markdown file under the app/docs/ tree.
// Vite resolves these globs at compile time and inlines the markdown content as
// strings (so the docs ship inside the JS bundle), and image files as URLs (so
// `![](../_assets/foo.png)` references in markdown resolve to a real bundled
// asset URL at runtime).
//
// Glob keys end up looking like "../../../docs/sr/exams.md" - the path is three
// levels up because this file lives at app/client/src/lib/, and the docs/ tree
// is at app/docs, next to app/client/.
const RAW_FILES = import.meta.glob<string>('../../../docs/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const IMAGE_FILES = import.meta.glob<string>(
  '../../../docs/**/*.{png,jpg,jpeg,gif,svg,webp,avif}',
  { query: '?url', import: 'default', eager: true }
);

export type DocsLanguage = 'sr' | 'en';

export type DocsPage = {
  // Stable id used in the URL: e.g. "exams" or "" for the language root.
  slug: string;
  // Display label derived from the first heading; falls back to slug.
  title: string;
  // Filename without extension ("README", "exams", ...). Used as ordering key.
  fileName: string;
  language: DocsLanguage;
  content: string;
};

// Sidebar order. README is always first; everything else is in the order below
// so admins/assistants read it the way the system is meant to be used (subjects
// first, then users, then exams, then running tests).
const FILE_ORDER = ['README', 'subjects', 'users', 'exams', 'running-tests'];

// Fallback titles used when a doc has no first H1.
const FALLBACK_TITLE: Record<string, { sr: string; en: string }> = {
  README: { sr: 'Početna', en: 'Overview' },
  exams: { sr: 'Upravljanje ispitima', en: 'Managing exams' },
  'running-tests': { sr: 'Pokretanje i vođenje testa', en: 'Running tests' },
  users: { sr: 'Upravljanje korisnicima', en: 'Managing users' },
  subjects: { sr: 'Upravljanje predmetima', en: 'Managing subjects' },
};

function firstHeading(md: string): string | null {
  const match = md.match(/^\s*#\s+(.+?)\s*$/m);
  return match ? match[1].trim() : null;
}

// docs-relative path → bundled asset URL. Keys look like "assets/foo.png" or
// "sr/screenshots/login.png". Used by resolveImage() to turn a relative `src`
// in markdown into a real URL.
const IMAGE_URLS: Record<string, string> = {};
// Secondary basename → URL index. Used as a fallback when the literal path
// resolution misses (e.g. the markdown wrote `./assets/foo.png` but the file
// actually lives at docs/assets/foo.png). Keys are just the filename so a
// duplicate basename across folders is overwritten - fine in practice since
// the docs root is small and authors don't tend to reuse names.
const IMAGE_BY_BASENAME: Record<string, string> = {};
for (const [path, url] of Object.entries(IMAGE_FILES)) {
  const m = path.match(/\/docs\/(.+)$/);
  if (!m) continue;
  IMAGE_URLS[m[1]] = url;
  const basename = m[1].split('/').pop() ?? m[1];
  IMAGE_BY_BASENAME[basename] = url;
}

function buildPages(): DocsPage[] {
  const out: DocsPage[] = [];
  for (const [path, content] of Object.entries(RAW_FILES)) {
    // Path format: ../../../docs/<lang>/<file>.md OR ../../../docs/<file>.md (we ignore the latter).
    const m = path.match(/\/docs\/(en|sr)\/([^/]+)\.md$/);
    if (!m) continue;
    const [, lang, fileName] = m;
    const language = lang as DocsLanguage;
    const slug = fileName === 'README' ? '' : fileName;

    out.push({
      slug,
      fileName,
      language,
      title: firstHeading(content) ?? FALLBACK_TITLE[fileName]?.[language] ?? fileName,
      content,
    });
  }
  return out;
}

const ALL_PAGES = buildPages();

export function getPages(language: DocsLanguage): DocsPage[] {
  return ALL_PAGES
    .filter((p) => p.language === language)
    .sort((a, b) => {
      const ai = FILE_ORDER.indexOf(a.fileName);
      const bi = FILE_ORDER.indexOf(b.fileName);
      // Anything not in FILE_ORDER gets pushed to the end, alphabetically.
      const aRank = ai === -1 ? FILE_ORDER.length : ai;
      const bRank = bi === -1 ? FILE_ORDER.length : bi;
      if (aRank !== bRank) return aRank - bRank;
      return a.fileName.localeCompare(b.fileName);
    });
}

export function findPage(language: DocsLanguage, slug: string): DocsPage | undefined {
  return ALL_PAGES.find((p) => p.language === language && p.slug === slug);
}

// Resolve a markdown image src (e.g. "../assets/foo.png") against the page
// that's rendering it. Returns the bundled asset URL, or null if it doesn't
// resolve (caller falls back to the raw src).
//
// Resolution order:
//   1. Literal path resolution from the current page's folder. Handles `./`,
//      `../`, and bare relative paths correctly.
//   2. Strip a leading `/` and try as docs-root-relative.
//   3. Basename fallback. Lets authors write `./assets/foo.png` (resolves to
//      docs/<lang>/assets/foo.png) and still have it work when the file
//      actually lives at docs/assets/foo.png. A common typo, not worth
//      breaking the page over.
export function resolveImage(page: DocsPage, src: string): string | null {
  if (!src) return null;
  // Absolute URLs (http://, data:, etc.) - leave alone.
  if (/^[a-z][a-z0-9+\-.]*:/i.test(src) || src.startsWith('//')) {
    return null;
  }

  // Try literal resolution from the page's folder first.
  const trimmed = src.startsWith('/') ? src.slice(1) : src;
  const startFolder = src.startsWith('/') ? [] : [page.language];
  const segments: string[] = [...startFolder];
  for (const part of trimmed.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') { segments.pop(); continue; }
    segments.push(part);
  }
  const literalKey = segments.join('/');
  if (IMAGE_URLS[literalKey]) return IMAGE_URLS[literalKey];

  // Fallback: match by filename only. Covers small path typos like
  // `./assets/x.png` vs `../assets/x.png` without forcing the author to care.
  const basename = segments[segments.length - 1];
  if (basename && IMAGE_BY_BASENAME[basename]) return IMAGE_BY_BASENAME[basename];

  return null;
}
