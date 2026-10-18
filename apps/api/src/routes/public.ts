import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ZodTypeAny } from 'zod';
import {
  availabilityQuerySchema,
  boutiqueInquirySchema,
  contactMessageSchema,
  createReservationSchema,
  eventInquirySchema,
  holdRequestSchema,
  manageLookupSchema,
  modifyReservationSchema,
  quoteRequestSchema,
  reviewSchema,
  tableRequestSchema,
  cancelReservationSchema,
  guestRequestSchema,
} from '@mdg/validation';
import { money, type AvailabilityResponseDto, type PublicPropertyDto, type CurrencyCode } from '@mdg/domain';
import { prisma } from '../db/prisma.js';
import { AppError } from '../lib/errors.js';
import { verifyLookupToken, verifyManageToken } from '../lib/tokens.js';
import { searchAvailability } from '../inventory/availability.js';
import { buildQuote } from '../inventory/pricing.js';
import { cancelReservation, confirmReservation, createHold, getReservationByReference, lookupReservation, modifyReservation } from '../services/booking.js';
import { reservationInclude, toReservationDto, quoteFromSnapshot } from '../services/reservationMapper.js';

function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', result.error.flatten());
  }
  return result.data;
}

async function resolveProperty(preferredSlug?: string) {
  const property = preferredSlug
    ? await prisma.property.findUnique({ where: { slug: preferredSlug } })
    : await prisma.property.findFirst({ where: { isPublished: true }, orderBy: { createdAt: 'asc' } });
  if (!property) throw AppError.notFound('Property not found.');
  return property;
}

function toPublicProperty(property: Awaited<ReturnType<typeof resolveProperty>>, amenities: { id: string; code: string; label: string; category: string; icon: string | null }[]): PublicPropertyDto {
  return {
    id: property.id,
    name: property.name,
    tagline: property.tagline,
    description: property.description,
    addressLine: property.addressLine,
    city: property.city,
    region: property.region,
    country: property.country,
    phone: property.phone,
    email: property.email,
    latitude: property.latitude ? Number(property.latitude) : null,
    longitude: property.longitude ? Number(property.longitude) : null,
    timeZone: property.timeZone,
    checkInTime: property.checkInTime,
    checkOutTime: property.checkOutTime,
    currency: property.currency as CurrencyCode,
    amenities: amenities.map((a) => ({ id: a.id, code: a.code, label: a.label, category: a.category, icon: a.icon })),
  };
}

async function verifyManageAccess(reference: string, token: string | undefined) {
  if (!token) throw AppError.unauthorized('A valid management link is required.');
  const reservation = await getReservationByReference(prisma, reference);
  let reservationId: string | null = null;
  try {
    reservationId = (await verifyManageToken(token)).reservationId;
  } catch {
    try {
      reservationId = (await verifyLookupToken(token)).reservationId;
    } catch {
      reservationId = null;
    }
  }
  if (reservationId !== reservation.id) throw AppError.forbidden('This link is not valid for that reservation.');
  return reservation;
}

