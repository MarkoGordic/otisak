import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Key, Pencil, User } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { ROLES, type RoleFilter, type StatusFilter, type Translate, type UserData } from './types';

type UserListProps = {
  users: UserData[];
  currentUserId: string | null;
  search: string;
  roleFilter: RoleFilter;
  statusFilter: StatusFilter;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onRoleChange: (user: UserData, role: string) => void;
  onEdit: (u: UserData) => void;
  onSetPassword: (u: UserData) => void;
  onOpenProfile: (id: string) => void;
  t: Translate;
};

// Filtering lives here, not in the page, so typing in search re-renders only
// the list. Kept outside the page so rows don't re-create on every parent render.
function UserListImpl({
  users,
  currentUserId,
  search,
  roleFilter,
  statusFilter,
  page,
  pageSize,
  onPageChange,
  onRoleChange,
  onEdit,
  onSetPassword,
  onOpenProfile,
  t,
}: UserListProps) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter === 'active' && !u.is_active) return false;
      if (statusFilter === 'inactive' && u.is_active) return false;
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        (u.name?.toLowerCase().includes(q) ?? false) ||
        (u.index_number?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [users, search, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const slice = filtered.slice(start, start + pageSize);

  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
      <div className="hidden md:grid grid-cols-[minmax(0,1fr)_7rem_9rem_7rem_6.5rem] gap-4 items-center px-5 py-2.5 border-b border-[var(--border-subtle)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        <div>{t('users.user')}</div>
        <div>{t('users.index')}</div>
        <div>{t('users.role')}</div>
        <div>{t('users.lastLogin')}</div>
        <div />
      </div>
      {slice.length === 0 ? (
        <div className="py-12 text-center text-sm text-[var(--text-muted)]">
          {t('users.noResults')}
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-subtle)]">
          {slice.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              isSelf={u.id === currentUserId}
              onRoleChange={onRoleChange}
              onEdit={onEdit}
              onSetPassword={onSetPassword}
              onOpenProfile={onOpenProfile}
              t={t}
            />
          ))}
        </div>
      )}

      {filtered.length > pageSize && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
          <span className="tabular-nums">
            {start + 1}-{Math.min(start + pageSize, filtered.length)} / {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t('users.prevPage')}
              onClick={() => onPageChange(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
              className="p-1.5 rounded-md hover:bg-[var(--bg-tertiary)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="font-mono">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              aria-label={t('users.nextPage')}
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
export const UserList = React.memo(UserListImpl);

type UserRowProps = {
  user: UserData;
  isSelf: boolean;
  onRoleChange: (user: UserData, role: string) => void;
  onEdit: (u: UserData) => void;
  onSetPassword: (u: UserData) => void;
  onOpenProfile: (id: string) => void;
  t: Translate;
};

const iconButton =
  'p-1.5 rounded-md text-[var(--text-muted)] hover:text-accent hover:bg-[var(--bg-tertiary)] transition-colors';

function UserRowImpl({
  user,
  isSelf,
  onRoleChange,
  onEdit,
  onSetPassword,
  onOpenProfile,
  t,
}: UserRowProps) {
  const display = user.name || user.email;
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_7rem_9rem_7rem_6.5rem] gap-x-4 gap-y-2 items-center px-4 md:px-5 py-3 hover:bg-[var(--bg-tertiary)] transition-colors ${user.is_active ? '' : 'opacity-70'}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full bg-accent-light text-accent flex items-center justify-center text-xs font-semibold flex-shrink-0">
          {display[0]?.toUpperCase() || '?'}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium text-[var(--text-primary)] truncate">
              {display}
            </span>
            {isSelf && <Badge variant="accent">{t('users.you')}</Badge>}
            {user.ldap_uid && <Badge variant="info">{t('users.badgeIpa')}</Badge>}
            {!user.is_active &&
              (user.ldap_archived_at ? (
                <Badge variant="warning">{t('users.badgeArchived')}</Badge>
              ) : (
                <Badge variant="neutral">{t('users.inactive')}</Badge>
              ))}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] truncate">
            {user.email}
            {/* On phones the index column is gone; keep it next to the e-mail. */}
            {user.index_number && <span className="md:hidden"> · {user.index_number}</span>}
            {!user.is_active && user.ldap_archived_at && (
              <>
                {' · '}
                {t(
                  user.ldap_archived_reason === 'locked'
                    ? 'users.archivedLocked'
                    : 'users.archivedRemoved',
                  {
                    date: new Date(user.ldap_archived_at).toLocaleDateString(),
                  },
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="hidden md:block text-xs text-[var(--text-secondary)] font-mono truncate">
        {user.index_number || '-'}
      </div>

      <div className="row-start-2 md:row-start-auto col-span-1">
        <select
          value={user.role}
          disabled={isSelf}
          title={isSelf ? t('users.selfRoleLocked') : undefined}
          onChange={(e) => onRoleChange(user, e.target.value)}
          className="h-8 px-2 w-full max-w-[11rem] rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`users.${r}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="hidden md:block text-xs text-[var(--text-muted)]">
        {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : t('users.never')}
      </div>

      <div className="row-start-1 col-start-2 md:row-start-auto md:col-start-auto flex items-center justify-end gap-0.5">
        <button
          type="button"
          title={t('users.openProfile')}
          aria-label={t('users.openProfile')}
          onClick={() => onOpenProfile(user.id)}
          className={iconButton}
        >
          <User size={14} />
        </button>
        <button
          type="button"
          title={t('users.edit')}
          aria-label={t('users.edit')}
          onClick={() => onEdit(user)}
          className={iconButton}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          title={t('users.setPassword')}
          aria-label={t('users.setPassword')}
          onClick={() => onSetPassword(user)}
          className={iconButton}
        >
          <Key size={14} />
        </button>
      </div>
    </div>
  );
}
const UserRow = React.memo(UserRowImpl);
