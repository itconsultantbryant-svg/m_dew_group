'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearStaffSession, staffRequest } from '@/lib/staff-session';
import type { StaffUser } from '@/lib/staff-session';

const LINKS = [
  { href: '/staff', label: 'Dashboard' },
  { href: '/staff/reservations', label: 'Reservations' },
  { href: '/admin', label: 'Admin console' },
];

export function StaffNav({ user }: { user: StaffUser | null }) {
  const router = useRouter();

  async function signOut() {
    try {
      await staffRequest('/auth/staff/logout', { method: 'POST' });
    } catch {
      // ignore network errors on sign out
    }
    clearStaffSession();
    router.push('/staff/login');
  }

  return (
    <div className="border-b border-forest-900/10 bg-forest-950 text-ivory-100">
      <div className="container-page flex flex-wrap items-center justify-between gap-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/staff" className="font-display text-lg font-semibold text-ivory-50">
            Mountain Dew <span className="text-brass-light">Staff</span>
          </Link>
          <nav className="flex gap-1" aria-label="Staff">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-md px-3 py-1.5 text-sm font-medium text-ivory-200 hover:bg-ivory-100/10">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <span className="text-ivory-200/80">
              {user.fullName} · <span className="text-brass-light">{user.role.replace(/_/g, ' ')}</span>
            </span>
          ) : null}
          <button type="button" onClick={() => void signOut()} className="rounded-md border border-ivory-100/30 px-3 py-1.5 font-medium hover:bg-ivory-100/10">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
