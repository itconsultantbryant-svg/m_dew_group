import type { Metadata } from 'next';
import { formatMoney, type CurrencyCode } from '@mdg/domain';
import { InquiryForm } from '@/components/InquiryForm';
import { getBoutique } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Boutique',
  description: 'A curated rail of Liberian and West African labels at Mountain Dew Group.',
};

export default async function BoutiquePage() {
  const catalog = await getBoutique();
  const collections = catalog?.collections ?? [];

  return (
    <div className="container-page py-12">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wider text-brass-ink">Shopping</p>
        <h1 className="mt-2 text-4xl font-semibold">Clothing boutique</h1>
        <p className="mt-3 text-charcoal-600">
          A curated rail of Liberian and West African labels. Browse the demonstration catalogue and enquire about an
          item or reserve it for pickup.
        </p>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-10">
          {collections.length > 0 ? (
            collections.map((collection) => (
              <section key={collection.id}>
                <h2 className="text-2xl font-semibold">{collection.name}</h2>
                {collection.description ? <p className="mt-1 text-sm text-charcoal-600">{collection.description}</p> : null}
                <div className="mt-5 grid gap-6 sm:grid-cols-2">
                  {collection.products.map((product) => (
                    <article key={product.id} className="card overflow-hidden">
                      <div className="aspect-[4/3] bg-sand-100">
                        {product.media[0] ? (
                          <img src={product.media[0].url} alt={product.media[0].alt} className="h-full w-full object-cover" loading="lazy" />
                        ) : null}
                      </div>
                      <div className="p-5">
                        <h3 className="font-display text-lg font-semibold text-forest-900">{product.name}</h3>
                        {product.description ? <p className="mt-1 text-sm text-charcoal-600">{product.description}</p> : null}
                        <p className="mt-3 font-medium text-forest-900">
                          {formatMoney({ amountMinor: product.priceMinor, currency: product.currency as CurrencyCode })}
                        </p>
                        {product.variants.length > 0 ? (
                          <p className="mt-1 text-xs text-charcoal-500">
                            {product.variants.map((v) => v.name).join(' · ')}
                          </p>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))
          ) : (
            <p className="text-charcoal-600">The catalogue is temporarily unavailable. Please check back shortly.</p>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="text-2xl font-semibold">Enquire or reserve</h2>
          <p className="mt-1 text-sm text-charcoal-600">
            Tell us which item interests you. We will confirm availability and pickup details.
          </p>
          <div className="mt-4">
            <InquiryForm
              endpoint="/boutique/inquiries"
              submitLabel="Send enquiry"
              successMessage="Your boutique enquiry has been received. Our team will be in touch."
              kind="INQUIRY"
              fields={[
                { name: 'name', label: 'Full name', required: true },
                { name: 'email', label: 'Email', type: 'email', required: true },
                { name: 'phoneCountryCode', label: 'Country code', placeholder: '+231' },
                { name: 'phoneNumber', label: 'Phone number', type: 'tel' },
                { name: 'message', label: 'What are you looking for?', type: 'textarea' },
              ]}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
