'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ReservationDto } from '@mdg/domain';
import { formatMoney } from '@mdg/domain';
import { StatusBadge } from '@/components/StatusBadge';
import { LiveBar, EmptyState } from '@/components/admin/ui';
import { API_BASE_URL, formatDateRange, reservationStatusLabel, statusTone } from '@/lib/format';
import { getAccessToken, staffRequest } from '@/lib/staff-session';
import { useLive } from '@/lib/use-live';

interface ListResponse {
  items: ReservationDto[];
  page: number;
  pageSize: number;
  total: number;
}

const STATUSES = ['', 'HELD', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW', 'EXPIRED'];

export default function AdminReservationsPage() {
  const [draftQuery, setDraftQuery] = useState('');
  const [draftStatus, setDraftStatus] = useState('');
  const [applied, setApplied] = useState({ query: '', status: '' });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const live = useLive<ListResponse>(() => {
    const params = new URLSearchParams();
    if (applied.query) params.set('q', applied.query);
    if (applied.status) params.set('status', applied.status);
    params.set('pageSize', '50');
    return staffRequest<ListResponse>(`/staff/reservations?${params.toString()}`);
  }, 8000);

  const { refresh } = live;
  useEffect(() => {
    void refresh();
  }, [applied, refresh]);

  const rows = live.data?.items ?? [];
  const summary = useMemo(() => {
    const balances = rows.reduce((acc, r) => acc + r.balanceDue.amountMinor, 0);
    return { count: rows.length, balanceMinor: balances, currency: rows[0]?.balanceDue.currency ?? 'USD' as const };
  }, [rows]);

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/staff/reports/export`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error('Export failed.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mdg-reservations-${new Date().toISOString().slice(0, 10)}.csv`;
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
    <div className="space-y-5">
      <LiveBar updatedAt={live.updatedAt} live={live.live} onToggle={live.setLive} onRefresh={() => void live.refresh()} error={live.error} />

      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-forest-900/10 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ query: draftQuery.trim(), status: draftStatus });
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-charcoal-700">Search</span>
          <input value={draftQuery} onChange={(e) => setDraftQuery(e.target.value)} placeholder="Reference, name or phone" className="w-64 rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-charcoal-700">Status</span>
          <select value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)} className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2">
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s ? reservationStatusLabel(s) : 'All statuses'}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-md bg-forest-900 px-5 py-2.5 text-sm font-semibold text-ivory-100 hover:bg-forest-800">Search</button>
        <button type="button" onClick={() => void exportCsv()} disabled={exporting} className="rounded-md border border-forest-900/30 px-4 py-2.5 text-sm font-semibold text-forest-900 hover:bg-forest-900/5 disabled:opacity-50">
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
        {live.data ? <span className="text-sm text-charcoal-500">{live.data.total} result{live.data.total === 1 ? '' : 's'}</span> : null}
      </form>

      {exportError ? <p role="alert" className="rounded-lg bg-danger-surface px-4 py-3 text-sm font-medium text-danger">{exportError}</p> : null}

      <div className="overflow-hidden rounded-xl border border-forest-900/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-ivory-200/60 text-xs uppercase tracking-wide text-charcoal-500">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Guest</th>
              <th className="px-4 py-3">Stay</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-forest-900/10">
            {live.loading && !live.data ? (
              <tr><td colSpan={6}><EmptyState>Loading reservations…</EmptyState></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6}><EmptyState>No reservations found.</EmptyState></td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-ivory-100/60">
                  <td className="px-4 py-3">
                    <Link href={`/admin/reservations/${r.id}`} className="font-medium text-forest-900 hover:underline">{r.reference}</Link>
                  </td>
                  <td className="px-4 py-3 text-charcoal-700">{r.leadGuestName}</td>
                  <td className="px-4 py-3 text-charcoal-600">{formatDateRange(r.checkIn, r.checkOut)}</td>
                  <td className="px-4 py-3 text-charcoal-500">{r.source.replace('_', ' ')}</td>
                  <td className="px-4 py-3"><StatusBadge label={reservationStatusLabel(r.status)} tone={statusTone(r.status)} /></td>
                  <td className="px-4 py-3 text-right font-medium text-charcoal-800">{formatMoney(r.balanceDue)}</td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot className="bg-ivory-200/40 text-sm font-semibold text-charcoal-700">
              <tr>
                <td className="px-4 py-3" colSpan={5}>Showing {summary.count} · balance on page</td>
                <td className="px-4 py-3 text-right">{formatMoney({ amountMinor: summary.balanceMinor, currency: summary.currency })}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
