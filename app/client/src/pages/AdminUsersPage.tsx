import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Users, Upload, Search, X } from 'lucide-react';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import { AppCopyright } from '../components/AppCopyright';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/Toast';
import { UserList } from '../components/users/UserList';
import { CreateUserModal, EditUserModal, PasswordModal } from '../components/users/UserModals';
import { LdapSyncPanel } from '../components/users/LdapSyncPanel';
import {
  ROLES,
  type RoleFilter,
  type StatusFilter,
  type UserData,
} from '../components/users/types';

type UserInfo = { id?: string; name?: string; role?: string; avatar_url?: string };

type ImportSummary = {
  created: number;
  skipped: number;
  total: number;
  items?: { skipped: Array<{ index_number: string; reason: string }> };
};

const PAGE_SIZE = 50;

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const { t } = useLang();
  const toast = useToast();
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserData[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ processed: number; total: number } | null>(
    null,
  );
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [page, setPage] = useState(1);

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
      setCurrentUser({
        id: data.user?.id,
        name: data.user?.name,
        role: data.user?.role,
        avatar_url: data.user?.avatar_url,
      });
    })();
  }, [navigate]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users', { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setUsers(d.users || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) loadUsers();
  }, [currentUser, loadUsers]);

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

  // A role change from the table used to save on the first click, so one slip
  // in a long list silently promoted or demoted someone. Confirm it first.
  const handleRoleChange = useCallback(
    async (user: UserData, newRole: string) => {
      if (newRole === user.role) return;
      const ok = confirm(
        t('users.roleChangeConfirm', {
          name: user.name || user.email,
          role: t(`users.${newRole}`),
        }),
      );
      // Cancel: the select is controlled, so React puts the old role back.
      if (!ok) return;
      try {
        const res = await fetch('/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id: user.id, role: newRole }),
        });
        if (res.ok) {
          toast.success(t('users.roleChanged'));
          setUsers((arr) => arr.map((u) => (u.id === user.id ? { ...u, role: newRole } : u)));
        } else {
          const d = await res.json().catch(() => ({}));
          toast.error(
            d.error === 'SELF_LOCKOUT'
              ? t('users.selfRoleLocked')
              : d.error || t('users.roleChangeFailed'),
          );
        }
      } catch {
        toast.error(t('users.roleChangeFailed'));
      }
    },
    [t, toast],
  );

  // Role chip counts follow the status filter, so "Students 412" matches the
  // list you get when you click it.
  const roleCounts = useMemo(() => {
    const inStatus = users.filter((u) =>
      statusFilter === 'all' ? true : statusFilter === 'active' ? u.is_active : !u.is_active,
    );
    const counts: Record<string, number> = { all: inStatus.length };
    for (const r of ROLES) counts[r] = inStatus.filter((u) => u.role === r).length;
    return counts;
  }, [users, statusFilter]);
  const activeCount = useMemo(() => users.filter((u) => u.is_active).length, [users]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  const chip = (active: boolean) =>
    `inline-flex flex-shrink-0 items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors ${
      active
        ? 'bg-accent text-white'
        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
    }`;

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex">
      <Sidebar
        userName={currentUser.name}
        userRole={currentUser.role}
        userAvatar={currentUser.avatar_url}
      />
      <MobileNav userName={currentUser.name} userRole={currentUser.role} />

      <div className="flex-1 min-w-0 lg:ml-[260px] flex flex-col min-h-screen">
        <main className="flex-1 flex flex-col pb-20 lg:pb-8">
          <div className="p-4 sm:p-6 lg:p-8 max-w-[1100px] mx-auto min-h-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-accent-light flex items-center justify-center flex-shrink-0">
                  <Users className="w-6 h-6 text-accent" strokeWidth={1.5} />
                </div>
                <div>
                  <h1 className="text-2xl font-display font-bold text-[var(--text-primary)]">
                    {t('users.title')}
                  </h1>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {t('users.summary', { active: activeCount, total: users.length })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      handleImportFile(e.target.files?.[0] || null);
                      e.target.value = '';
                    }}
                    disabled={importing}
                  />
                  <span
                    className={`inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-medium transition-colors ${importing ? 'opacity-50 cursor-not-allowed' : 'hover:border-accent hover:text-accent'}`}
                  >
                    {importing ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Upload size={14} />
                    )}
                    {t('users.importCsv')}
                  </span>
                </label>
                <Button
                  variant="primary"
                  leftIcon={<Plus size={16} />}
                  onClick={() => setShowCreate(true)}
                >
                  {t('users.add')}
                </Button>
              </div>
            </div>

            <LdapSyncPanel onSynced={loadUsers} />

            {importing && importProgress && (
              <div className="mb-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
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
                    style={{
                      width: `${Math.round((importProgress.processed / Math.max(1, importProgress.total)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {importSummary && (
              <div className="mb-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[var(--text-primary)] font-medium">
                      {t('users.importDone')}
                    </span>
                    <span className="text-success">
                      +{importSummary.created} {t('users.imported')}
                    </span>
                    {importSummary.skipped > 0 && (
                      <span className="text-warning">
                        {importSummary.skipped} {t('users.skipped')}
                      </span>
                    )}
                    <span className="text-[var(--text-muted)]">
                      / {importSummary.total} {t('users.totalRows')}
                    </span>
                  </div>
                  <button
                    onClick={() => setImportSummary(null)}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs"
                  >
                    {t('users.dismiss')}
                  </button>
                </div>
                {importSummary.items?.skipped && importSummary.items.skipped.length > 0 && (
                  <details className="mt-2 text-xs text-[var(--text-secondary)]">
                    <summary className="cursor-pointer">{t('users.viewSkipped')}</summary>
                    <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                      {importSummary.items.skipped.map((s, i) => (
                        <li key={i} className="flex justify-between gap-3">
                          <span className="font-mono">{s.index_number || '-'}</span>
                          <span className="text-[var(--text-muted)]">{s.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {!loading && (
              <div className="mb-3 space-y-3">
                <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1 w-fit max-w-full">
                  {(['all', ...ROLES] as RoleFilter[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setRoleFilter(r);
                        setPage(1);
                      }}
                      className={chip(roleFilter === r)}
                    >
                      {r === 'all' ? t('users.allRoles') : t(`users.rolePlural.${r}`)}
                      <span
                        className={`tabular-nums ${roleFilter === r ? 'text-white/80' : 'text-[var(--text-muted)]'}`}
                      >
                        {roleCounts[r] ?? 0}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[220px] max-w-[420px]">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                    />
                    <input
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                      placeholder={t('users.searchPlaceholder')}
                      className="w-full h-9 pl-8 pr-8 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm focus:border-accent focus:ring-0"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        aria-label={t('questions.clearSearch')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value as StatusFilter);
                      setPage(1);
                    }}
                    className="h-9 px-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm"
                  >
                    <option value="active">{t('users.filterActive')}</option>
                    <option value="inactive">{t('users.filterInactive')}</option>
                    <option value="all">{t('users.filterAll')}</option>
                  </select>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-accent" />
              </div>
            ) : (
              <UserList
                users={users}
                currentUserId={currentUser.id ?? null}
                search={search}
                roleFilter={roleFilter}
                statusFilter={statusFilter}
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
          <div className="mt-auto px-4 pb-6 pt-2 flex justify-center">
            <AppCopyright />
          </div>
        </main>
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadUsers();
          }}
        />
      )}

      {editTarget && (
        <EditUserModal
          user={editTarget}
          isSelf={editTarget.id === currentUser.id}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            setEditTarget(null);
            setUsers((arr) => arr.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
          }}
        />
      )}

      {passwordTarget && (
        <PasswordModal user={passwordTarget} onClose={() => setPasswordTarget(null)} />
      )}
    </div>
  );
}
