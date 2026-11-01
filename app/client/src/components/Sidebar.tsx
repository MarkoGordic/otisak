import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Fingerprint,
  LayoutDashboard,
  ClipboardList,
  Settings,
  Users,
  LogOut,
  BookOpen,
  BookMarked,
  BookText,
  Dumbbell,
  GraduationCap,
  Sun,
  Moon,
  Key,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { useLang } from './LangProvider';
import { LanguagePicker } from './LanguagePicker';
import { ChangePasswordModal } from './account/ChangePasswordModal';

type SidebarProps = {
  userName?: string;
  userRole?: string;
  userAvatar?: string;
};

type NavItem = { id: string; label: string; icon: LucideIcon; href: string };
type NavSection = { id: string; title?: string; items: NavItem[] };

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(href + '/');

function useNavSections(userRole?: string): NavSection[] {
  const { t } = useLang();
  const isAdmin = userRole === 'admin';
  const isStaff = isAdmin || userRole === 'assistant' || userRole === 'professor';

  const sections: NavSection[] = [
    {
      id: 'home',
      items: [
        isStaff
          ? {
              id: 'admin-home',
              label: t('nav.adminHome'),
              icon: LayoutDashboard,
              href: '/admin/home',
            }
          : {
              id: 'dashboard',
              label: t('nav.dashboard'),
              icon: LayoutDashboard,
              href: '/dashboard',
            },
      ],
    },
  ];
  if (isStaff) {
    sections.push(
      {
        id: 'teaching',
        title: t('nav.section.teaching'),
        items: [
          { id: 'manage', label: t('nav.manage'), icon: ClipboardList, href: '/manage' },
          // Administering practice templates; 'my-practice' below is where staff
          // TAKE one. Different icons on purpose: look-alikes that go elsewhere
          // are a trap.
          {
            id: 'practice-admin',
            label: t('nav.practiceAdmin'),
            icon: Dumbbell,
            href: '/practice',
          },
          { id: 'questions', label: t('nav.questionBank'), icon: BookOpen, href: '/questions' },
          { id: 'subjects', label: t('nav.subjects'), icon: BookMarked, href: '/subjects' },
        ],
      },
      {
        id: 'mine',
        title: t('nav.section.mine'),
        items: [
          {
            id: 'my-practice',
            label: t('nav.myPractice'),
            icon: GraduationCap,
            href: '/dashboard',
          },
        ],
      },
    );
  }
  if (isAdmin) {
    sections.push({
      id: 'admin',
      title: t('nav.section.admin'),
      items: [
        { id: 'users', label: t('nav.users'), icon: Users, href: '/admin/users' },
        { id: 'logs', label: t('nav.logs'), icon: ScrollText, href: '/admin/logs' },
        { id: 'settings', label: t('nav.settings'), icon: Settings, href: '/admin/settings' },
      ],
    });
  }
  return sections;
}

