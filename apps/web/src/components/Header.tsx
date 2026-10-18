import Link from 'next/link';
import { NavLinks } from '@/components/NavLinks';

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-forest-900/10 bg-ivory-100/90 shadow-[0_1px_0_rgba(22,26,22,0.04)] backdrop-blur-md">
      <div className="h-1 bg-gradient-to-r from-brass-dark via-brass to-terracotta" aria-hidden />
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <Link href="/" className="group flex items-center gap-3" aria-label="Mountain Dew Group home">
          <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full ring-1 ring-forest-900/15">
            <img src="/images/brand/logo.png" alt="" width={40} height={40} className="h-10 w-10 object-cover" />
          </span>
          <span className="leading-none">
            <span className="block font-display text-lg font-semibold text-forest-900">Mountain Dew Group</span>
            <span className="mt-1 block text-[0.7rem] font-medium uppercase tracking-[0.18em] text-brass-ink">
              Monrovia · Liberia
            </span>
          </span>
        </Link>

        <NavLinks variant="desktop" />

        <div className="flex items-center gap-2">
          <Link href="/staff/login" className="btn btn-ghost hidden px-3 py-2 text-sm sm:inline-flex">
            Staff
          </Link>
          <Link href="/book" className="btn btn-primary">
            Book a stay
          </Link>
        </div>
      </div>
      <NavLinks variant="mobile" />
    </header>
  );
}
