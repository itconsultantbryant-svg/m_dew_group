import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatMoney } from '@mdg/domain';
import { SearchBar } from '@/components/SearchBar';
import { getRoomType } from '@/lib/server-api';
import { todayISO } from '@/lib/format';

export const dynamic = 'force-dynamic';

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getRoomType(slug);
  if (!data) return { title: 'Room not found' };
  return { title: data.roomType.name, description: data.roomType.shortDescription };
}

export default async function RoomDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const checkIn = first(query.checkIn);
  const checkOut = first(query.checkOut);
  const hasDates = Boolean(checkIn && checkOut && checkIn < checkOut);

  const data = await getRoomType(slug, hasDates ? { checkIn, checkOut } : undefined);
  if (!data) notFound();

  const { roomType, availability } = data;
  const hero = roomType.images[0] ?? '/images/room-placeholder.svg';

  return (
    <div className="container-page py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-charcoal-500">
        <Link href="/rooms" className="hover:underline">
          Rooms
        </Link>
        <span aria-hidden> / </span>
        <span className="text-charcoal-700">{roomType.name}</span>
      </nav>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="overflow-hidden rounded-2xl bg-sand-100">
            <img src={hero} alt={roomType.name} className="aspect-[16/10] w-full object-cover" />
          </div>
          {roomType.images.length > 1 ? (
            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {roomType.images.slice(1, 9).map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  className="aspect-[4/3] w-full rounded-lg object-cover"
                  loading="lazy"
                />
              ))}
            </div>
          ) : null}

          <div className="mt-8">
            <h1 className="text-4xl font-semibold">{roomType.name}</h1>
            <p className="mt-3 text-lg text-charcoal-600">{roomType.shortDescription}</p>
            <p className="mt-4 whitespace-pre-line text-charcoal-700">{roomType.description}</p>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Fact label="Bed" value={roomType.bedConfiguration} />
            <Fact label="Sleeps" value={`${roomType.maxOccupancy} guests`} />
            {roomType.sizeSqm ? <Fact label="Size" value={`${roomType.sizeSqm} m²`} /> : null}
            <Fact label="Check-in" value={roomType.checkInTime} />
            <Fact label="Check-out" value={roomType.checkOutTime} />
            <Fact label="Smoking" value={roomType.smokingPolicy === 'NON_SMOKING' ? 'Non-smoking' : roomType.smokingPolicy} />
          </dl>

          {roomType.amenities.length > 0 ? (
            <section className="mt-10">
              <h2 className="text-2xl font-semibold">In-room amenities</h2>
              <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {roomType.amenities.map((a) => (
                  <li key={a.id} className="rounded-lg bg-ivory-200/70 px-3 py-2 text-sm text-charcoal-700">
                    {a.label}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-6">
            <p className="text-xs uppercase tracking-wide text-charcoal-500">
              {availability ? 'Total for stay' : 'From'}
            </p>
            <p className="font-display text-3xl font-semibold text-forest-900">
              {formatMoney(availability ? availability.stayTotal : roomType.fromPrice)}
            </p>
            <p className="text-sm text-charcoal-500">
              {availability
                ? `${availability.availableCount} room${availability.availableCount === 1 ? '' : 's'} available`
                : 'per night · pay at property'}
            </p>

            <div className="mt-5 border-t border-forest-900/10 pt-5">
              <SearchBar variant="sidebar" initial={{ checkIn, checkOut }} />
            </div>

            {hasDates ? (
              <Link
                href={`/book?checkIn=${checkIn}&checkOut=${checkOut}&adults=2&children=0&rooms=1&roomType=${roomType.slug}`}
                className="mt-4 block rounded-md bg-forest-900 px-5 py-3 text-center text-sm font-semibold text-ivory-100 hover:bg-forest-800"
              >
                Book this room
              </Link>
            ) : (
              <p className="mt-4 text-sm text-charcoal-500">
                Choose your dates above to check availability and book.
              </p>
            )}

            <p className="mt-4 text-xs text-charcoal-500">{roomType.cancellationSummary}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-ivory-200/60 p-3">
      <dt className="text-xs uppercase tracking-wide text-charcoal-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-charcoal-800">{value}</dd>
    </div>
  );
}
