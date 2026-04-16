import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, Plus, Trash2, Pencil, BookMarked, X, Check } from 'lucide-react';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { useLang } from '../components/LangProvider';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

type Subject = { id: string; name: string; code: string | null; description: string | null };
type UserInfo = { name?: string; role?: string; avatar_url?: string };

export default function SubjectsPage() {
  const navigate = useNavigate();
  const { t } = useLang();
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
      if (res.ok) { setShowCreate(false); setNewName(''); setNewCode(''); setNewDesc(''); loadSubjects(); }
    } catch {} finally { setCreating(false); }
  };

  const startEdit = (s: Subject) => {
    setEditingId(s.id); setEditName(s.name); setEditCode(s.code || ''); setEditDesc(s.description || '');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await fetch('/api/otisak/subjects', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ id: editingId, name: editName, code: editCode || undefined, description: editDesc || undefined }),
    });
    setEditingId(null); loadSubjects();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('subjects.deleteConfirm'))) return;
    await fetch(`/api/otisak/subjects?id=${id}`, { method: 'DELETE', credentials: 'include' });
    loadSubjects();
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
                          <Button variant="primary" size="sm" leftIcon={<Check size={14} />} onClick={handleSaveEdit}>{t('subjects.save')}</Button>
                          <Button variant="secondary" size="sm" leftIcon={<X size={14} />} onClick={() => setEditingId(null)}>{t('subjects.cancel')}</Button>
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
                          <Button variant="ghost" size="sm" onClick={() => startEdit(s)}><Pencil size={14} /></Button>
                          {user.role === 'admin' && (
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)} className="text-danger hover:bg-danger-light"><Trash2 size={14} /></Button>
                          )}
                        </div>
                      </div>
                    )}
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
            <h2 className="text-lg font-display font-semibold text-[var(--text-primary)] mb-4">{t('subjects.add')}</h2>
            <div className="space-y-3">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('subjects.namePlaceholder')} autoFocus />
              <input value={newCode} onChange={(e) => setNewCode(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('subjects.codePlaceholder')} />
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm" placeholder={t('subjects.descPlaceholder')} />
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <Button variant="secondary" onClick={() => setShowCreate(false)}>{t('subjects.cancel')}</Button>
              <Button variant="primary" loading={creating} onClick={handleCreate}>{t('subjects.create')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
