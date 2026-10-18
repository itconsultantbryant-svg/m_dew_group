'use client';

import { LiveBar, Panel, EmptyState } from '@/components/admin/ui';
import { staffRequest } from '@/lib/staff-session';
import { useLive } from '@/lib/use-live';

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorId: string | null;
  actorRole: string | null;
  reason: string | null;
  createdAt: string;
}

export default function AdminAuditPage() {
  const live = useLive<{ entries: AuditEntry[] }>(() => staffRequest('/staff/audit'), 10000);
  const entries = live.data?.entries ?? [];

  return (
    <div className="space-y-6">
      <LiveBar updatedAt={live.updatedAt} live={live.live} onToggle={live.setLive} onRefresh={() => void live.refresh()} error={live.error} />

      <Panel title="Audit log" subtitle="Every privileged change, most recent first">
        {entries.length === 0 ? (
          <EmptyState>No audit entries yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-charcoal-500">
                <tr>
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Entity</th>
                  <th className="py-2 pr-4">Actor</th>
                  <th className="py-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-forest-900/10">
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-2.5 pr-4 whitespace-nowrap text-charcoal-500">{new Date(entry.createdAt).toLocaleString()}</td>
                    <td className="py-2.5 pr-4 font-medium text-charcoal-800">{entry.action.replace(/[._]/g, ' ')}</td>
                    <td className="py-2.5 pr-4 text-charcoal-600">
                      {entry.entityType}
                      {entry.entityId ? <span className="ml-1 font-mono text-xs text-charcoal-400">{entry.entityId.slice(0, 8)}</span> : null}
                    </td>
                    <td className="py-2.5 pr-4 text-charcoal-500">{entry.actorRole?.replace(/_/g, ' ') ?? '—'}</td>
                    <td className="py-2.5 text-charcoal-600">{entry.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
