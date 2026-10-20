'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/rooms', label: 'Stay' },
  { href: '/restaurant', label: 'Dining' },
  { href: '/boutique', label: 'Boutique' },
  { href: '/experiences', label: 'Experiences' },
  { href: '/manage', label: 'Manage booking' },
  { href: '/contact', label: 'Contact' },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ variant }: { variant: 'desktop' | 'mobile' }) {
  const pathname = usePathname() ?? '/';

  if (variant === 'desktop') {
    return (
      <nav aria-label="Primary" className="hidden items-center gap-0.5 xl:flex">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`relative rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'text-forest-900'
                  : 'text-charcoal-600 hover:bg-forest-900/5 hover:text-forest-900'
              }`}
            >
              {item.label}
              {active ? (
                <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-brass" />
              ) : null}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Primary mobile" className="border-t border-forest-900/10 xl:hidden">
      <div className="container-page flex gap-1.5 overflow-x-auto py-2">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-forest-900 text-ivory-100'
                  : 'text-charcoal-700 hover:bg-forest-900/5'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
