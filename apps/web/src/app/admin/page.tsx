'use client';

import Link from 'next/link';
import type { ReservationDto } from '@mdg/domain';
import { formatMoney } from '@mdg/domain';
import { StatusBadge } from '@/components/StatusBadge';
import { LiveBar, Panel, StatCard, EmptyState } from '@/components/admin/ui';
import { staffRequest } from '@/lib/staff-session';
import { useLive } from '@/lib/use-live';
import { formatDate, reservationStatusLabel, statusTone } from '@/lib/format';

interface Overview {
  generatedAt: string;
  date: string;
  kpis: {
    inHouse: number;
    arrivals: number;
    departures: number;
    activeHolds: number;
    pendingRequests: number;
    openTasks: number;
    inProgressTasks: number;
    notificationsPending: number;
    notificationsFailed: number;
    activeSessions: number;
    occupancyRatePercent: number;
    outstanding: { amountMinor: number; currency: 'USD' | 'LRD' };
    collectedToday: { amountMinor: number; currency: 'USD' | 'LRD' };
    paymentsTodayCount: number;
    refundedToday: { amountMinor: number; currency: 'USD' | 'LRD' };
  };
  rooms: { total: number; dirty: number; outOfOrder: number; available: number };
  arrivals: ReservationDto[];
  departures: ReservationDto[];
  recentReservations: ReservationDto[];
  audit: { id: string; action: string; entityType: string; entityId: string | null; actorRole: string | null; createdAt: string; reason: string | null }[];
}

export default function AdminOverviewPage() {
  const live = useLive<Overview>(() => staffRequest<Overview>('/staff/admin/overview'), 6000);
  const data = live.data;

  return (
    <div className="space-y-6">
      <LiveBar updatedAt={live.updatedAt} live={live.live} onToggle={live.setLive} onRefresh={() => void live.refresh()} error={live.error} />

      {!data ? (
        <p className="text-charcoal-600">{live.loading ? 'Loading live operations…' : 'No data available.'}</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="In house" value={String(data.kpis.inHouse)} hint={`${data.kpis.occupancyRatePercent}% occupancy today`} />
            <StatCard label="Arrivals today" value={String(data.kpis.arrivals)} hint={`${data.kpis.departures} departures`} />
            <StatCard label="Rooms available" value={`${data.rooms.available}/${data.rooms.total}`} hint={`${data.rooms.dirty} to clean · ${data.rooms.outOfOrder} out of order`} tone={data.rooms.available === 0 ? 'danger' : 'default'} />
            <StatCard label="Received today" value={formatMoney(data.kpis.collectedToday)} hint={`${data.kpis.paymentsTodayCount} payment(s) · ${formatMoney(data.kpis.refundedToday)} refunded`} tone="positive" />
            <StatCard label="Outstanding balance" value={formatMoney(data.kpis.outstanding)} hint="Across confirmed & in-house stays" tone={data.kpis.outstanding.amountMinor > 0 ? 'warning' : 'default'} />
            <StatCard label="Active holds" value={String(data.kpis.activeHolds)} hint="Expire automatically" />
            <StatCard label="Open tasks" value={String(data.kpis.openTasks)} hint={`${data.kpis.inProgressTasks} in progress`} tone={data.kpis.openTasks > 0 ? 'warning' : 'default'} />
            <StatCard label="Notification issues" value={String(data.kpis.notificationsFailed)} hint={`${data.kpis.notificationsPending} pending in queue`} tone={data.kpis.notificationsFailed > 0 ? 'danger' : 'default'} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Arrivals today" subtitle="Expected check-ins">
              {data.arrivals.length === 0 ? (
                <EmptyState>No arrivals scheduled today.</EmptyState>
              ) : (
                <ul className="divide-y divide-forest-900/10">
                  {data.arrivals.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Link href={`/admin/reservations/${r.id}`} className="font-medium text-forest-900 hover:underline">
                          {r.leadGuestName}
                        </Link>
                        <p className="truncate text-xs text-charcoal-500">
                          {r.reference} · {r.rooms.map((room) => room.roomTypeName).join(', ')}
                        </p>
                      </div>
                      <StatusBadge label={reservationStatusLabel(r.status)} tone={statusTone(r.status)} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Departures today" subtitle="Expected check-outs">
              {data.departures.length === 0 ? (
                <EmptyState>No departures scheduled today.</EmptyState>
              ) : (
                <ul className="divide-y divide-forest-900/10">
                  {data.departures.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Link href={`/admin/reservations/${r.id}`} className="font-medium text-forest-900 hover:underline">
                          {r.leadGuestName}
                        </Link>
                        <p className="truncate text-xs text-charcoal-500">{r.reference} · balance {formatMoney(r.balanceDue)}</p>
                      </div>
                      <StatusBadge label={reservationStatusLabel(r.status)} tone={statusTone(r.status)} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Panel
              title="Latest bookings"
              actions={
                <Link href="/admin/reservations" className="text-sm font-semibold text-forest-900 hover:underline">
                  All reservations →
                </Link>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-charcoal-500">
                    <tr>
                      <th className="py-2 pr-4">Reference</th>
                      <th className="py-2 pr-4">Guest</th>
                      <th className="py-2 pr-4">Stay</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-forest-900/10">
                    {data.recentReservations.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2.5 pr-4">
                          <Link href={`/admin/reservations/${r.id}`} className="font-medium text-forest-900 hover:underline">
                            {r.reference}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-4 text-charcoal-700">{r.leadGuestName}</td>
                        <td className="py-2.5 pr-4 text-charcoal-600">
                          {formatDate(r.checkIn, { withYear: false })} – {formatDate(r.checkOut)}
                        </td>
                        <td className="py-2.5 pr-4">
                          <StatusBadge label={reservationStatusLabel(r.status)} tone={statusTone(r.status)} />
                        </td>
                        <td className="py-2.5 text-right font-medium text-charcoal-800">{formatMoney(r.balanceDue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="Activity feed" subtitle="Audit trail, live">
              <ul className="space-y-3">
                {data.audit.length === 0 ? <EmptyState>No activity recorded yet.</EmptyState> : null}
                {data.audit.map((entry) => (
                  <li key={entry.id} className="flex gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brass" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-charcoal-800">{entry.action.replace(/[._]/g, ' ')}</p>
                      <p className="text-xs text-charcoal-500">
                        {entry.entityType}
                        {entry.actorRole ? ` · ${entry.actorRole.replace(/_/g, ' ')}` : ''} · {new Date(entry.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
