import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Loader2, Plus, Trash2, Search, BookOpen, Tag, FileText, Code, Image, MessageSquare, Upload,
} from 'lucide-react';
import { CodeBlock } from '../components/otisak';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Dropdown } from '../components/ui/Dropdown';
import { EmptyState } from '../components/ui/EmptyState';

type Subject = { id: string; name: string; code: string | null };
type BankQuestion = {
  id: string;
  subject_id: string;
  subject_name: string;
  type: string;
  text: string;
  points: number;
  tags: string[];
  answers: Array<{ id: string; text: string; is_correct: boolean }>;
  created_at: string;
};

type UserInfo = { name?: string; role?: string; avatar_url?: string };

const typeIcons: Record<string, React.ReactNode> = {
  text: <FileText size={14} />,
  code: <Code size={14} />,
  image: <Image size={14} />,
  open_text: <MessageSquare size={14} />,
};

export default function QuestionBankPage() {
  const navigate = useNavigate();
  const { t } = useLang();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [allTags, setAllTags] = useState<string[]>([]);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newText, setNewText] = useState('');
  const [newType, setNewType] = useState('text');
  const [newPoints, setNewPoints] = useState('1');
  const [newTags, setNewTags] = useState('');
  const [newCodeSnippet, setNewCodeSnippet] = useState('');
  const [newCodeLanguage, setNewCodeLanguage] = useState('python');
  const [newImageUrl, setNewImageUrl] = useState(''); // either http(s) URL or data:image/...
  const [imageError, setImageError] = useState('');
  const [newAnswers, setNewAnswers] = useState([
    { text: '', is_correct: true },
    { text: '', is_correct: false },
    { text: '', is_correct: false },
    { text: '', is_correct: false },
  ]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/session', { credentials: 'include' });
      const data = await res.json();
      if (!data.authenticated || (data.user?.role !== 'admin' && data.user?.role !== 'assistant')) {
        navigate('/dashboard', { replace: true });
        return;
      }
      setUser({ name: data.user?.name, role: data.user?.role, avatar_url: data.user?.avatar_url });

      const subRes = await fetch('/api/otisak/subjects', { credentials: 'include' });
      if (subRes.ok) {
        const d = await subRes.json();
        setSubjects(d.subjects || []);
        if (d.subjects?.length > 0) setSelectedSubject(d.subjects[0].id);
      }
      setLoading(false);
    })();
  }, [navigate]);

  const loadQuestions = useCallback(async () => {
    if (!selectedSubject) return;
    const params = new URLSearchParams({ subject_id: selectedSubject });
    if (search) params.set('search', search);
    if (typeFilter) params.set('type', typeFilter);
    if (tagFilter) params.set('tag', tagFilter);

    const res = await fetch(`/api/otisak/questions?${params}`, { credentials: 'include' });
    if (res.ok) {
      const d = await res.json();
      setQuestions(d.questions || []);
      setTotal(d.total || 0);
      // Refresh global tag list when no tag filter is applied so chips don't collapse mid-filter.
      if (!tagFilter) {
        const seen = new Set<string>();
        for (const q of d.questions || []) for (const tag of (q.tags as string[] | undefined) || []) seen.add(tag);
        setAllTags(Array.from(seen).sort());
      }
    }
  }, [selectedSubject, search, typeFilter, tagFilter]);

  useEffect(() => { loadQuestions(); }, [loadQuestions]);

  const resetForm = () => {
    setNewText('');
    setNewTags('');
    setNewCodeSnippet('');
    setNewCodeLanguage('python');
    setNewImageUrl('');
    setImageError('');
    setNewAnswers([
      { text: '', is_correct: true },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
    ]);
  };

  const handleCreate = async () => {
    if (!newText.trim() || !selectedSubject) return;
    if (newType === 'code' && !newCodeSnippet.trim()) {
      alert(t('questions.codeRequired'));
      return;
    }
    if (newType === 'image' && !newImageUrl.trim()) {
      alert(t('questions.imageRequired'));
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/otisak/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subject_id: selectedSubject,
          type: newType,
          text: newText,
          points: parseInt(newPoints) || 1,
          tags: newTags.split(',').map(t => t.trim()).filter(Boolean),
          code_snippet: newType === 'code' ? newCodeSnippet : null,
          code_language: newType === 'code' ? (newCodeLanguage || null) : null,
          image_url: newType === 'image' ? newImageUrl : null,
          answers: newType === 'open_text' ? [] : newAnswers.filter(a => a.text.trim()),
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        resetForm();
        loadQuestions();
      } else {
        const d = await res.json();
        alert(d.error || 'Failed to create question');
      }
    } catch { alert('Error'); }
    finally { setCreating(false); }
  };

  const handleImageFile = (file: File | null) => {
    setImageError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setImageError(t('questions.imageInvalidType'));
      return;
    }
    if (file.size > 4 * 1024 * 1024) { // 4 MB cap — fits within the server's 5 MB JSON limit with overhead
      setImageError(t('questions.imageTooBig'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') setNewImageUrl(result);
    };
    reader.onerror = () => setImageError(t('questions.imageReadFailed'));
    reader.readAsDataURL(file);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('questions.deleteConfirm'))) return;
    await fetch(`/api/otisak/questions?id=${id}`, { method: 'DELETE', credentials: 'include' });
    loadQuestions();
  };

  if (!user || loading) {
    return <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex">
      <Sidebar userName={user.name} userRole={user.role} userAvatar={user.avatar_url} />
      <MobileNav userName={user.name} userRole={user.role} />

      <div className="flex-1 lg:ml-[260px] flex flex-col min-h-screen">
        <main className="flex-1 pb-20 lg:pb-8">
          <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto bg-[var(--bg-primary)] min-h-full">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-accent-light flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-accent" strokeWidth={1.5} />
                </div>
                <div>
                  <h1 className="text-2xl font-display font-bold text-[var(--text-primary)]">{t('questions.title')}</h1>
                  <p className="text-sm text-[var(--text-secondary)]">{total} questions across {subjects.length} subjects</p>
                </div>
              </div>
              <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => setShowCreate(true)}>
                {t('questions.add')}
              </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="w-[200px]">
                <Dropdown
                  options={subjects.map(s => ({ value: s.id, label: s.name }))}
                  value={selectedSubject}
                  onChange={setSelectedSubject}
                  placeholder="Select subject"
                />
              </div>
              <div className="w-[140px]">
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
              <div className="relative flex-1 min-w-[200px] max-w-[300px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 pl-8 pr-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm focus:border-accent focus:ring-0"
                  placeholder={t('questions.searchPlaceholder')}
                />
              </div>
            </div>

            {/* Tag chips — clickable filter, derived from full subject tag set */}
            {(() => {
              const tags = allTags;
              if (tags.length === 0 && !tagFilter) return null;
              return (
                <div className="flex flex-wrap items-center gap-2 mb-6">
                  <Tag size={12} className="text-[var(--text-muted)]" />
                  <button
                    type="button"
                    onClick={() => setTagFilter('')}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      tagFilter === ''
                        ? 'bg-accent text-white border-accent'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--text-muted)]'
                    }`}
                  >
                    {t('questions.allTags')}
                  </button>
                  {tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        tagFilter === tag
                          ? 'bg-accent text-white border-accent'
                          : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--text-muted)]'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                  {tagFilter && !tags.includes(tagFilter) && (
                    <button
                      type="button"
                      onClick={() => setTagFilter('')}
                      className="text-xs px-2.5 py-1 rounded-full bg-accent text-white border border-accent"
                    >
                      {tagFilter} <span aria-hidden>×</span>
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Questions List */}
            {subjects.length === 0 ? (
              <EmptyState icon={<BookOpen size={32} strokeWidth={1.5} />} title={t('questions.noSubjects')} description={t('questions.noSubjectsDesc')} />
            ) : questions.length > 0 ? (
              <div className="space-y-2">
                {questions.map((q, idx) => (
                  <motion.div key={q.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }}
                    className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] p-4 hover:border-[var(--text-muted)] transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="neutral" size="sm">{typeIcons[q.type]} {q.type}</Badge>
                          <Badge variant="accent" size="sm">{q.points} {t('questions.pts')}</Badge>
                          {q.tags.map(tag => (
                            <Badge key={tag} variant="info" size="sm"><Tag size={10} className="mr-0.5" />{tag}</Badge>
                          ))}
                        </div>
                        <p className="text-sm text-[var(--text-primary)] line-clamp-2">{q.text}</p>
                        {q.answers.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {q.answers.map(a => (
                              <span key={a.id} className={`text-[11px] px-2 py-0.5 rounded ${a.is_correct ? 'bg-success-light text-success' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}`}>
                                {a.text.substring(0, 40)}{a.text.length > 40 ? '...' : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(q.id)} className="text-danger hover:bg-danger-light flex-shrink-0">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <EmptyState icon={<FileText size={32} strokeWidth={1.5} />} title={t('questions.noQuestions')} description={t('questions.noQuestionsDesc')} actionLabel={t('questions.add')} onAction={() => setShowCreate(true)} />
            )}
          </div>
        </main>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] shadow-lg w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-display font-semibold text-[var(--text-primary)] mb-4">{t('questions.addTitle')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t('questions.type')}</label>
                <Dropdown options={[
                  { value: 'text', label: t('questions.multipleChoice') },
                  { value: 'code', label: t('questions.code') },
                  { value: 'image', label: t('questions.image') },
                  { value: 'open_text', label: t('questions.openText') },
                ]} value={newType} onChange={setNewType} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t('questions.questionText')}</label>
                <textarea value={newText} onChange={(e) => setNewText(e.target.value)}
                  className="w-full h-24 px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm resize-none" placeholder="Enter question..." />
              </div>

              {/* Code question: snippet + language picker + live highlight preview */}
              {newType === 'code' && (
                <>
                  <div className="grid grid-cols-3 gap-3 items-end">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t('questions.codeSnippet')}</label>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{t('questions.codeLanguage')}</label>
                      <Dropdown
                        options={[
                          { value: 'python', label: 'Python' },
                          { value: 'javascript', label: 'JavaScript' },
                          { value: 'typescript', label: 'TypeScript' },
                          { value: 'java', label: 'Java' },
                          { value: 'csharp', label: 'C#' },
                          { value: 'cpp', label: 'C++' },
                          { value: 'c', label: 'C' },
                          { value: 'sql', label: 'SQL' },
                          { value: 'bash', label: 'Bash' },
                          { value: 'go', label: 'Go' },
                          { value: 'rust', label: 'Rust' },
                          { value: 'php', label: 'PHP' },
                          { value: 'ruby', label: 'Ruby' },
                          { value: 'html', label: 'HTML' },
                          { value: 'css', label: 'CSS' },
                          { value: 'json', label: 'JSON' },
                          { value: 'xml', label: 'XML' },
                          { value: 'yaml', label: 'YAML' },
                          { value: '', label: t('questions.codeLanguageAuto') },
                        ]}
                        value={newCodeLanguage}
                        onChange={setNewCodeLanguage}
                      />
                    </div>
                  </div>
                  <textarea
                    value={newCodeSnippet}
                    onChange={(e) => setNewCodeSnippet(e.target.value)}
                    spellCheck={false}
                    className="w-full h-44 px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[#0d1117] text-gray-200 text-xs font-mono resize-y"
                    placeholder={'def add(a, b):\n    return a + b'}
                  />
                  {newCodeSnippet.trim() && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1">{t('questions.codePreview')}</p>
                      <CodeBlock code={newCodeSnippet} language={newCodeLanguage || undefined} />
                    </div>
                  )}
                </>
              )}

              {/* Image question: file upload OR pasted URL + preview */}
              {newType === 'image' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-[var(--text-secondary)]">{t('questions.imageSection')}</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 h-10 px-3 rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--bg-primary)] text-sm text-[var(--text-secondary)] hover:border-accent hover:text-accent transition-colors">
                      <Upload size={14} />
                      {t('questions.imageUpload')}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleImageFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    <input
                      value={newImageUrl.startsWith('data:') ? '' : newImageUrl}
                      onChange={(e) => { setImageError(''); setNewImageUrl(e.target.value); }}
                      className="flex-1 h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm"
                      placeholder={t('questions.imageUrlPlaceholder')}
                    />
                  </div>
                  {imageError && <p className="text-xs text-danger">{imageError}</p>}
                  {newImageUrl && (
                    <div className="mt-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] p-2">
                      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1">{t('questions.imagePreview')}</p>
                      <img
                        src={newImageUrl}
                        alt="Preview"
                        className="max-h-60 max-w-full rounded-md mx-auto block"
                        onError={() => setImageError(t('questions.imageInvalidUrl'))}
                      />
                      <button type="button" onClick={() => { setNewImageUrl(''); setImageError(''); }} className="mt-2 text-xs text-danger hover:underline">{t('questions.imageClear')}</button>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Points</label>
                  <input type="number" value={newPoints} onChange={(e) => setNewPoints(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Tags (comma-separated)</label>
                  <input value={newTags} onChange={(e) => setNewTags(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder="tag1, tag2" />
                </div>
              </div>

              {newType !== 'open_text' && (
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Answers</label>
                  <div className="space-y-2">
                    {newAnswers.map((a, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <button type="button" onClick={() => {
                          setNewAnswers(prev => prev.map((ans, j) => j === i ? { ...ans, is_correct: !ans.is_correct } : ans));
                        }} className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors ${a.is_correct ? 'bg-success text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}`}>
                          {a.is_correct ? '✓' : String.fromCharCode(65 + i)}
                        </button>
                        <input value={a.text} onChange={(e) => {
                          setNewAnswers(prev => prev.map((ans, j) => j === i ? { ...ans, text: e.target.value } : ans));
                        }} className="flex-1 h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm"
                          placeholder={`Answer ${String.fromCharCode(65 + i)}`} />
                      </div>
                    ))}
                    <button type="button" onClick={() => setNewAnswers(prev => [...prev, { text: '', is_correct: false }])}
                      className="text-xs text-accent hover:text-accent-hover">+ Add answer</button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <Button variant="secondary" onClick={() => setShowCreate(false)}>{t('questions.cancel')}</Button>
              <Button variant="primary" loading={creating} onClick={handleCreate}>{t('questions.createQuestion')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
