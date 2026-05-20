// Build-time bundling of every markdown file under the top-level docs/ tree.
// Vite resolves this glob at compile time and inlines each file's contents
// as a string, so the docs ship inside the JS bundle — no extra runtime
// fetches, no separate server route. Dev mode reads the files live (HMR
// on save) thanks to server.fs.allow in vite.config.ts.
//
// Keys end up looking like "../../../docs/en/admin/README.md" — we normalize
// them into a structured tree below. The path is three levels up because
// this file lives at client/src/lib/, and the docs/ tree is at the repo
// root next to client/.
const RAW_FILES = import.meta.glob<string>('../../../docs/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export type DocsLanguage = 'sr' | 'en';

export type DocsPage = {
  // Stable id used in the URL: e.g. "admin/users" or "" for the language root.
  slug: string;
  // Display label derived from the first heading; falls back to slug.
  title: string;
  audience: 'root' | 'admin' | 'assistant' | 'student' | 'architecture';
  language: DocsLanguage;
  content: string;
};

// Order matters for the sidebar — keep it predictable per audience.
const AUDIENCE_ORDER: DocsPage['audience'][] = [
  'root',
  'admin',
  'assistant',
  'student',
  'architecture',
];

const TITLE_BY_AUDIENCE: Record<DocsPage['audience'], { sr: string; en: string }> = {
  root: { sr: 'Početna', en: 'Overview' },
  admin: { sr: 'Administrator', en: 'Admin' },
  assistant: { sr: 'Asistent', en: 'Assistant' },
  student: { sr: 'Student', en: 'Student' },
  architecture: { sr: 'Arhitektura', en: 'Architecture' },
};

function firstHeading(md: string): string | null {
  const match = md.match(/^\s*#\s+(.+?)\s*$/m);
  return match ? match[1].trim() : null;
}

function buildPages(): DocsPage[] {
  const out: DocsPage[] = [];
  for (const [path, content] of Object.entries(RAW_FILES)) {
    // Path format: ../../docs/<lang>/<audience?>/<file>.md
    // We only render the audience README files (one page per audience for now);
    // any future leaf files (users.md, authz.md, ...) land here automatically.
    const m = path.match(/\/docs\/(en|sr)\/(?:([^/]+)\/)?([^/]+)\.md$/);
    if (!m) continue;
    const [, lang, audienceFolder, fileName] = m;
    const language = lang as DocsLanguage;

    let audience: DocsPage['audience'] = 'root';
    if (audienceFolder) {
      if (
        audienceFolder === 'admin' ||
        audienceFolder === 'assistant' ||
        audienceFolder === 'student' ||
        audienceFolder === 'architecture'
      ) {
        audience = audienceFolder;
      } else {
        continue;
      }
    }

    // Slug: empty for the top-level README, audience name for audience READMEs,
    // "audience/leaf" for any future deeper file.
    let slug = '';
    if (audience !== 'root') {
      slug = fileName === 'README' ? audience : `${audience}/${fileName}`;
    } else if (fileName !== 'README') {
      slug = fileName;
    }

    out.push({
      slug,
      audience,
      language,
      title: firstHeading(content) ?? TITLE_BY_AUDIENCE[audience][language],
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
      const ai = AUDIENCE_ORDER.indexOf(a.audience);
      const bi = AUDIENCE_ORDER.indexOf(b.audience);
      if (ai !== bi) return ai - bi;
      // Inside an audience, README first then alphabetical
      const aLeaf = a.slug.split('/')[1] ?? '';
      const bLeaf = b.slug.split('/')[1] ?? '';
      if (aLeaf === bLeaf) return 0;
      if (!aLeaf) return -1;
      if (!bLeaf) return 1;
      return aLeaf.localeCompare(bLeaf);
    });
}

export function findPage(language: DocsLanguage, slug: string): DocsPage | undefined {
  return ALL_PAGES.find((p) => p.language === language && p.slug === slug);
}

export function audienceLabel(audience: DocsPage['audience'], language: DocsLanguage): string {
  return TITLE_BY_AUDIENCE[audience][language];
}
