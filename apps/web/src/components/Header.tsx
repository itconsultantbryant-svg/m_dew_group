import Link from 'next/link';
import { NavLinks } from '@/components/NavLinks';

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-forest-900/10 bg-ivory-100/90 shadow-[0_1px_0_rgba(22,26,22,0.04)] backdrop-blur-md">
      <div className="h-1 bg-gradient-to-r from-brass-dark via-brass to-terracotta" aria-hidden />
      <div className="container-page flex h-16 items-center justify-between gap-3 sm:gap-6">
        <Link href="/" className="group flex min-w-0 items-center gap-3" aria-label="Mountain Dew Group home">
          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full ring-1 ring-forest-900/15">
            <img src="/images/brand/logo.png" alt="" width={40} height={40} className="h-10 w-10 object-cover" />
          </span>
          <span className="min-w-0 leading-none">
            <span className="block whitespace-nowrap font-display text-sm font-semibold text-forest-900 sm:text-lg">
              Mountain Dew Group
            </span>
            <span className="mt-1 block text-[0.65rem] font-medium uppercase tracking-[0.14em] text-brass-ink sm:text-[0.7rem] sm:tracking-[0.18em]">
              Monrovia · Liberia
            </span>
          </span>
        </Link>

        <NavLinks variant="desktop" />

        <div className="flex items-center gap-2">
          <Link href="/staff/login" className="btn btn-ghost hidden px-3 py-2 text-sm sm:inline-flex">
            Staff
          </Link>
          <Link href="/book" className="btn btn-primary shrink-0">
            <span className="sm:hidden">Book</span>
            <span className="hidden sm:inline">Book a stay</span>
          </Link>
        </div>
      </div>
      <NavLinks variant="mobile" />
    </header>
  );
}
