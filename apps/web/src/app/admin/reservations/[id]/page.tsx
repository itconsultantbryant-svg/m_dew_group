'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReservationDto } from '@mdg/domain';
import { formatMoney } from '@mdg/domain';
import { StatusBadge } from '@/components/StatusBadge';
import { LiveBar, Panel } from '@/components/admin/ui';
import { staffRequest } from '@/lib/staff-session';
import { useLive } from '@/lib/use-live';
import { formatDate, paymentStateLabel, reservationStatusLabel, statusTone } from '@/lib/format';

interface Payment {
  id: string;
  amountMinor: number;
  currency: 'USD' | 'LRD';
  method: string;
  verified: boolean;
  voided: boolean;
  createdAt: string;
  refunds: { id: string; amountMinor: number }[];
}

interface DetailResponse {
  reservation: ReservationDto;
  requests: unknown[];
  folio: { id: string; charges: { id: string; kind: string; description: string; amountMinor: number }[] } | null;
  payments: Payment[];
}

interface PhysicalRoom {
  id: string;
  number: string;
  readiness: string;
  roomTypeId: string;
}

const METHODS = ['CASH', 'MTN_MOBILE_MONEY', 'ORANGE_MONEY', 'BANK_TRANSFER', 'CARD_TERMINAL'];
const primaryBtn = 'rounded-md bg-forest-900 px-4 py-2 text-sm font-semibold text-ivory-100 hover:bg-forest-800 disabled:opacity-50';
const secondaryBtn = 'rounded-md border border-forest-900/30 px-4 py-2 text-sm font-semibold text-forest-900 hover:bg-forest-900/5 disabled:opacity-50';

