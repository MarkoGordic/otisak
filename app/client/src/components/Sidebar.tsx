
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Fingerprint,
  LayoutDashboard,
  Settings,
  Users,
  LogOut,
  BookOpen,
  BookMarked,
  BookText,
  Sun,
  Moon,
  Key,
} from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { useLang } from './LangProvider';
import { useToast } from './Toast';
import { Button } from './ui/Button';
import { LanguagePicker } from './LanguagePicker';

type SidebarProps = {
  userName?: string;
  userRole?: string;
  userAvatar?: string;
};

export function Sidebar({ userName, userRole }: SidebarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  const { t } = useLang();

  const isAdmin = userRole === 'admin';
  const isStaff = userRole === 'admin' || userRole === 'assistant';

  const navItems = [
    isStaff
      ? { id: 'admin-home', label: t('nav.adminHome'), icon: LayoutDashboard, href: '/admin/home' }
      : { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, href: '/dashboard' },
    ...(isStaff ? [
      { id: 'manage', label: t('nav.manage'), icon: Settings, href: '/manage' },
      { id: 'subjects', label: t('nav.subjects'), icon: BookMarked, href: '/subjects' },
      { id: 'questions', label: t('nav.questionBank'), icon: BookOpen, href: '/questions' },
    ] : []),
    ...(isAdmin ? [
      { id: 'users', label: t('nav.users'), icon: Users, href: '/admin/users' },
      { id: 'settings', label: t('nav.settings'), icon: Settings, href: '/admin/settings' },
    ] : []),
    // Documentation — visible to everyone with a session.
    { id: 'docs', label: t('nav.docs'), icon: BookText, href: '/docs' },
  ];

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    navigate('/admin');
  };

  const [showPasswordModal, setShowPasswordModal] = useState(false);

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[260px] bg-[var(--bg-elevated)] border-r border-[var(--border-default)] hidden lg:flex flex-col z-30">
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-3 border-b border-[var(--border-subtle)]">
        <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center">
          <Fingerprint className="w-5 h-5 text-accent" strokeWidth={1.5} />
        </div>
        <div>
          <div className="text-base font-display font-bold text-[var(--text-primary)] leading-tight">OTISAK</div>
          <div className="text-[11px] text-[var(--text-muted)]">{t('nav.assessmentSystem')}</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.href)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-0.5 ${
                active
                  ? 'bg-accent-light text-accent'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <item.icon size={18} strokeWidth={active ? 2 : 1.5} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Theme + User */}
      <div className="p-3 border-t border-[var(--border-subtle)]">
        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors mb-1"
        >
          {theme === 'dark' ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
          {theme === 'dark' ? t('nav.lightMode') : t('nav.darkMode')}
        </button>

        {/* Language picker: flag dropdown. Opens upward (sidebar bottom). */}
        <div className="mb-1">
          <LanguagePicker variant="sidebar" placement="top" />
        </div>

        {/* User */}
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-accent-light flex items-center justify-center text-accent text-xs font-bold">
            {userName?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[var(--text-primary)] truncate">{userName || 'User'}</div>
            <div className="text-[11px] text-[var(--text-muted)] capitalize">{userRole}</div>
          </div>
          <button
            onClick={() => setShowPasswordModal(true)}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-accent hover:bg-accent-light transition-colors"
            title={t('account.changePassword')}
          >
            <Key size={16} />
          </button>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-danger hover:bg-danger-light transition-colors"
            title={t('nav.signOut')}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}
    </aside>
  );
}

// Lives in Sidebar.tsx because the button that opens it does too. Keeps the
// state local to one component; no global context needed for a single dialog.
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (next.length < 6) { toast.error(t('account.passwordTooShort')); return; }
    if (next !== confirm) { toast.error(t('account.passwordMismatch')); return; }
    if (next === current) { toast.error(t('account.passwordSame')); return; }
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
        <h2 className="text-lg font-display font-semibold text-[var(--text-primary)] mb-4">{t('account.changePasswordTitle')}</h2>
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
          <Button variant="secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>{t('common.save')}</Button>
        </div>
      </div>
    </div>
  );
}

export function MobileNav({ userRole }: SidebarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useLang();

  const isStaff = userRole === 'admin' || userRole === 'assistant';

  const navItems = [
    isStaff
      ? { id: 'admin-home', label: t('nav.home'), icon: LayoutDashboard, href: '/admin/home' }
      : { id: 'dashboard', label: t('nav.home'), icon: LayoutDashboard, href: '/dashboard' },
    ...(isStaff ? [
      { id: 'manage', label: t('nav.manage.short'), icon: Settings, href: '/manage' },
    ] : []),
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[var(--bg-elevated)] border-t border-[var(--border-default)] z-30 flex items-center justify-around px-2 py-2">
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.href)}
            className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              active ? 'text-accent' : 'text-[var(--text-muted)]'
            }`}
          >
            <item.icon size={20} strokeWidth={active ? 2 : 1.5} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
