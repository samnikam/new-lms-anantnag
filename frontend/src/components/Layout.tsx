import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, LogOut, Menu, X } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { ROLE_LABELS, useAuth } from '../lib/auth';
import { navFor } from '../lib/nav';

export function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => (await api.get<{ count: number }>('/notifications/unread-count')).data,
    refetchInterval: 60_000,
  });

  if (!user) return null;
  const items = navFor(user.role);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — role-filtered navigation */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-brand-700 text-sm font-bold text-white">
            LMS
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">Hybrid Learning</p>
            <p className="truncate text-xs text-slate-500">PWD J&amp;K — Pahalgam</p>
          </div>
        </div>

        <nav className="space-y-0.5 p-3" aria-label="Main navigation">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-soft hover:bg-slate-50 hover:text-ink',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setMenuOpen(false)} />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
          <button
            type="button"
            className="rounded p-2 text-ink-soft hover:bg-slate-100 lg:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="ml-auto flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate('/notifications')}
              className="relative rounded p-2 text-ink-soft hover:bg-slate-100"
              aria-label={`Notifications${unread?.count ? `, ${unread.count} unread` : ''}`}
            >
              <Bell className="h-5 w-5" />
              {!!unread?.count && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                  {unread.count > 9 ? '9+' : unread.count}
                </span>
              )}
            </button>

            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-ink">{user.fullName}</p>
              <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
            </div>

            <button
              type="button"
              onClick={async () => {
                await signOut();
                navigate('/login');
              }}
              className="btn-secondary"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
