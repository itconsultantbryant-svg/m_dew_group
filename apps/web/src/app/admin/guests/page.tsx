'use client';

import { useEffect, useState } from 'react';
import { LiveBar, Panel, EmptyState } from '@/components/admin/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate, reservationStatusLabel, statusTone } from '@/lib/format';
import { staffRequest } from '@/lib/staff-session';
import { useLive } from '@/lib/use-live';

interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneCountryCode: string;
  phoneNumber: string;
  createdAt: string;
  reservations: { reference: string; status: string; checkIn: string; checkOut: string }[];
}

export default function AdminGuestsPage() {
  const [draft, setDraft] = useState('');
  const [applied, setApplied] = useState('');

  const live = useLive<{ guests: Guest[] }>(() => staffRequest(`/staff/guests${applied ? `?q=${encodeURIComponent(applied)}` : ''}`), 12000);
  const { refresh } = live;
  useEffect(() => {
    void refresh();
  }, [applied, refresh]);

  const guests = live.data?.guests ?? [];

  return (
    <div className="space-y-6">
      <LiveBar updatedAt={live.updatedAt} live={live.live} onToggle={live.setLive} onRefresh={() => void live.refresh()} error={live.error} />

      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-forest-900/10 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(draft.trim());
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-charcoal-700">Search guests</span>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Name, email or phone" className="w-72 rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2" />
        </label>
        <button type="submit" className="rounded-md bg-forest-900 px-5 py-2.5 text-sm font-semibold text-ivory-100 hover:bg-forest-800">Search</button>
        {applied ? (
          <button type="button" onClick={() => { setDraft(''); setApplied(''); }} className="rounded-md border border-forest-900/30 px-4 py-2.5 text-sm font-semibold text-forest-900 hover:bg-forest-900/5">Clear</button>
        ) : null}
      </form>

      <Panel title="Guest profiles" subtitle={applied ? `Matching “${applied}”` : 'Most recently updated guests'}>
        {guests.length === 0 ? (
          <EmptyState>No guests found.</EmptyState>
        ) : (
          <ul className="divide-y divide-forest-900/10">
            {guests.map((g) => (
              <li key={g.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-charcoal-800">{g.firstName} {g.lastName}</p>
                    <p className="text-sm text-charcoal-600">
                      {g.email ?? 'no email'} · {g.phoneCountryCode} {g.phoneNumber}
                    </p>
                    <p className="text-xs text-charcoal-500">Guest since {formatDate(g.createdAt)}</p>
                  </div>
                  <div className="text-right text-xs text-charcoal-500">{g.reservations.length} stay{g.reservations.length === 1 ? '' : 's'}</div>
                </div>
                {g.reservations.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {g.reservations.slice(0, 6).map((r) => (
                      <span key={r.reference} className="inline-flex items-center gap-2 rounded-lg border border-forest-900/10 px-2.5 py-1 text-xs">
                        <span className="font-medium text-charcoal-700">{r.reference}</span>
                        <StatusBadge label={reservationStatusLabel(r.status)} tone={statusTone(r.status)} />
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
