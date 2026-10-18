'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ApiClient, ApiError } from '@mdg/api-client';
import { formatMoney, type AvailabilityResponseDto, type QuoteDto, type ReservationDto } from '@mdg/domain';
import { API_BASE_URL, formatDate, todayISO } from '@/lib/format';

const client = new ApiClient({ baseUrl: API_BASE_URL });

type Step = 'search' | 'select' | 'details' | 'done';

interface Selection {
  roomTypeId: string;
  slug: string;
  name: string;
  ratePlanId: string;
  quantity: number;
  adults: number;
  children: number;
}

export default function BookPage() {
  return (
    <Suspense fallback={<div className="container-page py-16">Loading booking…</div>}>
      <BookFlow />
    </Suspense>
  );
}

function BookFlow() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>('search');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    checkIn: searchParams.get('checkIn') ?? todayISO(1),
    checkOut: searchParams.get('checkOut') ?? todayISO(3),
    adults: Number(searchParams.get('adults') ?? 2),
    children: Number(searchParams.get('children') ?? 0),
    rooms: Number(searchParams.get('rooms') ?? 1),
  });
  const preselectSlug = searchParams.get('roomType');

  const [availability, setAvailability] = useState<AvailabilityResponseDto | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [quote, setQuote] = useState<QuoteDto | null>(null);
  const [hold, setHold] = useState<{ holdId: string; reservationId: string; reference: string; expiresAt: string } | null>(null);
  const [confirmation, setConfirmation] = useState<{ reservation: ReservationDto; manageToken: string } | null>(null);

  const [guest, setGuest] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneCountryCode: '+231',
    phoneNumber: '',
    estimatedArrivalTime: '',
    specialRequests: '',
    communicationPreference: 'EMAIL' as 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PHONE',
    marketingConsent: false,
    acceptTerms: false,
    acceptPrivacy: false,
  });

  const runSearch = useCallback(
    async (f: typeof form) => {
      setBusy(true);
      setError(null);
      try {
        const result = await client.searchAvailability({
          checkIn: f.checkIn,
          checkOut: f.checkOut,
          rooms: f.rooms,
          adults: f.adults,
          children: f.children,
        });
        setAvailability(result);
        const preselected = preselectSlug ? result.results.find((r) => r.roomType.slug === preselectSlug) : undefined;
        if (preselected) {
          setSelections([
            {
              roomTypeId: preselected.roomType.id,
              slug: preselected.roomType.slug,
              name: preselected.roomType.name,
              ratePlanId: preselected.ratePlanId,
              quantity: f.rooms,
              adults: f.adults,
              children: f.children,
            },
          ]);
        }
        setStep('select');
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'We could not load availability. Please try again.');
      } finally {
        setBusy(false);
      }
    },
    [preselectSlug],
  );

  useEffect(() => {
    if (form.checkIn && form.checkOut && form.checkIn < form.checkOut) {
      void runSearch(form);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalSelected = selections.reduce((acc, s) => acc + s.quantity, 0);
  const canQuote = selections.length > 0;

  function addSelection(result: AvailabilityResponseDto['results'][number]) {
    setSelections((prev) => {
      const existing = prev.find((s) => s.roomTypeId === result.roomType.id);
      if (existing) {
        return prev;
      }
      return [
        ...prev,
        {
          roomTypeId: result.roomType.id,
          slug: result.roomType.slug,
          name: result.roomType.name,
          ratePlanId: result.ratePlanId,
          quantity: 1,
          adults: Math.min(form.adults, result.roomType.maxOccupancy),
          children: 0,
        },
      ];
    });
  }

  function updateSelection(roomTypeId: string, patch: Partial<Selection>) {
    setSelections((prev) => prev.map((s) => (s.roomTypeId === roomTypeId ? { ...s, ...patch } : s)));
  }

  function removeSelection(roomTypeId: string) {
    setSelections((prev) => prev.filter((s) => s.roomTypeId !== roomTypeId));
  }

  const quoteRooms = () =>
    selections.map((s) => ({
      roomTypeId: s.roomTypeId,
      ratePlanId: s.ratePlanId,
      quantity: s.quantity,
      adults: s.adults,
      children: s.children,
    }));

  async function proceedToDetails() {
    setBusy(true);
    setError(null);
    try {
      const q = await client.createQuote({ checkIn: form.checkIn, checkOut: form.checkOut, rooms: quoteRooms() });
      setQuote(q);
      setStep('details');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'We could not price your stay. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submitBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!quote) return;
    setBusy(true);
    setError(null);
    try {
      const created = await client.createHold({
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        rooms: quoteRooms(),
        quoteFingerprint: quote.fingerprint,
      });
      setHold(created);
      const result = await client.createReservation({
        holdId: created.holdId,
        quoteFingerprint: quote.fingerprint,
        leadGuest: {
          ...guest,
          email: guest.email || undefined,
          acceptTerms: true,
          acceptPrivacy: true,
        },
        idempotencyKey: `web-${created.holdId.slice(0, 8)}-${Date.now()}`,
      });
      setConfirmation(result);
      setStep('done');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'QUOTE_CHANGED') {
        setError('Prices changed while you were booking. Please review the updated total.');
        const refreshed = await client.createQuote({ checkIn: form.checkIn, checkOut: form.checkOut, rooms: quoteRooms() });
        setQuote(refreshed);
      } else {
        setError(err instanceof ApiError ? err.message : 'We could not complete your booking. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  const manageHref = useMemo(() => {
    if (!confirmation) return '/manage';
    return `/manage/${confirmation.reservation.reference}?token=${encodeURIComponent(confirmation.manageToken)}`;
  }, [confirmation]);

  return (
    <div className="container-page py-10">
      <h1 className="text-4xl font-semibold">Book your stay</h1>
      <p className="mt-2 text-charcoal-600">
        No payment is collected online. You confirm your booking instantly and pay at the property.
      </p>

      <ol className="mt-8 flex flex-wrap gap-3 text-sm" aria-label="Booking progress">
        {(['search', 'select', 'details', 'done'] as Step[]).map((s, index) => (
          <li
            key={s}
            aria-current={step === s ? 'step' : undefined}
            className={`rounded-full px-3 py-1 font-medium ${
              step === s ? 'bg-forest-900 text-ivory-100' : 'bg-ivory-200 text-charcoal-600'
            }`}
          >
            {index + 1}. {s === 'search' ? 'Dates' : s === 'select' ? 'Rooms' : s === 'details' ? 'Your details' : 'Confirmed'}
          </li>
        ))}
      </ol>

      {error ? (
        <p role="alert" className="mt-6 rounded-lg bg-danger-surface px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      {step === 'search' ? (
        <form
          className="card mt-8 grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(form);
          }}
        >
          <Field label="Check-in">
            <input type="date" min={todayISO()} value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} className={inputClass} required />
          </Field>
          <Field label="Check-out">
            <input type="date" min={form.checkIn} value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} className={inputClass} required />
          </Field>
          <Field label="Adults">
            <select value={form.adults} onChange={(e) => setForm({ ...form, adults: Number(e.target.value) })} className={inputClass}>
              {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Children">
            <select value={form.children} onChange={(e) => setForm({ ...form, children: Number(e.target.value) })} className={inputClass}>
              {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <button type="submit" disabled={busy} className={buttonClass}>
            {busy ? 'Searching…' : 'Search'}
          </button>
        </form>
      ) : null}

      {step === 'select' && availability ? (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-4">
            <p className="text-sm text-charcoal-600">
              {formatDate(availability.checkIn)} → {formatDate(availability.checkOut)} ·{' '}
              {availability.nights} night{availability.nights === 1 ? '' : 's'}
            </p>
            {availability.results.map((result) => {
              const selected = selections.find((s) => s.roomTypeId === result.roomType.id);
              return (
                <article key={result.roomType.id} className="card flex flex-col gap-4 p-4 sm:flex-row">
                  <img src={result.roomType.images[0] ?? '/images/room-placeholder.svg'} alt="" className="h-40 w-full rounded-lg object-cover sm:w-52" />
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="font-display text-xl font-semibold text-forest-900">{result.roomType.name}</h2>
                        <p className="text-sm text-charcoal-600">{result.roomType.shortDescription}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-xl font-semibold text-forest-900">{formatMoney(result.stayTotal)}</p>
                        <p className="text-xs text-charcoal-500">total · {formatMoney(result.averageNightly)}/night</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-charcoal-500">
                      {result.availableCount} available · sleeps {result.roomType.maxOccupancy}
                    </p>
                    <div className="mt-3">
                      {selected ? (
                        <button type="button" onClick={() => removeSelection(result.roomType.id)} className="rounded-md border border-forest-900/30 px-4 py-2 text-sm font-semibold text-forest-900 hover:bg-forest-900/5">
                          Remove
                        </button>
                      ) : (
                        <button type="button" onClick={() => addSelection(result)} className="rounded-md bg-forest-900 px-4 py-2 text-sm font-semibold text-ivory-100 hover:bg-forest-800">
                          Add to stay
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="card p-6">
              <h2 className="text-lg font-semibold">Your selection</h2>
              {selections.length === 0 ? (
                <p className="mt-3 text-sm text-charcoal-600">Add at least one room to continue.</p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {selections.map((s) => (
                    <li key={s.roomTypeId} className="border-b border-forest-900/10 pb-4 last:border-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-charcoal-800">{s.name}</span>
                        <button type="button" onClick={() => removeSelection(s.roomTypeId)} className="text-xs font-semibold text-danger hover:underline">
                          Remove
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <NumberStepper label="Rooms" value={s.quantity} min={1} max={availability.results.find((r) => r.roomType.id === s.roomTypeId)?.availableCount ?? 1} onChange={(v) => updateSelection(s.roomTypeId, { quantity: v })} />
                        <NumberStepper label="Adults" value={s.adults} min={1} max={s.quantity * (availability.results.find((r) => r.roomType.id === s.roomTypeId)?.roomType.maxAdults ?? 2)} onChange={(v) => updateSelection(s.roomTypeId, { adults: v })} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" disabled={!canQuote || busy} onClick={() => void proceedToDetails()} className={`${buttonClass} mt-6 w-full disabled:opacity-50`}>
                {busy ? 'Pricing…' : 'Continue to details'}
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {step === 'details' && quote ? (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          <form onSubmit={submitBooking} className="card p-6">
            <h2 className="text-lg font-semibold">Lead guest details</h2>
            <p className="mt-1 text-sm text-charcoal-600">We send your confirmation here. Fields marked * are required.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="First name *">
                <input className={inputClass} value={guest.firstName} onChange={(e) => setGuest({ ...guest, firstName: e.target.value })} required maxLength={80} />
              </Field>
              <Field label="Last name *">
                <input className={inputClass} value={guest.lastName} onChange={(e) => setGuest({ ...guest, lastName: e.target.value })} required maxLength={80} />
              </Field>
              <Field label="Email">
                <input type="email" className={inputClass} value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
              </Field>
              <Field label="Phone *">
                <div className="flex gap-2">
                  <input className={`${inputClass} w-24`} value={guest.phoneCountryCode} onChange={(e) => setGuest({ ...guest, phoneCountryCode: e.target.value })} required pattern="\+\d{1,4}" />
                  <input className={inputClass} value={guest.phoneNumber} onChange={(e) => setGuest({ ...guest, phoneNumber: e.target.value })} required minLength={5} maxLength={20} />
                </div>
              </Field>
              <Field label="Estimated arrival time">
                <input type="time" className={inputClass} value={guest.estimatedArrivalTime} onChange={(e) => setGuest({ ...guest, estimatedArrivalTime: e.target.value })} />
              </Field>
              <Field label="Preferred contact">
                <select className={inputClass} value={guest.communicationPreference} onChange={(e) => setGuest({ ...guest, communicationPreference: e.target.value as typeof guest.communicationPreference })}>
                  <option value="EMAIL">Email</option>
                  <option value="SMS">SMS</option>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="PHONE">Phone call</option>
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Special requests">
                  <textarea className={`${inputClass} min-h-24`} value={guest.specialRequests} onChange={(e) => setGuest({ ...guest, specialRequests: e.target.value })} maxLength={1000} />
                </Field>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <label className="flex items-start gap-3">
                <input type="checkbox" checked={guest.acceptTerms} onChange={(e) => setGuest({ ...guest, acceptTerms: e.target.checked })} required className="mt-1" />
                <span>I accept the booking terms and the cancellation policy. *</span>
              </label>
              <label className="flex items-start gap-3">
                <input type="checkbox" checked={guest.acceptPrivacy} onChange={(e) => setGuest({ ...guest, acceptPrivacy: e.target.checked })} required className="mt-1" />
                <span>I have read the privacy notice. *</span>
              </label>
              <label className="flex items-start gap-3">
                <input type="checkbox" checked={guest.marketingConsent} onChange={(e) => setGuest({ ...guest, marketingConsent: e.target.checked })} className="mt-1" />
                <span>Send me occasional offers (optional).</span>
              </label>
            </div>

            <button type="submit" disabled={busy} className={`${buttonClass} mt-6 w-full disabled:opacity-50`}>
              {busy ? 'Confirming…' : 'Confirm booking'}
            </button>
          </form>

          <QuoteSummary quote={quote} checkIn={form.checkIn} checkOut={form.checkOut} nights={availability?.nights ?? 0} />
        </div>
      ) : null}

      {step === 'done' && confirmation ? (
        <div className="card mx-auto mt-8 max-w-2xl p-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-success">Booking confirmed</p>
          <h2 className="mt-2 text-3xl font-semibold">Thank you, {confirmation.reservation.leadGuestName.split(' ')[0]}</h2>
          <p className="mt-3 text-charcoal-600">
            Your reference is <span className="font-semibold text-forest-900">{confirmation.reservation.reference}</span>.
            A confirmation message has been queued. Payment of{' '}
            {formatMoney(confirmation.reservation.balanceDue)} is due at the property.
          </p>
          <dl className="mt-6 grid grid-cols-2 gap-3 text-left text-sm">
            <div className="rounded-lg bg-ivory-200/60 p-3">
              <dt className="text-xs uppercase text-charcoal-500">Check-in</dt>
              <dd className="font-medium">{formatDate(confirmation.reservation.checkIn)}</dd>
            </div>
            <div className="rounded-lg bg-ivory-200/60 p-3">
              <dt className="text-xs uppercase text-charcoal-500">Check-out</dt>
              <dd className="font-medium">{formatDate(confirmation.reservation.checkOut)}</dd>
            </div>
          </dl>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={manageHref} className={buttonClass}>
              Manage this booking
            </Link>
            <Link href="/rooms" className="rounded-md border border-forest-900/30 px-5 py-2.5 text-sm font-semibold text-forest-900 hover:bg-forest-900/5">
              Explore more rooms
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const inputClass = 'rounded-md border border-charcoal-800/20 bg-ivory-50 px-3 py-2 text-charcoal-800 w-full';
const buttonClass = 'rounded-md bg-forest-900 px-5 py-2.5 text-sm font-semibold text-ivory-100 transition-colors hover:bg-forest-800';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-charcoal-700">{label}</span>
      {children}
    </label>
  );
}

function NumberStepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-charcoal-600">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="h-8 w-8 rounded-md border border-forest-900/20 text-charcoal-700" aria-label={`Decrease ${label}`}>
          −
        </button>
        <span className="w-6 text-center font-medium">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="h-8 w-8 rounded-md border border-forest-900/20 text-charcoal-700" aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
    </label>
  );
}

function QuoteSummary({ quote, checkIn, checkOut, nights }: { quote: QuoteDto; checkIn: string; checkOut: string; nights: number }) {
  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="card p-6">
        <h2 className="text-lg font-semibold">Your stay</h2>
        <p className="mt-1 text-sm text-charcoal-600">
          {formatDate(checkIn)} → {formatDate(checkOut)} · {nights || quote.nights} night{(nights || quote.nights) === 1 ? '' : 's'}
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {quote.lines.map((line, index) => (
            <li key={`${line.kind}-${index}`} className="flex justify-between gap-4">
              <span className="text-charcoal-700">
                {line.label}
                {line.quantity > 1 ? ` ×${line.quantity}` : ''}
              </span>
              <span className="font-medium text-charcoal-800">{formatMoney(line.amount)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1 border-t border-forest-900/10 pt-4 text-sm">
          <Row label="Subtotal" value={formatMoney(quote.subtotal)} />
          {quote.taxes.amountMinor ? <Row label="Taxes &amp; service" value={formatMoney(quote.taxes)} /> : null}
          {quote.fees.amountMinor ? <Row label="Fees" value={formatMoney(quote.fees)} /> : null}
          {quote.discount.amountMinor ? <Row label="Discount" value={`−${formatMoney(quote.discount)}`} /> : null}
          <div className="flex justify-between border-t border-forest-900/10 pt-2 text-base font-semibold text-forest-900">
            <dt>Total</dt>
            <dd>{formatMoney(quote.total)}</dd>
          </div>
        </dl>
        <p className="mt-4 rounded-lg bg-info-surface px-3 py-2 text-xs text-info">
          Due online today: {formatMoney(quote.dueOnlineToday)} · Due at property: {formatMoney(quote.dueAtProperty)}
        </p>
        <p className="mt-3 text-xs text-charcoal-500">{quote.cancellationSummary}</p>
      </div>
    </aside>
  );
}

function Row({ label, value, }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-charcoal-600" dangerouslySetInnerHTML={{ __html: label }} />
      <dd className="font-medium text-charcoal-800">{value}</dd>
    </div>
  );
}
