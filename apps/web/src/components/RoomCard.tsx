import Link from 'next/link';
import { formatMoney, type Money, type RoomTypeDto } from '@mdg/domain';

interface RoomCardProps {
  roomType: RoomTypeDto;
  search?: { checkIn: string; checkOut: string; adults: number; children: number; rooms: number };
  available?: { availableCount: number; stayTotal: Money };
}

export function RoomCard({ roomType, search, available }: RoomCardProps) {
  const image = roomType.images[0] ?? '/images/room-placeholder.svg';
  const bookHref = search
    ? `/book?checkIn=${search.checkIn}&checkOut=${search.checkOut}&adults=${search.adults}&children=${search.children}&rooms=${search.rooms}&roomType=${roomType.slug}`
    : `/rooms/${roomType.slug}`;

  return (
    <article className="card card-hover group flex h-full flex-col overflow-hidden">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-sand-100">
        <img
          src={image}
          alt={roomType.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-xl font-semibold text-forest-900">{roomType.name}</h3>
        <p className="mt-1.5 text-sm text-charcoal-600">{roomType.shortDescription}</p>
        <ul className="mt-4 flex flex-wrap gap-2 text-xs text-charcoal-600">
          <li className="badge">{roomType.bedConfiguration}</li>
          <li className="badge">Sleeps {roomType.maxOccupancy}</li>
          {roomType.sizeSqm ? <li className="badge">{roomType.sizeSqm} m²</li> : null}
        </ul>
        <div className="mt-5 flex items-end justify-between gap-4 border-t border-forest-900/10 pt-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-charcoal-500">
              {available ? 'Total for stay' : 'From'}
            </p>
            <p className="font-display text-2xl font-semibold text-forest-900">
              {formatMoney(available ? available.stayTotal : roomType.fromPrice)}
            </p>
            {available ? (
              <p className="text-xs text-charcoal-500">
                {available.availableCount} available · pay at property
              </p>
            ) : (
              <p className="text-xs text-charcoal-500">per night · pay at property</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Link href={bookHref} className="btn btn-primary">
              {available ? 'Select room' : 'View details'}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
