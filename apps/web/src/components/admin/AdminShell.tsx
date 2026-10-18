'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { hasPermission, type Role } from '@mdg/domain';
import { ADMIN_NAV } from '@/lib/admin-nav';
import { AdminIcon } from '@/components/admin/AdminIcon';
import { clearStaffSession, staffRequest } from '@/lib/staff-session';
import { useRequireStaff } from '@/lib/use-staff';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, ready } = useRequireStaff();
  const pathname = usePathname() ?? '/admin';
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const role = (user?.role ?? '') as Role;

  const groups = useMemo(
    () =>
      ADMIN_NAV.map((group) => ({
        ...group,
        items: group.items.filter((item) => (user ? hasPermission(role, item.permission) : false)),
      })).filter((group) => group.items.length > 0),
    [role, user],
  );

  const current = useMemo(() => {
    const all = ADMIN_NAV.flatMap((g) => g.items);
    return [...all].sort((a, b) => b.href.length - a.href.length).find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  }, [pathname]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function signOut() {
    try {
      await staffRequest('/auth/staff/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    clearStaffSession();
    router.push('/staff/login');
  }

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ivory-100 text-charcoal-600">
        Loading workspace…
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-ivory-100 lg:flex">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-forest-950 text-ivory-100 transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Admin navigation"
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <img src="/images/brand/logo.png" alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover ring-1 ring-brass/40" />
          <div className="leading-tight">
            <p className="font-display text-base font-semibold text-ivory-50">Mountain Dew</p>
            <p className="text-xs uppercase tracking-widest text-brass-light">Admin console</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="ml-auto rounded-md p-1 text-ivory-200 hover:bg-ivory-100/10 lg:hidden" aria-label="Close navigation">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
          {groups.map((group) => (
            <div key={group.heading}>
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-widest text-ivory-200/50">{group.heading}</p>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          active ? 'bg-brass/20 text-ivory-50 ring-1 ring-brass/40' : 'text-ivory-200/80 hover:bg-ivory-100/10 hover:text-ivory-50'
                        }`}
                      >
                        <AdminIcon name={item.icon} className={`h-5 w-5 ${active ? 'text-brass-light' : 'text-ivory-200/60'}`} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-ivory-100/10 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brass/25 text-sm font-semibold text-ivory-50">
              {(user?.fullName ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium text-ivory-50">{user?.fullName ?? 'Staff'}</p>
              <p className="truncate text-xs text-ivory-200/60">{user?.role?.replace(/_/g, ' ') ?? ''}</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Link href="/" className="flex-1 rounded-md border border-ivory-100/20 px-3 py-1.5 text-center text-xs font-medium text-ivory-100 hover:bg-ivory-100/10">
              View site
            </Link>
            <button type="button" onClick={() => void signOut()} className="flex-1 rounded-md border border-ivory-100/20 px-3 py-1.5 text-xs font-medium text-ivory-100 hover:bg-ivory-100/10">
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {open ? <button type="button" aria-label="Close navigation overlay" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-charcoal-900/40 lg:hidden" /> : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-forest-900/10 bg-ivory-100/95 px-4 py-3 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-forest-900/20 p-2 text-forest-900 lg:hidden" aria-label="Open navigation">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-semibold text-forest-900">{current?.label ?? 'Admin'}</h1>
            <p className="truncate text-xs text-charcoal-500">{current?.description ?? 'Mountain Dew Group administration'}</p>
          </div>
          <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-success-surface px-3 py-1 text-xs font-semibold text-success sm:inline-flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            Live
          </span>
        </header>

        <div className="flex-1 p-4 sm:p-6 lg:p-8">{children}</div>
      </div>
    </div>
  );
}
