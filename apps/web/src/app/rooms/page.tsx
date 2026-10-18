import type { Metadata } from 'next';
import { SearchBar } from '@/components/SearchBar';
import { RoomCard } from '@/components/RoomCard';
import { getProperty, getRoomTypes, searchAvailability } from '@/lib/server-api';
import { todayISO } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Rooms & rates',
  description: 'Browse comfortable rooms and rates at Mountain Dew Group in Monrovia, Liberia.',
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const checkIn = first(params.checkIn);
  const checkOut = first(params.checkOut);
  const adults = Number(first(params.adults) ?? 2);
  const children = Number(first(params.children) ?? 0);
  const rooms = Number(first(params.rooms) ?? 1);

  const hasDates = Boolean(checkIn && checkOut && checkIn < checkOut);

  const [property, roomTypes, availability] = await Promise.all([
    getProperty(),
    getRoomTypes(),
    hasDates ? searchAvailability({ checkIn: checkIn!, checkOut: checkOut!, rooms, adults, children }) : Promise.resolve(null),
  ]);

  const search = hasDates ? { checkIn: checkIn!, checkOut: checkOut!, adults, children, rooms } : undefined;
  const availabilityByType = new Map(
    (availability?.results ?? []).map((r) => [r.roomType.slug, r] as const),
  );

  const visible = roomTypes.filter((rt) => !availability || availabilityByType.has(rt.slug));
  const soldOut = roomTypes.filter((rt) => availability && !availabilityByType.has(rt.slug));

  return (
    <div className="container-page py-12">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wider text-brass-ink">
          {property?.name ?? 'Mountain Dew Group'}
        </p>
        <h1 className="mt-2 text-4xl font-semibold">Rooms &amp; rates</h1>
        <p className="mt-3 text-charcoal-600">
          Choose a room that suits your stay. Rates shown are demonstration placeholders and taxes are configured by the
          property. Payment is collected at the property on arrival.
        </p>
      </header>

      <div className="mt-8">
        <SearchBar
          variant="inline"
          initial={{ checkIn: checkIn ?? todayISO(1), checkOut: checkOut ?? todayISO(3), adults, children, rooms }}
        />
      </div>

      {hasDates ? (
        <p className="mt-6 text-sm text-charcoal-600">
          Showing availability for {checkIn} to {checkOut} · {adults} adult{adults === 1 ? '' : 's'}
          {children > 0 ? `, ${children} child${children === 1 ? '' : 'ren'}` : ''}.
        </p>
      ) : null}

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visible.length > 0 ? (
          visible.map((rt) => (
            <RoomCard key={rt.id} roomType={rt} search={search} available={availabilityByType.get(rt.slug)} />
          ))
        ) : (
          <div className="card p-6 sm:col-span-2 lg:col-span-3">
            <h2 className="font-display text-xl font-semibold text-forest-900">No rooms available for those dates</h2>
            <p className="mt-2 text-charcoal-600">
              Try adjusting your dates or party size. Our team is happy to help by phone or email.
            </p>
          </div>
        )}
      </div>

      {soldOut.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-lg font-semibold text-charcoal-700">Fully booked for these dates</h2>
          <ul className="mt-4 space-y-2">
            {soldOut.map((rt) => (
              <li key={rt.id} className="card flex items-center justify-between gap-4 p-4">
                <span className="font-medium text-charcoal-800">{rt.name}</span>
                <span className="text-sm text-charcoal-500">No rooms left for this stay</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
