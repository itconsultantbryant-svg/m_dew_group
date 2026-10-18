'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiClient, ApiError } from '@mdg/api-client';
import { API_BASE_URL } from '@/lib/format';

const client = new ApiClient({ baseUrl: API_BASE_URL });

export default function ManageLookupPage() {
  const router = useRouter();
  const [reference, setReference] = useState('');
  const [lastName, setLastName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await client.lookupReservation({ reference: reference.trim(), lastName: lastName.trim() });
      router.push(`/manage/${encodeURIComponent(result.reservation.reference)}?token=${encodeURIComponent(result.manageToken)}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'We could not find a booking with that reference and surname.'
          : err instanceof ApiError
            ? err.message
            : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-page flex justify-center py-16">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-3xl font-semibold">Manage your booking</h1>
        <p className="mt-2 text-sm text-charcoal-600">
          Enter your booking reference and the surname used at booking to view, change or cancel your stay.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-charcoal-700">Booking reference</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value.toUpperCase())}
              placeholder="MDG-XXXXXX"
              className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2 uppercase tracking-wide text-charcoal-800"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-charcoal-700">Surname</span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2 text-charcoal-800"
              required
            />
          </label>
          {error ? (
            <p role="alert" className="rounded-lg bg-danger-surface px-3 py-2 text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-forest-900 px-5 py-2.5 text-sm font-semibold text-ivory-100 hover:bg-forest-800 disabled:opacity-50"
          >
            {busy ? 'Looking up…' : 'Find my booking'}
          </button>
        </form>
      </div>
    </div>
  );
}
