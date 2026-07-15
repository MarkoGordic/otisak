import { useCallback } from 'react';
import { useLang } from '../components/LangProvider';
import { useToast } from '../components/Toast';

// Status transitions for an admin exam list. Shared by /manage and /practice
// so the demo-lock branch exists in exactly one place. `onDone` reloads the
// caller's list after a successful change.
export function useExamStatusChange(onDone: () => void) {
  const { t } = useLang();
  const toast = useToast();

  return useCallback(async (examId: string, newStatus: string) => {
    try {
      const res = await fetch('/api/otisak/exams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: examId, status: newStatus }),
      });
      if (res.ok) {
        toast.success(t('manage.statusChanged'));
        onDone();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error === 'DEMO_EXAM_LOCKED' ? t('manage.demoLocked') : (d.error || t('manage.statusFailed')));
      }
    } catch {
      toast.error(t('manage.statusFailed'));
    }
  }, [onDone, t, toast]);
}
