import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, Plus, Trash2, Pencil, BookMarked, X, Check, UserPlus } from 'lucide-react';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import { AppCopyright } from '../components/AppCopyright';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/Toast';

type Subject = { id: string; name: string; code: string | null; description: string | null };
type UserInfo = { name?: string; role?: string; avatar_url?: string };

export default function SubjectsPage() {
  const navigate = useNavigate();
  const { t } = useLang();
  const toast = useToast();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [assignmentsSubject, setAssignmentsSubject] = useState<Subject | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/session', { credentials: 'include' });
      const data = await res.json();
      if (!data.authenticated || (data.user?.role !== 'admin' && data.user?.role !== 'assistant')) {
        navigate('/dashboard', { replace: true }); return;
      }
      setUser({ name: data.user?.name, role: data.user?.role, avatar_url: data.user?.avatar_url });
    })();
  }, [navigate]);

  const loadSubjects = useCallback(async () => {
    try {
      const res = await fetch('/api/otisak/subjects', { credentials: 'include' });
      if (res.ok) { const d = await res.json(); setSubjects(d.subjects || []); }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) loadSubjects(); }, [user, loadSubjects]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/otisak/subjects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name: newName, code: newCode || undefined, description: newDesc || undefined }),
      });
      if (res.ok) {
        setShowCreate(false);
        setNewName(''); setNewCode(''); setNewDesc('');
        toast.success(t('subjects.createSuccess'));
        loadSubjects();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('subjects.createFailed'));
      }
    } catch {
      toast.error(t('subjects.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (s: Subject) => {
    setEditingId(s.id); setEditName(s.name); setEditCode(s.code || ''); setEditDesc(s.description || '');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch('/api/otisak/subjects', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ id: editingId, name: editName, code: editCode || undefined, description: editDesc || undefined }),
      });
      if (res.ok) {
        toast.success(t('subjects.saveSuccess'));
        setEditingId(null);
        loadSubjects();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('subjects.saveFailed'));
      }
    } catch {
      toast.error(t('subjects.saveFailed'));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('subjects.deleteConfirm'))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/otisak/subjects?id=${id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        toast.success(t('subjects.deleteSuccess'));
        loadSubjects();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('subjects.deleteFailed'));
      }
    } catch {
      toast.error(t('subjects.deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  };

  if (!user || loading) {
    return <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex">
      <Sidebar userName={user.name} userRole={user.role} userAvatar={user.avatar_url} />
      <MobileNav userName={user.name} userRole={user.role} />

      <div className="flex-1 lg:ml-[260px] flex flex-col min-h-screen">
        <main className="flex-1 pb-20 lg:pb-8">
          <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto bg-[var(--bg-primary)] min-h-full">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-accent-light flex items-center justify-center">
                  <BookMarked className="w-6 h-6 text-accent" strokeWidth={1.5} />
                </div>
                <div>
                  <h1 className="text-2xl font-display font-bold text-[var(--text-primary)]">{t('subjects.title')}</h1>
                  <p className="text-sm text-[var(--text-secondary)]">{subjects.length} {t('subjects.count')}</p>
                </div>
              </div>
              <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => setShowCreate(true)}>{t('subjects.add')}</Button>
            </div>

            {subjects.length === 0 ? (
              <EmptyState icon={<BookMarked size={32} strokeWidth={1.5} />} title={t('subjects.noSubjects')} description={t('subjects.noSubjectsDesc')} actionLabel={t('subjects.add')} onAction={() => setShowCreate(true)} />
            ) : (
              <div className="space-y-2">
                {subjects.map((s, idx) => (
                  <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
                    className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] p-4 hover:border-[var(--text-muted)] transition-colors">
                    {editingId === s.id ? (
                      <div className="space-y-3">
                        <input value={editName} onChange={(e) => setEditName(e.target.value)}
                          className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('subjects.namePlaceholder')} />
                        <div className="flex gap-3">
                          <input value={editCode} onChange={(e) => setEditCode(e.target.value)}
                            className="w-32 h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('subjects.codePlaceholder')} />
                          <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                            className="flex-1 h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('subjects.descPlaceholder')} />
                        </div>
                        <div className="flex gap-2">
                          <Button variant="primary" size="sm" leftIcon={<Check size={14} />} loading={savingEdit} onClick={handleSaveEdit}>{t('subjects.save')}</Button>
                          <Button variant="secondary" size="sm" leftIcon={<X size={14} />} onClick={() => setEditingId(null)} disabled={savingEdit}>{t('subjects.cancel')}</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-display font-semibold text-[var(--text-primary)]">{s.name}</h3>
                            {s.code && <span className="text-xs font-mono text-accent bg-accent-light px-2 py-0.5 rounded">{s.code}</span>}
                          </div>
                          {s.description && <p className="text-xs text-[var(--text-muted)] mt-1">{s.description}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          {user.role === 'admin' && (
                            <Button variant="ghost" size="sm" leftIcon={<UserPlus size={14} />} onClick={() => setAssignmentsSubject(s)}>
                              {t('subjects.assistants')}
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => startEdit(s)}><Pencil size={14} /></Button>
                          {user.role === 'admin' && (
                            <Button variant="ghost" size="sm" loading={deletingId === s.id} onClick={() => handleDelete(s.id)} className="text-danger hover:bg-danger-light"><Trash2 size={14} /></Button>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
          <div className="px-4 pb-6 pt-2 flex justify-center"><AppCopyright /></div>
        </main>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-display font-semibold text-[var(--text-primary)] mb-4">{t('subjects.add')}</h2>
            <div className="space-y-3">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('subjects.namePlaceholder')} autoFocus />
              <input value={newCode} onChange={(e) => setNewCode(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('subjects.codePlaceholder')} />
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('subjects.descPlaceholder')} />
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={creating}>{t('subjects.cancel')}</Button>
              <Button variant="primary" loading={creating} onClick={handleCreate}>{t('subjects.create')}</Button>
            </div>
          </div>
        </div>
      )}

      {assignmentsSubject && (
        <AssignmentsModal
          subject={assignmentsSubject}
          onClose={() => setAssignmentsSubject(null)}
        />
      )}
    </div>
  );
}

// ----- Assignments modal -----

type AssignmentRow = {
  user_id: string;
  subject_id: string;
  role: string;
  email: string;
  name: string | null;
  index_number: string | null;
};

type AllUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

function AssignmentsModal({ subject, onClose }: { subject: { id: string; name: string }; onClose: () => void }) {
  const { t } = useLang();
  const toast = useToast();
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [users, setUsers] = useState<AllUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, u] = await Promise.all([
        fetch(`/api/admin/subjects/${subject.id}/assignments`, { credentials: 'include' }),
        fetch('/api/admin/users', { credentials: 'include' }),
      ]);
      if (a.ok) { const d = await a.json(); setAssignments(d.assignments || []); }
      if (u.ok) { const d = await u.json(); setUsers((d.users as AllUserRow[]) || []); }
    } finally { setLoading(false); }
  }, [subject.id]);

  useEffect(() => { load(); }, [load]);

  const assignedIds = new Set(assignments.map((a) => a.user_id));
  // Anyone with role 'assistant' (or 'admin' for completeness) who isn't
  // already assigned to this subject. Filter is plain substring over name
  // and email — the user list is small (one screen of staff).
  const candidates = users
    .filter((u) => (u.role === 'assistant' || u.role === 'admin') && !assignedIds.has(u.id))
    .filter((u) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return u.email.toLowerCase().includes(q) || (u.name?.toLowerCase().includes(q) ?? false);
    });

  const handleAssign = async (userId: string) => {
    setPendingUserId(userId);
    try {
      const res = await fetch(`/api/admin/subjects/${subject.id}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ user_id: userId, role: 'assistant' }),
      });
      if (res.ok) {
        toast.success(t('subjects.assignSuccess'));
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('subjects.assignFailed'));
      }
    } catch {
      toast.error(t('subjects.assignFailed'));
    } finally {
      setPendingUserId(null);
    }
  };

  const handleUnassign = async (userId: string) => {
    setPendingUserId(userId);
    try {
      const res = await fetch(`/api/admin/subjects/${subject.id}/assignments/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        toast.success(t('subjects.unassignSuccess'));
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('subjects.unassignFailed'));
      }
    } catch {
      toast.error(t('subjects.unassignFailed'));
    } finally {
      setPendingUserId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] shadow-lg w-full max-w-lg p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-display font-semibold text-[var(--text-primary)]">{t('subjects.assistantsTitle')}</h2>
          <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={16} /></button>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-4 truncate">{subject.name}</p>

        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-accent" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">{t('subjects.assistantsTitle')}</h3>
              {assignments.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] py-2">{t('subjects.noAssistants')}</p>
              ) : (
                <ul className="space-y-1">
                  {assignments.map((a) => (
                    <li key={a.user_id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm text-[var(--text-primary)] truncate">{a.name || a.email}</div>
                        <div className="text-[11px] text-[var(--text-muted)] truncate">{a.email}</div>
                      </div>
                      <Button variant="ghost" size="sm" loading={pendingUserId === a.user_id} onClick={() => handleUnassign(a.user_id)} className="text-danger">
                        {t('subjects.unassign')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">{t('subjects.pickAssistant')}</h3>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('subjects.searchAssistants')}
                className="w-full h-9 px-3 mb-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm"
              />
              {candidates.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] py-2">—</p>
              ) : (
                <ul className="space-y-1 max-h-56 overflow-y-auto">
                  {candidates.slice(0, 30).map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm text-[var(--text-primary)] truncate">{u.name || u.email}</div>
                        <div className="text-[11px] text-[var(--text-muted)] truncate">{u.email}</div>
                      </div>
                      <Button variant="ghost" size="sm" loading={pendingUserId === u.id} onClick={() => handleAssign(u.id)} className="text-accent">
                        {t('subjects.assign')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end mt-4">
          <Button variant="secondary" onClick={onClose}>{t('subjects.close')}</Button>
        </div>
      </div>
    </div>
  );
}
