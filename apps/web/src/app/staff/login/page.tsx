'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { staffRequest, setStaffSession, type StaffUser } from '@/lib/staff-session';

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsTotp, setNeedsTotp] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await staffRequest<{ user: StaffUser; accessToken: string }>('/auth/staff/login', {
        method: 'POST',
        body: { email: email.trim(), password, totp: totp || undefined },
      });
      setStaffSession(result.accessToken, result.user);
      router.push('/staff');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed.';
      if (message.toLowerCase().includes('verification code')) setNeedsTotp(true);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-page flex justify-center py-16">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-3xl font-semibold">Staff sign in</h1>
        <p className="mt-2 text-sm text-charcoal-600">
          For Mountain Dew Group team members. Guests should use the booking management page instead.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-charcoal-700">Work email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2" required autoComplete="username" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-charcoal-700">Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2" required autoComplete="current-password" />
          </label>
          {needsTotp ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-charcoal-700">Verification code</span>
              <input inputMode="numeric" value={totp} onChange={(e) => setTotp(e.target.value)} className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2" />
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-lg bg-danger-surface px-3 py-2 text-sm font-medium text-danger">{error}</p>
          ) : null}
          <button type="submit" disabled={busy} className="w-full rounded-md bg-forest-900 px-5 py-2.5 text-sm font-semibold text-ivory-100 hover:bg-forest-800 disabled:opacity-50">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
