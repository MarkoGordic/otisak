import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  BookOpen, Menu, X, ChevronRight, ExternalLink, Languages,
} from 'lucide-react';
import 'highlight.js/styles/github-dark-dimmed.css';

import { useLang } from '../components/LangProvider';
import {
  type DocsLanguage, type DocsPage as DocsPageData,
  getPages, findPage, audienceLabel,
} from '../lib/docs';

// The /docs route is public — no session check. It's a knowledge base, not
// a privileged surface. The page picks its initial language from whatever
// the app-wide LangProvider has (sr-Latn → 'sr', otherwise 'en') and lets
// the reader override that locally without affecting the rest of the app.
export default function DocsPage() {
  const navigate = useNavigate();
  const params = useParams<{ lang?: string; '*'?: string }>();
  const { locale, t } = useLang();

  // Single source of truth for which language we're showing. URL wins; fallback
  // to the app locale; final fallback to Serbian since that's the project default.
  const language: DocsLanguage =
    params.lang === 'en' || params.lang === 'sr'
      ? params.lang
      : locale === 'en'
        ? 'en'
        : 'sr';

  // First-load redirect to a canonical URL with language in the path.
  useEffect(() => {
    if (params.lang !== 'en' && params.lang !== 'sr') {
      navigate(`/docs/${language}`, { replace: true });
    }
  }, [params.lang, language, navigate]);

  const slug = params['*'] ?? '';
  const page = findPage(language, slug);
  const pagesForLang = useMemo(() => getPages(language), [language]);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Close drawer when the route changes (sidebar click on mobile).
  useEffect(() => { setMobileNavOpen(false); }, [slug, language]);

  const switchLanguage = (next: DocsLanguage) => {
    if (next === language) return;
    // Try to land on the same page in the other language; fall back to root.
    const candidate = findPage(next, slug);
    navigate(`/docs/${next}/${candidate ? candidate.slug : ''}`);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-[var(--bg-elevated)]/95 backdrop-blur border-b border-[var(--border-default)]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <button
            type="button"
            className="lg:hidden p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <Link to={`/docs/${language}`} className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-4 h-4 text-accent" />
            </div>
            <div className="text-sm font-display font-semibold text-[var(--text-primary)] truncate">
              OTISAK · {t('docs.title')}
            </div>
          </Link>

          <div className="flex-1" />

          {/* Language switcher */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)]">
            {(['sr', 'en'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => switchLanguage(lang)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium uppercase tracking-wider transition-colors ${
                  language === lang
                    ? 'bg-accent text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {lang === 'sr' ? 'SR' : 'EN'}
              </button>
            ))}
          </div>

          <Link
            to="/"
            className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-accent transition-colors"
          >
            {t('docs.backToApp')}
            <ExternalLink size={12} />
          </Link>
        </div>
      </header>

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8 grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* Sidebar */}
        <DocsSidebar
          pages={pagesForLang}
          language={language}
          activeSlug={slug}
          mobileOpen={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
        />

        {/* Content */}
        <main className="min-w-0">
          {page ? (
            <article className="docs-prose">
              {/* Breadcrumb */}
              {page.audience !== 'root' && (
                <Breadcrumb
                  language={language}
                  audience={page.audience}
                  title={page.title}
                />
              )}
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  // Internal docs links keep the user inside the React Router
                  // boundary instead of triggering a full reload.
                  a: ({ href, children, ...rest }) => {
                    if (!href) return <a {...rest}>{children}</a>;
                    const internal = /^\.{1,2}\//.test(href) || /^\/docs(\/|$)/.test(href);
                    if (internal && !href.startsWith('http')) {
                      const target = resolveInternalHref(href, language, page);
                      if (target) {
                        return <Link to={target}>{children}</Link>;
                      }
                    }
                    return <a href={href} {...rest}>{children}</a>;
                  },
                }}
              >
                {page.content}
              </ReactMarkdown>
            </article>
          ) : (
            <NotFound language={language} />
          )}
        </main>
      </div>
    </div>
  );
}

// ---------- Helpers ----------

