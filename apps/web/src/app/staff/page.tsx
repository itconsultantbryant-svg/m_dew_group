'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ReservationDto } from '@mdg/domain';
import { formatMoney } from '@mdg/domain';
import { StaffNav } from '@/components/StaffNav';
import { StatusBadge } from '@/components/StatusBadge';
import { staffRequest } from '@/lib/staff-session';
import { useRequireStaff } from '@/lib/use-staff';
import { formatDate, paymentStateLabel, reservationStatusLabel, statusTone } from '@/lib/format';

interface Dashboard {
  date: string;
  arrivals: ReservationDto[];
  departures: ReservationDto[];
  inHouse: number;
  rooms: { total: number; available: number; dirty: number; outOfOrder: number };
  pendingRequests: number;
  holds: number;
  outstanding: { amountMinor: number; currency: 'USD' | 'LRD' };
}

export default function StaffDashboardPage() {
  const { user, ready } = useRequireStaff();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await staffRequest<Dashboard>('/staff/dashboard'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the dashboard.');
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  if (!ready) return <div className="container-page py-10">Loading…</div>;

  return (
    <>
      <StaffNav user={user} />
      <div className="container-page py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Today</h1>
            <p className="text-sm text-charcoal-600">{data ? formatDate(data.date) : '—'}</p>
          </div>
          <button type="button" onClick={() => void load()} className="rounded-md border border-forest-900/30 px-4 py-2 text-sm font-semibold text-forest-900 hover:bg-forest-900/5">
            Refresh
          </button>
        </div>

        {error ? <p role="alert" className="mt-4 rounded-lg bg-danger-surface px-4 py-3 text-sm font-medium text-danger">{error}</p> : null}

        {data ? (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="In house" value={String(data.inHouse)} />
              <Metric label="Arrivals today" value={String(data.arrivals.length)} />
              <Metric label="Departures today" value={String(data.departures.length)} />
              <Metric label="Active holds" value={String(data.holds)} />
              <Metric label="Available rooms" value={`${data.rooms.available} / ${data.rooms.total}`} />
              <Metric label="Rooms to clean" value={String(data.rooms.dirty)} />
              <Metric label="Out of order" value={String(data.rooms.outOfOrder)} />
              <Metric label="Outstanding balance" value={formatMoney(data.outstanding)} />
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <ArrivalsPanel title="Arrivals today" reservations={data.arrivals} empty="No arrivals scheduled today." />
              <ArrivalsPanel title="Departures today" reservations={data.departures} empty="No departures scheduled today." />
            </div>
          </>
        ) : (
          <p className="mt-6 text-charcoal-600">Loading dashboard…</p>
        )}
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-charcoal-500">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-forest-900">{value}</p>
    </div>
  );
}

function ArrivalsPanel({ title, reservations, empty }: { title: string; reservations: ReservationDto[]; empty: string }) {
  return (
    <section className="card p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {reservations.length === 0 ? (
        <p className="mt-3 text-sm text-charcoal-600">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-forest-900/10">
          {reservations.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-4 py-3">
              <div>
                <Link href={`/staff/reservations/${r.id}`} className="font-medium text-forest-900 hover:underline">
                  {r.leadGuestName}
                </Link>
                <p className="text-xs text-charcoal-500">
                  {r.reference} · {r.rooms.map((room) => room.roomTypeName).join(', ')}
                </p>
              </div>
              <StatusBadge label={reservationStatusLabel(r.status)} tone={statusTone(r.status)} />
            </li>
          ))}
        </ul>
      )}
      {reservations.some((r) => r.paymentState !== 'PAID') ? (
        <p className="mt-3 text-xs text-charcoal-500">
          Some balances remain outstanding ({paymentStateLabel('PARTIALLY_PAID')} is shown for part-paid stays).
        </p>
      ) : null}
    </section>
  );
}
