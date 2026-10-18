'use client';

import { useState } from 'react';
import { formatMoney } from '@mdg/domain';
import { LiveBar, Panel, StatCard, EmptyState } from '@/components/admin/ui';
import { API_BASE_URL, reservationStatusLabel, todayISO } from '@/lib/format';
import { getAccessToken, staffRequest } from '@/lib/staff-session';
import { useLive } from '@/lib/use-live';

interface Money {
  amountMinor: number;
  currency: 'USD' | 'LRD';
}

interface Report {
  range: { from: string; to: string };
  occupancyRatePercent: number;
  occupiedRoomNights: number;
  availableRoomNights: number;
  adr: Money;
  revpar: Money;
  roomRevenue: Money;
  cashCollected: Money;
  refunded: Money;
  netCash: Money;
  outstandingBalance: Money;
  byStatus: { status: string; count: number }[];
  definitions: Record<string, string>;
}

export default function AdminReportsPage() {
  const [from, setFrom] = useState(todayISO(-29));
  const [to, setTo] = useState(todayISO());
  const [applied, setApplied] = useState({ from: todayISO(-29), to: todayISO() });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const live = useLive<Report>(() => staffRequest<Report>(`/staff/reports/summary?from=${applied.from}&to=${applied.to}`), 20000);
  const report = live.data;

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/staff/reports/export?from=${applied.from}&to=${applied.to}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error('Export failed.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mdg-reservations-${applied.from}-to-${applied.to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <LiveBar updatedAt={live.updatedAt} live={live.live} onToggle={live.setLive} onRefresh={() => void live.refresh()} error={live.error} />

      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-forest-900/10 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ from, to });
        }}
      >
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-charcoal-600">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-charcoal-600">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2" />
        </label>
        <button type="submit" className="rounded-md bg-forest-900 px-5 py-2.5 text-sm font-semibold text-ivory-100 hover:bg-forest-800">Apply</button>
        <button type="button" onClick={() => void exportCsv()} disabled={exporting} className="rounded-md border border-forest-900/30 px-4 py-2.5 text-sm font-semibold text-forest-900 hover:bg-forest-900/5 disabled:opacity-50">
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </form>

      {exportError ? <p role="alert" className="rounded-lg bg-danger-surface px-4 py-3 text-sm font-medium text-danger">{exportError}</p> : null}

      {!report ? (
        <p className="text-charcoal-600">{live.loading ? 'Loading report…' : 'No report data.'}</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Occupancy" value={`${report.occupancyRatePercent}%`} hint={`${report.occupiedRoomNights} of ${report.availableRoomNights} room nights`} />
            <StatCard label="ADR" value={formatMoney(report.adr)} hint="Average daily rate" />
            <StatCard label="RevPAR" value={formatMoney(report.revpar)} hint="Revenue per available room" />
            <StatCard label="Room revenue" value={formatMoney(report.roomRevenue)} />
            <StatCard label="Cash collected" value={formatMoney(report.cashCollected)} tone="positive" />
            <StatCard label="Refunded" value={formatMoney(report.refunded)} />
            <StatCard label="Net cash" value={formatMoney(report.netCash)} tone="positive" />
            <StatCard label="Outstanding" value={formatMoney(report.outstandingBalance)} tone="warning" />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Reservations by status" subtitle={`${report.range.from} → ${report.range.to}`}>
              {report.byStatus.length === 0 ? (
                <EmptyState>No reservations in range.</EmptyState>
              ) : (
                <ul className="space-y-2 text-sm">
                  {report.byStatus.map((s) => (
                    <li key={s.status} className="flex items-center justify-between border-b border-forest-900/10 pb-2 last:border-0">
                      <span className="text-charcoal-700">{reservationStatusLabel(s.status)}</span>
                      <span className="font-semibold text-charcoal-900">{s.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="How these are defined">
              <dl className="space-y-3 text-sm">
                {Object.entries(report.definitions).map(([key, value]) => (
                  <div key={key}>
                    <dt className="font-medium text-charcoal-800">{key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</dt>
                    <dd className="text-charcoal-600">{value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
