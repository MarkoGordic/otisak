import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Loader2, Plus, Users, Shield, GraduationCap, UserCircle2,
} from 'lucide-react';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Dropdown } from '../components/ui/Dropdown';

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

const roleIcon: Record<string, React.ReactNode> = {
  admin: <Shield size={14} />,
  assistant: <UserCircle2 size={14} />,
  student: <GraduationCap size={14} />,
};

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const { t } = useLang();
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
        loadUsers();
      } else {
        const d = await res.json();
        alert(d.error || 'Failed to create user');
      }
    } catch { alert('Error creating user'); }
    finally { setCreating(false); }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id: userId, role: newRole }),
    });
    loadUsers();
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
              <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => setShowCreate(true)}>
                {t('users.add')}
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
            ) : (
              <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] overflow-hidden">
                <div className="hidden sm:flex items-center px-5 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border-default)] text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  <div className="flex-1">{t('users.user')}</div>
                  <div className="w-32">{t('users.index')}</div>
                  <div className="w-36">{t('users.role')}</div>
                  <div className="w-32">{t('users.lastLogin')}</div>
                </div>
                {users.map((u, idx) => (
                  <motion.div key={u.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }}
                    className="flex items-center px-5 py-3 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[var(--text-primary)] truncate">{u.name || u.email}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">{u.email}</div>
                    </div>
                    <div className="w-32 text-xs text-[var(--text-muted)] font-mono">{u.index_number || '\u2014'}</div>
                    <div className="w-36">
                      <Dropdown
                        options={[
                          { value: 'student', label: t('users.student') },
                          { value: 'assistant', label: t('users.assistant') },
                          { value: 'admin', label: t('users.admin') },
                        ]}
                        value={u.role}
                        onChange={(v) => handleRoleChange(u.id, v)}
                      />
                    </div>
                    <div className="w-32 text-xs text-[var(--text-muted)]">
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : t('users.never')}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-display font-semibold text-[var(--text-primary)] mb-4">{t('users.addTitle')}</h2>
            <div className="space-y-3">
              <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('users.email')} />
              <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('users.password')} />
              <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('users.name')} />
              <input value={newIndex} onChange={(e) => setNewIndex(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('users.indexNumber')} />
              <Dropdown options={[{ value: 'student', label: t('users.student') }, { value: 'assistant', label: t('users.assistant') }, { value: 'admin', label: t('users.admin') }]} value={newRole} onChange={setNewRole} />
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <Button variant="secondary" onClick={() => setShowCreate(false)}>{t('users.cancel')}</Button>
              <Button variant="primary" loading={creating} onClick={handleCreate}>{t('users.createUser')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
