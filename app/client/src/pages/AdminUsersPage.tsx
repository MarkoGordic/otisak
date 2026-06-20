import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, Plus, Users, Upload, Search,
  ChevronLeft, ChevronRight, Pencil, Key, User,
} from 'lucide-react';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import { AppCopyright } from '../components/AppCopyright';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/Toast';

type UserData = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  index_number: string | null;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
};

type UserInfo = { name?: string; role?: string; avatar_url?: string };

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const { t } = useLang();
  const toast = useToast();
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserData[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('student');
  const [newIndex, setNewIndex] = useState('');
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ processed: number; total: number } | null>(null);
  const [importSummary, setImportSummary] = useState<{ created: number; skipped: number; total: number; items?: { skipped: Array<{ index_number: string; reason: string }> } } | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'assistant' | 'admin'>('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // Edit + password modals share the "currently targeted user" so the row
  // action buttons stay simple ("open with this user").
  const [editTarget, setEditTarget] = useState<UserData | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<UserData | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/session', { credentials: 'include' });
      const data = await res.json();
      if (!data.authenticated || data.user?.role !== 'admin') {
        navigate('/dashboard', { replace: true });
        return;
      }
      setCurrentUser({ name: data.user?.name, role: data.user?.role });
    })();
  }, [navigate]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users', { credentials: 'include' });
      if (res.ok) { const d = await res.json(); setUsers(d.users || []); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (currentUser) loadUsers(); }, [currentUser, loadUsers]);

  const handleCreate = async () => {
    if (!newEmail || !newPassword) return;
    setCreating(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          name: newName || undefined,
          role: newRole,
          index_number: newIndex || undefined,
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setNewEmail(''); setNewPassword(''); setNewName(''); setNewRole('student'); setNewIndex('');
        toast.success(t('users.createSuccess'));
        loadUsers();
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

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    setImportSummary(null);
    setImporting(true);
    setImportProgress(null);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const total = lines.length;
      if (total === 0) {
        toast.error(t('users.importFailed'));
        return;
      }
      setImportProgress({ processed: 0, total });

      const CHUNK = 25; // rows per request
      const allCreated: Array<{ index_number: string; email: string }> = [];
      const allSkipped: Array<{ index_number: string; reason: string }> = [];

      for (let i = 0; i < total; i += CHUNK) {
        const chunk = lines.slice(i, i + CHUNK).join('\n');
        const res = await fetch('/api/admin/users/import-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ csv: chunk }),
        });
        const d = await res.json();
        if (!res.ok) {
          toast.error(d.error || t('users.importFailed'));
          break;
        }
        if (d.items?.created) allCreated.push(...d.items.created);
        if (d.items?.skipped) allSkipped.push(...d.items.skipped);
        setImportProgress({ processed: Math.min(i + CHUNK, total), total });
      }

      setImportSummary({
        created: allCreated.length,
        skipped: allSkipped.length,
        total,
        items: { skipped: allSkipped },
      });
      loadUsers();
    } catch (e) {
      toast.error((e as Error).message || t('users.importFailed'));
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: userId, role: newRole }),
      });
      if (res.ok) {
        toast.success(t('users.roleChanged'));
        loadUsers();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('users.roleChangeFailed'));
      }
    } catch {
      toast.error(t('users.roleChangeFailed'));
    }
  };

  if (!currentUser) {
    return <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex">
      <Sidebar userName={currentUser.name} userRole={currentUser.role} />
      <MobileNav userName={currentUser.name} userRole={currentUser.role} />

      <div className="flex-1 lg:ml-[260px] flex flex-col min-h-screen">
        <main className="flex-1 pb-20 lg:pb-8">
          <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto bg-[var(--bg-primary)] min-h-full">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-accent-light flex items-center justify-center">
                  <Users className="w-6 h-6 text-accent" strokeWidth={1.5} />
                </div>
                <div>
                  <h1 className="text-2xl font-display font-bold text-[var(--text-primary)]">{t('users.title')}</h1>
                  <p className="text-sm text-[var(--text-secondary)]">{users.length} {t('users.count')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0] || null; handleImportFile(f); e.target.value = ''; }}
                    disabled={importing}
                  />
                  <span className={`inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-medium transition-colors ${importing ? 'opacity-50 cursor-not-allowed' : 'hover:border-accent hover:text-accent'}`}>
                    {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {t('users.importCsv')}
                  </span>
                </label>
                <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => setShowCreate(true)}>
                  {t('users.add')}
                </Button>
              </div>
            </div>

            {importing && importProgress && (
              <div className="mb-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-[var(--text-primary)] font-medium flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-accent" />
                    {t('users.importProcessing')}
                  </span>
                  <span className="text-[var(--text-muted)] font-mono">
                    {importProgress.processed} / {importProgress.total}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                  <div
                    className="h-full bg-accent transition-[width] duration-200 ease-out"
                    style={{ width: `${Math.round((importProgress.processed / Math.max(1, importProgress.total)) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {importSummary && (
              <div className="mb-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[var(--text-primary)] font-medium">{t('users.importDone')}</span>
                    <span className="text-success">+{importSummary.created} {t('users.imported')}</span>
                    {importSummary.skipped > 0 && (
                      <span className="text-warning">{importSummary.skipped} {t('users.skipped')}</span>
                    )}
                    <span className="text-[var(--text-muted)]">/ {importSummary.total} {t('users.totalRows')}</span>
                  </div>
                  <button onClick={() => setImportSummary(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs">{t('users.dismiss')}</button>
                </div>
                {importSummary.items?.skipped && importSummary.items.skipped.length > 0 && (
                  <details className="mt-2 text-xs text-[var(--text-secondary)]">
                    <summary className="cursor-pointer">{t('users.viewSkipped')}</summary>
                    <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                      {importSummary.items.skipped.map((s, i) => (
                        <li key={i} className="flex justify-between gap-3">
                          <span className="font-mono">{s.index_number || '—'}</span>
                          <span className="text-[var(--text-muted)]">{s.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {!loading && (
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="relative flex-1 min-w-[220px] max-w-[420px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    placeholder={t('users.searchPlaceholder')}
                    className="w-full h-9 pl-8 pr-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm focus:border-accent focus:ring-0"
                  />
                </div>
                <select
                  value={roleFilter}
                  onChange={(e) => { setRoleFilter(e.target.value as typeof roleFilter); setPage(1); }}
                  className="h-9 px-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm"
                >
                  <option value="all">{t('users.allRoles')}</option>
                  <option value="student">{t('users.student')}</option>
                  <option value="assistant">{t('users.assistant')}</option>
                  <option value="admin">{t('users.admin')}</option>
                </select>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
            ) : (
              <UserList
                users={users}
                search={search}
                roleFilter={roleFilter}
                page={page}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                onRoleChange={handleRoleChange}
                onEdit={setEditTarget}
                onSetPassword={setPasswordTarget}
                onOpenProfile={(id) => navigate(`/users/${id}`)}
                t={t}
              />
            )}
          </div>
          <div className="px-4 pb-6 pt-2 flex justify-center"><AppCopyright /></div>
        </main>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-display font-semibold text-[var(--text-primary)] mb-4">{t('users.addTitle')}</h2>
            <div className="space-y-3">
              <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('users.email')} />
              <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('users.password')} />
              <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('users.name')} />
              <input value={newIndex} onChange={(e) => setNewIndex(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('users.indexNumber')} />
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm">
                <option value="student">{t('users.student')}</option>
                <option value="assistant">{t('users.assistant')}</option>
                <option value="admin">{t('users.admin')}</option>
              </select>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <Button variant="secondary" onClick={() => setShowCreate(false)}>{t('users.cancel')}</Button>
              <Button variant="primary" loading={creating} onClick={handleCreate}>{t('users.createUser')}</Button>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <EditUserModal
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            setEditTarget(null);
            setUsers((arr) => arr.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
          }}
        />
      )}

      {passwordTarget && (
        <PasswordModal
          user={passwordTarget}
          onClose={() => setPasswordTarget(null)}
        />
      )}
    </div>
  );
}

// ----- list + row components, kept outside the page so they don't re-create on every parent render -----

type UserListProps = {
  users: UserData[];
  search: string;
  roleFilter: 'all' | 'student' | 'assistant' | 'admin';
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onRoleChange: (id: string, role: string) => void;
  onEdit: (u: UserData) => void;
  onSetPassword: (u: UserData) => void;
  onOpenProfile: (id: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

function UserListImpl({ users, search, roleFilter, page, pageSize, onPageChange, onRoleChange, onEdit, onSetPassword, onOpenProfile, t }: UserListProps) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        (u.name?.toLowerCase().includes(q) ?? false) ||
        (u.index_number?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [users, search, roleFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const slice = filtered.slice(start, start + pageSize);

  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] overflow-hidden">
      <div className="hidden sm:flex items-center px-5 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border-default)] text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        <div className="flex-1">{t('users.user')}</div>
        <div className="w-32">{t('users.index')}</div>
        <div className="w-36">{t('users.role')}</div>
        <div className="w-32">{t('users.lastLogin')}</div>
        <div className="w-24 text-right">{t('users.edit')}</div>
      </div>
      {slice.length === 0 ? (
        <div className="py-12 text-center text-sm text-[var(--text-muted)]">{t('users.noResults')}</div>
      ) : (
        slice.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            onRoleChange={onRoleChange}
            onEdit={onEdit}
            onSetPassword={onSetPassword}
            onOpenProfile={onOpenProfile}
            t={t}
          />
        ))
      )}

      {filtered.length > pageSize && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-default)] text-xs text-[var(--text-muted)]">
          <span>
            {start + 1}-{Math.min(start + pageSize, filtered.length)} / {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
              className="p-1.5 rounded-md hover:bg-[var(--bg-tertiary)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="font-mono">{safePage} / {totalPages}</span>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
              disabled={safePage >= totalPages}
              className="p-1.5 rounded-md hover:bg-[var(--bg-tertiary)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
const UserList = React.memo(UserListImpl);

type UserRowProps = {
  user: UserData;
  onRoleChange: (id: string, role: string) => void;
  onEdit: (u: UserData) => void;
  onSetPassword: (u: UserData) => void;
  onOpenProfile: (id: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

function UserRowImpl({ user, onRoleChange, onEdit, onSetPassword, onOpenProfile, t }: UserRowProps) {
  return (
    <div className="flex items-center px-5 py-3 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-tertiary)] transition-colors">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--text-primary)] truncate">{user.name || user.email}</div>
        <div className="text-[11px] text-[var(--text-muted)] truncate">{user.email}</div>
      </div>
      <div className="w-32 text-xs text-[var(--text-muted)] font-mono truncate">{user.index_number || '—'}</div>
      <div className="w-36">
        <select
          value={user.role}
          onChange={(e) => onRoleChange(user.id, e.target.value)}
          className="h-9 px-2 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm"
        >
          <option value="student">{t('users.student')}</option>
          <option value="assistant">{t('users.assistant')}</option>
          <option value="admin">{t('users.admin')}</option>
        </select>
      </div>
      <div className="w-32 text-xs text-[var(--text-muted)]">
        {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : t('users.never')}
      </div>
      <div className="w-32 flex items-center justify-end gap-1">
        <button
          type="button"
          title={t('users.openProfile')}
          onClick={() => onOpenProfile(user.id)}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-accent hover:bg-[var(--bg-tertiary)]"
        >
          <User size={14} />
        </button>
        <button
          type="button"
          title={t('users.edit')}
          onClick={() => onEdit(user)}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-accent hover:bg-[var(--bg-tertiary)]"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          title={t('users.setPassword')}
          onClick={() => onSetPassword(user)}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-accent hover:bg-[var(--bg-tertiary)]"
        >
          <Key size={14} />
        </button>
      </div>
    </div>
  );
}
const UserRow = React.memo(UserRowImpl);

// ----- Modals -----

function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserData;
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
          role,
          is_active: isActive,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || t('users.saveFailed'));
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-display font-semibold text-[var(--text-primary)] mb-4">{t('users.editTitle')}</h2>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('users.name')} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('users.email')} />
          <input value={indexNumber} onChange={(e) => setIndexNumber(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('users.indexNumber')} />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm">
            <option value="student">{t('users.student')}</option>
            <option value="assistant">{t('users.assistant')}</option>
            <option value="admin">{t('users.admin')}</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            {t('users.statusActive')}
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={onClose} disabled={saving}>{t('users.cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>{t('users.save')}</Button>
        </div>
      </div>
    </div>
  );
}

function PasswordModal({ user, onClose }: { user: UserData; onClose: () => void }) {
  const { t } = useLang();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (password.length < 6) {
      toast.error(t('users.passwordTooShort'));
      return;
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-display font-semibold text-[var(--text-primary)] mb-1">{t('users.passwordTitle')}</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4 truncate">{user.name || user.email}</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          placeholder={t('users.passwordPlaceholder')}
          className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm"
        />
        <div className="flex items-center justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={onClose} disabled={saving}>{t('users.cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>{t('users.save')}</Button>
        </div>
      </div>
    </div>
  );
}
