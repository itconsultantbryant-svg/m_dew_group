'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiClient, ApiError } from '@mdg/api-client';
import { API_BASE_URL } from '@/lib/format';

const client = new ApiClient({ baseUrl: API_BASE_URL });

export function CancelBooking({ reference, token }: { reference: string; token: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await client.cancelReservation(reference, {
        token,
        reason: reason || undefined,
        idempotencyKey: `cancel-${reference}-${Date.now()}`,
      });
      router.refresh();
      setConfirming(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'We could not cancel this booking. Please contact us.');
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-danger/40 px-4 py-2 text-sm font-semibold text-danger hover:bg-danger-surface"
      >
        Cancel booking
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-danger/30 bg-danger-surface/60 p-4">
      <p className="text-sm font-medium text-danger">Are you sure you want to cancel this booking?</p>
      <label className="mt-3 flex flex-col gap-1 text-sm">
        <span className="text-charcoal-700">Reason (optional)</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-md border border-charcoal-800/20 bg-white px-3 py-2"
        />
      </label>
      {error ? <p role="alert" className="mt-2 text-sm font-medium text-danger">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void cancel()}
          disabled={busy}
          className="rounded-md bg-danger px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Cancelling…' : 'Yes, cancel booking'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-md border border-charcoal-800/20 px-4 py-2 text-sm font-semibold text-charcoal-700"
        >
          Keep booking
        </button>
      </div>
    </div>
  );
}
