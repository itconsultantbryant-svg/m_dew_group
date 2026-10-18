'use client';

import { useState } from 'react';
import { LiveBar, Panel, EmptyState } from '@/components/admin/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/format';
import { staffRequest } from '@/lib/staff-session';
import { useLive } from '@/lib/use-live';

interface StaffAccount {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const FALLBACK_ROLES = ['OWNER', 'GENERAL_MANAGER', 'FRONT_DESK', 'FINANCE', 'HOUSEKEEPING', 'RESTAURANT', 'BOUTIQUE', 'ENTERTAINMENT', 'CONTENT_EDITOR'];

export default function AdminTeamPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const live = useLive<{ users: StaffAccount[]; roles: string[] }>(async () => {
    try {
      return await staffRequest<{ users: StaffAccount[]; roles: string[] }>('/staff/users');
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes('permission')) setForbidden(true);
      throw err;
    }
  }, 15000);

  const users = live.data?.users ?? [];
  const roles = live.data?.roles ?? FALLBACK_ROLES;

  async function run(fn: () => Promise<unknown>, successMessage?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (successMessage) setNotice(successMessage);
      await live.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The change could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  if (forbidden) {
    return <p className="rounded-lg bg-warning-surface px-4 py-3 text-sm font-medium text-warning">Your role does not have permission to manage team accounts.</p>;
  }

  return (
    <div className="space-y-6">
      <LiveBar updatedAt={live.updatedAt} live={live.live} onToggle={live.setLive} onRefresh={() => void live.refresh()} error={error ?? live.error} />

      {notice ? <p className="rounded-lg bg-success-surface px-4 py-3 text-sm font-medium text-success">{notice}</p> : null}

      <Panel title="Staff accounts" subtitle="Roles control what each person can do">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-charcoal-500">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Last login</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-forest-900/10">
              {live.loading && !live.data ? (
                <tr><td colSpan={6}><EmptyState>Loading accounts…</EmptyState></td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2.5 pr-4 font-medium text-charcoal-800">{u.fullName}</td>
                    <td className="py-2.5 pr-4 text-charcoal-600">{u.email}</td>
                    <td className="py-2.5 pr-4">
                      <select
                        value={u.role}
                        disabled={busy}
                        onChange={(e) => void run(() => staffRequest(`/staff/users/${u.id}`, { method: 'PATCH', body: { role: e.target.value } }), `Updated ${u.fullName}.`)}
                        className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-2 py-1 text-xs"
                      >
                        {roles.map((role) => <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>)}
                      </select>
                    </td>
                    <td className="py-2.5 pr-4 text-charcoal-500">{u.lastLoginAt ? formatDate(u.lastLoginAt) : 'never'}</td>
                    <td className="py-2.5 pr-4"><StatusBadge label={u.isActive ? 'Active' : 'Disabled'} tone={u.isActive ? 'success' : 'danger'} /></td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void run(() => staffRequest(`/staff/users/${u.id}`, { method: 'PATCH', body: { isActive: !u.isActive } }), `${u.fullName} ${u.isActive ? 'disabled' : 'reactivated'}.`)}
                          className="rounded-md border border-forest-900/30 px-3 py-1 text-xs font-semibold text-forest-900 hover:bg-forest-900/5 disabled:opacity-50"
                        >
                          {u.isActive ? 'Disable' : 'Reactivate'}
                        </button>
                        <PasswordReset busy={busy} onReset={(password) => void run(() => staffRequest(`/staff/users/${u.id}`, { method: 'PATCH', body: { password } }), `Password reset for ${u.fullName}.`)} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Invite a team member" subtitle="They sign in at /staff/login with these credentials">
        <CreateUserForm roles={roles} busy={busy} onCreate={(payload) => void run(() => staffRequest('/staff/users', { method: 'POST', body: payload }), `Created ${payload.fullName}.`)} />
      </Panel>
    </div>
  );
}

function PasswordReset({ busy, onReset }: { busy: boolean; onReset: (password: string) => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  if (!open) {
    return (
      <button type="button" disabled={busy} onClick={() => setOpen(true)} className="rounded-md border border-forest-900/30 px-3 py-1 text-xs font-semibold text-forest-900 hover:bg-forest-900/5 disabled:opacity-50">
        Reset password
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" className="w-36 rounded-md border border-charcoal-800/20 bg-ivory-50 px-2 py-1 text-xs" />
      <button type="button" disabled={busy || password.length < 12} onClick={() => { onReset(password); setPassword(''); setOpen(false); }} className="rounded-md bg-forest-900 px-3 py-1 text-xs font-semibold text-ivory-100 hover:bg-forest-800 disabled:opacity-50">Save</button>
    </div>
  );
}

function CreateUserForm({ roles, busy, onCreate }: { roles: string[]; busy: boolean; onCreate: (payload: { email: string; fullName: string; role: string; password: string }) => void }) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState(roles[0] ?? 'FRONT_DESK');
  const [password, setPassword] = useState('');

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onCreate({ email: email.trim().toLowerCase(), fullName: fullName.trim(), role, password });
        setEmail('');
        setFullName('');
        setPassword('');
      }}
    >
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-charcoal-600">Full name</span>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-charcoal-600">Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-charcoal-600">Role</span>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2">
          {roles.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-charcoal-600">Temporary password (12+ chars)</span>
        <input value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} required className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2" />
      </label>
      <button type="submit" disabled={busy} className="rounded-md bg-forest-900 px-5 py-2.5 text-sm font-semibold text-ivory-100 hover:bg-forest-800 disabled:opacity-50">Create account</button>
    </form>
  );
}
