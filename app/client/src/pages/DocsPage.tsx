import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  BookOpen, Menu, X, ChevronRight, ExternalLink,
} from 'lucide-react';
import 'highlight.js/styles/github-dark-dimmed.css';

import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import {
  type DocsLanguage, type DocsPage as DocsPageData,
  getPages, findPage, resolveImage,
} from '../lib/docs';

type SessionUser = { id?: string; name?: string; role?: string };

// The /docs route works both for signed-in users (rendered inside the main app
// shell with the global Sidebar so navigation stays one click away) and for
// anonymous visitors (rendered standalone with its own minimal top bar). The
// session probe drives which layout to use.
export default function DocsPage() {
  const navigate = useNavigate();
  const params = useParams<{ lang?: string; '*'?: string }>();
  const { locale, t } = useLang();

  // URL wins for language; fall back to app locale; final fallback Serbian.
  const language: DocsLanguage =
    params.lang === 'en' || params.lang === 'sr'
      ? params.lang
      : locale === 'en'
        ? 'en'
        : 'sr';

  // First-load redirect to a canonical URL with the language in the path.
  useEffect(() => {
    if (params.lang !== 'en' && params.lang !== 'sr') {
      navigate(`/docs/${language}`, { replace: true });
    }
  }, [params.lang, language, navigate]);

  const slug = params['*'] ?? '';
  const page = findPage(language, slug);
  const pagesForLang = useMemo(() => getPages(language), [language]);

  // Probe the session once on mount. `null` = still loading, then resolves to
  // either a user (logged in) or `undefined` (anonymous).
  const [sessionUser, setSessionUser] = useState<SessionUser | null | undefined>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        if (cancelled) return;
        if (!res.ok) { setSessionUser(undefined); return; }
        const data = await res.json();
        if (data?.authenticated && data.user) setSessionUser(data.user);
        else setSessionUser(undefined);
      } catch {
        if (!cancelled) setSessionUser(undefined);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const switchLanguage = (next: DocsLanguage) => {
    if (next === language) return;
    const candidate = findPage(next, slug);
    navigate(`/docs/${next}/${candidate ? candidate.slug : ''}`);
  };

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => { setMobileNavOpen(false); }, [slug, language]);

  const content = (
    <>
      {/* Topic nav for the 4 doc pages - sits inside the main column so the
          app's global Sidebar (when present) stays usable. */}
      <DocsTopicNav
        pages={pagesForLang}
        language={language}
        activeSlug={slug}
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        currentLang={language}
        onSwitchLanguage={switchLanguage}
      />

      <main className="min-w-0">
        {page ? (
          <article className="docs-prose">
            {page.slug !== '' && (
              <Breadcrumb language={language} title={page.title} />
            )}
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                a: ({ href, children, ...rest }) => {
                  if (!href) return <a {...rest}>{children}</a>;
                  const internal = /^\.{0,2}\//.test(href) || /^[^/:#?]+\.md(#|$)/.test(href) || /^\/docs(\/|$)/.test(href);
                  if (internal && !href.startsWith('http')) {
                    const target = resolveInternalHref(href, language, page);
                    if (target) return <Link to={target}>{children}</Link>;
                  }
                  return <a href={href} {...rest}>{children}</a>;
                },
                img: ({ src, alt, ...rest }) => {
                  const resolved = typeof src === 'string' ? (resolveImage(page, src) ?? src) : src;
                  return (
                    <img
                      src={resolved}
                      alt={alt ?? ''}
                      loading="lazy"
                      className="rounded-lg border border-[var(--border-default)] my-4 max-w-full h-auto"
                      {...rest}
                    />
                  );
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
    </>
  );

  // Wait for the session probe before picking a layout so we don't flash the
  // anonymous shell for logged-in users (or vice versa).
  if (sessionUser === null) {
    return <div className="min-h-screen bg-[var(--bg-secondary)]" />;
  }

  // Signed-in layout: full app shell with the global Sidebar.
  if (sessionUser) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex">
        <Sidebar userName={sessionUser.name} userRole={sessionUser.role} />
        <MobileNav userRole={sessionUser.role} />
        <div className="flex-1 lg:ml-[260px] flex flex-col min-h-screen">
          <main className="flex-1 pb-20 lg:pb-8">
            <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto bg-[var(--bg-primary)] min-h-full">
              <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
                {content}
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Anonymous (public) layout: standalone top bar, no app sidebar.
  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
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

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        {content}
      </div>
    </div>
  );
}

// ---------- Helpers ----------

// Resolve a relative markdown link ("subjects.md", "./users.md", "/docs/sr/exams")
// into an in-app /docs/<lang>/<slug> URL. Returns null if it can't be confidently
// mapped, so the caller falls back to a regular <a>.
function resolveInternalHref(
  href: string,
  language: DocsLanguage,
  _current: DocsPageData | undefined,
): string | null {
  const [bare, fragment] = href.split('#');
  const fragmentSuffix = fragment ? `#${fragment}` : '';

  if (!bare) return null;

  if (/^\/docs(\/|$)/.test(bare)) return bare + fragmentSuffix;

  // All non-README pages live at the language root, so we start from there.
  // Any `..` segments pop off the language; we squash that back to '' so we
  // still land on the language root.
  const segments: string[] = [];
  for (const part of bare.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') { segments.pop(); continue; }
    segments.push(part);
  }

  let last = segments[segments.length - 1] || '';
  last = last.replace(/\.md$/i, '');
  if (last === 'README') segments.pop();
  else if (last) segments[segments.length - 1] = last;

  const targetSlug = segments.join('/');
  if (!findPage(language, targetSlug)) return null;
  return `/docs/${language}/${targetSlug}${fragmentSuffix}`;
}

function DocsTopicNav({
  pages, language, activeSlug, mobileOpen, onClose, currentLang, onSwitchLanguage,
}: {
  pages: DocsPageData[];
  language: DocsLanguage;
  activeSlug: string;
  mobileOpen: boolean;
  onClose: () => void;
  currentLang: DocsLanguage;
  onSwitchLanguage: (next: DocsLanguage) => void;
}) {
  return (
    <>
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
        } lg:block lg:relative lg:w-auto lg:z-0 lg:p-0 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto bg-[var(--bg-elevated)] lg:bg-transparent border-r border-[var(--border-default)] lg:border-r-0`}
      >
        <nav className="space-y-4">
          <div className="flex flex-col">
            {pages.map((p) => (
              <Link
                key={p.slug || 'root'}
                to={`/docs/${language}${p.slug ? `/${p.slug}` : ''}`}
                onClick={onClose}
                className={`px-2 py-1.5 rounded-md text-sm transition-colors ${
                  activeSlug === p.slug
                    ? 'bg-accent-light text-accent font-medium'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                {p.title}
              </Link>
            ))}
          </div>

          {/* Language switcher inside the topic nav so signed-in users (who
              don't see the standalone top bar) can still flip language. */}
          <div className="pt-2 border-t border-[var(--border-subtle)]">
            <div className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Jezik / Language
            </div>
            <div className="flex items-center gap-1 p-0.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] w-fit">
              {(['sr', 'en'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => onSwitchLanguage(lang)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium uppercase tracking-wider transition-colors ${
                    currentLang === lang
                      ? 'bg-accent text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {lang === 'sr' ? 'SR' : 'EN'}
                </button>
              ))}
            </div>
          </div>
        </nav>
      </aside>
    </>
  );
}

function Breadcrumb({ language, title }: { language: DocsLanguage; title: string }) {
  const { t } = useLang();
  return (
    <div className="not-prose flex items-center gap-1.5 text-xs text-[var(--text-muted)] mb-1" style={{ marginTop: 0 }}>
      <Link to={`/docs/${language}`} className="hover:text-[var(--text-primary)]">{t('docs.home')}</Link>
      <ChevronRight size={12} />
      <span className="text-[var(--text-primary)] font-medium truncate">{title}</span>
    </div>
  );
}

function NotFound({ language }: { language: DocsLanguage }) {
  const { t } = useLang();
  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] p-10 text-center">
      <BookOpen size={32} className="mx-auto text-[var(--text-muted)] mb-3" />
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
