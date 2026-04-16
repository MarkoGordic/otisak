'use client';

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Fingerprint,
  LayoutDashboard,
  Settings,
  Users,
  LogOut,
  FileText,
  BookOpen,
  Sun,
  Moon,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

type SidebarProps = {
  userName?: string;
  userRole?: string;
  userAvatar?: string;
};

export function Sidebar({ userName, userRole, userAvatar }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  const isAdmin = userRole === 'admin';
  const isStaff = userRole === 'admin' || userRole === 'assistant';

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
    ...(isStaff ? [
      { id: 'manage', label: 'Manage Exams', icon: Settings, href: '/manage' },
      { id: 'questions', label: 'Question Bank', icon: BookOpen, href: '/questions' },
    ] : []),
    ...(isAdmin ? [
      { id: 'users', label: 'Users', icon: Users, href: '/admin/users' },
    ] : []),
  ];

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    router.push('/login');
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[260px] bg-[var(--bg-elevated)] border-r border-[var(--border-default)] hidden lg:flex flex-col z-30">
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-3 border-b border-[var(--border-subtle)]">
        <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center">
          <Fingerprint className="w-5 h-5 text-accent" strokeWidth={1.5} />
        </div>
        <div>
          <div className="text-base font-display font-bold text-[var(--text-primary)] leading-tight">OTISAK</div>
          <div className="text-[11px] text-[var(--text-muted)]">Assessment System</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <button
              key={item.id}
              onClick={() => router.push(item.href)}
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
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>

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
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-danger hover:bg-danger-light transition-colors"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export function MobileNav({ userName, userRole }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const isStaff = userRole === 'admin' || userRole === 'assistant';

  const navItems = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard, href: '/dashboard' },
    ...(isStaff ? [
      { id: 'manage', label: 'Manage', icon: Settings, href: '/manage' },
    ] : []),
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[var(--bg-elevated)] border-t border-[var(--border-default)] z-30 flex items-center justify-around px-2 py-2">
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <button
            key={item.id}
            onClick={() => router.push(item.href)}
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
