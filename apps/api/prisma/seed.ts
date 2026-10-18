/**
 * DEMONSTRATION SEED DATA.
 *
 * Everything created here is illustrative and must be reviewed and replaced by
 * Mountain Dew Group staff before launch. Rates, taxes, policies, contact
 * details, room counts and menus are NOT approved business facts.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { hashPassword } from '../src/lib/passwords.js';

const prisma = new PrismaClient();

const img = (n: number) => `/images/rooms/room-${String(n).padStart(2, '0')}.jpeg`;
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

async function main() {
  const property = await prisma.property.upsert({
    where: { slug: 'mountain-dew' },
    update: {},
    create: {
      slug: 'mountain-dew',
      name: 'Mountain Dew Group',
      legalName: 'Mountain Dew Group Inc. (legal name to be confirmed)',
      tagline: 'Stay comfortably. Experience more.',
      description:
        'A warm boutique guest house and hotel experience with a restaurant serving Liberian dishes, a clothing boutique and an entertainment centre with a cigar bar.',
      addressLine: 'Street address pending confirmation',
      city: 'Monrovia',
      region: 'Montserrado',
      country: 'Liberia',
      phone: '+231 (000) 000-0000',
      email: 'reservations@example.com',
      timeZone: 'Africa/Monrovia',
      currency: 'USD',
      secondaryCurrency: 'LRD',
      checkInTime: '14:00',
      checkOutTime: '11:00',
      arrivalCutoffTime: '22:00',
      minStayNights: 1,
      maxStayNights: 30,
      bookingWindowDays: 540,
      minLeadTimeDays: 0,
      maxRoomsPerReservation: 5,
      holdTtlMinutes: 15,
      isPublished: true,
    },
  });

  await prisma.setting.upsert({
    where: { propertyId_key: { propertyId: property.id, key: 'placeholder_notice' } },
    update: {},
    create: {
      propertyId: property.id,
      key: 'placeholder_notice',
      value: {
        demo: true,
        message: 'Development placeholder content. Location, phone number, rates, taxes, policies and menus require staff approval before launch.',
      },
    },
  });

  await prisma.setting.upsert({
    where: { propertyId_key: { propertyId: property.id, key: 'extras' } },
    update: {},
    create: {
      propertyId: property.id,
      key: 'extras',
      value: [
        { code: 'AIRPORT_PICKUP', label: 'Airport pickup (one way)', priceMinor: 2500, currency: 'USD', perStay: false },
        { code: 'BREAKFAST', label: 'Breakfast per person, per stay day', priceMinor: 800, currency: 'USD', perStay: false },
        { code: 'LATE_CHECKOUT', label: 'Late checkout (subject to availability)', priceMinor: 1500, currency: 'USD', perStay: true },
      ],
    },
  });

  await prisma.setting.upsert({
    where: { propertyId_key: { propertyId: property.id, key: 'restaurant_hours' } },
    update: {},
    create: {
      propertyId: property.id,
      key: 'restaurant_hours',
      value: { demo: true, hours: [{ days: 'Mon-Sun', open: '11:00', close: '22:30' }] },
    },
  });

  await prisma.setting.upsert({
    where: { propertyId_key: { propertyId: property.id, key: 'venue_rules' } },
    update: {},
    create: {
      propertyId: property.id,
      key: 'venue_rules',
      value: {
        demo: true,
        rules: [
          'The cigar bar is an adult-only area. Age requirements must be confirmed with local regulations before launch.',
          'Smoking is only permitted in the designated cigar bar area.',
          'Smart-casual dress is encouraged after 7pm.',
        ],
      },
    },
  });

  // ---- amenities ----
  const amenityDefs = [
    { code: 'wifi', label: 'High-speed Wi-Fi', category: 'connectivity', verified: true },
    { code: 'ac', label: 'Air conditioning', category: 'comfort', verified: true },
    { code: 'hot_water', label: 'Hot water', category: 'comfort', verified: true },
    { code: 'power', label: 'Standby power', category: 'comfort', verified: true },
    { code: 'parking', label: 'Secure parking', category: 'general', verified: true },
    { code: 'tv', label: 'Satellite TV', category: 'entertainment', verified: false },
    { code: 'desk', label: 'Work desk', category: 'general', verified: true },
    { code: 'breakfast', label: 'Breakfast available (extra)', category: 'dining', verified: true },
    { code: 'accessible', label: 'Accessible features available on request', category: 'accessibility', verified: false },
    { code: 'safe', label: 'In-room safe', category: 'security', verified: false },
  ];
  const amenities: Record<string, string> = {};
  for (const [i, def] of amenityDefs.entries()) {
    const a = await prisma.amenity.upsert({
      where: { propertyId_code: { propertyId: property.id, code: def.code } },
      update: { label: def.label, verified: def.verified, sortOrder: i },
      create: { propertyId: property.id, ...def, sortOrder: i },
    });
    amenities[def.code] = a.id;
  }

  // ---- cancellation policy & taxes (taxes INACTIVE until approved) ----
  const cancellation = await prisma.cancellationPolicy.upsert({
    where: { propertyId_code: { propertyId: property.id, code: 'FLEX' } },
    update: {},
    create: {
      propertyId: property.id,
      code: 'FLEX',
      name: 'Flexible (demo)',
      summary: 'Free cancellation up to the day before arrival. No payment is collected online; pay at the property on arrival.',
      freeCancellationUntilDaysBefore: 1,
      noShowPenaltyFirstNight: true,
      isDefault: true,
    },
  });

  const taxDefs = [
    { code: 'VAT', label: 'Value Added Tax (rate to be confirmed)', kind: 'TAX' as const, mode: 'PERCENT' as const, valueBps: 0 },
    { code: 'SERVICE', label: 'Service charge (rate to be confirmed)', kind: 'SERVICE_CHARGE' as const, mode: 'PERCENT' as const, valueBps: 0 },
    { code: 'CITY_LEVY', label: 'City levy (to be confirmed)', kind: 'FEE' as const, mode: 'FLAT' as const, amountMinor: 0 },
  ];
  for (const [i, def] of taxDefs.entries()) {
    await prisma.taxFee.upsert({
      where: { propertyId_code: { propertyId: property.id, code: def.code } },
      update: {},
      create: { propertyId: property.id, ...def, appliesTo: 'ROOM', isActive: false, sortOrder: i },
    });
  }

  await prisma.promotion.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: {
      propertyId: property.id,
      code: 'WELCOME10',
      description: 'Demo promotion: 10% off accommodation',
      kind: 'PERCENT',
      valueBps: 1000,
      isActive: true,
    },
  });

  // ---- room types ----
  const roomTypeDefs = [
    {
      slug: 'garden-twin',
      name: 'Garden Twin',
      short: 'A calm twin room overlooking the garden.',
      bed: 'Two single beds',
      maxOccupancy: 2,
      maxAdults: 2,
      maxChildren: 1,
      size: 22,
      images: range(1, 6),
      base: 8500,
      amenities: ['wifi', 'ac', 'hot_water', 'desk', 'tv'],
    },
    {
      slug: 'classic-double',
      name: 'Classic Double',
      short: 'A comfortable double room for couples or solo travellers.',
      bed: 'One double bed',
      maxOccupancy: 2,
      maxAdults: 2,
      maxChildren: 2,
      size: 26,
      images: range(7, 13),
      base: 11000,
      amenities: ['wifi', 'ac', 'hot_water', 'desk', 'tv', 'safe'],
    },
    {
      slug: 'executive-king',
      name: 'Executive King',
      short: 'A spacious room with a king bed and workspace.',
      bed: 'One king bed',
      maxOccupancy: 3,
      maxAdults: 2,
      maxChildren: 2,
      size: 32,
      images: range(14, 21),
      base: 15000,
      amenities: ['wifi', 'ac', 'hot_water', 'desk', 'tv', 'safe', 'breakfast'],
    },
    {
      slug: 'family-room',
      name: 'Family Room',
      short: 'Room for the whole family with flexible bedding.',
      bed: 'One queen bed and two single beds',
      maxOccupancy: 4,
      maxAdults: 3,
      maxChildren: 3,
      size: 38,
      images: range(22, 29),
      base: 19000,
      amenities: ['wifi', 'ac', 'hot_water', 'tv'],
    },
    {
      slug: 'deluxe-suite',
      name: 'Deluxe Suite',
      short: 'A generous suite with a separate sitting area.',
      bed: 'One king bed',
      maxOccupancy: 3,
      maxAdults: 3,
      maxChildren: 2,
      size: 45,
      images: range(30, 39),
      base: 24000,
      amenities: ['wifi', 'ac', 'hot_water', 'desk', 'tv', 'safe', 'breakfast'],
    },
    {
      slug: 'standard-single',
      name: 'Standard Single',
      short: 'A practical single room for short stays.',
      bed: 'One single bed',
      maxOccupancy: 1,
      maxAdults: 1,
      maxChildren: 0,
      size: 16,
      images: range(40, 47),
      base: 6500,
      amenities: ['wifi', 'ac', 'hot_water', 'desk'],
    },
  ];

  const staffPasswordHash = hashPassword('Password!2026');
  const ownerPasswordHash = hashPassword('OwnerAdmin!2026');

  const staffSeeds = [
    { email: 'owner@mountaindewgroup.test', fullName: 'Demo Owner', role: 'OWNER' as const, hash: ownerPasswordHash },
    { email: 'manager@mountaindewgroup.test', fullName: 'Demo General Manager', role: 'GENERAL_MANAGER' as const, hash: staffPasswordHash },
    { email: 'frontdesk@mountaindewgroup.test', fullName: 'Demo Front Desk', role: 'FRONT_DESK' as const, hash: staffPasswordHash },
    { email: 'finance@mountaindewgroup.test', fullName: 'Demo Finance', role: 'FINANCE' as const, hash: staffPasswordHash },
    { email: 'housekeeping@mountaindewgroup.test', fullName: 'Demo Housekeeping', role: 'HOUSEKEEPING' as const, hash: staffPasswordHash },
    { email: 'restaurant@mountaindewgroup.test', fullName: 'Demo Restaurant', role: 'RESTAURANT' as const, hash: staffPasswordHash },
    { email: 'boutique@mountaindewgroup.test', fullName: 'Demo Boutique', role: 'BOUTIQUE' as const, hash: staffPasswordHash },
    { email: 'entertainment@mountaindewgroup.test', fullName: 'Demo Entertainment', role: 'ENTERTAINMENT' as const, hash: staffPasswordHash },
    { email: 'content@mountaindewgroup.test', fullName: 'Demo Content Editor', role: 'CONTENT_EDITOR' as const, hash: staffPasswordHash },
  ];
  for (const s of staffSeeds) {
    await prisma.user.upsert({
      where: { email: s.email },
      update: { role: s.role, fullName: s.fullName },
      create: { email: s.email, fullName: s.fullName, role: s.role, passwordHash: s.hash, isActive: true },
    });
  }

  const physicalRoomPlan: Record<string, { prefix: string; count: number }> = {
    'garden-twin': { prefix: 'G', count: 4 },
    'classic-double': { prefix: 'D', count: 4 },
    'executive-king': { prefix: 'K', count: 3 },
    'family-room': { prefix: 'F', count: 2 },
    'deluxe-suite': { prefix: 'S', count: 2 },
    'standard-single': { prefix: 'STD', count: 3 },
  };

  for (const [index, def] of roomTypeDefs.entries()) {
    const rt = await prisma.roomType.upsert({
      where: { propertyId_slug: { propertyId: property.id, slug: def.slug } },
      update: {},
      create: {
        propertyId: property.id,
        slug: def.slug,
        name: def.name,
        shortDescription: def.short,
        description:
          `${def.short} The ${def.name} is part of the demonstration catalogue and is furnished to reflect the property's warm, contemporary style. Room sizes and accessibility information are unverified placeholders until confirmed by staff.`,
        bedConfiguration: def.bed,
        maxOccupancy: def.maxOccupancy,
        maxAdults: def.maxAdults,
        maxChildren: def.maxChildren,
        sizeSqm: def.size,
        sizeVerified: false,
        accessibility: ['Step-free access on request (unverified)'],
        accessibilityVerified: false,
        smokingPolicy: 'NON_SMOKING',
        bathroomDetails: 'Private bathroom with shower and hot water.',
        baseCurrency: 'USD',
        sortOrder: index,
        isPublished: true,
      },
    });

    for (const [i, code] of def.amenities.entries()) {
      await prisma.roomTypeAmenity.upsert({
        where: { roomTypeId_amenityId: { roomTypeId: rt.id, amenityId: amenities[code]! } },
        update: {},
        create: { roomTypeId: rt.id, amenityId: amenities[code]! },
      });
    }

    const existingMedia = await prisma.media.count({ where: { roomTypeId: rt.id } });
    if (existingMedia === 0) {
      await prisma.media.createMany({
        data: def.images.map((n, i) => ({
          roomTypeId: rt.id,
          url: img(n),
          alt: `${def.name} at Mountain Dew Group (development photograph ${i + 1})`,
          caption: i === 0 ? `${def.name}` : null,
          ratio: '4 / 3',
          sortOrder: i,
        })),
      });
    }

    await prisma.ratePlan.upsert({
      where: { propertyId_code: { propertyId: property.id, code: `${def.slug.toUpperCase().replace(/-/g, '_')}-FLEX` } },
      update: {},
      create: {
        propertyId: property.id,
        roomTypeId: rt.id,
        code: `${def.slug.toUpperCase().replace(/-/g, '_')}-FLEX`,
        name: 'Flexible rate (demo)',
        description: 'Demonstration rate. Pay at the property on arrival.',
        currency: 'USD',
        baseRateMinor: def.base,
        weekendRateMinor: def.base + 1000,
        cancellationPolicyId: cancellation.id,
        isDefault: true,
        isActive: true,
      },
    });

    const plan = physicalRoomPlan[def.slug]!;
    for (let i = 1; i <= plan.count; i += 1) {
      const number = `${plan.prefix}${i}`;
      await prisma.physicalRoom.upsert({
        where: { propertyId_number: { propertyId: property.id, number } },
        update: {},
        create: { propertyId: property.id, roomTypeId: rt.id, number, floor: String(Math.ceil(i / 2)), readiness: 'CLEAN', active: true },
      });
    }
  }

  // ---- gallery / hero media ----
  const existingGallery = await prisma.media.count({ where: { propertyId: property.id, roomTypeId: null } });
  if (existingGallery === 0) {
    await prisma.media.createMany({
      data: range(48, 54).map((n, i) => ({
        propertyId: property.id,
        url: img(n),
        alt: `Mountain Dew Group property development photograph ${i + 1}`,
        ratio: '16 / 9',
        sortOrder: i,
      })),
    });
  }

  // ---- content blocks ----
  const contentBlocks = [
    { key: 'home.hero', title: 'Stay comfortably. Experience more.', body: 'Discover welcoming rooms, dining, and memorable experiences at Mountain Dew Group.', status: 'PUBLISHED' as const },
    { key: 'home.intro', title: 'A warm welcome in Liberia', body: 'Mountain Dew Group brings together comfortable accommodation, Liberian cooking, a curated boutique and an entertainment centre with a cigar bar.', status: 'PUBLISHED' as const },
    { key: 'home.restaurant', title: 'Liberian dishes, cooked with care', body: 'From cassava leaf and potato greens to jollof rice, our kitchen celebrates the flavours of Liberia. Menu items shown are demonstration content.', status: 'PUBLISHED' as const },
    { key: 'home.boutique', title: 'The Boutique', body: 'A small, considered clothing collection. Browse in person or reserve an item for pickup.', status: 'PUBLISHED' as const },
    { key: 'home.experiences', title: 'Experiences & the cigar bar', body: 'Evenings of music, conversation and a relaxed adult-only cigar bar.', status: 'PUBLISHED' as const },
    { key: 'about.story', title: 'Our story', body: 'Mountain Dew Group is a Liberian hospitality company. This content is a development placeholder and should be replaced with approved company information before launch.', status: 'PUBLISHED' as const },
  ];
  for (const b of contentBlocks) {
    await prisma.contentBlock.upsert({ where: { key: b.key }, update: { title: b.title, body: b.body, status: 'PUBLISHED' }, create: { key: b.key, title: b.title, body: b.body, status: b.status, propertyId: property.id, data: { demo: true } } });
  }

  const faqs = [
    { q: 'Do I need to pay online to book?', a: 'No. You reserve online and pay at the property on arrival. Your reservation is confirmed immediately and no payment is collected online.' },
    { q: 'What are the check-in and check-out times?', a: 'Check-in is from 14:00 and check-out is by 11:00. These times are configurable and pending confirmation.' },
    { q: 'Can I book more than one room?', a: 'Yes. You can book multiple rooms in a single reservation, subject to availability and the property room limit.' },
    { q: 'How do I change or cancel my booking?', a: 'Use the secure management link in your confirmation, or contact the property. Cancellation terms are shown before you confirm.' },
  ];
  const faqCount = await prisma.faq.count({ where: { propertyId: property.id } });
  if (faqCount === 0) {
    await prisma.faq.createMany({ data: faqs.map((f, i) => ({ propertyId: property.id, question: f.q, answer: f.a, category: 'general', status: 'PUBLISHED' as const, sortOrder: i })) });
  }

  // ---- restaurant menu (DEMO) ----
  const menuDefs = [
    {
      slug: 'starters',
      name: 'Starters & Small Plates',
      items: [
        { slug: 'pepper-soup', name: 'Pepper Soup', description: 'Spiced broth with tender meat and herbs.', price: 700 },
        { slug: 'kelewele', name: 'Kelewele Plantain', description: 'Spiced fried plantain.', price: 500 },
      ],
    },
    {
      slug: 'liberian-mains',
      name: 'Liberian Mains',
      items: [
        { slug: 'cassava-leaf', name: 'Cassava Leaf', description: 'Ground cassava leaf cooked with palm oil, served with rice.', price: 1200, allergens: ['fish'] },
        { slug: 'potato-greens', name: 'Potato Greens', description: 'Potato leaves with smoked fish and palm oil, served with rice.', price: 1200, allergens: ['fish'] },
        { slug: 'palm-butter', name: 'Palm Butter', description: 'Rich palm nut stew with meat and rice.', price: 1300 },
        { slug: 'jollof-rice', name: 'Jollof Rice', description: 'Fragrant one-pot rice with peppers, served with chicken.', price: 1100 },
      ],
    },
    {
      slug: 'soups-stews',
      name: 'Soups & Stews',
      items: [
        { slug: 'okra-soup', name: 'Okra Soup', description: 'Okra soup served with fufu.', price: 1150 },
        { slug: 'check-rice', name: 'Check Rice & Gravy', description: 'Seasoned rice with a slow-cooked gravy.', price: 1000 },
      ],
    },
    {
      slug: 'grills-sides',
      name: 'Grills & Sides',
      items: [
        { slug: 'grilled-fish', name: 'Grilled Fish', description: 'Grilled tilapia with pepper sauce and fries.', price: 1600 },
        { slug: 'fried-rice', name: 'Fried Rice', description: 'Vegetable fried rice.', price: 800 },
      ],
    },
  ];
  for (const [ci, cat] of menuDefs.entries()) {
    const category = await prisma.restaurantMenuCategory.upsert({
      where: { propertyId_slug: { propertyId: property.id, slug: cat.slug } },
      update: { name: cat.name, isPublished: true },
      create: { propertyId: property.id, slug: cat.slug, name: cat.name, description: 'Demonstration menu category.', sortOrder: ci, isPublished: true },
    });
    for (const [ii, item] of cat.items.entries()) {
      await prisma.menuItem.upsert({
        where: { slug: item.slug },
        update: {},
        create: {
          categoryId: category.id,
          slug: item.slug,
          name: item.name,
          description: item.description,
          priceMinor: item.price,
          currency: 'USD',
          ingredients: [],
          allergens: item.allergens ?? [],
          dietaryLabels: [],
          isDemo: true,
          isAvailable: true,
          sortOrder: ii,
        },
      });
    }
  }

  // ---- boutique (DEMO) ----
  const collection = await prisma.boutiqueCollection.upsert({
    where: { slug: 'everyday-linen' },
    update: { isPublished: true },
    create: { propertyId: property.id, slug: 'everyday-linen', name: 'Everyday Linen', description: 'Breathable linen pieces for warm days. Demonstration catalogue.', sortOrder: 0, isPublished: true },
  });
  const products = [
    { slug: 'linen-shirt', name: 'Linen Shirt', price: 4500, sizes: ['S', 'M', 'L', 'XL'], colors: ['Ivory', 'Forest'] },
    { slug: 'wrap-dress', name: 'Wrap Dress', price: 6200, sizes: ['XS', 'S', 'M', 'L'], colors: ['Terracotta', 'Charcoal'] },
    { slug: 'tailored-trouser', name: 'Tailored Trouser', price: 5400, sizes: ['30', '32', '34', '36'], colors: ['Charcoal'] },
  ];
  for (const [pi, p] of products.entries()) {
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: { isPublished: true },
      create: { collectionId: collection.id, slug: p.slug, name: p.name, description: `Demonstration product: ${p.name}. Sizes and colours are examples for development.`, priceMinor: p.price, currency: 'USD', careInstructions: 'Cold wash, warm iron.', isDemo: true, isPublished: true },
    });
    for (const [si, size] of p.sizes.entries()) {
      for (const color of p.colors) {
        const sku = `${p.slug}-${size}-${color}`.toUpperCase().replace(/\s+/g, '-');
        await prisma.productVariant.upsert({
          where: { sku },
          update: {},
          create: { productId: product.id, sku, size, color, available: true },
        });
      }
      void si;
    }
    if ((await prisma.media.count({ where: { productId: product.id } })) === 0) {
      await prisma.media.createMany({
        data: range(48 + pi, 49 + pi).map((n, i) => ({ productId: product.id, url: img(n), alt: `${p.name} (demonstration photograph ${i + 1})`, ratio: '3 / 4', sortOrder: i })),
      });
    }
  }

  // ---- experiences (DEMO) ----
  const events = [
    { slug: 'live-highlife-night', title: 'Live Highlife Night', venue: 'Entertainment Centre', age: false, smoking: false, days: 7 },
    { slug: 'cigar-and-jazz', title: 'Cigar & Jazz Evening', venue: 'Cigar Bar (adult-only)', age: true, smoking: true, days: 14 },
  ];
  for (const [ei, e] of events.entries()) {
    await prisma.event.upsert({
      where: { slug: e.slug },
      update: {},
      create: {
        propertyId: property.id,
        slug: e.slug,
        title: e.title,
        description: 'Demonstration event. Details, dates and age requirements require confirmation before launch.',
        startsAt: new Date(Date.now() + e.days * 86_400_000),
        venue: e.venue,
        ageRestricted: e.age,
        minimumAge: e.age ? 18 : null,
        smokingVenue: e.smoking,
        isPublished: true,
        isDemo: true,
      },
    });
    void ei;
  }

  // ---- notification templates ----
  const templates = [
    { code: 'reservation.confirmed', channel: 'EMAIL' as const, subject: 'Your reservation is confirmed', body: 'Thank you {{name}}. Reference {{reference}}. Payment is due at the property on arrival.' },
    { code: 'reservation.cancelled', channel: 'EMAIL' as const, subject: 'Reservation cancelled', body: 'Reservation {{reference}} has been cancelled. No payment was collected online.' },
    { code: 'reservation.modified', channel: 'EMAIL' as const, subject: 'Reservation updated', body: 'Reservation {{reference}} has been updated.' },
    { code: 'stay.reminder', channel: 'EMAIL' as const, subject: 'Your stay is coming up', body: 'We look forward to welcoming you. Reference {{reference}}.' },
  ];
  for (const t of templates) {
    await prisma.notificationTemplate.upsert({ where: { code: t.code }, update: {}, create: t });
  }

  // ---- demo guest account ----
  const guestPasswordHash = hashPassword('GuestUser!2026');
  await prisma.guestAccount.upsert({
    where: { email: 'guest@example.com' },
    update: {},
    create: {
      email: 'guest@example.com',
      passwordHash: guestPasswordHash,
      guestProfile: {
        create: { firstName: 'Demo', lastName: 'Guest', email: 'guest@example.com', phoneCountryCode: '+231', phoneNumber: '770000000', marketingConsent: false },
      },
    },
  });

  console.info('\nDemo seed complete.');
  console.info('Staff sign-in (development credentials - change before any real use):');
  console.info('  owner@mountaindewgroup.test / OwnerAdmin!2026 (OWNER)');
  console.info('  frontdesk@mountaindewgroup.test / Password!2026 (FRONT_DESK)');
  console.info('  finance@mountaindewgroup.test / Password!2026 (FINANCE)');
  console.info('Guest: guest@example.com / GuestUser!2026');
  console.info('All rates, taxes, menus and contact details are DEMONSTRATION placeholders.\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

void Prisma;
