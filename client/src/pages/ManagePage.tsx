import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Loader2, Plus, Settings, Trash2, Users, Play, Pause, Archive, Eye,
  Fingerprint, FileText, Clock, CalendarIcon, Radio, Link2, Copy,
} from 'lucide-react';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Dropdown } from '../components/ui/Dropdown';
import { EmptyState } from '../components/ui/EmptyState';
import type { OtisakExamWithSubject } from '../lib/types';

type UserInfo = { name?: string; role?: string; avatar_url?: string };
type Subject = { id: string; name: string; code: string | null };

export default function ManagePage() {
  const navigate = useNavigate();
  const { t } = useLang();

  const STATUS_OPTIONS = [
    { value: 'all', label: t('manage.allStatuses') },
    { value: 'draft', label: t('manage.draft') },
    { value: 'scheduled', label: t('manage.scheduled') },
    { value: 'active', label: t('manage.active') },
    { value: 'completed', label: t('manage.completed') },
    { value: 'archived', label: t('manage.archived') },
  ];

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
      { label: t('manage.reactivate'), status: 'active', icon: <Play size={14} /> },
    ],
  };
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<OtisakExamWithSubject[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

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
        loadData();
      }
    } catch (e) { console.error(e); }
    finally { setCreating(false); }
  };

  const handleStatusChange = async (examId: string, newStatus: string) => {
    await fetch('/api/otisak/exams', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id: examId, status: newStatus }),
    });
    loadData();
  };

  const handleDelete = async (examId: string) => {
    if (!confirm(t('manage.deleteConfirm'))) return;
    await fetch(`/api/otisak/exams?id=${examId}`, { method: 'DELETE', credentials: 'include' });
    loadData();
  };

  const filteredExams = exams.filter((e) => statusFilter === 'all' || e.status === statusFilter);

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
              <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => setShowCreateModal(true)}>
                {t('manage.newExam')}
              </Button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-[180px]">
                <Dropdown options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
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
                            {exam.status}
                          </Badge>
                          {exam.exam_mode === 'practice' && <Badge variant="accent" size="sm">Practice</Badge>}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
                          {exam.subject_name && <span>{exam.subject_name}</span>}
                          <span className="flex items-center gap-1"><Clock size={12} />{exam.duration_minutes}min</span>
                          <span className="flex items-center gap-1"><FileText size={12} />{exam.question_count} questions</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {exam.status === 'active' && (
                          <Button variant="primary" size="sm" leftIcon={<Radio size={14} />} onClick={() => navigate(`/manage/${exam.id}`)}>
                            {t('manage.room')}
                          </Button>
                        )}
                        {statusActions[exam.status]?.map((action) => (
                          <Button key={action.status} variant="secondary" size="sm" leftIcon={action.icon} onClick={() => handleStatusChange(exam.id, action.status)}>
                            {action.label}
                          </Button>
                        ))}
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(exam.id)} className="text-danger hover:bg-danger-light">
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <EmptyState icon={<FileText size={32} strokeWidth={1.5} />} title={t('manage.noExams')} description={t('manage.noExamsDesc')} actionLabel={t('manage.createExam')} onAction={() => setShowCreateModal(true)} />
            )}
          </div>
        </main>
      </div>

      {/* Create Modal */}
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
