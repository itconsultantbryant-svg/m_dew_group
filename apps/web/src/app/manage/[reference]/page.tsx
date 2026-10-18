import Link from 'next/link';
import { formatMoney } from '@mdg/domain';
import { CancelBooking } from '@/components/CancelBooking';
import { StatusBadge } from '@/components/StatusBadge';
import { fetchReservation } from '@/lib/manage';
import { formatDate, paymentStateLabel, reservationStatusLabel, statusTone } from '@/lib/format';

export const dynamic = 'force-dynamic';

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ManageReservationPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { reference } = await params;
  const token = first((await searchParams).token);

  if (!token) {
    return (
      <div className="container-page py-16">
        <div className="card mx-auto max-w-md p-8 text-center">
          <h1 className="text-2xl font-semibold">Management link required</h1>
          <p className="mt-2 text-sm text-charcoal-600">
            Open the link from your confirmation message, or look up your booking with your reference and surname.
          </p>
          <Link href="/manage" className="mt-4 inline-block rounded-md bg-forest-900 px-5 py-2.5 text-sm font-semibold text-ivory-100">
            Look up a booking
          </Link>
        </div>
      </div>
    );
  }

  const reservation = await fetchReservation(reference, token);

  if (!reservation) {
    return (
      <div className="container-page py-16">
        <div className="card mx-auto max-w-md p-8 text-center">
          <h1 className="text-2xl font-semibold">Booking not found</h1>
          <p className="mt-2 text-sm text-charcoal-600">
            This management link is invalid or has expired. Please search again with your reference and surname.
          </p>
          <Link href="/manage" className="mt-4 inline-block rounded-md bg-forest-900 px-5 py-2.5 text-sm font-semibold text-ivory-100">
            Try again
          </Link>
        </div>
      </div>
    );
  }

  const canCancel = ['HELD', 'CONFIRMED'].includes(reservation.status);

  return (
    <div className="container-page py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-charcoal-500">Booking reference</p>
          <h1 className="font-display text-3xl font-semibold">{reservation.reference}</h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge label={reservationStatusLabel(reservation.status)} tone={statusTone(reservation.status)} />
          <StatusBadge label={paymentStateLabel(reservation.paymentState)} tone={statusTone(reservation.paymentState)} />
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="text-lg font-semibold">Your stay</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <Detail label="Check-in" value={formatDate(reservation.checkIn)} />
              <Detail label="Check-out" value={formatDate(reservation.checkOut)} />
              <Detail label="Nights" value={String(reservation.nights)} />
              <Detail label="Guests" value={reservation.leadGuestName} />
              <Detail label="Phone" value={reservation.leadGuestPhone} />
              <Detail label="Arrival" value={reservation.estimatedArrivalTime ?? 'Not specified'} />
            </dl>
            {reservation.specialRequests ? (
              <p className="mt-4 rounded-lg bg-ivory-200/60 p-3 text-sm text-charcoal-700">
                <span className="font-medium">Requests: </span>
                {reservation.specialRequests}
              </p>
            ) : null}
          </section>

          <section className="card p-6">
            <h2 className="text-lg font-semibold">Rooms</h2>
            <ul className="mt-4 divide-y divide-forest-900/10">
              {reservation.rooms.map((room) => (
                <li key={room.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="font-medium text-charcoal-800">
                      {room.roomTypeName} ×{room.quantity}
                    </p>
                    <p className="text-xs text-charcoal-500">
                      {room.adults} adult{room.adults === 1 ? '' : 's'}
                      {room.children ? `, ${room.children} child${room.children === 1 ? '' : 'ren'}` : ''}
                      {room.assignedRoomNumber ? ` · Room ${room.assignedRoomNumber}` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-medium">{formatMoney(room.total)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-6">
          <div className="card p-6">
            <h2 className="text-lg font-semibold">Payment</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-charcoal-600">Total</dt><dd className="font-medium">{formatMoney(reservation.quote.total)}</dd></div>
              <div className="flex justify-between"><dt className="text-charcoal-600">Paid</dt><dd className="font-medium">{formatMoney(reservation.amountPaid)}</dd></div>
              <div className="flex justify-between border-t border-forest-900/10 pt-2 text-base font-semibold text-forest-900">
                <dt>Balance due</dt><dd>{formatMoney(reservation.balanceDue)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-charcoal-500">Payment is collected at the property. {reservation.quote.cancellationSummary}</p>
          </div>

          {canCancel ? (
            <div className="card p-6">
              <h2 className="text-lg font-semibold">Need to change plans?</h2>
              <p className="mt-2 text-sm text-charcoal-600">
                You can cancel this booking now. To change dates or rooms, cancel and rebook, or contact the property.
              </p>
              <div className="mt-4">
                <CancelBooking reference={reservation.reference} token={token} />
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-ivory-200/50 p-3">
      <dt className="text-xs uppercase tracking-wide text-charcoal-500">{label}</dt>
      <dd className="mt-1 font-medium text-charcoal-800">{value}</dd>
    </div>
  );
}
