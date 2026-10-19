import { useState } from 'react';
import { Upload, ExternalLink } from 'lucide-react';
import { useLang } from '../LangProvider';
import { useToast } from '../Toast';
import { Button } from '../ui/Button';
import { Dropdown } from '../ui/Dropdown';
import type { OtisakExamMode } from '../../lib/types';

type Subject = { id: string; name: string; code: string | null };

// Import-exam dialog shared by /manage and /practice. Takes a .json file or a
// .zip (exam.json + images). The page's `mode` is
// what decides real vs practice; the file has no say. A legacy file that
// still carries exam.exam_mode imports fine, and we warn that it was ignored.
export function ImportExamModal({
  subjects,
  mode,
  title,
  help,
  onClose,
  onImported,
}: {
  subjects: Subject[];
  mode: OtisakExamMode;
  title: string;
  help: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const { t, locale } = useLang();
  const toast = useToast();

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSubjectId, setImportSubjectId] = useState('');
  const [importing, setImporting] = useState(false);

  // The docs only exist in en and sr; every other locale reads the sr pages.
  // Mirrors the collapse in DocsPage.
  const docsLang = locale === 'en' ? 'en' : 'sr';

  // Server error codes from the zip path (lib/examArchive.ts) mapped to
  // something a person can act on. `details` names the offending files.
  const describeError = (d: { code?: string; error?: string; details?: string[] }): string => {
    const list = (d.details || []).join(', ');
    switch (d.code) {
      case 'MISSING_IMAGES': return t('manage.importMissingImages', { list });
      case 'BAD_IMAGE': return t('manage.importBadImage', { list });
      case 'ZIP_NO_JSON': return t('manage.importZipNoJson');
      case 'ZIP_MANY_JSON': return t('manage.importZipManyJson', { list });
      case 'INVALID_ZIP': return t('manage.importZipInvalid');
      case 'ZIP_TOO_LARGE': return t('manage.importZipTooLarge');
      case 'INVALID_JSON': return t('manage.importInvalidJson');
      default: return d.error || t('manage.importFailed');
    }
  };

  const handleImport = async () => {
    if (!importFile || !importSubjectId) return;
    setImporting(true);
    try {
      // A .zip (exam.json + its images) goes up as-is; the server unpacks it.
      // Anything else is read as JSON here first, so a malformed file fails
      // with a clear message before any upload.
      const isZip = /\.zip$/i.test(importFile.name) || importFile.type.includes('zip');
      let res: Response;
      if (isZip) {
        const qs = new URLSearchParams({ subject_id: importSubjectId, exam_mode: mode });
        res = await fetch(`/api/otisak/exams/import-zip?${qs}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/zip' },
          credentials: 'include',
          body: importFile,
        });
      } else {
        let json: unknown;
        try {
          json = JSON.parse(await importFile.text());
        } catch {
          toast.error(t('manage.importInvalidJson'));
          return;
        }
        // A file holding bare `null` or a scalar parses fine but has no fields to
        // read. Bail here so the user gets the server's wording rather than a
        // raw "Cannot read properties of null" from the property access below.
        if (!json || typeof json !== 'object') {
          toast.error(t('manage.importFailed'));
          return;
        }
        const file = json as { exam?: unknown; questions?: unknown };
        // Built explicitly rather than by spreading `json`: the file must not be
        // able to contribute a top-level subject_id or exam_mode, and `version`
        // is not read by the server.
        res = await fetch('/api/otisak/exams/import-json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ exam: file.exam, questions: file.questions, subject_id: importSubjectId, exam_mode: mode }),
        });
      }

      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(describeError(d));
        return;
      }

      toast.success(mode === 'practice' ? t('practiceAdmin.createSuccess') : t('manage.importSuccess'));
      if (d.exam_mode_ignored) {
        toast.warning(
          mode === 'practice' ? t('manage.importModeIgnoredPractice') : t('manage.importModeIgnoredReal'),
          { title: t('manage.importModeIgnoredTitle'), duration: 8000 },
        );
      }
      const unresolved: string[] = Array.isArray(d.unresolved_images) ? d.unresolved_images : [];
      if (unresolved.length) {
        toast.warning(
          t('manage.importUnresolvedImages', { count: unresolved.length, list: unresolved.slice(0, 5).join(', ') + (unresolved.length > 5 ? ', ...' : '') }),
          { title: t('manage.importUnresolvedImagesTitle'), duration: 12000 },
        );
      }
      onImported();
      onClose();
    } catch (err) {
      toast.error((err as Error).message || t('manage.importFailed'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-display font-semibold text-[var(--text-primary)] mb-1">{title}</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">{help}</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t('manage.importJsonFile')}</label>
            <label className="block">
              <input
                type="file"
                accept="application/json,.json,application/zip,.zip"
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
            <a
              href={`/docs/${docsLang}/json-format`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline mt-1.5"
            >
              <ExternalLink size={11} />
              {t('manage.importJsonFormatLink')}
            </a>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={onClose} disabled={importing}>{t('manage.cancel')}</Button>
          <Button variant="primary" loading={importing} disabled={!importFile || !importSubjectId} onClick={handleImport}>
            {t('manage.importJson')}
          </Button>
        </div>
      </div>
    </div>
  );
}