// Resolve a relative markdown link ("admin/users.md", "../authz.md") into an
// in-app /docs/<lang>/<slug> URL. Returns null if it can't be confidently
// mapped, in which case the parent renderer falls back to a regular <a>.
function resolveInternalHref(
  href: string,
  language: DocsLanguage,
  current: DocsPageData,
): string | null {
  // Strip trailing fragment so we can append it back after resolution.
  const [bare, fragment] = href.split('#');
  const fragmentSuffix = fragment ? `#${fragment}` : '';

  // Same-page anchor: leave as-is so the browser handles scroll.
  if (!bare) return null;

  // /docs/... absolute links bypass resolution entirely.
  if (/^\/docs(\/|$)/.test(bare)) return bare + fragmentSuffix;

  // Treat the current page's "folder" as its audience. Use string[] so we
  // can append arbitrary URL parts without narrowing to the audience union.
  const segments: string[] = current.audience === 'root' ? [] : [current.audience];

  const parts = bare.split('/');
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') { segments.pop(); continue; }
    segments.push(part);
  }

  // Strip a trailing README and the .md extension.
  let last = segments[segments.length - 1] || '';
  last = last.replace(/\.md$/i, '');
  if (last === 'README') segments.pop();
  else if (last) segments[segments.length - 1] = last;

  const targetSlug = segments.join('/');
  // Only translate to an in-app URL if a matching page actually exists,
  // otherwise we'd produce dead links.
  if (!findPage(language, targetSlug)) return null;
  return `/docs/${language}/${targetSlug}${fragmentSuffix}`;
}

function DocsSidebar({
  pages, language, activeSlug, mobileOpen, onClose,
}: {
  pages: DocsPageData[];
  language: DocsLanguage;
  activeSlug: string;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  // Group pages by audience for a section-style listing.
  const groups = useMemo(() => {
    const byAudience = new Map<DocsPageData['audience'], DocsPageData[]>();
    for (const p of pages) {
      const list = byAudience.get(p.audience) ?? [];
      list.push(p);
      byAudience.set(p.audience, list);
    }
    return byAudience;
  }, [pages]);

  const rootPages = groups.get('root') ?? [];
  const audienceOrder: DocsPageData['audience'][] = ['admin', 'assistant', 'student', 'architecture'];

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={`${
          mobileOpen ? 'fixed inset-y-0 left-0 w-[260px] z-50 overflow-y-auto p-4' : 'hidden'
        } lg:block lg:relative lg:w-auto lg:z-0 lg:p-0 lg:sticky lg:top-[5.5rem] lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto bg-[var(--bg-elevated)] lg:bg-transparent border-r border-[var(--border-default)] lg:border-r-0`}
      >
        <nav className="space-y-5">
          {rootPages.length > 0 && (
            <SidebarSection>
              {rootPages.map((p) => (
                <SidebarLink
                  key={p.slug}
                  to={`/docs/${language}${p.slug ? `/${p.slug}` : ''}`}
                  label={p.title}
                  active={activeSlug === p.slug}
                />
              ))}
            </SidebarSection>
          )}

          {audienceOrder.map((audience) => {
            const items = groups.get(audience);
            if (!items || items.length === 0) return null;
            return (
              <SidebarSection key={audience} heading={audienceLabel(audience, language)}>
                {items.map((p) => (
                  <SidebarLink
                    key={p.slug}
                    to={`/docs/${language}/${p.slug}`}
                    label={p.title}
                    active={activeSlug === p.slug}
                  />
                ))}
              </SidebarSection>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

function SidebarSection({
  heading, children,
}: {
  heading?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {heading && (
        <div className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {heading}
        </div>
      )}
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function SidebarLink({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={`px-2 py-1.5 rounded-md text-sm transition-colors ${
        active
          ? 'bg-accent-light text-accent font-medium'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
      }`}
    >
      {label}
    </Link>
  );
}

function Breadcrumb({
  language, audience, title,
}: {
  language: DocsLanguage;
  audience: DocsPageData['audience'];
  title: string;
}) {
  const { t } = useLang();
  if (audience === 'root') return null;
  return (
    <div className="not-prose flex items-center gap-1.5 text-xs text-[var(--text-muted)] mb-1" style={{ marginTop: 0 }}>
      <Link to={`/docs/${language}`} className="hover:text-[var(--text-primary)]">{t('docs.home')}</Link>
      <ChevronRight size={12} />
      <span className="text-[var(--text-secondary)]">{audienceLabel(audience, language)}</span>
      {title && (
        <>
          <ChevronRight size={12} />
          <span className="text-[var(--text-primary)] font-medium truncate">{title}</span>
        </>
      )}
    </div>
  );
}

function NotFound({ language }: { language: DocsLanguage }) {
  const { t } = useLang();
  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] p-10 text-center">
      <Languages size={32} className="mx-auto text-[var(--text-muted)] mb-3" />
      <h2 className="text-lg font-display font-semibold text-[var(--text-primary)]">{t('docs.notFoundTitle')}</h2>
      <p className="text-sm text-[var(--text-secondary)] mt-1">{t('docs.notFoundBody')}</p>
      <Link
        to={`/docs/${language}`}
        className="inline-block mt-4 px-4 h-10 leading-10 rounded-lg bg-accent text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
      >
        {t('docs.backToIndex')}
      </Link>
    </div>
  );
}
