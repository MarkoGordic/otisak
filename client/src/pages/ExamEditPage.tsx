import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Loader2, ArrowLeft, Plus, Trash2, Code, Image as ImageIcon, FileText, MessageSquare,
  Settings, Download, Save, ChevronDown, ChevronUp, Upload as UploadIcon,
} from 'lucide-react';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import { useToast } from '../components/Toast';
import { AppCopyright } from '../components/AppCopyright';
import { Button } from '../components/ui/Button';
import { CodeBlock } from '../components/otisak';

type Exam = {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  pass_threshold: number;
  exam_mode: 'real' | 'practice';
  allow_review: boolean;
  shuffle_questions: boolean;
  shuffle_answers: boolean;
  partial_scoring: boolean;
  negative_points_enabled: boolean;
  negative_points_value: number;
  negative_points_threshold: number;
  status: string;
  subject_name?: string | null;
  question_count?: number;
};

type Answer = { id?: string; text: string; is_correct: boolean; position?: number };
type Question = {
  id: string;
  type: string;
  text: string;
  content: string | null;
  points: number;
  position: number;
  explanation: string | null;
  ai_grading_instructions: string | null;
  answers: Answer[];
};

type UserInfo = { name?: string; role?: string; avatar_url?: string };

// Map from question type -> i18n key + icon (label is resolved through `t()` at render time).
const TYPE_LABELS: Record<string, { labelKey: string; icon: React.ReactNode }> = {
  text: { labelKey: 'questions.multipleChoice', icon: <FileText size={14} /> },
  code: { labelKey: 'questions.code', icon: <Code size={14} /> },
  image: { labelKey: 'questions.image', icon: <ImageIcon size={14} /> },
  open_text: { labelKey: 'questions.openText', icon: <MessageSquare size={14} /> },
};

