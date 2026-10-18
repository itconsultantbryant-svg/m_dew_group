import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container-page py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-brass-ink">404</p>
      <h1 className="mt-3 text-4xl font-semibold">We could not find that page</h1>
      <p className="mx-auto mt-3 max-w-md text-charcoal-600">
        The page may have moved. You can return home, browse our rooms, or manage an existing booking.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/" className="rounded-md bg-forest-900 px-5 py-2.5 text-sm font-semibold text-ivory-100 hover:bg-forest-800">
          Go home
        </Link>
        <Link href="/rooms" className="rounded-md border border-forest-900/30 px-5 py-2.5 text-sm font-semibold text-forest-900 hover:bg-forest-900/5">
          Browse rooms
        </Link>
      </div>
    </div>
  );
}
