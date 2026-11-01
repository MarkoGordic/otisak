import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useLang } from '../LangProvider';
import { useToast } from '../Toast';
import { Button } from '../ui/Button';
import { ROLES, inputClass, type UserData } from './types';

// Shared dialog frame: Escape and a backdrop click close it, like the rest of the app.
function ModalShell({
  title,
  subtitle,
  onClose,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useLang();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[var(--bg-elevated)] rounded-2xl border border-[var(--border-default)] shadow-xl w-full max-w-md">
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-display font-semibold text-[var(--text-primary)]">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('users.cancel')}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-6 space-y-3">{children}</div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 mt-5 border-t border-[var(--border-subtle)]">
          {footer}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{label}</span>
      {children}
    </label>
  );
}

function RoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useLang();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {t(`users.${r}`)}
        </option>
      ))}
    </select>
  );
}

export function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useLang();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('student');
  const [index, setIndex] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!email.trim() || !password) return toast.error(t('users.emailPasswordRequired'));
    if (password.length < 6) return toast.error(t('users.passwordTooShort'));
    setCreating(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim() || undefined,
          role,
          index_number: index.trim() || undefined,
        }),
      });
      if (res.ok) {
        toast.success(t('users.createSuccess'));
        onCreated();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('users.createFailed'));
      }
    } catch {
      toast.error(t('users.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <ModalShell
      title={t('users.addTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('users.cancel')}
          </Button>
          <Button variant="primary" loading={creating} onClick={handleCreate}>
            {t('users.createUser')}
          </Button>
        </>
      }
    >
      <Field label={t('users.name')}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className={inputClass}
        />
      </Field>
      <Field label={t('users.email')}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('users.indexNumber')}>
          <input
            value={index}
            onChange={(e) => setIndex(e.target.value)}
            className={inputClass}
            placeholder="IN 1/2024"
          />
        </Field>
        <Field label={t('users.role')}>
          <RoleSelect value={role} onChange={setRole} />
        </Field>
      </div>
      <Field label={t('users.password')}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          placeholder={t('users.passwordPlaceholder')}
        />
      </Field>
    </ModalShell>
  );
}

export function EditUserModal({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: UserData;
  isSelf: boolean;
  onClose: () => void;
  onSaved: (u: UserData) => void;
}) {
  const { t } = useLang();
  const toast = useToast();
  const [name, setName] = useState(user.name ?? '');
  const [email, setEmail] = useState(user.email);
  const [indexNumber, setIndexNumber] = useState(user.index_number ?? '');
  const [role, setRole] = useState(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: user.id,
          name: name.trim() || null,
          email: email.trim(),
          index_number: indexNumber.trim() || null,
          // Your own role and status are not editable: the server refuses
          // anything that would lock you out of the admin console.
          ...(isSelf ? {} : { role, is_active: isActive }),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          d.error === 'SELF_LOCKOUT' ? t('users.selfRoleLocked') : d.error || t('users.saveFailed'),
        );
        return;
      }
      toast.success(t('users.saveSuccess'));
      onSaved(d.user as UserData);
    } catch {
      toast.error(t('users.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title={t('users.editTitle')}
      subtitle={user.email}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('users.cancel')}
          </Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>
            {t('users.save')}
          </Button>
        </>
      }
    >
      <Field label={t('users.name')}>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </Field>
      <Field label={t('users.email')}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('users.indexNumber')}>
          <input
            value={indexNumber}
            onChange={(e) => setIndexNumber(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={t('users.role')}>
          {isSelf ? (
            <div
              className={`${inputClass} flex items-center opacity-60`}
              title={t('users.selfRoleLocked')}
            >
              {t(`users.${user.role}`)}
            </div>
          ) : (
            <RoleSelect value={role} onChange={setRole} />
          )}
        </Field>
      </div>
      {!isSelf && (
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          {t('users.statusActive')}
        </label>
      )}
      {isSelf && <p className="text-xs text-[var(--text-muted)]">{t('users.selfRoleLocked')}</p>}
      {!user.is_active && user.ldap_archived_at && (
        <p className="text-xs text-[var(--text-muted)]">{t('users.archivedNote')}</p>
      )}
    </ModalShell>
  );
}

export function PasswordModal({ user, onClose }: { user: UserData; onClose: () => void }) {
  const { t } = useLang();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (password.length < 6) return toast.error(t('users.passwordTooShort'));
    setSaving(true);
    try {
      const res = await fetch('/api/admin/users/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: user.id, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || t('users.passwordFailed'));
        return;
      }
      toast.success(t('users.passwordChanged'));
      onClose();
    } catch {
      toast.error(t('users.passwordFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title={t('users.passwordTitle')}
      subtitle={user.name || user.email}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('users.cancel')}
          </Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>
            {t('users.save')}
          </Button>
        </>
      }
    >
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        autoFocus
        placeholder={t('users.passwordPlaceholder')}
        className={inputClass}
      />
    </ModalShell>
  );
}
