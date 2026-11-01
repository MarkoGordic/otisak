import { useCallback } from 'react';
import { useLang } from '../components/LangProvider';
import { useToast } from '../components/Toast';

// Status transitions for an admin exam list. Shared by /manage and /practice
// so the demo-lock branch exists in exactly one place. `onDone` reloads the
// caller's list after a successful change.
//
// The irreversible ones ask first: completing a live exam cuts off everyone
// still writing it, archiving can't be undone from the UI, and activating an
// exam with no questions hands students an empty test.
export function useExamStatusChange(onDone: () => void) {
  const { t } = useLang();
  const toast = useToast();

  return useCallback(
    async (
      examId: string,
      newStatus: string,
      exam?: { title: string; question_count?: number; bank_question_count?: number },
    ) => {
      if (exam) {
        const empty = (exam.question_count ?? 0) === 0 && (exam.bank_question_count ?? 0) === 0;
        const prompt =
          newStatus === 'completed'
            ? t('manage.confirmComplete', { title: exam.title })
            : newStatus === 'archived'
              ? t('manage.confirmArchive', { title: exam.title })
              : newStatus === 'active' && empty
                ? t('manage.confirmActivateEmpty', { title: exam.title })
                : null;
        if (prompt && !confirm(prompt)) return;
      }
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
          toast.error(
            d.error === 'DEMO_EXAM_LOCKED'
              ? t('manage.demoLocked')
              : d.error || t('manage.statusFailed'),
          );
        }
      } catch {
        toast.error(t('manage.statusFailed'));
      }
    },
    [onDone, t, toast],
  );
}
