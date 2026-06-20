import { useState } from 'react';
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
