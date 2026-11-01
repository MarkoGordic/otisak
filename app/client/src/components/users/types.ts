export type UserData = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  index_number: string | null;
  is_active: boolean;
  ldap_uid: string | null;
  ldap_archived_at: string | null;
  ldap_archived_reason: 'removed' | 'locked' | null;
  created_at: string;
  last_login_at: string | null;
};

export type RoleFilter = 'all' | 'student' | 'assistant' | 'professor' | 'admin';
export type StatusFilter = 'active' | 'inactive' | 'all';

export const ROLES = ['student', 'assistant', 'professor', 'admin'] as const;

export type Translate = (key: string, params?: Record<string, string | number>) => string;

export const inputClass =
  'w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:border-accent focus:ring-0';
