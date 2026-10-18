'use client';

import { useState } from 'react';
import { LiveBar, Panel, EmptyState } from '@/components/admin/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { statusTone } from '@/lib/format';
import { staffRequest } from '@/lib/staff-session';
import { useLive } from '@/lib/use-live';

interface Notification {
  id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  status: string;
  templateCode: string | null;
  createdAt: string;
}

interface OutboxJob {
  id: string;
  topic: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

export default function AdminNotificationsPage() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const live = useLive<{ notifications: Notification[]; jobs: OutboxJob[] }>(() => staffRequest('/staff/notifications'), 8000);

  async function processNow() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await staffRequest<Record<string, unknown>>('/staff/notifications/process', { method: 'POST' });
      setNotice('Outbox processed.');
      void result;
      await live.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process the outbox.');
    } finally {
      setBusy(false);
    }
  }

  const notifications = live.data?.notifications ?? [];
  const jobs = live.data?.jobs ?? [];

  return (
    <div className="space-y-6">
      <LiveBar updatedAt={live.updatedAt} live={live.live} onToggle={live.setLive} onRefresh={() => void live.refresh()} error={error ?? live.error} />

      <Panel
        title="Outbox queue"
        subtitle="Background notification jobs awaiting delivery"
        actions={
          <button type="button" onClick={() => void processNow()} disabled={busy} className="rounded-md bg-forest-900 px-4 py-2 text-sm font-semibold text-ivory-100 hover:bg-forest-800 disabled:opacity-50">
            {busy ? 'Processing…' : 'Process now'}
          </button>
        }
      >
        {notice ? <p className="mb-3 rounded-lg bg-success-surface px-3 py-2 text-sm font-medium text-success">{notice}</p> : null}
        {jobs.length === 0 ? (
          <EmptyState>No pending or failed jobs.</EmptyState>
        ) : (
          <ul className="divide-y divide-forest-900/10 text-sm">
            {jobs.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="font-medium text-charcoal-800">{job.topic.replace(/[._]/g, ' ')}</p>
                  <p className="text-xs text-charcoal-500">
                    {new Date(job.createdAt).toLocaleString()} · {job.attempts} attempt(s)
                    {job.lastError ? ` · ${job.lastError}` : ''}
                  </p>
                </div>
                <StatusBadge label={job.status} tone={job.status === 'FAILED' || job.status === 'DEAD' ? 'danger' : 'warning'} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Recent notifications" subtitle="What has been sent to guests">
        {notifications.length === 0 ? (
          <EmptyState>No notifications yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-forest-900/10 text-sm">
            {notifications.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium text-charcoal-800">{n.subject ?? n.templateCode ?? 'Notification'}</p>
                  <p className="truncate text-xs text-charcoal-500">{n.channel} → {n.recipient} · {new Date(n.createdAt).toLocaleString()}</p>
                </div>
                <StatusBadge label={n.status} tone={statusTone(n.status === 'SENT' || n.status === 'DELIVERED' ? 'PAID' : n.status === 'FAILED' ? 'CANCELLED' : 'HELD')} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
