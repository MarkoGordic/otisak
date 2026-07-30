import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, Plus, Settings, Play, Pause, Archive,
  FileText, CalendarIcon, Radio,
  Download, Upload, Pencil, Package, BarChart3, Printer,
} from 'lucide-react';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import { AppCopyright } from '../components/AppCopyright';
import { Button } from '../components/ui/Button';
import { Dropdown } from '../components/ui/Dropdown';
import { EmptyState } from '../components/ui/EmptyState';
import { Tabs } from '../components/ui/Tabs';
import { ExamRowCard } from '../components/manage/ExamRowCard';
import { CreateExamModal } from '../components/manage/CreateExamModal';
import { ImportExamModal } from '../components/manage/ImportExamModal';
import { useExamStatusChange } from '../hooks/useExamStatusChange';
import type { OtisakExamWithSubject } from '../lib/types';

// Real exams only. Practice templates have their own page at /practice - an
// exam's mode is fixed when it is created and it never moves between the two.
//
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
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/session', { credentials: 'include' });
      const data = await res.json();
      if (!data.authenticated || (data.user?.role !== 'admin' && data.user?.role !== 'assistant' && data.user?.role !== 'professor')) {
        navigate('/dashboard', { replace: true });
        return;
      }
      setUser({ name: data.user?.name, role: data.user?.role, avatar_url: data.user?.avatar_url });
    })();
  }, [navigate]);

  const loadData = useCallback(async () => {
    try {
      const [examsRes, subjectsRes] = await Promise.all([
        fetch('/api/otisak/exams?exam_mode=real', { credentials: 'include' }),
        fetch('/api/otisak/subjects', { credentials: 'include' }),
      ]);
      if (examsRes.ok) { const d = await examsRes.json(); setExams(d.exams || []); }
      if (subjectsRes.ok) { const d = await subjectsRes.json(); setSubjects(d.subjects || []); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) loadData(); }, [user, loadData]);

  const handleStatusChange = useExamStatusChange(loadData);

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
                  onClick={() => setShowImportModal(true)}
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
                <span className="text-xs text-[var(--text-muted)]">-</span>
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
                  <ExamRowCard
                    key={exam.id}
                    exam={exam}
                    index={idx}
                    actions={
                      <>
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
                      </>
                    }
                  />
                ))}
              </div>
            ) : (
              <EmptyState icon={<FileText size={32} strokeWidth={1.5} />} title={t('manage.noExams')} description={t('manage.noExamsDesc')} actionLabel={t('manage.createExam')} onAction={() => setShowCreateModal(true)} />
            )}
          </div>
          <div className="px-4 pb-6 pt-2 flex justify-center"><AppCopyright /></div>
        </main>
      </div>

      {showImportModal && (
        <ImportExamModal
          subjects={subjects}
          mode="real"
          title={t('manage.importJsonTitle')}
          help={t('manage.importJsonHelp')}
          onClose={() => setShowImportModal(false)}
          onImported={loadData}
        />
      )}

      {showCreateModal && (
        <CreateExamModal
          subjects={subjects}
          mode="real"
          title={t('manage.createTitle')}
          onClose={() => setShowCreateModal(false)}
          onCreated={loadData}
        />
      )}
    </div>
  );
}
