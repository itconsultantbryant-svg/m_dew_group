'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { todayISO } from '@/lib/format';

interface SearchBarProps {
  initial?: { checkIn?: string; checkOut?: string; adults?: number; children?: number; rooms?: number };
  variant?: 'hero' | 'inline';
}

export function SearchBar({ initial, variant = 'hero' }: SearchBarProps) {
  const router = useRouter();
  const [checkIn, setCheckIn] = useState(initial?.checkIn ?? todayISO(1));
  const [checkOut, setCheckOut] = useState(initial?.checkOut ?? todayISO(3));
  const [adults, setAdults] = useState(initial?.adults ?? 2);
  const [children, setChildren] = useState(initial?.children ?? 0);
  const [rooms] = useState(initial?.rooms ?? 1);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (checkOut <= checkIn) {
      setError('Check-out must be after check-in.');
      return;
    }
    setError(null);
    const params = new URLSearchParams({
      checkIn,
      checkOut,
      adults: String(adults),
      children: String(children),
      rooms: String(rooms),
    });
    router.push(`/book?${params.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className={
        variant === 'hero'
          ? 'card grid gap-4 p-5 shadow-lift sm:p-6 sm:grid-cols-2 lg:grid-cols-5 lg:items-end'
          : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end'
      }
      aria-label="Search availability"
    >
      {variant === 'hero' ? (
        <p className="col-span-full font-display text-lg font-semibold text-forest-900">Check availability</p>
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        <span className="label mb-0">Check-in</span>
        <input
          type="date"
          value={checkIn}
          min={todayISO()}
          onChange={(e) => setCheckIn(e.target.value)}
          className="field"
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="label mb-0">Check-out</span>
        <input
          type="date"
          value={checkOut}
          min={checkIn}
          onChange={(e) => setCheckOut(e.target.value)}
          className="field"
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="label mb-0">Adults</span>
        <select value={adults} onChange={(e) => setAdults(Number(e.target.value))} className="field">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="label mb-0">Children</span>
        <select value={children} onChange={(e) => setChildren(Number(e.target.value))} className="field">
          {[0, 1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn btn-primary py-2.5">
        Check availability
      </button>
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger sm:col-span-2 lg:col-span-5">
          {error}
        </p>
      ) : null}
    </form>
  );
}
