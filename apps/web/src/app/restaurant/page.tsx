import type { Metadata } from 'next';
import { formatMoney } from '@mdg/domain';
import type { CurrencyCode } from '@mdg/domain';
import { InquiryForm } from '@/components/InquiryForm';
import { getMenu } from '@/lib/server-api';
import { todayISO } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Restaurant',
  description: 'Liberian dishes and international favourites at Mountain Dew Group, Monrovia.',
};

export default async function RestaurantPage() {
  const menu = await getMenu();

  return (
    <div className="container-page py-12">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wider text-brass-ink">Dining</p>
        <h1 className="mt-2 text-4xl font-semibold">Restaurant</h1>
        <p className="mt-3 text-charcoal-600">
          Comforting Liberian dishes and international favourites, served indoors or on the terrace. The menu below is
          demonstration content pending approval.
        </p>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-8">
          {menu && menu.categories.length > 0 ? (
            menu.categories.map((category) => (
              <section key={category.id}>
                <h2 className="text-2xl font-semibold">{category.name}</h2>
                {category.description ? <p className="mt-1 text-sm text-charcoal-600">{category.description}</p> : null}
                <ul className="mt-4 divide-y divide-forest-900/10">
                  {category.items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-4 py-3">
                      <div>
                        <p className="font-medium text-charcoal-800">{item.name}</p>
                        {item.description ? <p className="text-sm text-charcoal-600">{item.description}</p> : null}
                      </div>
                      <span className="whitespace-nowrap font-medium text-forest-900">
                        {formatMoney({ amountMinor: item.priceMinor, currency: item.currency as CurrencyCode })}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <p className="text-charcoal-600">The menu is temporarily unavailable. Please check back shortly.</p>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="text-2xl font-semibold">Request a table</h2>
          <p className="mt-1 text-sm text-charcoal-600">
            Tell us your preferred date and time. Our team reviews requests and confirms by phone or email.
          </p>
          <div className="mt-4">
            <InquiryForm
              endpoint="/restaurant/table-requests"
              submitLabel="Request table"
              successMessage="Your table request has been received. Our team will confirm with you shortly."
              fields={[
                { name: 'name', label: 'Full name', required: true },
                { name: 'email', label: 'Email', type: 'email' },
                { name: 'phoneCountryCode', label: 'Country code', required: true, placeholder: '+231' },
                { name: 'phoneNumber', label: 'Phone number', type: 'tel', required: true },
                { name: 'date', label: 'Preferred date', type: 'date', required: true },
                { name: 'time', label: 'Preferred time', type: 'time', required: true },
                { name: 'partySize', label: 'Party size', type: 'number', required: true },
                { name: 'notes', label: 'Notes', type: 'textarea' },
              ]}
            />
            <p className="mt-2 text-xs text-charcoal-500">Earliest available date: {todayISO()}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
