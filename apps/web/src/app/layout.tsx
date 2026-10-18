import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';

const display = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
});

const sans = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'Mountain Dew Group — Boutique stay, dining & experiences in Monrovia',
    template: '%s · Mountain Dew Group',
  },
  description:
    'Book a comfortable room at Mountain Dew Group in Monrovia, Liberia. A boutique guest house with a restaurant serving Liberian dishes, a clothing boutique and an entertainment centre with a cigar bar.',
};

export const viewport: Viewport = {
  themeColor: '#173D32',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-forest-900 focus:px-4 focus:py-2 focus:text-ivory-100"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
