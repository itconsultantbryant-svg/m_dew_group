'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ReservationDto } from '@mdg/domain';
import { formatMoney } from '@mdg/domain';
import { LiveBar, Panel, StatCard, EmptyState } from '@/components/admin/ui';
import { staffRequest } from '@/lib/staff-session';
import { useLive } from '@/lib/use-live';

interface ListResponse {
  items: ReservationDto[];
  total: number;
}

interface Overview {
  kpis: {
    outstanding: { amountMinor: number; currency: 'USD' | 'LRD' };
    collectedToday: { amountMinor: number; currency: 'USD' | 'LRD' };
    paymentsTodayCount: number;
    refundedToday: { amountMinor: number; currency: 'USD' | 'LRD' };
  };
}

const METHODS = ['CASH', 'MTN_MOBILE_MONEY', 'ORANGE_MONEY', 'BANK_TRANSFER', 'CARD_TERMINAL'];

export default function AdminPaymentsPage() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const live = useLive<{ outstanding: ReservationDto[] }>(async () => {
    const [confirmed, checkedIn] = await Promise.all([
      staffRequest<ListResponse>('/staff/reservations?status=CONFIRMED&pageSize=100'),
      staffRequest<ListResponse>('/staff/reservations?status=CHECKED_IN&pageSize=100'),
    ]);
    const outstanding = [...confirmed.items, ...checkedIn.items].filter((r) => r.balanceDue.amountMinor > 0);
    return { outstanding };
  }, 10000);

  const stats = useLive<Overview>(() => staffRequest<Overview>('/staff/admin/overview'), 12000);

  const rows = live.data?.outstanding ?? [];
  const kpis = stats.data?.kpis;

  async function recordPayment(reservation: ReservationDto, method: string, amountMinor: number) {
    setBusyId(reservation.id);
    setError(null);
    setNotice(null);
    try {
      await staffRequest('/staff/payments', {
        method: 'POST',
        body: { reservationId: reservation.id, amountMinor, currency: reservation.currency, method, verified: true },
      });
      setNotice(`Recorded ${formatMoney({ amountMinor, currency: reservation.currency })} for ${reservation.reference}.`);
      await live.refresh();
      await stats.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the payment.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <LiveBar updatedAt={live.updatedAt} live={live.live} onToggle={live.setLive} onRefresh={() => { void live.refresh(); void stats.refresh(); }} error={live.error} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Outstanding balance" value={kpis ? formatMoney(kpis.outstanding) : '—'} hint="Confirmed & in-house stays" tone="warning" />
        <StatCard label="Received today" value={kpis ? formatMoney(kpis.collectedToday) : '—'} hint={kpis ? `${kpis.paymentsTodayCount} payment(s)` : ''} tone="positive" />
        <StatCard label="Refunded today" value={kpis ? formatMoney(kpis.refundedToday) : '—'} />
      </div>

      {notice ? <p className="rounded-lg bg-success-surface px-4 py-3 text-sm font-medium text-success">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-lg bg-danger-surface px-4 py-3 text-sm font-medium text-danger">{error}</p> : null}

      <Panel title="Balances due" subtitle="Take a payment at the property. Open a reservation for partial payments or refunds.">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-charcoal-500">
              <tr>
                <th className="py-2 pr-4">Reference</th>
                <th className="py-2 pr-4">Guest</th>
                <th className="py-2 pr-4">Check-out</th>
                <th className="py-2 pr-4 text-right">Balance</th>
                <th className="py-2">Take payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-forest-900/10">
              {live.loading && !live.data ? (
                <tr><td colSpan={5}><EmptyState>Loading balances…</EmptyState></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5}><EmptyState>No outstanding balances. Every stay is fully settled.</EmptyState></td></tr>
              ) : (
                rows.map((r) => (
                  <PayRow key={r.id} reservation={r} busy={busyId === r.id} onPay={(method, amountMinor) => void recordPayment(r, method, amountMinor)} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function PayRow({ reservation, busy, onPay }: { reservation: ReservationDto; busy: boolean; onPay: (method: string, amountMinor: number) => void }) {
  const [method, setMethod] = useState(METHODS[0]!);
  const [amount, setAmount] = useState((reservation.balanceDue.amountMinor / 100).toFixed(2));

  return (
    <tr>
      <td className="py-3 pr-4">
        <Link href={`/admin/reservations/${reservation.id}`} className="font-medium text-forest-900 hover:underline">{reservation.reference}</Link>
      </td>
      <td className="py-3 pr-4 text-charcoal-700">{reservation.leadGuestName}</td>
      <td className="py-3 pr-4 text-charcoal-600">{reservation.checkOut}</td>
      <td className="py-3 pr-4 text-right font-medium text-charcoal-800">{formatMoney(reservation.balanceDue)}</td>
      <td className="py-3">
        <div className="flex items-center gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Amount" className="w-24 rounded-md border border-charcoal-800/20 bg-ivory-50 px-2 py-1.5 text-sm" />
          <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Method" className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-2 py-1.5 text-sm">
            {METHODS.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={() => onPay(method, Math.round(Number(amount) * 100))} className="rounded-md bg-forest-900 px-3 py-1.5 text-xs font-semibold text-ivory-100 hover:bg-forest-800 disabled:opacity-50">
            {busy ? 'Saving…' : 'Record'}
          </button>
        </div>
      </td>
    </tr>
  );
}
