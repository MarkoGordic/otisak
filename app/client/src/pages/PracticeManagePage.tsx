import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, Plus, Dumbbell, Play, Archive,
  Download, Upload, Pencil, Printer, RotateCw,
} from 'lucide-react';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import { useToast } from '../components/Toast';
import { AppCopyright } from '../components/AppCopyright';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Dropdown } from '../components/ui/Dropdown';
import { EmptyState } from '../components/ui/EmptyState';
import { Tabs } from '../components/ui/Tabs';
import { ExamRowCard } from '../components/manage/ExamRowCard';
import { CreateExamModal } from '../components/manage/CreateExamModal';
import { ImportExamModal } from '../components/manage/ImportExamModal';
import { useExamStatusChange } from '../hooks/useExamStatusChange';
import type { OtisakExamWithSubject } from '../lib/types';

// Practice templates only. Real exams live at /manage; an exam's mode is fixed
// when it is created and never moves between the two pages.
//
// The tabs are not /manage's. What matters for a practice template is whether
// a student can see it right now, so "Published" is exactly the status set
// getSelfServicePracticeExams accepts. Drafts are still being written, and
// Archive is the resting place. Three groups cover all five statuses, so a
// legacy row can never fall out of every tab.
type PracticeTab = 'published' | 'drafts' | 'archive';
const STATUSES_BY_TAB: Record<PracticeTab, string[]> = {
  published: ['active', 'scheduled'],
  drafts: ['draft'],
  archive: ['archived', 'completed'],
};

type UserInfo = { name?: string; role?: string; avatar_url?: string };
type Subject = { id: string; name: string; code: string | null };

