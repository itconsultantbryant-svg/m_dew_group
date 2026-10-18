'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ReservationDto } from '@mdg/domain';
import { formatMoney } from '@mdg/domain';
import { StaffNav } from '@/components/StaffNav';
import { StatusBadge } from '@/components/StatusBadge';
import { staffRequest } from '@/lib/staff-session';
import { useRequireStaff } from '@/lib/use-staff';
import { formatDateRange, reservationStatusLabel, statusTone } from '@/lib/format';

interface ListResponse {
  items: ReservationDto[];
  page: number;
  pageSize: number;
  total: number;
}

const STATUSES = ['', 'HELD', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW', 'EXPIRED'];

export default function StaffReservationsPage() {
  const { user, ready } = useRequireStaff();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (status) params.set('status', status);
      const result = await staffRequest<ListResponse>(`/staff/reservations?${params.toString()}`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load reservations.');
    } finally {
      setBusy(false);
    }
  }, [query, status]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  if (!ready) return <div className="container-page py-10">Loading…</div>;

  return (
    <>
      <StaffNav user={user} />
      <div className="container-page py-8">
        <h1 className="text-3xl font-semibold">Reservations</h1>
        <form
          className="mt-6 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-charcoal-700">Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Reference, name or phone"
              className="w-64 rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-charcoal-700">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2">
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s ? reservationStatusLabel(s) : 'All statuses'}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-md bg-forest-900 px-5 py-2.5 text-sm font-semibold text-ivory-100 hover:bg-forest-800">
            Search
          </button>
          {data ? <span className="text-sm text-charcoal-500">{data.total} result{data.total === 1 ? '' : 's'}</span> : null}
        </form>

        {error ? <p role="alert" className="mt-4 rounded-lg bg-danger-surface px-4 py-3 text-sm font-medium text-danger">{error}</p> : null}

        <div className="mt-6 overflow-hidden rounded-xl border border-forest-900/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-ivory-200/60 text-xs uppercase tracking-wide text-charcoal-500">
              <tr>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Guest</th>
                <th className="px-4 py-3">Stay</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-forest-900/10">
              {busy && !data ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-charcoal-500">Loading…</td></tr>
              ) : (data?.items ?? []).length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-charcoal-500">No reservations found.</td></tr>
              ) : (
                data?.items.map((r) => (
                  <tr key={r.id} className="hover:bg-ivory-100/60">
                    <td className="px-4 py-3">
                      <Link href={`/staff/reservations/${r.id}`} className="font-medium text-forest-900 hover:underline">
                        {r.reference}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-charcoal-700">{r.leadGuestName}</td>
                    <td className="px-4 py-3 text-charcoal-600">{formatDateRange(r.checkIn, r.checkOut)}</td>
                    <td className="px-4 py-3"><StatusBadge label={reservationStatusLabel(r.status)} tone={statusTone(r.status)} /></td>
                    <td className="px-4 py-3 text-right font-medium text-charcoal-800">{formatMoney(r.balanceDue)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
