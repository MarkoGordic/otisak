import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Loader2, Plus, Settings, Play, Pause, Archive,
  FileText, Clock, CalendarIcon, Radio,
  Download, Upload, Pencil, Package, BarChart3, Printer,
} from 'lucide-react';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import { AppCopyright } from '../components/AppCopyright';
import { useToast } from '../components/Toast';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Dropdown } from '../components/ui/Dropdown';
import { EmptyState } from '../components/ui/EmptyState';
import { Tabs } from '../components/ui/Tabs';
import type { OtisakExamWithSubject } from '../lib/types';

// Statuses live inside one of three top tabs. The Aktivni tab covers everything
// the admin is actively building or running; Završeni is just `completed`;
// Arhiva is its own resting place so closed exams don't crowd the main list.
type ManageTab = 'aktivni' | 'zavrseni' | 'arhiva';
const STATUSES_BY_TAB: Record<ManageTab, string[]> = {
  aktivni: ['draft', 'scheduled', 'active'],
  zavrseni: ['completed'],
  arhiva: ['archived'],
};

type UserInfo = { name?: string; role?: string; avatar_url?: string };
type Subject = { id: string; name: string; code: string | null };

export default function ManagePage() {
  const navigate = useNavigate();
  const { t, locale } = useLang();
  const toast = useToast();

  // Per-tab status sub-filter options. The Aktivni tab can narrow further;
  // the other two tabs are already single-status and don't need a dropdown.
  const AKTIVNI_STATUS_OPTIONS = [
    { value: 'all', label: t('manage.allStatuses') },
    { value: 'draft', label: t('manage.draft') },
    { value: 'scheduled', label: t('manage.scheduled') },
    { value: 'active', label: t('manage.active') },
  ];

  // Per-status admin actions. Completed and archived exams are read-only -
  // they can be archived (housekeeping) but never reopened.
  const statusActions: Record<string, Array<{ label: string; status: string; icon: React.ReactNode }>> = {
    draft: [
      { label: t('manage.activate'), status: 'active', icon: <Play size={14} /> },
      { label: t('manage.schedule'), status: 'scheduled', icon: <CalendarIcon size={14} /> },
    ],
    scheduled: [
      { label: t('manage.activate'), status: 'active', icon: <Play size={14} /> },
    ],
    active: [
      { label: t('manage.complete'), status: 'completed', icon: <Pause size={14} /> },
    ],
    completed: [
      { label: t('manage.archive'), status: 'archived', icon: <Archive size={14} /> },
    ],
    archived: [],
  };
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<OtisakExamWithSubject[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // Tab + filter state. All filtering happens client-side over the cached
  // `exams` list - the request already returns the assistant-scoped set.
  const [tab, setTab] = useState<ManageTab>('aktivni');
  const [statusFilter, setStatusFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [scheduledFrom, setScheduledFrom] = useState('');
  const [scheduledTo, setScheduledTo] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);

  // Import form
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSubjectId, setImportSubjectId] = useState('');
  const [importing, setImporting] = useState(false);

  // Create form
  const [newTitle, setNewTitle] = useState('');
  const [newSubjectId, setNewSubjectId] = useState('');
  const [newDuration, setNewDuration] = useState('60');
  const [newMode, setNewMode] = useState('real');
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
    })();
  }, [navigate]);

  const loadData = useCallback(async () => {
    try {
      const [examsRes, subjectsRes] = await Promise.all([
        fetch('/api/otisak/exams', { credentials: 'include' }),
        fetch('/api/otisak/subjects', { credentials: 'include' }),
      ]);
      if (examsRes.ok) { const d = await examsRes.json(); setExams(d.exams || []); }
      if (subjectsRes.ok) { const d = await subjectsRes.json(); setSubjects(d.subjects || []); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) loadData(); }, [user, loadData]);

  const handleCreate = async () => {
    if (!newTitle.trim() || !newDuration) return;
    setCreating(true);
    try {
      const res = await fetch('/api/otisak/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: newTitle,
          subject_id: newSubjectId || undefined,
          duration_minutes: parseInt(newDuration),
          exam_mode: newMode,
          self_service: newMode === 'practice',
          is_public: newMode === 'practice',
        }),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setNewTitle('');
        setNewSubjectId('');
        setNewDuration('60');
        toast.success(t('manage.createSuccess'));
        loadData();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('manage.createFailed'));
      }
    } catch {
      toast.error(t('manage.createFailed'));
    } finally { setCreating(false); }
  };

  const handleStatusChange = async (examId: string, newStatus: string) => {
    try {
      const res = await fetch('/api/otisak/exams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: examId, status: newStatus }),
      });
      if (res.ok) {
        toast.success(t('manage.statusChanged'));
        loadData();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error === 'DEMO_EXAM_LOCKED' ? t('manage.demoLocked') : (d.error || t('manage.statusFailed')));
      }
    } catch {
      toast.error(t('manage.statusFailed'));
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const text = await importFile.text();
      const json = JSON.parse(text);
      // Explicit subject pick from the dialog wins over whatever the JSON
      // carries in exam.subject_name. The server enforces the same rule.
      const body = importSubjectId ? { ...json, subject_id: importSubjectId } : json;
      const res = await fetch('/api/otisak/exams/import-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('manage.importFailed'));
        return;
      }
      toast.success(t('manage.importSuccess'));
      setShowImportModal(false);
      setImportFile(null);
      setImportSubjectId('');
      loadData();
    } catch (err) {
      toast.error((err as Error).message || t('manage.importFailed'));
    } finally {
      setImporting(false);
    }
  };

  // Filter pipeline: tab gates by status group → status sub-filter → subject
  // → tags (any-overlap, lowercased) → scheduled date range (inclusive). Each
  // step is cheap so doing it on the client keeps the UI snappy without an
  // extra round-trip per filter change.
  const allowedStatuses = STATUSES_BY_TAB[tab];
  const fromMs = scheduledFrom ? new Date(scheduledFrom).getTime() : null;
  const toMs = scheduledTo ? new Date(scheduledTo).getTime() : null;
  const tagSet = new Set(tagFilter.map((t) => t.toLowerCase()));

  const filteredExams = exams.filter((e) => {
    if (!allowedStatuses.includes(e.status)) return false;
    if (tab === 'aktivni' && statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (subjectFilter !== 'all' && (e.subject_id ?? '') !== subjectFilter) return false;
    if (tagSet.size > 0) {
      const examTags = Array.isArray(e.tags) ? e.tags.map((x) => x.toLowerCase()) : [];
      const overlap = examTags.some((tt) => tagSet.has(tt));
      if (!overlap) return false;
    }
    if (fromMs !== null || toMs !== null) {
      const ms = e.scheduled_at ? new Date(e.scheduled_at as unknown as string).getTime() : null;
      if (ms === null) return false;
      if (fromMs !== null && ms < fromMs) return false;
      if (toMs !== null && ms > toMs) return false;
    }
    return true;
  });

  // Collected tag pool for the filter dropdown - every tag seen on any exam
  // in scope, sorted alphabetically. Recomputes per render; small N.
  const tagPool = Array.from(new Set(
    exams.flatMap((e) => (Array.isArray(e.tags) ? e.tags : []).map((x) => x.toLowerCase()))
  )).sort();

  if (!user) {
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
                  <Settings className="w-6 h-6 text-accent" strokeWidth={1.5} />
                </div>
                <div>
                  <h1 className="text-2xl font-display font-bold text-[var(--text-primary)]">{t('manage.title')}</h1>
                  <p className="text-sm text-[var(--text-secondary)]">{t('manage.subtitle')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  leftIcon={<Upload size={14} />}
                  onClick={() => { setImportFile(null); setImportSubjectId(''); setShowImportModal(true); }}
                >
                  {t('manage.importJson')}
                </Button>
                <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => setShowCreateModal(true)}>
                  {t('manage.newExam')}
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <div className="mb-4">
              <Tabs
                tabs={[
                  { id: 'aktivni', label: t('manage.tab.active') },
                  { id: 'zavrseni', label: t('manage.tab.completed') },
                  { id: 'arhiva', label: t('manage.tab.archive') },
                ]}
                activeTab={tab}
                onChange={(id) => { setTab(id as ManageTab); setStatusFilter('all'); }}
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              {tab === 'aktivni' && (
                <div className="w-[160px]">
                  <Dropdown options={AKTIVNI_STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
                </div>
              )}
              <div className="w-[200px]">
                <Dropdown
                  options={[
                    { value: 'all', label: t('manage.allSubjects') },
                    ...subjects.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                  value={subjectFilter}
                  onChange={setSubjectFilter}
                />
              </div>
              {tagPool.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {tagPool.map((tg) => {
                    const active = tagFilter.includes(tg);
                    return (
                      <button
                        key={tg}
                        type="button"
                        onClick={() => setTagFilter((prev) => active ? prev.filter((x) => x !== tg) : [...prev, tg])}
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${
                          active ? 'bg-accent text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-accent-light hover:text-accent'
                        }`}
                      >
                        {tg}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <input
                  type="date"
                  value={scheduledFrom}
                  onChange={(e) => setScheduledFrom(e.target.value)}
                  className="h-9 px-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                  title={t('manage.scheduledFrom')}
                />
                <span className="text-xs text-[var(--text-muted)]">–</span>
                <input
                  type="date"
                  value={scheduledTo}
                  onChange={(e) => setScheduledTo(e.target.value)}
                  className="h-9 px-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                  title={t('manage.scheduledTo')}
                />
                {(scheduledFrom || scheduledTo) && (
                  <button
                    type="button"
                    onClick={() => { setScheduledFrom(''); setScheduledTo(''); }}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2"
                    title={t('common.clear')}
                  >
                    ×
                  </button>
                )}
              </div>
              <span className="text-xs text-[var(--text-muted)]">{filteredExams.length} {t('manage.exams')}</span>
            </div>

            {/* Exam List */}
            {loading ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
            ) : filteredExams.length > 0 ? (
              <div className="space-y-3">
                {filteredExams.map((exam, idx) => (
                  <motion.div
                    key={exam.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] p-5 hover:border-[var(--text-muted)] transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-base font-display font-semibold text-[var(--text-primary)] truncate">{exam.title}</h3>
                          <Badge variant={
                            exam.status === 'active' ? 'success' :
                            exam.status === 'draft' ? 'neutral' :
                            exam.status === 'scheduled' ? 'warning' :
                            exam.status === 'completed' ? 'info' : 'neutral'
                          } size="sm">
                            {t(`manage.${exam.status}`) || exam.status}
                          </Badge>
                          {exam.exam_mode === 'practice' && <Badge variant="accent" size="sm">{t('manage.practice')}</Badge>}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
                          {exam.subject_name && <span>{exam.subject_name}</span>}
                          <span className="flex items-center gap-1"><Clock size={12} />{exam.duration_minutes} {t('manage.minShort')}</span>
                          <span className="flex items-center gap-1"><FileText size={12} />{exam.question_count} {t('manage.questionsShort')}</span>
                          {exam.scheduled_at && (
                            <span className="flex items-center gap-1">
                              <CalendarIcon size={12} />
                              {new Date(exam.scheduled_at as unknown as string).toLocaleString('sr-RS', {
                                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                              })}
                            </span>
                          )}
                          {Array.isArray(exam.tags) && exam.tags.length > 0 && (
                            <span className="flex flex-wrap items-center gap-1">
                              {exam.tags.map((tg) => (
                                <span key={tg} className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-[10px]">
                                  {tg}
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {exam.status === 'active' && (
                          <Button variant="primary" size="sm" leftIcon={<Radio size={14} />} onClick={() => navigate(`/manage/${exam.id}`)}>
                            {t('manage.room')}
                          </Button>
                        )}
                        <Button variant="secondary" size="sm" leftIcon={<Pencil size={14} />} onClick={() => navigate(`/manage/${exam.id}/edit`)}>
                          {t('manage.edit')}
                        </Button>
                        <a
                          href={`/api/otisak/exams/${exam.id}/export-json`}
                          className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-sm font-medium hover:border-accent hover:text-accent transition-colors"
                          title={t('manage.exportJson')}
                        >
                          <Download size={14} />
                        </a>
                        <a
                          href={`/api/otisak/exams/${exam.id}/print/pdf?lang=${locale}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-sm font-medium hover:border-accent hover:text-accent transition-colors"
                          title={t('manage.printTest')}
                        >
                          <Printer size={14} />
                        </a>
                        {exam.status === 'completed' && (
                          <a
                            href={`/api/otisak/exams/${exam.id}/export-results?lang=${locale}`}
                            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-accent bg-accent-light text-accent text-sm font-medium hover:bg-accent hover:text-white transition-colors"
                            title={t('manage.exportResults')}
                          >
                            <Package size={14} />
                            {t('manage.exportResults.label')}
                          </a>
                        )}
                        {/* Statistika: available once attempts can exist (i.e.
                            not draft). Endpoint is open to any status; the
                            row CTA mirrors that and lets admins peek mid-run. */}
                        {exam.status !== 'draft' && (
                          <button
                            type="button"
                            onClick={() => navigate(`/manage/${exam.id}/stats`)}
                            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] text-sm font-medium hover:border-accent hover:text-accent transition-colors"
                            title={t('manage.openStats')}
                          >
                            <BarChart3 size={14} />
                          </button>
                        )}
                        {statusActions[exam.status]?.map((action) => (
                          <Button key={action.status} variant="secondary" size="sm" leftIcon={action.icon} onClick={() => handleStatusChange(exam.id, action.status)}>
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <EmptyState icon={<FileText size={32} strokeWidth={1.5} />} title={t('manage.noExams')} description={t('manage.noExamsDesc')} actionLabel={t('manage.createExam')} onAction={() => setShowCreateModal(true)} />
            )}
          </div>
          <div className="px-4 pb-6 pt-2 flex justify-center"><AppCopyright /></div>
        </main>
      </div>

      {/* Create Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-display font-semibold text-[var(--text-primary)] mb-1">{t('manage.importJsonTitle')}</h2>
            <p className="text-xs text-[var(--text-muted)] mb-4">{t('manage.importJsonHelp')}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t('manage.importJsonFile')}</label>
                <label className="block">
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  />
                  <span className="inline-flex items-center gap-2 h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm cursor-pointer hover:border-accent transition-colors w-full">
                    <Upload size={14} className="text-[var(--text-muted)]" />
                    <span className="truncate">{importFile ? importFile.name : t('manage.importJsonPick')}</span>
                  </span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  {t('manage.subject')} <span className="text-danger">*</span>
                </label>
                <Dropdown
                  options={subjects.map((s) => ({ value: s.id, label: s.name }))}
                  value={importSubjectId}
                  onChange={setImportSubjectId}
                  placeholder={t('manage.importJsonSubjectPlaceholder')}
                />
                <p className="text-[11px] text-[var(--text-muted)] mt-1">{t('manage.importJsonSubjectHint')}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <Button variant="secondary" onClick={() => setShowImportModal(false)} disabled={importing}>{t('manage.cancel')}</Button>
              <Button variant="primary" loading={importing} disabled={!importFile || !importSubjectId} onClick={handleImport}>{t('manage.importJson')}</Button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-display font-semibold text-[var(--text-primary)] mb-4">{t('manage.createTitle')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t('manage.examTitle')}</label>
                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('manage.examTitlePlaceholder')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t('manage.subject')}</label>
                <Dropdown
                  options={[{ value: '', label: t('manage.noSubject') }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]}
                  value={newSubjectId}
                  onChange={setNewSubjectId}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t('manage.duration')}</label>
                <input type="number" value={newDuration} onChange={(e) => setNewDuration(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t('manage.mode')}</label>
                <Dropdown
                  options={[{ value: 'real', label: t('manage.realExam') }, { value: 'practice', label: t('manage.practice') }]}
                  value={newMode}
                  onChange={setNewMode}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <Button variant="secondary" onClick={() => setShowCreateModal(false)}>{t('manage.cancel')}</Button>
              <Button variant="primary" loading={creating} onClick={handleCreate}>{t('manage.create')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
