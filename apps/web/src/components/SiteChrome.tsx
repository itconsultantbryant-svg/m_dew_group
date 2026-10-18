'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

const BARE_PREFIXES = ['/admin', '/staff'];

function useIsBare(): boolean {
  const pathname = usePathname() ?? '';
  return BARE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function SiteHeader() {
  if (useIsBare()) return null;
  return <Header />;
}

export function SiteFooter() {
  if (useIsBare()) return null;
  return <Footer />;
}
