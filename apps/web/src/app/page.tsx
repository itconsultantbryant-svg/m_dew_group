import Link from 'next/link';
import { SearchBar } from '@/components/SearchBar';
import { RoomCard } from '@/components/RoomCard';
import { getHomeContent, getProperty, getRoomTypes } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

const SERVICE_CARDS = [
  {
    href: '/restaurant',
    title: 'Restaurant',
    body: 'Comforting Liberian dishes and international favourites, served indoors or on the terrace.',
    image: '/images/rooms/room-31.jpeg',
  },
  {
    href: '/boutique',
    title: 'Clothing boutique',
    body: 'A curated rail of Liberian and West African labels, available for in-store purchase.',
    image: '/images/rooms/room-12.jpeg',
  },
  {
    href: '/experiences',
    title: 'Entertainment & cigar bar',
    body: 'Live music, private hire and a relaxed cigar bar for evenings on the property.',
    image: '/images/rooms/room-44.jpeg',
  },
];

const HIGHLIGHTS = [
  { label: 'Boutique rooms', detail: 'Comfortable, quiet and well-kept' },
  { label: 'Liberian kitchen', detail: 'Home-style dishes & terrace dining' },
  { label: 'Evenings out', detail: 'Live music and a cigar bar' },
];

export default async function HomePage() {
  const [property, content, roomTypes] = await Promise.all([getProperty(), getHomeContent(), getRoomTypes()]);
  const featured = roomTypes.slice(0, 3);
  const reviews = content?.reviews ?? [];

  return (
    <>
      <section className="relative isolate overflow-hidden bg-forest-950 text-ivory-100">
        <img
          src="/images/rooms/room-01.jpeg"
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-45"
        />
        <div
          className="absolute inset-0 -z-10 bg-gradient-to-br from-forest-950/95 via-forest-900/80 to-forest-950/60"
          aria-hidden
        />
        <div className="container-page relative grid gap-12 py-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="animate-fade-up">
            <p className="eyebrow text-brass-light">
              {property?.city ?? 'Monrovia'}, {property?.country ?? 'Liberia'}
            </p>
            <h1 className="mt-4 max-w-2xl font-display text-4xl font-semibold leading-[1.08] text-ivory-50 sm:text-5xl lg:text-6xl">
              {property?.tagline ?? 'Stay comfortably. Experience more.'}
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ivory-200/90">
              {property?.description ??
                'A warm boutique guest house and hotel with dining, a clothing boutique and an entertainment centre.'}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/rooms" className="btn btn-light px-5 py-3 text-base">
                Explore rooms
              </Link>
              <Link href="/manage" className="btn btn-outline px-5 py-3 text-base">
                Manage a booking
              </Link>
            </div>

            <dl className="mt-12 grid max-w-xl grid-cols-3 gap-6 border-t border-ivory-100/15 pt-6">
              {HIGHLIGHTS.map((item) => (
                <div key={item.label}>
                  <dt className="font-display text-base font-semibold text-ivory-50">{item.label}</dt>
                  <dd className="mt-1 text-xs leading-relaxed text-ivory-200/70">{item.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="animate-fade-up lg:pl-6">
            <SearchBar variant="hero" />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container-page">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Rooms &amp; rates</p>
              <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">Comfortable rooms for every stay</h2>
              <p className="mt-3 max-w-2xl text-charcoal-600">
                Rates below are demonstration placeholders. No payment is collected online — you pay at the property on
                arrival.
              </p>
            </div>
            <Link href="/rooms" className="link-underline text-sm font-semibold text-forest-700">
              View all rooms →
            </Link>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.length > 0 ? (
              featured.map((roomType) => <RoomCard key={roomType.id} roomType={roomType} />)
            ) : (
              <p className="text-charcoal-600">
                Room details are temporarily unavailable. Please try again shortly.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="section bg-ivory-200/60">
        <div className="container-page">
          <p className="eyebrow">Beyond the room</p>
          <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">Dining, shopping and evenings out</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {SERVICE_CARDS.map((card) => (
              <Link key={card.href} href={card.href} className="card card-hover group overflow-hidden">
                <div className="aspect-[16/10] overflow-hidden bg-sand-100">
                  <img
                    src={card.image}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <div className="p-6">
                  <h3 className="font-display text-xl font-semibold text-forest-900">{card.title}</h3>
                  <p className="mt-2 text-sm text-charcoal-600">{card.body}</p>
                  <span className="mt-4 inline-block text-sm font-semibold text-forest-700 group-hover:underline">
                    Discover more →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {reviews.length > 0 ? (
        <section className="section">
          <div className="container-page">
            <h2 className="text-3xl font-semibold sm:text-4xl">What guests say</h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {reviews.slice(0, 3).map((review) => (
                <blockquote key={review.id} className="card flex flex-col p-6">
                  <p className="text-brass-ink" aria-label={`${review.rating} out of 5`}>
                    {'★'.repeat(Math.round(review.rating))}
                    <span className="text-charcoal-300">{'★'.repeat(5 - Math.round(review.rating))}</span>
                  </p>
                  {review.title ? <p className="mt-3 font-semibold text-forest-900">{review.title}</p> : null}
                  <p className="mt-2 flex-1 text-sm text-charcoal-600">{review.body}</p>
                  <footer className="mt-4 border-t border-forest-900/10 pt-3 text-xs text-charcoal-500">
                    — {review.guestName ?? 'Verified guest'}
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {content?.faqs && content.faqs.length > 0 ? (
        <section className="section bg-forest-900 text-ivory-100">
          <div className="container-page grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="eyebrow text-brass-light">Good to know</p>
              <h2 className="mt-3 text-3xl font-semibold text-ivory-50 sm:text-4xl">
                Frequently asked questions
              </h2>
            </div>
            <dl className="space-y-4">
              {content.faqs.slice(0, 6).map((faq) => (
                <div
                  key={faq.id}
                  className="rounded-xl border border-ivory-100/15 bg-ivory-100/[0.04] p-5 transition-colors hover:border-ivory-100/30"
                >
                  <dt className="font-semibold text-ivory-50">{faq.question}</dt>
                  <dd className="mt-2 text-sm text-ivory-200/85">{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ) : null}
    </>
  );
}
