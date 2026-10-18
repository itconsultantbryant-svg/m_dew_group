import Link from 'next/link';

const EXPLORE = [
  { href: '/rooms', label: 'Rooms & rates' },
  { href: '/restaurant', label: 'Restaurant' },
  { href: '/boutique', label: 'Boutique' },
  { href: '/experiences', label: 'Experiences' },
];

const GUESTS = [
  { href: '/book', label: 'Book a stay' },
  { href: '/manage', label: 'Manage a booking' },
  { href: '/contact', label: 'Contact us' },
  { href: '/staff/login', label: 'Staff sign in' },
];

export function Footer() {
  return (
    <footer className="mt-24 bg-forest-950 text-ivory-200">
      <div className="h-1 bg-gradient-to-r from-brass-dark via-brass to-terracotta" aria-hidden />
      <div className="container-page grid gap-10 py-16 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full ring-1 ring-ivory-100/20">
              <img src="/images/brand/logo.png" alt="" width={40} height={40} className="h-10 w-10 object-cover" />
            </span>
            <p className="font-display text-xl font-semibold text-ivory-50">Mountain Dew Group</p>
          </div>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ivory-200/80">
            A warm boutique guest house and hotel in Monrovia, Liberia, with a restaurant serving Liberian dishes, a
            clothing boutique and an entertainment centre with a cigar bar.
          </p>
          <p className="mt-5 text-sm text-ivory-200/70">
            Reservations:{' '}
            <a className="font-medium text-brass-light hover:underline" href="mailto:reservations@example.com">
              reservations@example.com
            </a>
          </p>
        </div>

        <div>
          <p className="eyebrow text-brass-light">Explore</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {EXPLORE.map((item) => (
              <li key={item.href}>
                <Link className="text-ivory-200/85 transition-colors hover:text-brass-light" href={item.href}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="eyebrow text-brass-light">Guests</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {GUESTS.map((item) => (
              <li key={item.href}>
                <Link className="text-ivory-200/85 transition-colors hover:text-brass-light" href={item.href}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-ivory-100/10">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-ivory-200/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Mountain Dew Group. All rights reserved.</p>
          <p className="max-w-xl sm:text-right">
            Demonstration catalogue: rates, menus, taxes and contact details are placeholders pending approval. Payment
            is collected at the property.
          </p>
        </div>
      </div>
    </footer>
  );
}
