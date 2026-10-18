'use client';

import { useState } from 'react';
import { LiveBar, Panel, StatCard, EmptyState } from '@/components/admin/ui';
import { todayISO } from '@/lib/format';
import { staffRequest } from '@/lib/staff-session';
import { useLive } from '@/lib/use-live';

interface PhysicalRoom {
  id: string;
  number: string;
  readiness: string;
  active: boolean;
  roomTypeId: string;
  roomType: { name: string; slug: string };
}

interface Task {
  id: string;
  type: string;
  status: string;
  priority: string;
  dueAt: string | null;
  room: { number: string } | null;
  assignee: { fullName: string } | null;
  notes: string | null;
}

interface Block {
  id: string;
  roomId: string;
  room: { number: string };
  startDate: string;
  endDate: string;
  kind: string;
  reason: string;
}

const READINESS = ['CLEAN', 'DIRTY', 'IN_PROGRESS', 'INSPECTED', 'OUT_OF_ORDER'];
const TASK_FLOW: Record<string, string | null> = { OPEN: 'IN_PROGRESS', IN_PROGRESS: 'DONE', DONE: 'INSPECTED', INSPECTED: null };

export default function AdminRoomsPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const roomsLive = useLive<{ rooms: PhysicalRoom[] }>(() => staffRequest('/staff/rooms'), 10000);
  const tasksLive = useLive<{ tasks: Task[] }>(() => staffRequest('/staff/housekeeping/tasks'), 8000);
  const blocksLive = useLive<{ blocks: Block[] }>(() => staffRequest('/staff/room-blocks'), 15000);

  const rooms = roomsLive.data?.rooms ?? [];
  const tasks = tasksLive.data?.tasks ?? [];
  const blocks = blocksLive.data?.blocks ?? [];

  async function run(fn: () => Promise<unknown>, refresh: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The action could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  const dirty = rooms.filter((r) => r.readiness === 'DIRTY' || r.readiness === 'IN_PROGRESS').length;
  const ooo = rooms.filter((r) => r.readiness === 'OUT_OF_ORDER').length;
  const available = rooms.filter((r) => r.active && r.readiness !== 'OUT_OF_ORDER').length;
  const openTasks = tasks.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;

  return (
    <div className="space-y-6">
      <LiveBar updatedAt={roomsLive.updatedAt} live={roomsLive.live} onToggle={roomsLive.setLive} onRefresh={() => { void roomsLive.refresh(); void tasksLive.refresh(); void blocksLive.refresh(); }} error={error ?? roomsLive.error} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Rooms" value={String(rooms.length)} hint={`${available} sellable`} />
        <StatCard label="Need cleaning" value={String(dirty)} tone={dirty ? 'warning' : 'default'} />
        <StatCard label="Out of order" value={String(ooo)} tone={ooo ? 'danger' : 'default'} />
        <StatCard label="Open tasks" value={String(openTasks)} tone={openTasks ? 'warning' : 'default'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Room readiness" subtitle="Update as housekeeping progresses">
          <div className="max-h-[28rem] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-charcoal-500">
                <tr><th className="py-2 pr-4">Room</th><th className="py-2 pr-4">Type</th><th className="py-2">Readiness</th></tr>
              </thead>
              <tbody className="divide-y divide-forest-900/10">
                {rooms.length === 0 ? <tr><td colSpan={3}><EmptyState>No rooms configured.</EmptyState></td></tr> : null}
                {rooms.map((room) => (
                  <tr key={room.id}>
                    <td className="py-2.5 pr-4 font-medium text-charcoal-800">{room.number}</td>
                    <td className="py-2.5 pr-4 text-charcoal-600">{room.roomType.name}</td>
                    <td className="py-2.5">
                      <select
                        value={room.readiness}
                        disabled={busy}
                        onChange={(e) => void run(() => staffRequest(`/staff/rooms/${room.id}/readiness`, { method: 'PATCH', body: { readiness: e.target.value } }), roomsLive.refresh)}
                        className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-2 py-1 text-xs"
                      >
                        {READINESS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Housekeeping tasks" subtitle="Advance or close tasks">
          {tasks.length === 0 ? (
            <EmptyState>No housekeeping tasks.</EmptyState>
          ) : (
            <ul className="max-h-[28rem] space-y-3 overflow-y-auto">
              {tasks.map((task) => {
                const next = TASK_FLOW[task.status];
                return (
                  <li key={task.id} className="rounded-lg border border-forest-900/10 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-charcoal-800">
                          {task.type.replace(/_/g, ' ')} · room {task.room?.number ?? '—'}
                        </p>
                        <p className="text-xs text-charcoal-500">
                          {task.status.replace(/_/g, ' ')} · {task.priority.toLowerCase()}
                          {task.assignee ? ` · ${task.assignee.fullName}` : ''}
                          {task.dueAt ? ` · due ${new Date(task.dueAt).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      {next ? (
                        <button type="button" disabled={busy} onClick={() => void run(() => staffRequest(`/staff/housekeeping/tasks/${task.id}`, { method: 'PATCH', body: { status: next } }), tasksLive.refresh)} className="rounded-md bg-forest-900 px-3 py-1 text-xs font-semibold text-ivory-100 hover:bg-forest-800 disabled:opacity-50">
                          Mark {next.replace(/_/g, ' ').toLowerCase()}
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-success">Done</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <BlockPanel rooms={rooms} blocks={blocks} busy={busy} onRelease={(id) => void run(() => staffRequest(`/staff/room-blocks/${id}`, { method: 'DELETE' }), blocksLive.refresh)} onCreate={(body) => void run(() => staffRequest('/staff/room-blocks', { method: 'POST', body }), blocksLive.refresh)} />
    </div>
  );
}

function BlockPanel({ rooms, blocks, busy, onRelease, onCreate }: { rooms: PhysicalRoom[]; blocks: Block[]; busy: boolean; onRelease: (id: string) => void; onCreate: (body: unknown) => void }) {
  const [roomId, setRoomId] = useState('');
  const [kind, setKind] = useState('MAINTENANCE');
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO(1));
  const [reason, setReason] = useState('');

  return (
    <Panel title="Maintenance & out-of-order blocks" subtitle="Blocks remove rooms from sale for the selected dates">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate({ roomId, kind, startDate, endDate, reason: reason.trim() });
          setReason('');
        }}
      >
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-charcoal-600">Room</span>
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)} required className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-2 py-1.5">
            <option value="">Select…</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.number} · {r.roomType.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-charcoal-600">Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-2 py-1.5">
            {['MAINTENANCE', 'OUT_OF_ORDER', 'BLOCK'].map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-charcoal-600">From</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-2 py-1.5" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-charcoal-600">To</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-2 py-1.5" />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs">
          <span className="font-medium text-charcoal-600">Reason</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} required className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-2 py-1.5" />
        </label>
        <button type="submit" disabled={busy || !roomId} className="rounded-md bg-forest-900 px-4 py-2 text-sm font-semibold text-ivory-100 hover:bg-forest-800 disabled:opacity-50">Block room</button>
      </form>

      <div className="mt-4">
        {blocks.length === 0 ? (
          <EmptyState>No active blocks.</EmptyState>
        ) : (
          <ul className="divide-y divide-forest-900/10 text-sm">
            {blocks.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-4 py-2.5">
                <div>
                  <p className="font-medium text-charcoal-800">Room {b.room.number} · {b.kind.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-charcoal-500">{b.startDate} → {b.endDate} · {b.reason}</p>
                </div>
                <button type="button" disabled={busy} onClick={() => onRelease(b.id)} className="rounded-md border border-forest-900/30 px-3 py-1 text-xs font-semibold text-forest-900 hover:bg-forest-900/5 disabled:opacity-50">Release</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