export async function registerPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get('/properties/:slug', { schema: { tags: ['public'], summary: 'Get public property details' } }, async (request) => {
    const { slug } = request.params as { slug: string };
    const property = await resolveProperty(slug === 'default' ? undefined : slug);
    const amenities = await prisma.amenity.findMany({ where: { propertyId: property.id, verified: true }, orderBy: { sortOrder: 'asc' } });
    return toPublicProperty(property, amenities);
  });

  app.get('/room-types', { schema: { tags: ['public'], summary: 'List published room types' } }, async () => {
    const property = await resolveProperty();
    const roomTypes = await prisma.roomType.findMany({
      where: { propertyId: property.id, isPublished: true },
      include: { amenities: { include: { amenity: true } }, media: true, ratePlans: { where: { isActive: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    return {
      roomTypes: roomTypes.map((rt) => {
        const fromMinor = rt.ratePlans.length ? Math.min(...rt.ratePlans.map((r) => r.baseRateMinor)) : 0;
        return {
          id: rt.id,
          slug: rt.slug,
          name: rt.name,
          shortDescription: rt.shortDescription,
          description: rt.description,
          bedConfiguration: rt.bedConfiguration,
          maxOccupancy: rt.maxOccupancy,
          maxAdults: rt.maxAdults,
          maxChildren: rt.maxChildren,
          sizeSqm: rt.sizeSqm,
          sizeVerified: rt.sizeVerified,
          accessibility: rt.accessibilityVerified ? rt.accessibility : [],
          smokingPolicy: rt.smokingPolicy,
          amenities: rt.amenities.map((a) => ({ id: a.amenity.id, code: a.amenity.code, label: a.amenity.label, category: a.amenity.category, icon: a.amenity.icon })),
          media: rt.media.map((m) => ({ id: m.id, url: m.url, alt: m.alt, caption: m.caption, width: m.width, height: m.height, ratio: m.ratio })),
          images: rt.media.length ? rt.media.map((m) => m.url) : ['/images/room-placeholder.svg'],
          baseCurrency: rt.baseCurrency,
          fromPrice: money(fromMinor, rt.baseCurrency as CurrencyCode),
          checkInTime: property.checkInTime,
          checkOutTime: property.checkOutTime,
          cancellationSummary: 'Free cancellation up to the day before arrival, subject to the property policy.',
          payAtProperty: true,
        };
      }),
    };
  });

  app.get('/room-types/:slug', { schema: { tags: ['public'], summary: 'Get a room type with optional date-specific availability' } }, async (request) => {
    const { slug } = request.params as { slug: string };
    const query = request.query as { checkIn?: string; checkOut?: string };
    const property = await resolveProperty();
    const rt = await prisma.roomType.findFirst({
      where: { propertyId: property.id, slug },
      include: { amenities: { include: { amenity: true } }, media: true, ratePlans: { where: { isActive: true } }, rooms: { where: { active: true } } },
    });
    if (!rt) throw AppError.notFound('Room type not found.');
    const fromMinor = rt.ratePlans.length ? Math.min(...rt.ratePlans.map((r) => r.baseRateMinor)) : 0;
    const roomType = {
      id: rt.id,
      slug: rt.slug,
      name: rt.name,
      shortDescription: rt.shortDescription,
      description: rt.description,
      bedConfiguration: rt.bedConfiguration,
      maxOccupancy: rt.maxOccupancy,
      maxAdults: rt.maxAdults,
      maxChildren: rt.maxChildren,
      sizeSqm: rt.sizeSqm,
      sizeVerified: rt.sizeVerified,
      bathroomDetails: rt.bathroomDetails,
      accessibility: rt.accessibilityVerified ? rt.accessibility : [],
      smokingPolicy: rt.smokingPolicy,
      amenities: rt.amenities.map((a) => ({ id: a.amenity.id, code: a.amenity.code, label: a.amenity.label, category: a.amenity.category, icon: a.amenity.icon })),
      media: rt.media.map((m) => ({ id: m.id, url: m.url, alt: m.alt, caption: m.caption, width: m.width, height: m.height, ratio: m.ratio })),
      images: rt.media.length ? rt.media.map((m) => m.url) : ['/images/room-placeholder.svg'],
      baseCurrency: rt.baseCurrency,
      fromPrice: money(fromMinor, rt.baseCurrency as CurrencyCode),
      checkInTime: property.checkInTime,
      checkOutTime: property.checkOutTime,
      cancellationSummary: 'Free cancellation up to the day before arrival, subject to the property cancellation policy.',
      payAtProperty: true,
    };
    let availability: AvailabilityResponseDto['results'][number] | undefined;
    if (query.checkIn && query.checkOut) {
      const result = await searchAvailability(prisma, {
        propertySlug: property.slug,
        checkIn: query.checkIn,
        checkOut: query.checkOut,
        rooms: 1,
        adults: 2,
        children: 0,
      });
      availability = result.results.find((r) => r.roomType.id === rt.id);
    }
    return { roomType, availability };
  });

  app.get('/availability', { schema: { tags: ['booking'], summary: 'Search room availability for a date range' } }, async (request) => {
    const query = parse(availabilityQuerySchema, request.query);
    const property = await resolveProperty();
    return searchAvailability(prisma, {
      propertySlug: property.slug,
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      rooms: query.rooms,
      adults: query.adults,
      children: query.children,
      childAges: query.childAges,
      currency: query.currency,
    });
  });

  app.post('/quotes', { schema: { tags: ['booking'], summary: 'Price a stay without holding inventory' } }, async (request) => {
    const body = parse(quoteRequestSchema, request.body);
    const property = await resolveProperty();
    const built = await buildQuote(prisma, {
      propertyId: property.id,
      checkIn: body.checkIn,
      checkOut: body.checkOut,
      rooms: body.rooms,
      promotionCode: body.promotionCode,
      currency: body.currency,
    });
    return built.quote;
  });

  app.post(
    '/holds',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
      schema: { tags: ['booking'], summary: 'Create an expiring hold that reserves inventory without payment' },
    },
    async (request) => {
      const body = parse(holdRequestSchema, request.body);
      const property = await resolveProperty();
      return createHold(prisma, {
        propertySlug: property.slug,
        checkIn: body.checkIn,
        checkOut: body.checkOut,
        rooms: body.rooms,
        quoteFingerprint: body.quoteFingerprint,
        promotionCode: body.promotionCode,
      });
    },
  );

  app.post(
    '/reservations',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
      schema: { tags: ['booking'], summary: 'Confirm a held reservation (idempotent). No online payment is collected.' },
    },
    async (request, reply) => {
      const body = parse(createReservationSchema, request.body);
      const result = await confirmReservation(prisma, body);
      reply.header('Location', `/reservations/${result.reservation.reference}`);
      return result;
    },
  );

  app.post('/reservations/lookup', { schema: { tags: ['booking'], summary: 'Find a reservation using reference and surname' } }, async (request) => {
    const body = parse(manageLookupSchema, request.body);
    return lookupReservation(prisma, body);
  });

  app.get('/reservations/:reference', { schema: { tags: ['booking'], summary: 'Retrieve a reservation via a signed link' } }, async (request) => {
    const { reference } = request.params as { reference: string };
    const { token } = request.query as { token?: string };
    const reservation = await verifyManageAccess(reference, token);
    return toReservationDto(reservation, quoteFromSnapshot(reservation.rateSnapshot));
  });

  app.post('/reservations/:reference/cancel', { schema: { tags: ['booking'], summary: 'Cancel a reservation (idempotent)' } }, async (request) => {
    const { reference } = request.params as { reference: string };
    const body = parse(cancelReservationSchema.extend({ token: z.string().min(10) }) as unknown as ZodTypeAny, request.body);
    const reservation = await verifyManageAccess(reference, (body as { token: string }).token);
    return cancelReservation(prisma, reservation.id, { reference, reason: (body as { reason?: string }).reason, actorRole: 'GUEST' });
  });

  app.post('/reservations/:reference/modify', { schema: { tags: ['booking'], summary: 'Request or apply a change to dates or rooms' } }, async (request) => {
    const { reference } = request.params as { reference: string };
    const body = parse(modifyReservationSchema.extend({ token: z.string().min(10) }) as unknown as ZodTypeAny, request.body) as unknown as {
      token: string;
      checkIn?: string;
      checkOut?: string;
      rooms?: { roomTypeId: string; ratePlanId?: string; quantity: number; adults: number; children: number; childAges?: number[] }[];
      acceptedFingerprint?: string;
      reason?: string;
    };
    const reservation = await verifyManageAccess(reference, body.token);
    const result = await modifyReservation(prisma, reservation.id, {
      changes: { checkIn: body.checkIn, checkOut: body.checkOut, rooms: body.rooms },
      acceptedFingerprint: body.acceptedFingerprint,
      reason: body.reason,
      actorRole: 'GUEST',
    });
    return result;
  });

  app.post('/reservations/:reference/requests', { schema: { tags: ['booking'], summary: 'Submit a guest request (arrival, extra bed, etc.)' } }, async (request) => {
    const { reference } = request.params as { reference: string };
    const body = parse(guestRequestSchema.extend({ token: z.string().min(10) }) as unknown as ZodTypeAny, request.body) as unknown as { token: string; type: string; details: string };
    const reservation = await verifyManageAccess(reference, body.token);
    const created = await prisma.guestRequest.create({
      data: { reservationId: reservation.id, type: body.type, details: body.details, status: 'PENDING' },
    });
    return { requestId: created.id, status: created.status };
  });

  app.get('/reviews', { schema: { tags: ['public'], summary: 'List published guest reviews' } }, async () => {
    const property = await resolveProperty();
    const reviews = await prisma.review.findMany({
      where: { propertyId: property.id, status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      take: 24,
    });
    const count = reviews.length;
    const average = count ? reviews.reduce((acc, r) => acc + r.rating, 0) / count : 0;
    return { reviews, summary: { count, average: Math.round(average * 10) / 10 } };
  });

  app.post('/reviews', { schema: { tags: ['public'], summary: 'Submit a review for a completed stay' } }, async (request) => {
    const body = parse(reviewSchema, request.body);
    const reservation = await prisma.reservation.findUnique({ where: { reference: body.reference.toUpperCase() }, include: { property: true } });
    const surnameMatches = reservation?.leadGuestName.toLowerCase().split(/\s+/).includes(body.lastName.toLowerCase());
    if (!reservation || !surnameMatches) throw AppError.notFound('We could not match that reference and surname.');
    if (reservation.status !== 'CHECKED_OUT') throw AppError.unprocessable('REVIEW_NOT_ALLOWED', 'Reviews can be submitted after check-out.');
    const review = await prisma.review.create({
      data: {
        propertyId: reservation.propertyId,
        reservationId: reservation.id,
        guestName: `${body.lastName.charAt(0).toUpperCase()}.`,
        rating: body.rating,
        title: body.title || null,
        body: body.body,
        status: 'PENDING',
      },
    });
    return { id: review.id, status: review.status };
  });

  app.get('/content/home', { schema: { tags: ['public'], summary: 'Homepage content composition' } }, async () => {
    const property = await resolveProperty();
    const [blocks, faqs, gallery, reviews] = await Promise.all([
      prisma.contentBlock.findMany({ where: { status: 'PUBLISHED', OR: [{ propertyId: property.id }, { propertyId: null }] } }),
      prisma.faq.findMany({ where: { status: 'PUBLISHED', OR: [{ propertyId: property.id }, { propertyId: null }] }, orderBy: { sortOrder: 'asc' } }),
      prisma.media.findMany({ where: { propertyId: property.id, roomTypeId: null }, orderBy: { sortOrder: 'asc' } }),
      prisma.review.findMany({ where: { propertyId: property.id, status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 6 }),
    ]);
    return {
      blocks: blocks.map((b) => ({ key: b.key, title: b.title, body: b.body, data: b.data })),
      faqs,
      gallery: gallery.map((m) => ({ id: m.id, url: m.url, alt: m.alt, caption: m.caption })),
      reviews,
    };
  });

  app.get('/restaurant/menu', { schema: { tags: ['services'], summary: 'Published restaurant menu (demonstration content until approved)' } }, async () => {
    const property = await resolveProperty();
    const categories = await prisma.restaurantMenuCategory.findMany({
      where: { propertyId: property.id, isPublished: true },
      include: { items: { where: { isAvailable: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
    return {
      demoContent: true,
      hours: (await prisma.setting.findFirst({ where: { propertyId: property.id, key: 'restaurant_hours' } }))?.value ?? null,
      categories,
    };
  });

  app.get('/boutique/catalog', { schema: { tags: ['services'], summary: 'Published boutique catalog' } }, async () => {
    const property = await resolveProperty();
    const collections = await prisma.boutiqueCollection.findMany({
      where: { propertyId: property.id, isPublished: true },
      include: { products: { where: { isPublished: true }, include: { variants: true, media: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    return { collections };
  });

  app.get('/experiences/events', { schema: { tags: ['services'], summary: 'Upcoming published events' } }, async () => {
    const property = await resolveProperty();
    const events = await prisma.event.findMany({
      where: { propertyId: property.id, isPublished: true },
      include: { media: true },
      orderBy: { startsAt: 'asc' },
      take: 30,
    });
    const venueRules = (await prisma.setting.findFirst({ where: { propertyId: property.id, key: 'venue_rules' } }))?.value ?? null;
    return { events, venueRules };
  });

  app.get('/faqs', { schema: { tags: ['public'], summary: 'Published frequently asked questions' } }, async () => {
    const property = await resolveProperty();
    return {
      faqs: await prisma.faq.findMany({
        where: { status: 'PUBLISHED', OR: [{ propertyId: property.id }, { propertyId: null }] },
        orderBy: { sortOrder: 'asc' },
      }),
    };
  });

  async function createInquiry<T extends ZodTypeAny>(schema: T, request: FastifyRequest, handler: (data: z.infer<T>) => Promise<{ id: string; status?: string }>) {
    const body = parse(schema, request.body);
    return handler(body);
  }

  app.post('/restaurant/table-requests', { schema: { tags: ['services'], summary: 'Request a table (pending until staff confirm)' } }, async (request) => {
    return createInquiry(tableRequestSchema, request, async (body) => {
      const property = await resolveProperty();
      const created = await prisma.tableRequest.create({
        data: {
          propertyId: property.id,
          name: body.name,
          phoneCountryCode: body.phoneCountryCode,
          phoneNumber: body.phoneNumber,
          email: body.email || null,
          date: new Date(`${body.date}T00:00:00.000Z`),
          time: body.time,
          partySize: body.partySize,
          notes: body.notes || null,
          status: 'NEW',
        },
      });
      return { id: created.id, status: 'PENDING' };
    });
  });

  app.post('/boutique/inquiries', { schema: { tags: ['services'], summary: 'Ask about or reserve a boutique item for pickup' } }, async (request) => {
    return createInquiry(boutiqueInquirySchema, request, async (body) => {
      const created = await prisma.boutiqueInquiry.create({
        data: {
          name: body.name,
          email: body.email,
          phoneCountryCode: body.phoneCountryCode || null,
          phoneNumber: body.phoneNumber || null,
          productId: body.productId ?? null,
          variantId: body.variantId ?? null,
          kind: body.kind,
          message: body.message || null,
          status: 'NEW',
        },
      });
      return { id: created.id, status: 'NEW' };
    });
  });

  app.post('/experiences/event-inquiries', { schema: { tags: ['services'], summary: 'Inquire about an event or private hire' } }, async (request) => {
    return createInquiry(eventInquirySchema, request, async (body) => {
      const created = await prisma.eventInquiry.create({
        data: {
          name: body.name,
          email: body.email,
          phoneCountryCode: body.phoneCountryCode,
          phoneNumber: body.phoneNumber,
          eventType: body.eventType,
          preferredDate: body.preferredDate ? new Date(`${body.preferredDate}T00:00:00.000Z`) : null,
          partySize: body.partySize ?? null,
          details: body.details || null,
          status: 'NEW',
        },
      });
      return { id: created.id, status: 'NEW' };
    });
  });

  app.post('/contact', { schema: { tags: ['public'], summary: 'Send a contact message' } }, async (request) => {
    return createInquiry(contactMessageSchema, request, async (body) => {
      const created = await prisma.contactMessage.create({
        data: { name: body.name, email: body.email, phoneNumber: body.phoneNumber || null, subject: body.subject, message: body.message },
      });
      return { id: created.id };
    });
  });

  app.post('/newsletter', { schema: { tags: ['public'], summary: 'Subscribe to marketing updates' } }, async (request) => {
    const body = parse(contactMessageSchema.pick({ email: true }), request.body);
    await prisma.newsletterSubscriber.upsert({
      where: { email: body.email },
      update: { unsubscribedAt: null },
      create: { email: body.email },
    });
    return { ok: true };
  });
}
