import { useState } from 'react';
import { Upload, AlertTriangle } from 'lucide-react';
import { useLang } from '../LangProvider';
import { useToast } from '../Toast';
import { Button } from '../ui/Button';

type Issue = { index: number; code: string; detail?: string };

// Question bank import: a .json file ({ questions: [...] }, the exam format
// plus `tags`) or a .zip with that JSON and its images. Goes into the subject
// the bank page has open. The server checks every question first and refuses
// the whole file if any is wrong; the list below says which and why.
export function ImportBankModal({
  subjectId,
  subjectName,
  onClose,
  onImported,
}: {
  subjectId: string;
  subjectName: string;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const { t } = useLang();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);

  const describeIssue = (i: Issue): string => {
    const key = `bankImport.issue.${i.code}`;
    const msg = t(key, { detail: i.detail ?? '' });
    return msg === key ? i.code : msg;
  };

  const describeError = (d: { code?: string; error?: string; details?: string[] }): string => {
    const list = (d.details || []).join(', ');
    switch (d.code) {
      case 'MISSING_IMAGES':
        return t('manage.importMissingImages', { list });
      case 'BAD_IMAGE':
        return t('manage.importBadImage', { list });
      case 'ZIP_NO_JSON':
        return t('manage.importZipNoJson');
      case 'ZIP_MANY_JSON':
        return t('manage.importZipManyJson', { list });
      case 'INVALID_ZIP':
        return t('manage.importZipInvalid');
      case 'ZIP_TOO_LARGE':
        return t('manage.importZipTooLarge');
      case 'INVALID_JSON':
        return t('manage.importInvalidJson');
      default:
        return d.error || t('manage.importFailed');
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setIssues([]);
    try {
      const isZip = /\.zip$/i.test(file.name) || file.type.includes('zip');
      let res: Response;
      if (isZip) {
        res = await fetch(
          `/api/otisak/questions/import-zip?${new URLSearchParams({ subject_id: subjectId })}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/zip' },
            credentials: 'include',
            body: file,
          },
        );
      } else {
        let json: unknown;
        try {
          json = JSON.parse(await file.text());
        } catch {
          toast.error(t('manage.importInvalidJson'));
          return;
        }
        const questions =
          json && typeof json === 'object' ? (json as { questions?: unknown }).questions : null;
        res = await fetch('/api/otisak/questions/import-json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ subject_id: subjectId, questions }),
        });
      }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.code === 'INVALID_QUESTIONS' && Array.isArray(d.issues)) {
          setIssues(d.issues);
          return;
        }
        toast.error(describeError(d));
        return;
      }
      toast.success(t('bankImport.success', { count: d.imported ?? 0 }));
      onImported(d.imported ?? 0);
      onClose();
    } catch (err) {
      toast.error((err as Error).message || t('manage.importFailed'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] shadow-lg w-full max-w-md p-6 max-h-[90vh] flex flex-col">
        <h2 className="text-lg font-display font-semibold text-[var(--text-primary)] mb-1">
          {t('bankImport.title')}
        </h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          {t('bankImport.help', { subject: subjectName })}
        </p>

        <label className="block">
          <input
            type="file"
            accept="application/json,.json,application/zip,.zip"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setIssues([]);
            }}
          />
          <span className="inline-flex items-center gap-2 h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm cursor-pointer hover:border-accent transition-colors w-full">
            <Upload size={14} className="text-[var(--text-muted)]" />
            <span className="truncate">{file ? file.name : t('manage.importJsonPick')}</span>
          </span>
        </label>

        {issues.length > 0 && (
          <div className="mt-4 rounded-lg border border-[var(--border-default)] bg-danger-light p-3 overflow-y-auto min-h-0">
            <p className="flex items-center gap-1.5 text-xs font-medium text-danger mb-2">
              <AlertTriangle size={13} />
              {t('bankImport.refused', { count: issues.length })}
            </p>
            <ul className="space-y-1">
              {issues.map((i, n) => (
                <li key={n} className="text-xs text-[var(--text-primary)]">
                  {i.index > 0 && (
                    <span className="font-mono text-[var(--text-muted)] mr-1.5">
                      {t('bankImport.questionNo', { n: i.index })}
                    </span>
                  )}
                  {describeIssue(i)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={onClose} disabled={importing}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            leftIcon={<Upload size={14} />}
            onClick={handleImport}
            loading={importing}
            disabled={!file}
          >
            {t('bankImport.submit')}
          </Button>
        </div>
      </div>
    </div>
  );
}