export default function ExamEditPage() {
  const navigate = useNavigate();
  const { examId } = useParams();
  const { t } = useLang();
  const toast = useToast();

  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // New question draft
  const blankAnswers = (): Answer[] => [
    { text: '', is_correct: true },
    { text: '', is_correct: false },
    { text: '', is_correct: false },
    { text: '', is_correct: false },
  ];
  const [draftType, setDraftType] = useState('text');
  const [draftText, setDraftText] = useState('');
  const [draftPoints, setDraftPoints] = useState('2');
  const [draftCode, setDraftCode] = useState('');
  const [draftLang, setDraftLang] = useState('python');
  const [draftImage, setDraftImage] = useState('');
  const [draftAnswers, setDraftAnswers] = useState<Answer[]>(blankAnswers());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/session', { credentials: 'include' });
      const data = await res.json();
      if (!data.authenticated || (data.user?.role !== 'admin' && data.user?.role !== 'assistant')) {
        navigate('/admin', { replace: true });
        return;
      }
      setUser({ name: data.user?.name, role: data.user?.role, avatar_url: data.user?.avatar_url });
    })();
  }, [navigate]);

  const load = useCallback(async () => {
    if (!examId) return;
    try {
      const [examsRes, qRes] = await Promise.all([
        fetch('/api/otisak/exams', { credentials: 'include' }),
        fetch(`/api/otisak/exams/${examId}/questions`, { credentials: 'include' }),
      ]);
      if (examsRes.ok) {
        const d = await examsRes.json();
        const found = (d.exams || []).find((e: Exam) => e.id === examId) || null;
        setExam(found);
      }
      if (qRes.ok) {
        const d = await qRes.json();
        const sorted = (d.questions || []).sort((a: Question, b: Question) => a.position - b.position);
        setQuestions(sorted);
      }
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => { if (user) load(); }, [user, load]);

  const handleSaveSettings = async () => {
    if (!exam) return;
    setSavingSettings(true);
    try {
      const res = await fetch('/api/otisak/exams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: exam.id,
          title: exam.title,
          description: exam.description,
          duration_minutes: Number(exam.duration_minutes) || 60,
          pass_threshold: Number(exam.pass_threshold) || 50,
          exam_mode: exam.exam_mode,
          allow_review: exam.allow_review,
          shuffle_questions: exam.shuffle_questions,
          shuffle_answers: exam.shuffle_answers,
          partial_scoring: exam.partial_scoring,
          negative_points_enabled: exam.negative_points_enabled,
          negative_points_value: Number(exam.negative_points_value) || 0,
          negative_points_threshold: Number(exam.negative_points_threshold) || 0,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('examEdit.saveFailed'));
        return;
      }
      // Sync local state to the server's truth so the form reflects what was
      // actually persisted (Postgres NUMERIC comes back as a string; the merge
      // below normalises those fields). Without this, the dropdown would still
      // *display* the chosen value but nothing in the UI confirmed the save.
      const saved = await res.json().catch(() => null);
      if (saved && typeof saved === 'object') {
        setExam((prev) => prev ? {
          ...prev,
          title: typeof saved.title === 'string' ? saved.title : prev.title,
          description: 'description' in saved ? saved.description : prev.description,
          duration_minutes: Number(saved.duration_minutes ?? prev.duration_minutes),
          pass_threshold: Number(saved.pass_threshold ?? prev.pass_threshold),
          exam_mode: saved.exam_mode === 'practice' ? 'practice' : 'real',
          allow_review: !!saved.allow_review,
          shuffle_questions: !!saved.shuffle_questions,
          shuffle_answers: !!saved.shuffle_answers,
          partial_scoring: !!saved.partial_scoring,
          negative_points_enabled: !!saved.negative_points_enabled,
          negative_points_value: Number(saved.negative_points_value ?? prev.negative_points_value),
          negative_points_threshold: Number(saved.negative_points_threshold ?? prev.negative_points_threshold),
        } : prev);
      }
      toast.success(t('examEdit.saveSuccess'));
    } catch {
      toast.error(t('examEdit.saveFailed'));
    } finally {
      setSavingSettings(false);
    }
  };

  const resetDraft = () => {
    setDraftText('');
    setDraftCode('');
    setDraftImage('');
    setDraftPoints('2');
    setDraftAnswers(blankAnswers());
  };

  const handleAddQuestion = async () => {
    if (!draftText.trim()) return;
    if (draftType === 'code' && !draftCode.trim()) return;
    if (draftType === 'image' && !draftImage.trim()) return;

    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        type: draftType,
        text: draftText,
        points: Number(draftPoints) || 1,
        answers: draftType === 'open_text' ? [] : draftAnswers.filter((a) => a.text.trim()),
      };
      if (draftType === 'code') {
        body.content = JSON.stringify({ snippet: draftCode, language: draftLang || null });
      } else if (draftType === 'image') {
        body.content = draftImage;
      }
      const res = await fetch(`/api/otisak/exams/${examId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || t('examEdit.addFailed'));
        return;
      }
      resetDraft();
      load();
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteQuestion = async (qid: string) => {
    if (!confirm(t('examEdit.confirmDelete'))) return;
    await fetch(`/api/otisak/exams/${examId}/questions`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id: qid }),
    });
    setQuestions((qs) => qs.filter((q) => q.id !== qid));
  };

  const handleImageFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert(t('questions.imageInvalidType')); return; }
    if (file.size > 4 * 1024 * 1024) { alert(t('questions.imageTooBig')); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') setDraftImage(reader.result); };
    reader.readAsDataURL(file);
  };

  if (!user || loading) {
    return <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  if (!exam) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center">
        <p className="text-[var(--text-secondary)]">{t('examEdit.notFound')}</p>
      </div>
    );
  }

  const totalPoints = questions.reduce((s, q) => s + Number(q.points || 0), 0);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex">
      <Sidebar userName={user.name} userRole={user.role} userAvatar={user.avatar_url} />
      <MobileNav userName={user.name} userRole={user.role} />

      <div className="flex-1 lg:ml-[260px] flex flex-col min-h-screen">
        <main className="flex-1 pb-20 lg:pb-8">
          <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto bg-[var(--bg-primary)] min-h-full">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <button onClick={() => navigate('/manage')} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                  <ArrowLeft size={20} />
                </button>
                <div className="min-w-0">
                  <h1 className="text-2xl font-display font-bold text-[var(--text-primary)] truncate">{exam.title}</h1>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {questions.length} {t('examEdit.questions')} · {totalPoints} {t('questions.pts')} · {exam.status}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/otisak/exams/${exam.id}/export-json`}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-medium hover:border-accent hover:text-accent transition-colors"
                >
                  <Download size={14} />{t('manage.exportJson')}
                </a>
              </div>
            </div>

            {/* Settings */}
            <section className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] mb-6">
              <button
                type="button"
                onClick={() => setShowSettings((s) => !s)}
                className="w-full flex items-center justify-between gap-3 p-5 text-left"
              >
                <div className="flex items-center gap-3">
                  <Settings size={16} className="text-accent" />
                  <span className="text-sm font-medium text-[var(--text-primary)]">{t('examEdit.settings')}</span>
                </div>
                {showSettings ? <ChevronUp size={16} className="text-[var(--text-muted)]" /> : <ChevronDown size={16} className="text-[var(--text-muted)]" />}
              </button>
              {showSettings && (
                <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label={t('examEdit.title')}>
                    <input value={exam.title} onChange={(e) => setExam({ ...exam, title: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" />
                  </Field>
                  <Field label={t('examEdit.description')}>
                    <input value={exam.description ?? ''} onChange={(e) => setExam({ ...exam, description: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" />
                  </Field>
                  <Field label={t('examEdit.duration')}>
                    <input type="number" min={1} value={exam.duration_minutes} onChange={(e) => setExam({ ...exam, duration_minutes: Number(e.target.value) })} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" />
                  </Field>
                  <Field label={t('examEdit.passThreshold')}>
                    <input type="number" min={0} max={100} value={exam.pass_threshold} onChange={(e) => setExam({ ...exam, pass_threshold: Number(e.target.value) })} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" />
                  </Field>
                  <Field label={t('examEdit.examMode')}>
                    <select value={exam.exam_mode} onChange={(e) => setExam({ ...exam, exam_mode: e.target.value as Exam['exam_mode'] })} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm">
                      <option value="real">{t('examEdit.modeReal')}</option>
                      <option value="practice">{t('examEdit.modePractice')}</option>
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-2 col-span-1 sm:col-span-2">
                    <Toggle label={t('examEdit.allowReview')} value={exam.allow_review} onChange={(v) => setExam({ ...exam, allow_review: v })} />
                    <Toggle label={t('examEdit.shuffleQuestions')} value={exam.shuffle_questions} onChange={(v) => setExam({ ...exam, shuffle_questions: v })} />
                    <Toggle label={t('examEdit.shuffleAnswers')} value={exam.shuffle_answers} onChange={(v) => setExam({ ...exam, shuffle_answers: v })} />
                    <Toggle label={t('examEdit.partialScoring')} value={exam.partial_scoring} onChange={(v) => setExam({ ...exam, partial_scoring: v })} />
                  </div>

                  <div className="col-span-1 sm:col-span-2 flex justify-end">
                    <Button variant="primary" leftIcon={<Save size={14} />} loading={savingSettings} onClick={handleSaveSettings}>
                      {t('examEdit.saveSettings')}
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {/* Add question */}
            <section className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] p-5 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Plus size={16} className="text-accent" />
                <span className="text-sm font-medium text-[var(--text-primary)]">{t('examEdit.addQuestion')}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <Field label={t('questions.type')}>
                  <select value={draftType} onChange={(e) => setDraftType(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm">
                    <option value="text">{t('questions.multipleChoice')}</option>
                    <option value="code">{t('questions.code')}</option>
                    <option value="image">{t('questions.image')}</option>
                    <option value="open_text">{t('questions.openText')}</option>
                  </select>
                </Field>
                <Field label={t('questions.pts')}>
                  <input type="number" min={0} value={draftPoints} onChange={(e) => setDraftPoints(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" />
                </Field>
              </div>

              <Field label={t('questions.questionText')}>
                <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} className="w-full h-20 px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm resize-none" />
              </Field>

              {draftType === 'code' && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <Field label={t('questions.codeSnippet')}>
                      <textarea value={draftCode} onChange={(e) => setDraftCode(e.target.value)} spellCheck={false} className="w-full h-32 px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[#0d1117] text-gray-200 text-xs font-mono resize-y" />
                    </Field>
                  </div>
                  <div>
                    <Field label={t('questions.codeLanguage')}>
                      <select value={draftLang} onChange={(e) => setDraftLang(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm">
                        {['python','javascript','typescript','java','csharp','cpp','c','sql','bash','go','rust','php','ruby','html','css','json','xml','yaml',''].map((v) => (
                          <option key={v} value={v}>{v || t('questions.codeLanguageAuto')}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  {draftCode.trim() && (
                    <div className="sm:col-span-3">
                      <CodeBlock code={draftCode} language={draftLang || undefined} />
                    </div>
                  )}
                </div>
              )}

              {draftType === 'image' && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 h-10 px-3 rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--bg-primary)] text-sm text-[var(--text-secondary)] hover:border-accent hover:text-accent transition-colors">
                      <UploadIcon size={14} />{t('questions.imageUpload')}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageFile(e.target.files?.[0] || null)} />
                    </label>
                    <input value={draftImage.startsWith('data:') ? '' : draftImage} onChange={(e) => setDraftImage(e.target.value)} className="flex-1 h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('questions.imageUrlPlaceholder')} />
                  </div>
                  {draftImage && (
                    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] p-2">
                      <img src={draftImage} alt="preview" className="max-h-48 max-w-full rounded mx-auto block" />
                    </div>
                  )}
                </div>
              )}

              {draftType !== 'open_text' && (
                <div className="mt-3 space-y-2">
                  <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{t('examEdit.answers')}</span>
                  {draftAnswers.map((a, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <button type="button" onClick={() => setDraftAnswers((prev) => prev.map((x, j) => j === i ? { ...x, is_correct: !x.is_correct } : x))} className={`w-7 h-7 rounded flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors ${a.is_correct ? 'bg-success text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}`}>
                        {a.is_correct ? '✓' : String.fromCharCode(65 + i)}
                      </button>
                      <input value={a.text} onChange={(e) => setDraftAnswers((prev) => prev.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} className="flex-1 h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={`${t('examEdit.answer')} ${String.fromCharCode(65 + i)}`} />
                      {draftAnswers.length > 2 && (
                        <button type="button" onClick={() => setDraftAnswers((prev) => prev.filter((_, j) => j !== i))} className="text-[var(--text-muted)] hover:text-danger p-1" title={t('examEdit.removeAnswer')}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => setDraftAnswers((prev) => [...prev, { text: '', is_correct: false }])} className="text-xs text-accent hover:text-accent-hover">
                    + {t('examEdit.addAnswer')}
                  </button>
                </div>
              )}

              <div className="flex justify-end mt-3">
                <Button variant="primary" leftIcon={<Plus size={14} />} loading={creating} onClick={handleAddQuestion}>
                  {t('examEdit.addQuestion')}
                </Button>
              </div>
            </section>

            {/* Existing questions */}
            <section>
              <h2 className="text-xs uppercase tracking-widest text-[var(--text-muted)] font-semibold mb-3">{t('examEdit.questions')} ({questions.length})</h2>
              {questions.length === 0 ? (
                <div className="text-sm text-[var(--text-muted)] text-center py-12 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)]">
                  {t('examEdit.empty')}
                </div>
              ) : (
                <div className="space-y-2">
                  {questions.map((q, idx) => {
                    const isOpen = expanded.has(q.id);
                    const typeInfo = TYPE_LABELS[q.type] || { labelKey: '', icon: <FileText size={14} /> };
                    const typeLabel = typeInfo.labelKey ? t(typeInfo.labelKey) : q.type;
                    // Surface multi-select status as a chip so the admin can verify at a
                    // glance whether two or more answers were marked correct (multi_answer
                    // is derived server-side from the is_correct count).
                    const correctCount = q.answers.filter((a) => a.is_correct).length;
                    const isMultiAnswer = correctCount > 1;
                    return (
                      <div key={q.id} className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)]">
                        <button type="button" onClick={() => toggleExpand(q.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                          <span className="text-xs font-mono text-[var(--text-muted)] w-6 flex-shrink-0">{idx + 1}.</span>
                          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-accent bg-accent-light px-2 py-0.5 rounded-full">
                            {typeInfo.icon}
                            {typeLabel}
                          </span>
                          {isMultiAnswer && (
                            <span className="text-[10px] uppercase tracking-wider text-warning bg-warning-light px-2 py-0.5 rounded-full">
                              {t('examEdit.multiAnswer')}
                            </span>
                          )}
                          <span className="flex-1 text-sm text-[var(--text-primary)] truncate">{q.text}</span>
                          <span className="text-xs font-mono text-[var(--text-secondary)]">{Number(q.points)} {t('questions.pts')}</span>
                          {isOpen ? <ChevronUp size={14} className="text-[var(--text-muted)]" /> : <ChevronDown size={14} className="text-[var(--text-muted)]" />}
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4 border-t border-[var(--border-subtle)] pt-3">
                            <p className="text-sm text-[var(--text-primary)] mb-2 whitespace-pre-wrap">{q.text}</p>
                            {q.type === 'code' && q.content && (() => {
                              try {
                                const parsed = JSON.parse(q.content) as { snippet?: string; language?: string };
                                if (parsed.snippet) return <CodeBlock code={parsed.snippet} language={parsed.language || undefined} />;
                              } catch { /* fallthrough */ }
                              return <CodeBlock code={q.content} />;
                            })()}
                            {q.type === 'image' && q.content && (
                              <img src={q.content} alt="" className="max-h-60 max-w-full rounded mx-auto block bg-white p-1" />
                            )}
                            {q.answers.length > 0 && (
                              <ul className="mt-2 space-y-1">
                                {q.answers.map((a, i) => (
                                  <li key={a.id ?? i} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${a.is_correct ? 'bg-success-light text-success' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
                                    <span className="font-mono">{String.fromCharCode(65 + i)}.</span>
                                    <span>{a.text}</span>
                                    {a.is_correct && <span className="ml-auto text-[10px] uppercase tracking-wider">✓</span>}
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="flex justify-end mt-3">
                              <Button variant="ghost" size="sm" leftIcon={<Trash2 size={14} />} onClick={() => handleDeleteQuestion(q.id)} className="text-danger hover:bg-danger-light">
                                {t('examEdit.delete')}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
          <div className="px-4 pb-6 pt-2 flex justify-center"><AppCopyright /></div>
        </main>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${value ? 'border-accent bg-accent-light text-accent' : 'border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-secondary)]'}`}
    >
      <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${value ? 'border-accent bg-accent' : 'border-[var(--border-default)]'}`} />
      <span>{label}</span>
    </button>
  );
}