export function Sidebar({ userName, userRole, userAvatar }: SidebarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  const { t } = useLang();
  const sections = useNavSections(userRole);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    navigate('/login');
  };

  const renderItem = (item: NavItem) => {
    const active = isActive(pathname, item.href);
    return (
      <Link
        key={item.id}
        to={item.href}
        aria-current={active ? 'page' : undefined}
        className={`relative flex items-center gap-3 h-9 px-3 rounded-lg text-[13px] font-medium transition-colors ${
          active
            ? 'bg-accent-light text-accent'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
        }`}
      >
        {active && (
          <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-accent" />
        )}
        <item.icon size={17} strokeWidth={active ? 2 : 1.6} className="flex-shrink-0" />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  const roleLabel = userRole ? t(`users.${userRole}`) : '';

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[260px] bg-[var(--bg-elevated)] border-r border-[var(--border-subtle)] hidden lg:flex flex-col z-30">
      {/* Logo */}
      <Link to={sections[0].items[0].href} className="flex items-center gap-3 px-5 pt-6 pb-5">
        <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shadow-sm">
          <Fingerprint className="w-5 h-5 text-white" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-display font-bold tracking-wide text-[var(--text-primary)] leading-tight">
            OTISAK
          </div>
          <div className="text-[11px] text-[var(--text-muted)] truncate">
            {t('nav.assessmentSystem')}
          </div>
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex-1 px-3 pb-3 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.id} className={section.title ? 'mt-5' : ''}>
            {section.title && (
              <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {section.title}
              </div>
            )}
            <div className="space-y-0.5">{section.items.map(renderItem)}</div>
          </div>
        ))}
        <div className="mt-5 pt-3 border-t border-[var(--border-subtle)]">
          {renderItem({ id: 'docs', label: t('nav.docs'), icon: BookText, href: '/docs' })}
        </div>
      </nav>

      {/* Preferences + account */}
      <div className="p-3 border-t border-[var(--border-subtle)] space-y-2">
        <div className="flex items-center gap-1">
          <div className="flex-1 min-w-0">
            <LanguagePicker variant="sidebar" placement="top" />
          </div>
          <button
            onClick={toggle}
            title={theme === 'dark' ? t('nav.lightMode') : t('nav.darkMode')}
            aria-label={theme === 'dark' ? t('nav.lightMode') : t('nav.darkMode')}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            {theme === 'dark' ? (
              <Sun size={17} strokeWidth={1.6} />
            ) : (
              <Moon size={17} strokeWidth={1.6} />
            )}
          </button>
        </div>

        <div className="flex items-center gap-2.5 rounded-xl bg-[var(--bg-tertiary)] px-2.5 py-2">
          {userAvatar ? (
            <img
              src={userAvatar}
              alt=""
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-accent-light flex items-center justify-center text-accent text-xs font-bold flex-shrink-0">
              {userName?.[0]?.toUpperCase() || '?'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">
              {userName || 'User'}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] truncate">{roleLabel}</div>
          </div>
          <button
            onClick={() => setShowPasswordModal(true)}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-accent hover:bg-accent-light transition-colors"
            title={t('account.changePassword')}
            aria-label={t('account.changePassword')}
          >
            <Key size={15} />
          </button>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-danger hover:bg-danger-light transition-colors"
            title={t('nav.signOut')}
            aria-label={t('nav.signOut')}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
    </aside>
  );
}

export function MobileNav({ userRole }: SidebarProps) {
  const { pathname } = useLocation();
  const { t } = useLang();
  const isStaff = userRole === 'admin' || userRole === 'assistant' || userRole === 'professor';

  const navItems: NavItem[] = isStaff
    ? [
        { id: 'admin-home', label: t('nav.home'), icon: LayoutDashboard, href: '/admin/home' },
        { id: 'manage', label: t('nav.manage.short'), icon: ClipboardList, href: '/manage' },
        {
          id: 'practice-admin',
          label: t('nav.practiceAdmin.short'),
          icon: Dumbbell,
          href: '/practice',
        },
        { id: 'questions', label: t('nav.questionBank.short'), icon: BookOpen, href: '/questions' },
        {
          id: 'my-practice',
          label: t('nav.myPractice.short'),
          icon: GraduationCap,
          href: '/dashboard',
        },
      ]
    : [
        { id: 'dashboard', label: t('nav.home'), icon: LayoutDashboard, href: '/dashboard' },
        { id: 'docs', label: t('nav.docs'), icon: BookText, href: '/docs' },
      ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[color-mix(in_srgb,var(--bg-elevated)_95%,transparent)] backdrop-blur border-t border-[var(--border-subtle)] z-30 flex items-center justify-around px-1 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
      {navItems.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.id}
            to={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
              active ? 'text-accent' : 'text-[var(--text-muted)]'
            }`}
          >
            <item.icon size={20} strokeWidth={active ? 2 : 1.5} />
            <span className="truncate max-w-full">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
