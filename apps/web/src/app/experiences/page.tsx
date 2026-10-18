import type { Metadata } from 'next';
import { formatMoney, type CurrencyCode } from '@mdg/domain';
import { InquiryForm } from '@/components/InquiryForm';
import { getEvents } from '@/lib/server-api';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Experiences',
  description: 'Live music, private hire and a cigar bar at Mountain Dew Group, Monrovia.',
};

export default async function ExperiencesPage() {
  const data = await getEvents();
  const events = data?.events ?? [];

  return (
    <div className="container-page py-12">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wider text-brass-ink">Entertainment</p>
        <h1 className="mt-2 text-4xl font-semibold">Experiences &amp; entertainment</h1>
        <p className="mt-3 text-charcoal-600">
          Live music, private hire and a relaxed cigar bar. The events below are demonstration listings; enquire to
          discuss dates, capacity and pricing.
        </p>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          {events.length > 0 ? (
            events.map((event) => (
              <article key={event.id} className="card flex flex-col gap-4 p-5 sm:flex-row">
                {event.media[0] ? (
                  <img src={event.media[0].url} alt={event.media[0].alt} className="h-40 w-full rounded-lg object-cover sm:w-52" loading="lazy" />
                ) : null}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brass-ink">
                    {formatDate(event.startsAt)}
                    {event.venue ? ` · ${event.venue}` : ''}
                  </p>
                  <h2 className="mt-1 font-display text-xl font-semibold text-forest-900">{event.title}</h2>
                  {event.description ? <p className="mt-2 text-sm text-charcoal-600">{event.description}</p> : null}
                  {typeof event.ticketPriceMinor === 'number' ? (
                    <p className="mt-2 text-sm font-medium text-forest-900">
                      From {formatMoney({ amountMinor: event.ticketPriceMinor, currency: 'USD' as CurrencyCode })}
                    </p>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <p className="text-charcoal-600">No scheduled events right now. Enquire below for private hire.</p>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="text-2xl font-semibold">Enquire about an event</h2>
          <p className="mt-1 text-sm text-charcoal-600">
            Planning a celebration or private hire? Send us the details and our team will respond.
          </p>
          <div className="mt-4">
            <InquiryForm
              endpoint="/experiences/event-inquiries"
              submitLabel="Send enquiry"
              successMessage="Your event enquiry has been received. Our team will be in touch shortly."
              fields={[
                { name: 'name', label: 'Full name', required: true },
                { name: 'email', label: 'Email', type: 'email', required: true },
                { name: 'phoneCountryCode', label: 'Country code', required: true, placeholder: '+231' },
                { name: 'phoneNumber', label: 'Phone number', type: 'tel', required: true },
                {
                  name: 'eventType',
                  label: 'Type of event',
                  type: 'select',
                  required: true,
                  options: [
                    { value: 'Private hire', label: 'Private hire' },
                    { value: 'Birthday', label: 'Birthday' },
                    { value: 'Corporate', label: 'Corporate event' },
                    { value: 'Cigar bar', label: 'Cigar bar reservation' },
                    { value: 'Other', label: 'Other' },
                  ],
                },
                { name: 'preferredDate', label: 'Preferred date', type: 'date' },
                { name: 'partySize', label: 'Expected guests', type: 'number' },
                { name: 'details', label: 'Tell us more', type: 'textarea' },
              ]}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
