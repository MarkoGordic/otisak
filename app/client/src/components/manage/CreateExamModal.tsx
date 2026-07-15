import { useState } from 'react';
import { useLang } from '../LangProvider';
import { useToast } from '../Toast';
import { Button } from '../ui/Button';
import { Dropdown } from '../ui/Dropdown';
import type { OtisakExamMode } from '../../lib/types';

type Subject = { id: string; name: string; code: string | null };

// Create-exam dialog shared by /manage and /practice. `mode` comes from the
// page, which is the whole point: an exam's mode is decided by where you
// create it, not by a dropdown the user can get wrong.
export function CreateExamModal({
  subjects,
  mode,
  title,
  requireSubject = false,
  onClose,
  onCreated,
}: {
  subjects: Subject[];
  mode: OtisakExamMode;
  title: string;
  requireSubject?: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useLang();
  const toast = useToast();

  const [newTitle, setNewTitle] = useState('');
  const [newSubjectId, setNewSubjectId] = useState('');
  const [newDuration, setNewDuration] = useState('60');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newTitle.trim() || !newDuration) return;
    if (requireSubject && !newSubjectId) return;
    setCreating(true);
    try {
      // self_service / is_public are intentionally absent: the server derives
      // them from exam_mode, so there is one place that decides.
      const res = await fetch('/api/otisak/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: newTitle,
          subject_id: newSubjectId || undefined,
          duration_minutes: parseInt(newDuration),
          exam_mode: mode,
        }),
      });
      if (res.ok) {
        toast.success(mode === 'practice' ? t('practiceAdmin.createSuccess') : t('manage.createSuccess'));
        onCreated();
        onClose();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('manage.createFailed'));
      }
    } catch {
      toast.error(t('manage.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-display font-semibold text-[var(--text-primary)] mb-4">{title}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t('manage.examTitle')}</label>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm"
              placeholder={t('manage.examTitlePlaceholder')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              {t('manage.subject')} {requireSubject && <span className="text-danger">*</span>}
            </label>
            <Dropdown
              options={requireSubject
                ? subjects.map((s) => ({ value: s.id, label: s.name }))
                : [{ value: '', label: t('manage.noSubject') }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]}
              value={newSubjectId}
              onChange={setNewSubjectId}
              placeholder={requireSubject ? t('manage.subjectPlaceholder') : undefined}
            />
            {requireSubject && (
              <p className="text-[11px] text-[var(--text-muted)] mt-1">{t('practiceAdmin.subjectRequired')}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t('manage.duration')}</label>
            <input
              type="number"
              value={newDuration}
              onChange={(e) => setNewDuration(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={onClose} disabled={creating}>{t('manage.cancel')}</Button>
          <Button
            variant="primary"
            loading={creating}
            disabled={!newTitle.trim() || !newDuration || (requireSubject && !newSubjectId)}
            onClick={handleCreate}
          >
            {t('manage.create')}
          </Button>
        </div>
      </div>
    </div>
  );
}