export default function PracticeManagePage() {
  const navigate = useNavigate();
  const { t, locale } = useLang();
  const toast = useToast();

  // No Unpublish (active -> draft). It is legal server-side, but the demo lock
  // only fires on completed/archived, so an Unpublish button would be an
  // unguarded way to hide the pinned demo with no way back except SQL.
  const statusActions: Record<string, Array<{ label: string; status: string; icon: React.ReactNode }>> = {
    draft: [{ label: t('practiceAdmin.publish'), status: 'active', icon: <Play size={14} /> }],
    scheduled: [{ label: t('practiceAdmin.publish'), status: 'active', icon: <Play size={14} /> }],
    active: [{ label: t('manage.archive'), status: 'archived', icon: <Archive size={14} /> }],
    completed: [{ label: t('manage.archive'), status: 'archived', icon: <Archive size={14} /> }],
    archived: [],
  };

  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<OtisakExamWithSubject[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [tab, setTab] = useState<PracticeTab>('published');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState<string[]>([]);

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
        fetch('/api/otisak/exams?exam_mode=practice', { credentials: 'include' }),
        fetch('/api/otisak/subjects', { credentials: 'include' }),
      ]);
      if (examsRes.ok) { const d = await examsRes.json(); setExams(d.exams || []); }
      if (subjectsRes.ok) { const d = await subjectsRes.json(); setSubjects(d.subjects || []); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) loadData(); }, [user, loadData]);

  const handleStatusChange = useExamStatusChange(loadData);

  // Repair path for practice exams imported before the flags were derived from
  // the mode: they carry self_service=false and never reach the student list.
  const handleRepublish = async (examId: string) => {
    try {
      const res = await fetch('/api/otisak/exams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: examId, self_service: true, is_public: true }),
      });
      if (res.ok) {
        toast.success(t('practiceAdmin.republished'));
        loadData();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error === 'DEMO_EXAM_LOCKED' ? t('manage.demoLocked') : (d.error || t('practiceAdmin.republishFailed')));
      }
    } catch {
      toast.error(t('practiceAdmin.republishFailed'));
    }
  };

  const allowedStatuses = STATUSES_BY_TAB[tab];
  const tagSet = new Set(tagFilter.map((x) => x.toLowerCase()));

  // No date range filter: practice templates are never scheduled, so filtering
  // on scheduled_at would hide every row.
  const filteredExams = exams.filter((e) => {
    if (!allowedStatuses.includes(e.status)) return false;
    if (subjectFilter !== 'all' && (e.subject_id ?? '') !== subjectFilter) return false;
    if (tagSet.size > 0) {
      const examTags = Array.isArray(e.tags) ? e.tags.map((x) => x.toLowerCase()) : [];
      if (!examTags.some((tt) => tagSet.has(tt))) return false;
    }
    return true;
  });

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
                  <Dumbbell className="w-6 h-6 text-accent" strokeWidth={1.5} />
                </div>
                <div>
                  <h1 className="text-2xl font-display font-bold text-[var(--text-primary)]">{t('practiceAdmin.title')}</h1>
                  <p className="text-sm text-[var(--text-secondary)]">{t('practiceAdmin.subtitle')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" leftIcon={<Upload size={14} />} onClick={() => setShowImportModal(true)}>
                  {t('manage.importJson')}
                </Button>
                <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => setShowCreateModal(true)}>
                  {t('practiceAdmin.new')}
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <div className="mb-4">
              <Tabs
                tabs={[
                  { id: 'published', label: t('practiceAdmin.tab.published') },
                  { id: 'drafts', label: t('practiceAdmin.tab.drafts') },
                  { id: 'archive', label: t('practiceAdmin.tab.archive') },
                ]}
                activeTab={tab}
                onChange={(id) => setTab(id as PracticeTab)}
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
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
              <span className="text-xs text-[var(--text-muted)] ml-auto">{filteredExams.length} {t('practiceAdmin.count')}</span>
            </div>

            {/* Practice list */}
            {loading ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
            ) : filteredExams.length > 0 ? (
              <div className="space-y-3">
                {filteredExams.map((exam, idx) => (
                  <ExamRowCard
                    key={exam.id}
                    exam={exam}
                    index={idx}
                    badges={
                      exam.self_service === false ? (
                        // Badge takes no title prop, so wrap it for the tooltip.
                        <span title={t('practiceAdmin.hiddenHint')}>
                          <Badge variant="danger" size="sm">{t('practiceAdmin.hidden')}</Badge>
                        </span>
                      ) : (
                        <Badge variant={exam.is_public ? 'success' : 'neutral'} size="sm">
                          {exam.is_public ? t('practiceAdmin.public') : t('practiceAdmin.enrolledOnly')}
                        </Badge>
                      )
                    }
                    actions={
                      <>
                        {/* No Soba (a template has no roster), no Statistika or
                            Export rezultata (attempts hang off the per-student
                            child exams, so both are always empty here). */}
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
                        {exam.self_service === false && (
                          <Button variant="secondary" size="sm" leftIcon={<RotateCw size={14} />} onClick={() => handleRepublish(exam.id)}>
                            {t('practiceAdmin.republish')}
                          </Button>
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
              <EmptyState
                icon={<Dumbbell size={32} strokeWidth={1.5} />}
                title={t('practiceAdmin.empty')}
                description={t('practiceAdmin.emptyDesc')}
                actionLabel={t('practiceAdmin.new')}
                onAction={() => setShowCreateModal(true)}
              />
            )}
          </div>
          <div className="px-4 pb-6 pt-2 flex justify-center"><AppCopyright /></div>
        </main>
      </div>

      {showImportModal && (
        <ImportExamModal
          subjects={subjects}
          mode="practice"
          title={t('practiceAdmin.importTitle')}
          help={t('practiceAdmin.importHelp')}
          onClose={() => setShowImportModal(false)}
          onImported={loadData}
        />
      )}

      {showCreateModal && (
        <CreateExamModal
          subjects={subjects}
          mode="practice"
          title={t('practiceAdmin.createTitle')}
          requireSubject
          onClose={() => setShowCreateModal(false)}
          onCreated={loadData}
        />
      )}
    </div>
  );
}
