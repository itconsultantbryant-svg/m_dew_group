'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReservationDto } from '@mdg/domain';
import { formatMoney } from '@mdg/domain';
import { StaffNav } from '@/components/StaffNav';
import { StatusBadge } from '@/components/StatusBadge';
import { staffRequest } from '@/lib/staff-session';
import { useRequireStaff } from '@/lib/use-staff';
import { formatDate, paymentStateLabel, reservationStatusLabel, statusTone } from '@/lib/format';

interface DetailResponse {
  reservation: ReservationDto;
  requests: unknown[];
  folio: { id: string; charges: { id: string; kind: string; description: string; amountMinor: number }[] } | null;
  payments: unknown[];
}

interface PhysicalRoom {
  id: string;
  number: string;
  readiness: string;
  roomTypeId: string;
}

export default function StaffReservationDetailPage() {
  const { user, ready } = useRequireStaff();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [rooms, setRooms] = useState<PhysicalRoom[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, r] = await Promise.all([
        staffRequest<DetailResponse>(`/staff/reservations/${id}`),
        staffRequest<{ rooms: PhysicalRoom[] }>('/staff/rooms').catch((err) => {
          setRoomsError(err instanceof Error ? err.message : 'Could not load rooms.');
          return { rooms: [] };
        }),
      ]);
      setDetail(d);
      setRooms(r.rooms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the reservation.');
    }
  }, [id]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await staffRequest(`/staff/reservations/${id}${path}`, { method: 'POST', body });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The action could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <div className="container-page py-10">Loading…</div>;

  const reservation = detail?.reservation;

  return (
    <>
      <StaffNav user={user} />
      <div className="container-page py-8">
        <Link href="/staff/reservations" className="text-sm text-charcoal-500 hover:underline">
          ← Reservations
        </Link>

        {error ? <p role="alert" className="mt-4 rounded-lg bg-danger-surface px-4 py-3 text-sm font-medium text-danger">{error}</p> : null}

        {!reservation ? (
          <p className="mt-6 text-charcoal-600">Loading reservation…</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="font-display text-3xl font-semibold">{reservation.reference}</h1>
                <p className="text-charcoal-600">{reservation.leadGuestName} · {reservation.leadGuestPhone}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge label={reservationStatusLabel(reservation.status)} tone={statusTone(reservation.status)} />
                <StatusBadge label={paymentStateLabel(reservation.paymentState)} tone={statusTone(reservation.paymentState)} />
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
              <div className="space-y-6">
                <section className="card p-6">
                  <h2 className="text-lg font-semibold">Stay</h2>
                  <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                    <Info label="Check-in" value={formatDate(reservation.checkIn)} />
                    <Info label="Check-out" value={formatDate(reservation.checkOut)} />
                    <Info label="Nights" value={String(reservation.nights)} />
                    <Info label="Arrival" value={reservation.estimatedArrivalTime ?? '—'} />
                    <Info label="Source" value={reservation.source.replace('_', ' ')} />
                    <Info label="Created" value={formatDate(reservation.createdAt)} />
                  </dl>
                  {reservation.specialRequests ? (
                    <p className="mt-4 rounded-lg bg-ivory-200/60 p-3 text-sm text-charcoal-700">
                      <span className="font-medium">Requests: </span>{reservation.specialRequests}
                    </p>
                  ) : null}
                </section>

                <section className="card p-6">
                  <h2 className="text-lg font-semibold">Rooms</h2>
                  <ul className="mt-4 space-y-4">
                    {reservation.rooms.map((room) => {
                      const candidates = rooms.filter((r) => r.roomTypeId === room.roomTypeId);
                      return (
                        <li key={room.id} className="border-b border-forest-900/10 pb-4 last:border-0">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="font-medium text-charcoal-800">{room.roomTypeName} ×{room.quantity}</p>
                              <p className="text-xs text-charcoal-500">
                                {room.adults} adult{room.adults === 1 ? '' : 's'}{room.children ? `, ${room.children} child` : ''}
                                {room.assignedRoomNumber ? ` · assigned room ${room.assignedRoomNumber}` : ' · unassigned'}
                              </p>
                            </div>
                            {['HELD', 'CONFIRMED', 'CHECKED_IN'].includes(reservation.status) && !room.assignedRoomId ? (
                              <AssignControl
                                candidates={candidates}
                                busy={busy}
                                onAssign={(roomId) => void act('/assign-room', { reservationRoomId: room.id, roomId })}
                              />
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {roomsError ? <p className="mt-3 text-sm text-danger">{roomsError}</p> : null}
                </section>
              </div>

              <aside className="space-y-6">
                <section className="card p-6">
                  <h2 className="text-lg font-semibold">Actions</h2>
                  <div className="mt-4 flex flex-col gap-3">
                    {reservation.status === 'CONFIRMED' ? (
                      <button type="button" disabled={busy} onClick={() => void act('/checkin', {})} className={primaryBtn}>
                        Check in
                      </button>
                    ) : null}
                    {reservation.status === 'CHECKED_IN' ? (
                      <button type="button" disabled={busy} onClick={() => void act('/checkout')} className={primaryBtn}>
                        Check out
                      </button>
                    ) : null}
                    {reservation.status === 'CONFIRMED' ? (
                      <button type="button" disabled={busy} onClick={() => void act('/no-show', { reason: 'Guest did not arrive' })} className={secondaryBtn}>
                        Record no-show
                      </button>
                    ) : null}
                    {['HELD', 'CONFIRMED'].includes(reservation.status) ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act('/cancel', { reason: 'Cancelled by staff' })}
                        className="rounded-md border border-danger/40 px-4 py-2 text-sm font-semibold text-danger hover:bg-danger-surface"
                      >
                        Cancel reservation
                      </button>
                    ) : null}
                  </div>
                </section>

                <section className="card p-6">
                  <h2 className="text-lg font-semibold">Payment</h2>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between"><dt className="text-charcoal-600">Total</dt><dd className="font-medium">{formatMoney(reservation.quote.total)}</dd></div>
                    <div className="flex justify-between"><dt className="text-charcoal-600">Paid</dt><dd className="font-medium">{formatMoney(reservation.amountPaid)}</dd></div>
                    <div className="flex justify-between border-t border-forest-900/10 pt-2 text-base font-semibold text-forest-900">
                      <dt>Balance due</dt><dd>{formatMoney(reservation.balanceDue)}</dd>
                    </div>
                  </dl>
                </section>

                {detail?.folio?.charges?.length ? (
                  <section className="card p-6">
                    <h2 className="text-lg font-semibold">Folio</h2>
                    <ul className="mt-4 space-y-2 text-sm">
                      {detail.folio.charges.map((charge) => (
                        <li key={charge.id} className="flex justify-between gap-4">
                          <span className="text-charcoal-700">{charge.description}</span>
                          <span className="font-medium">{formatMoney({ amountMinor: charge.amountMinor, currency: reservation.currency })}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </aside>
            </div>
          </>
        )}
      </div>
    </>
  );
}

const primaryBtn = 'rounded-md bg-forest-900 px-4 py-2 text-sm font-semibold text-ivory-100 hover:bg-forest-800 disabled:opacity-50';
const secondaryBtn = 'rounded-md border border-forest-900/30 px-4 py-2 text-sm font-semibold text-forest-900 hover:bg-forest-900/5 disabled:opacity-50';

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-ivory-200/50 p-3">
      <dt className="text-xs uppercase tracking-wide text-charcoal-500">{label}</dt>
      <dd className="mt-1 font-medium text-charcoal-800">{value}</dd>
    </div>
  );
}

function AssignControl({ candidates, busy, onAssign }: { candidates: PhysicalRoom[]; busy: boolean; onAssign: (roomId: string) => void }) {
  const [selected, setSelected] = useState('');
  return (
    <div className="flex items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        aria-label="Select room"
        className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-2 py-1.5 text-sm"
      >
        <option value="">Select room…</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.number} ({c.readiness.replace('_', ' ').toLowerCase()})
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!selected || busy}
        onClick={() => onAssign(selected)}
        className="rounded-md bg-forest-900 px-3 py-1.5 text-xs font-semibold text-ivory-100 hover:bg-forest-800 disabled:opacity-50"
      >
        Assign
      </button>
    </div>
  );
}
