import { useState, useEffect } from 'react';
import { Fingerprint } from 'lucide-react';
import { useLang } from '../LangProvider';
import { useToast } from '../Toast';
import { Button } from '../ui/Button';

// Self-service password change dialog. Extracted from Sidebar.tsx; state stays
// local to one component, no global context needed for a single dialog.
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  // Optional ELPIS ID self-linking. `elpisConfigured` gates the whole section;
  // when the feature is off this fetch fails/returns false and nothing renders.
  const [elpisConfigured, setElpisConfigured] = useState(false);
  const [elpisLinked, setElpisLinked] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/elpis/link-status', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        setElpisConfigured(!!d.configured);
        setElpisLinked(!!d.linked);
      })
      .catch(() => { /* feature stays hidden */ });
    return () => { alive = false; };
  }, []);

  const startLink = () => {
    const back = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/api/auth/elpis/link?returnTo=${back}`;
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    try {
      const res = await fetch('/api/auth/elpis/unlink', { method: 'POST', credentials: 'include' });
      if (!res.ok) { toast.error(t('account.elpis.unlinkFailed')); return; }
      setElpisLinked(false);
      toast.success(t('account.elpis.unlinked'));
    } catch {
      toast.error(t('account.elpis.unlinkFailed'));
    } finally {
      setUnlinking(false);
    }
  };

  const handleSave = async () => {
    if (next.length < 6) {
      toast.error(t('account.passwordTooShort'));
      return;
    }
    if (next !== confirm) {
      toast.error(t('account.passwordMismatch'));
      return;
    }
    if (next === current) {
      toast.error(t('account.passwordSame'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || t('account.passwordChangeFailed'));
        return;
      }
      toast.success(t('account.passwordChanged'));
      onClose();
    } catch {
      toast.error(t('account.passwordChangeFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-display font-semibold text-[var(--text-primary)] mb-4">
          {t('account.changePasswordTitle')}
        </h2>
        <div className="space-y-3">
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoFocus
            placeholder={t('account.currentPasswordPlaceholder')}
            className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm"
          />
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder={t('account.newPasswordPlaceholder')}
            className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm"
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t('account.confirmPasswordPlaceholder')}
            className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm"
          />
        </div>

        {elpisConfigured && (
          <div className="mt-5 pt-5 border-t border-[var(--border-default)]">
            <div className="flex items-center gap-2 mb-2">
              <Fingerprint size={16} className="text-accent" />
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t('account.elpis.title')}</h3>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-[var(--text-secondary)]">
                {elpisLinked ? t('account.elpis.linked') : t('account.elpis.notLinked')}
              </p>
              {elpisLinked ? (
                <Button variant="secondary" size="sm" loading={unlinking} onClick={handleUnlink}>
                  {t('account.elpis.unlink')}
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={startLink}>
                  {t('account.elpis.link')}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
