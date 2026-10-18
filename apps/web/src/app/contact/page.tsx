import type { Metadata } from 'next';
import { InquiryForm } from '@/components/InquiryForm';
import { getProperty } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Contact Mountain Dew Group in Monrovia, Liberia.',
};

export default async function ContactPage() {
  const property = await getProperty();

  return (
    <div className="container-page py-12">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wider text-brass-ink">Get in touch</p>
        <h1 className="mt-2 text-4xl font-semibold">Contact us</h1>
        <p className="mt-3 text-charcoal-600">
          Questions about your stay, dining, the boutique or an event? Send us a message and we will respond.
        </p>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="text-2xl font-semibold">Send a message</h2>
          <div className="mt-4">
            <InquiryForm
              endpoint="/contact"
              submitLabel="Send message"
              successMessage="Thank you for your message. Our team will respond shortly."
              fields={[
                { name: 'name', label: 'Full name', required: true },
                { name: 'email', label: 'Email', type: 'email', required: true },
                { name: 'phoneNumber', label: 'Phone number', type: 'tel' },
                { name: 'subject', label: 'Subject', required: true },
                { name: 'message', label: 'Message', type: 'textarea', required: true },
              ]}
            />
          </div>
        </div>

        <aside className="card h-fit p-6">
          <h2 className="text-lg font-semibold">Property details</h2>
          {property ? (
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-charcoal-500">Address</dt>
                <dd className="mt-1 text-charcoal-800">
                  {property.addressLine}
                  <br />
                  {property.city}, {property.region}
                  <br />
                  {property.country}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-charcoal-500">Email</dt>
                <dd className="mt-1"><a className="text-forest-700 hover:underline" href={`mailto:${property.email}`}>{property.email}</a></dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-charcoal-500">Phone</dt>
                <dd className="mt-1 text-charcoal-800">{property.phone}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-charcoal-500">Check-in / check-out</dt>
                <dd className="mt-1 text-charcoal-800">{property.checkInTime} / {property.checkOutTime}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-charcoal-600">Contact details are temporarily unavailable.</p>
          )}
          <p className="mt-5 text-xs text-charcoal-500">
            Address and contact details shown are placeholders pending confirmation. Please verify before relying on them.
          </p>
        </aside>
      </div>
    </div>
  );
}