export default function AdminReservationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);

  const live = useLive<DetailResponse>(() => staffRequest<DetailResponse>(`/staff/reservations/${id}`), 10000);
  const roomsLive = useLive<{ rooms: PhysicalRoom[] }>(() => staffRequest<{ rooms: PhysicalRoom[] }>('/staff/rooms').catch((err) => {
    setRoomError(err instanceof Error ? err.message : 'Could not load rooms.');
    return { rooms: [] as PhysicalRoom[] };
  }), 30000);

  const reservation = live.data?.reservation;
  const rooms = roomsLive.data?.rooms ?? [];

  const act = useCallback(
    async (path: string, body?: unknown) => {
      setBusy(true);
      setActionError(null);
      try {
        await staffRequest(`/staff/reservations/${id}${path}`, { method: 'POST', body });
        await live.refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'The action could not be completed.');
      } finally {
        setBusy(false);
      }
    },
    [id, live],
  );

  if (!reservation) {
    return (
      <div className="space-y-4">
        <Link href="/admin/reservations" className="text-sm text-charcoal-500 hover:underline">← Reservations</Link>
        {live.error ? <p className="rounded-lg bg-danger-surface px-4 py-3 text-sm font-medium text-danger">{live.error}</p> : null}
        <p className="text-charcoal-600">{live.loading ? 'Loading reservation…' : 'Reservation not found.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/reservations" className="text-sm text-charcoal-500 hover:underline">← Reservations</Link>
      </div>

      <LiveBar updatedAt={live.updatedAt} live={live.live} onToggle={live.setLive} onRefresh={() => void live.refresh()} error={live.error} />
      {actionError ? <p role="alert" className="rounded-lg bg-danger-surface px-4 py-3 text-sm font-medium text-danger">{actionError}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-forest-900">{reservation.reference}</h2>
          <p className="text-charcoal-600">{reservation.leadGuestName} · {reservation.leadGuestPhone}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge label={reservationStatusLabel(reservation.status)} tone={statusTone(reservation.status)} />
          <StatusBadge label={paymentStateLabel(reservation.paymentState)} tone={statusTone(reservation.paymentState)} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Panel title="Stay">
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <Info label="Check-in" value={formatDate(reservation.checkIn)} />
              <Info label="Check-out" value={formatDate(reservation.checkOut)} />
              <Info label="Nights" value={String(reservation.nights)} />
              <Info label="Arrival" value={reservation.estimatedArrivalTime ?? '—'} />
              <Info label="Source" value={reservation.source.replace('_', ' ')} />
              <Info label="Created" value={formatDate(reservation.createdAt)} />
            </dl>
            {reservation.specialRequests ? (
              <p className="mt-4 rounded-lg bg-ivory-200/60 p-3 text-sm text-charcoal-700"><span className="font-medium">Requests: </span>{reservation.specialRequests}</p>
            ) : null}
          </Panel>

          <Panel title="Rooms" subtitle="Assign physical rooms">
            <ul className="space-y-4">
              {reservation.rooms.map((room) => {
                const candidates = rooms.filter((r) => r.roomTypeId === room.roomTypeId);
                return (
                  <li key={room.id} className="border-b border-forest-900/10 pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-charcoal-800">{room.roomTypeName} ×{room.quantity}</p>
                        <p className="text-xs text-charcoal-500">
                          {room.adults} adult{room.adults === 1 ? '' : 's'}{room.children ? `, ${room.children} child` : ''}
                          {room.assignedRoomNumber ? ` · assigned room ${room.assignedRoomNumber}` : ' · unassigned'}
                        </p>
                      </div>
                      {['HELD', 'CONFIRMED', 'CHECKED_IN'].includes(reservation.status) && !room.assignedRoomId ? (
                        <AssignControl candidates={candidates} busy={busy} onAssign={(roomId) => void act('/assign-room', { reservationRoomId: room.id, roomId })} />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {roomError ? <p className="mt-3 text-sm text-danger">{roomError}</p> : null}
          </Panel>

          <Panel title="Payments" subtitle="Taken at the property">
            <PaymentList payments={live.data?.payments ?? []} currency={reservation.currency} onRefund={(paymentId, amountMinor, reason) => void refund(paymentId, amountMinor, reason, live.refresh)} />
            <div className="mt-5 border-t border-forest-900/10 pt-5">
              <RecordPaymentForm reservationId={id} currency={reservation.currency} balanceMinor={reservation.balanceDue.amountMinor} onDone={() => void live.refresh()} />
            </div>
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Actions">
            <div className="flex flex-col gap-3">
              {reservation.status === 'CONFIRMED' ? <button type="button" disabled={busy} onClick={() => void act('/checkin', {})} className={primaryBtn}>Check in</button> : null}
              {reservation.status === 'CHECKED_IN' ? <button type="button" disabled={busy} onClick={() => void act('/checkout')} className={primaryBtn}>Check out</button> : null}
              {reservation.status === 'CONFIRMED' ? <button type="button" disabled={busy} onClick={() => void act('/no-show', { reason: 'Guest did not arrive' })} className={secondaryBtn}>Record no-show</button> : null}
              {reservation.status === 'CONFIRMED' ? (
                <button type="button" disabled={busy} onClick={() => void act('/resend-confirmation')} className={secondaryBtn}>Resend confirmation</button>
              ) : null}
              {['HELD', 'CONFIRMED'].includes(reservation.status) ? (
                <button type="button" disabled={busy} onClick={() => void act('/cancel', { reason: 'Cancelled by staff' })} className="rounded-md border border-danger/40 px-4 py-2 text-sm font-semibold text-danger hover:bg-danger-surface">
                  Cancel reservation
                </button>
              ) : null}
            </div>
          </Panel>

          <Panel title="Balance">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-charcoal-600">Total</dt><dd className="font-medium">{formatMoney(reservation.quote.total)}</dd></div>
              <div className="flex justify-between"><dt className="text-charcoal-600">Paid</dt><dd className="font-medium">{formatMoney(reservation.amountPaid)}</dd></div>
              <div className="flex justify-between border-t border-forest-900/10 pt-2 text-base font-semibold text-forest-900"><dt>Balance due</dt><dd>{formatMoney(reservation.balanceDue)}</dd></div>
            </dl>
          </Panel>

          {live.data?.folio?.charges?.length ? (
            <Panel title="Folio">
              <ul className="space-y-2 text-sm">
                {live.data.folio.charges.map((charge) => (
                  <li key={charge.id} className="flex justify-between gap-4">
                    <span className="text-charcoal-700">{charge.description}</span>
                    <span className="font-medium">{formatMoney({ amountMinor: charge.amountMinor, currency: reservation.currency })}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

async function refund(paymentId: string, amountMinor: number, reason: string, done: () => Promise<void>): Promise<void> {
  await staffRequest('/staff/refunds', { method: 'POST', body: { paymentId, amountMinor, reason } });
  await done();
}

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
      <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Select room" className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-2 py-1.5 text-sm">
        <option value="">Select room…</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>{c.number} ({c.readiness.replace('_', ' ').toLowerCase()})</option>
        ))}
      </select>
      <button type="button" disabled={!selected || busy} onClick={() => onAssign(selected)} className="rounded-md bg-forest-900 px-3 py-1.5 text-xs font-semibold text-ivory-100 hover:bg-forest-800 disabled:opacity-50">Assign</button>
    </div>
  );
}

function PaymentList({ payments, currency, onRefund }: { payments: Payment[]; currency: 'USD' | 'LRD'; onRefund: (paymentId: string, amountMinor: number, reason: string) => void }) {
  const [refunding, setRefunding] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  if (payments.length === 0) return <p className="text-sm text-charcoal-500">No payments recorded yet. The guest pays at the property.</p>;

  return (
    <ul className="space-y-3">
      {payments.map((p) => {
        const refunded = p.refunds.reduce((acc, r) => acc + r.amountMinor, 0);
        return (
          <li key={p.id} className="rounded-lg border border-forest-900/10 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-charcoal-800">{formatMoney({ amountMinor: p.amountMinor, currency: p.currency })} · {p.method.replace(/_/g, ' ')}</p>
                <p className="text-xs text-charcoal-500">
                  {new Date(p.createdAt).toLocaleString()} · {p.verified ? 'verified' : 'unverified'}{p.voided ? ' · voided' : ''}
                  {refunded > 0 ? ` · refunded ${formatMoney({ amountMinor: refunded, currency: p.currency })}` : ''}
                </p>
              </div>
              {!p.voided && refunded < p.amountMinor ? (
                <button type="button" onClick={() => setRefunding(refunding === p.id ? null : p.id)} className="text-xs font-semibold text-forest-900 hover:underline">
                  {refunding === p.id ? 'Cancel' : 'Refund'}
                </button>
              ) : null}
            </div>
            {refunding === p.id ? (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-charcoal-600">Amount ({currency})</span>
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="w-28 rounded-md border border-charcoal-800/20 bg-ivory-50 px-2 py-1.5" />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-xs">
                  <span className="font-medium text-charcoal-600">Reason</span>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-2 py-1.5" />
                </label>
                <button
                  type="button"
                  disabled={!amount || reason.trim().length < 3}
                  onClick={() => {
                    onRefund(p.id, Math.round(Number(amount) * 100), reason.trim());
                    setRefunding(null);
                    setAmount('');
                    setReason('');
                  }}
                  className="rounded-md bg-forest-900 px-3 py-1.5 text-xs font-semibold text-ivory-100 hover:bg-forest-800 disabled:opacity-50"
                >
                  Approve refund
                </button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function RecordPaymentForm({ reservationId, currency, balanceMinor, onDone }: { reservationId: string; currency: 'USD' | 'LRD'; balanceMinor: number; onDone: () => void }) {
  const [amount, setAmount] = useState((balanceMinor / 100).toFixed(2));
  const [method, setMethod] = useState(METHODS[0]!);
  const [verified, setVerified] = useState(true);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      await staffRequest('/staff/payments', {
        method: 'POST',
        body: { reservationId, amountMinor: Math.round(Number(amount) * 100), currency, method, verified, transactionReference: reference || undefined },
      });
      setOk(true);
      setReference('');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the payment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <h3 className="text-sm font-semibold text-charcoal-800">Record a payment</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-charcoal-600">Amount ({currency})</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="w-28 rounded-md border border-charcoal-800/20 bg-ivory-50 px-2 py-1.5" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-charcoal-600">Method</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-2 py-1.5">
            {METHODS.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-charcoal-600">Transaction ref (optional)</span>
          <input value={reference} onChange={(e) => setReference(e.target.value)} className="w-40 rounded-md border border-charcoal-800/20 bg-ivory-50 px-2 py-1.5" />
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-xs font-medium text-charcoal-600">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> Verified
        </label>
        <button type="submit" disabled={busy} className="rounded-md bg-forest-900 px-4 py-2 text-sm font-semibold text-ivory-100 hover:bg-forest-800 disabled:opacity-50">
          {busy ? 'Recording…' : 'Record payment'}
        </button>
      </div>
      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
      {ok ? <p className="text-sm font-medium text-success">Payment recorded.</p> : null}
    </form>
  );
}
