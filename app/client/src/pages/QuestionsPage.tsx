import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Search, BookOpen, FileText, X } from 'lucide-react';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import { AppCopyright } from '../components/AppCopyright';
import { useToast } from '../components/Toast';
import { Button } from '../components/ui/Button';
import { Dropdown } from '../components/ui/Dropdown';
import { EmptyState } from '../components/ui/EmptyState';
import { BankQuestionCard } from '../components/questions/BankQuestionCard';
import { CreateBankQuestionModal } from '../components/questions/CreateBankQuestionModal';
import type { BankQuestion, BankSubject, BankTagCount } from '../components/questions/types';

type UserInfo = { name?: string; role?: string; avatar_url?: string };

const PAGE_SIZE = 50;
const SUBJECT_KEY = 'otisak.bank.subject';

function readStoredSubject(): string {
  try {
    return localStorage.getItem(SUBJECT_KEY) || '';
  } catch {
    return '';
  }
}

export default function QuestionBankPage() {
  const navigate = useNavigate();
  const { t } = useLang();
  const toast = useToast();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<BankSubject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [total, setTotal] = useState(0); // matches the current filters
  const [subjectTotal, setSubjectTotal] = useState(0); // the whole subject
  const [tagCounts, setTagCounts] = useState<BankTagCount[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/session', { credentials: 'include' });
      const data = await res.json();
      if (
        !data.authenticated ||
        (data.user?.role !== 'admin' &&
          data.user?.role !== 'assistant' &&
          data.user?.role !== 'professor')
      ) {
        navigate('/dashboard', { replace: true });
        return;
      }
      setUser({ name: data.user?.name, role: data.user?.role, avatar_url: data.user?.avatar_url });

      // Only subjects this user may open: assistants get their assigned ones.
      const subRes = await fetch('/api/otisak/questions/subjects', { credentials: 'include' });
      if (subRes.ok) {
        const d = await subRes.json();
        const list: BankSubject[] = d.subjects || [];
        setSubjects(list);
        const stored = readStoredSubject();
        setSelectedSubject(list.some((s) => s.id === stored) ? stored : list[0]?.id || '');
      }
      setLoading(false);
    })();
  }, [navigate]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  const changeSubject = (id: string) => {
    setSelectedSubject(id);
    // A tag from one subject almost never exists in another; keeping it would
    // open the new subject on an empty list.
    setTagFilter('');
    try {
      localStorage.setItem(SUBJECT_KEY, id);
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  };

  const loadQuestions = useCallback(
    async (offset: number) => {
      if (!selectedSubject) return;
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      const params = new URLSearchParams({
        subject_id: selectedSubject,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (typeFilter) params.set('type', typeFilter);
      if (tagFilter) params.set('tag', tagFilter);

      setListLoading(true);
      try {
        const res = await fetch(`/api/otisak/questions?${params}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!res.ok) {
          toast.error(t('questions.loadFailed'));
          return;
        }
        const d = await res.json();
        const page: BankQuestion[] = d.questions || [];
        setQuestions((prev) => (offset === 0 ? page : [...prev, ...page]));
        setTotal(d.total || 0);
        setSubjectTotal(d.subject_total || 0);
        setTagCounts(d.tags || []);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') toast.error(t('questions.loadFailed'));
      } finally {
        if (requestRef.current === controller) setListLoading(false);
      }
    },
    [selectedSubject, debouncedSearch, typeFilter, tagFilter, toast, t],
  );

  useEffect(() => {
    loadQuestions(0);
  }, [loadQuestions]);

  const handleDelete = async (q: BankQuestion) => {
    if (!confirm(t('questions.deleteConfirm'))) return;
    try {
      const res = await fetch(`/api/otisak/questions?id=${q.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        toast.success(t('examEdit.questionDeleted'));
        // Update in place so the reviewer keeps their scroll position and loaded pages.
        setQuestions((prev) => prev.filter((x) => x.id !== q.id));
        setTotal((n) => Math.max(0, n - 1));
        setSubjectTotal((n) => Math.max(0, n - 1));
        setTagCounts((prev) =>
          prev
            .map((tc) => (q.tags.includes(tc.tag) ? { ...tc, count: tc.count - 1 } : tc))
            .filter((tc) => tc.count > 0),
        );
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('examEdit.questionDeleteFailed'));
      }
    } catch {
      toast.error(t('examEdit.questionDeleteFailed'));
    }
  };

  const subjectName = subjects.find((s) => s.id === selectedSubject)?.name || '';
  const filtered = Boolean(debouncedSearch || typeFilter || tagFilter);
  // New code questions default to the language this subject already uses most.
  const defaultCodeLanguage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const q of questions)
      if (q.code_language) counts.set(q.code_language, (counts.get(q.code_language) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'python';
  }, [questions]);

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('');
    setTagFilter('');
  };

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  const chipClass = (active: boolean) =>
    `inline-flex flex-shrink-0 whitespace-nowrap items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
      active
        ? 'bg-accent text-white border-accent'
        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--text-muted)]'
    }`;

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex">
      <Sidebar userName={user.name} userRole={user.role} userAvatar={user.avatar_url} />
      <MobileNav userName={user.name} userRole={user.role} />

      <div className="flex-1 min-w-0 lg:ml-[260px] flex flex-col min-h-screen">
        <main className="flex-1 pb-20 lg:pb-8">
          <div className="p-4 sm:p-6 lg:p-8 max-w-[1100px] mx-auto min-h-full">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-accent-light flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-6 h-6 text-accent" strokeWidth={1.5} />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-display font-bold text-[var(--text-primary)]">
                    {t('questions.title')}
                  </h1>
                  {subjectName && (
                    <p className="text-sm text-[var(--text-secondary)] truncate">
                      {t('questions.subtitleSubject', {
                        subject: subjectName,
                        total: subjectTotal,
                      })}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="primary"
                leftIcon={<Plus size={16} />}
                onClick={() => setShowCreate(true)}
                disabled={!selectedSubject}
              >
                {t('questions.add')}
              </Button>
            </div>

            {/* Filters: sticky so they stay reachable deep in a long bank */}
            <div className="sm:sticky sm:top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 mb-4 bg-[color-mix(in_srgb,var(--bg-secondary)_90%,transparent)] backdrop-blur border-b border-[var(--border-subtle)]">
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-full sm:w-[240px]">
                  <Dropdown
                    options={subjects.map((s) => ({ value: s.id, label: s.name }))}
                    value={selectedSubject}
                    onChange={changeSubject}
                    placeholder={t('questions.selectSubject')}
                  />
                </div>
                <div className="w-[160px]">
                  <Dropdown
                    options={[
                      { value: '', label: t('questions.allTypes') },
                      { value: 'text', label: t('questions.multipleChoice') },
                      { value: 'code', label: t('questions.code') },
                      { value: 'image', label: t('questions.image') },
                      { value: 'open_text', label: t('questions.openText') },
                    ]}
                    value={typeFilter}
                    onChange={setTypeFilter}
                  />
                </div>
                <div className="relative flex-1 min-w-[200px]">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full h-9 pl-8 pr-8 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm focus:border-accent focus:ring-0"
                    placeholder={t('questions.searchPlaceholder')}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      aria-label={t('questions.clearSearch')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              {tagCounts.length > 0 && (
                <div className="flex flex-nowrap sm:flex-wrap items-center gap-1.5 mt-3 overflow-x-auto sm:overflow-visible pb-1 sm:pb-0 [scrollbar-width:none]">
                  <button
                    type="button"
                    onClick={() => setTagFilter('')}
                    className={chipClass(tagFilter === '')}
                  >
                    {t('questions.allTags')}
                  </button>
                  {tagCounts.map(({ tag, count }) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
                      className={chipClass(tagFilter === tag)}
                    >
                      {tag}
                      <span
                        className={`tabular-nums text-[10px] ${tagFilter === tag ? 'text-white/80' : 'text-[var(--text-muted)]'}`}
                      >
                        {count}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {filtered && (
              <div className="flex items-center gap-3 mb-3 text-xs text-[var(--text-secondary)]">
                <span>{t('questions.filteredCount', { count: total, total: subjectTotal })}</span>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-accent hover:text-accent-hover"
                >
                  {t('questions.clearFilters')}
                </button>
              </div>
            )}

            {/* Questions List */}
            {subjects.length === 0 ? (
              <EmptyState
                icon={<BookOpen size={32} strokeWidth={1.5} />}
                title={t('questions.noSubjects')}
                description={t('questions.noSubjectsDesc')}
              />
            ) : questions.length > 0 ? (
              <div className="space-y-3">
                {questions.map((q, idx) => (
                  <BankQuestionCard
                    key={q.id}
                    question={q}
                    number={idx + 1}
                    animationIndex={idx % PAGE_SIZE}
                    activeTag={tagFilter}
                    onTagClick={(tag) => setTagFilter(tagFilter === tag ? '' : tag)}
                    onDelete={() => handleDelete(q)}
                  />
                ))}
                {questions.length < total && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="secondary"
                      loading={listLoading}
                      onClick={() => loadQuestions(questions.length)}
                    >
                      {t('questions.loadMore', {
                        shown: questions.length,
                        total,
                      })}
                    </Button>
                  </div>
                )}
              </div>
            ) : listLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-accent" />
              </div>
            ) : (
              <EmptyState
                icon={<FileText size={32} strokeWidth={1.5} />}
                title={t(filtered ? 'questions.noMatches' : 'questions.noQuestions')}
                description={t(filtered ? 'questions.noMatchesDesc' : 'questions.noQuestionsDesc')}
                actionLabel={filtered ? t('questions.clearFilters') : t('questions.add')}
                onAction={filtered ? clearFilters : () => setShowCreate(true)}
              />
            )}
          </div>
          <div className="px-4 pb-6 pt-2 flex justify-center">
            <AppCopyright />
          </div>
        </main>
      </div>

      {showCreate && selectedSubject && (
        <CreateBankQuestionModal
          subjectId={selectedSubject}
          defaultCodeLanguage={defaultCodeLanguage}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadQuestions(0);
          }}
        />
      )}
    </div>
  );
}
