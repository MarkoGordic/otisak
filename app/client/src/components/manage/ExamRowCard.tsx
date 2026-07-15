import React from 'react';
import { motion } from 'framer-motion';
import { Clock, FileText, CalendarIcon } from 'lucide-react';
import { useLang } from '../LangProvider';
import { Badge } from '../ui/Badge';
import type { OtisakExamWithSubject } from '../../lib/types';

// One row in an admin exam list. Shared by /manage (real exams) and
// /practice (practice templates) so the card markup can't drift between them.
//
// Knows nothing about exam_mode: the pages differ in which badges and actions
// they hand in, not in how a row is drawn.
export function ExamRowCard({
  exam,
  index,
  badges,
  actions,
}: {
  exam: OtisakExamWithSubject;
  index: number;
  badges?: React.ReactNode;
  actions: React.ReactNode;
}) {
  const { t } = useLang();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
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
            {badges}
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
          {actions}
        </div>
      </div>
    </motion.div>
  );
}
