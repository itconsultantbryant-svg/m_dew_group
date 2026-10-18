import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db/prisma.js';
import { buildQuote, type QuoteRoomInput } from '../../src/inventory/pricing.js';
import { getNightAvailability } from '../../src/inventory/inventory.js';
import { confirmReservation, createHold } from '../../src/services/booking.js';
import { assignRoom } from '../../src/services/frontdesk.js';
import { releaseExpiredHolds } from '../../src/services/holds.js';

const PROPERTY_SLUG = 'mountain-dew';

interface Ctx {
  propertyId: string;
  roomTypeId: string;
  capacity: number;
}

async function setupRoomType(slug: string): Promise<Ctx> {
  const property = await prisma.property.findUniqueOrThrow({ where: { slug: PROPERTY_SLUG } });
  const roomType = await prisma.roomType.findUniqueOrThrow({ where: { propertyId_slug: { propertyId: property.id, slug } } });
  const capacity = await prisma.physicalRoom.count({ where: { roomTypeId: roomType.id, active: true } });
  return { propertyId: property.id, roomTypeId: roomType.id, capacity };
}

async function fingerprintFor(ctx: Ctx, checkIn: string, checkOut: string, rooms: QuoteRoomInput[]): Promise<string> {
  const built = await prisma.$transaction((tx) =>
    buildQuote(tx, { propertyId: ctx.propertyId, checkIn, checkOut, rooms }),
  );
  return built.quote.fingerprint;
}

function makeHold(ctx: Ctx, checkIn: string, checkOut: string, rooms: QuoteRoomInput[], quoteFingerprint: string) {
  return createHold(prisma, { propertySlug: PROPERTY_SLUG, checkIn, checkOut, rooms, quoteFingerprint });
}

const guest = {
  firstName: 'Test',
  lastName: 'Guest',
  email: 'test.guest@example.com',
  phoneCountryCode: '+231',
  phoneNumber: '770000000',
  communicationPreference: 'EMAIL' as const,
  marketingConsent: false,
  acceptTerms: true as const,
  acceptPrivacy: true as const,
};

afterAll(async () => {
  await prisma.$disconnect();
});

describe('inventory integrity under concurrency', () => {
  it('never oversells a room type when holds are created concurrently', async () => {
    const ctx = await setupRoomType('family-room');
    expect(ctx.capacity).toBeGreaterThan(0);
    const checkIn = '2027-06-01';
    const checkOut = '2027-06-03';
    const rooms: QuoteRoomInput[] = [{ roomTypeId: ctx.roomTypeId, quantity: 1, adults: 2, children: 0 }];
    const fingerprint = await fingerprintFor(ctx, checkIn, checkOut, rooms);

    const attempts = Array.from({ length: ctx.capacity + 5 }, () =>
      makeHold(ctx, checkIn, checkOut, rooms, fingerprint).then(
        () => ({ ok: true as const, code: undefined }),
        (err: { code?: string }) => ({ ok: false as const, code: err.code }),
      ),
    );
    const results = await Promise.all(attempts);

    const succeeded = results.filter((r) => r.ok).length;
    const rejected = results.filter((r) => !r.ok);
    expect(succeeded).toBe(ctx.capacity);
    expect(rejected.length).toBe(5);
    expect(rejected.every((r) => r.code === 'INSUFFICIENT_INVENTORY')).toBe(true);

    const nights = await getNightAvailability(prisma, [ctx.roomTypeId], ["2027-06-01", "2027-06-02"]);
    expect(nights).toHaveLength(2);
    for (const night of nights) {
      expect(night.sold).toBe(ctx.capacity);
      expect(night.available).toBe(0);
    }
  });
});

describe('reservation idempotency', () => {
  it('confirms a hold exactly once and preserves inventory', async () => {
    const ctx = await setupRoomType('garden-twin');
    const checkIn = '2027-07-01';
    const checkOut = '2027-07-03';
    const rooms: QuoteRoomInput[] = [{ roomTypeId: ctx.roomTypeId, quantity: 1, adults: 2, children: 0 }];
    const fingerprint = await fingerprintFor(ctx, checkIn, checkOut, rooms);
    const hold = await makeHold(ctx, checkIn, checkOut, rooms, fingerprint);

    const before = await getNightAvailability(prisma, [ctx.roomTypeId], ['2027-07-01']);
    const first = await confirmReservation(prisma, { holdId: hold.holdId, quoteFingerprint: fingerprint, leadGuest: guest, idempotencyKey: "test-idem-0001" });
    const second = await confirmReservation(prisma, { holdId: hold.holdId, quoteFingerprint: fingerprint, leadGuest: guest, idempotencyKey: "test-idem-0001" });

    expect(first.reservation.status).toBe('CONFIRMED');
    expect(second.reservation.reference).toBe(first.reservation.reference);

    const count = await prisma.reservation.count({ where: { hold: { id: hold.holdId } } });
    expect(count).toBe(1);

    const after = await getNightAvailability(prisma, [ctx.roomTypeId], ['2027-07-01']);
    expect(before[0]!.sold).toBe(1);
    expect(after[0]!.sold).toBe(1);
  });
});

describe('hold expiry', () => {
  it('releases inventory exactly once when a hold expires', async () => {
    const ctx = await setupRoomType('standard-single');
    const checkIn = '2027-08-01';
    const checkOut = '2027-08-03';
    const rooms: QuoteRoomInput[] = [{ roomTypeId: ctx.roomTypeId, quantity: 1, adults: 1, children: 0 }];
    const fingerprint = await fingerprintFor(ctx, checkIn, checkOut, rooms);
    const hold = await makeHold(ctx, checkIn, checkOut, rooms, fingerprint);

    const held = await getNightAvailability(prisma, [ctx.roomTypeId], ['2027-08-01']);
    expect(held[0]!.sold).toBe(1);

    await prisma.hold.update({ where: { id: hold.holdId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const releasedFirst = await releaseExpiredHolds(prisma);
    expect(releasedFirst).toBe(1);
    const releasedSecond = await releaseExpiredHolds(prisma);
    expect(releasedSecond).toBe(0);

    const expired = await prisma.reservation.findUniqueOrThrow({ where: { id: hold.reservationId } });
    expect(expired.status).toBe('EXPIRED');

    const restored = await getNightAvailability(prisma, [ctx.roomTypeId], ['2027-08-01']);
    expect(restored[0]!.sold).toBe(0);
  });
});

describe('physical room assignment', () => {
  it('rejects overlapping assignments of the same room', async () => {
    const ctx = await setupRoomType('classic-double');
    const checkIn = '2027-09-01';
    const checkOut = '2027-09-03';
    const rooms: QuoteRoomInput[] = [{ roomTypeId: ctx.roomTypeId, quantity: 1, adults: 2, children: 0 }];
    const fingerprint = await fingerprintFor(ctx, checkIn, checkOut, rooms);

    const holdA = await makeHold(ctx, checkIn, checkOut, rooms, fingerprint);
    const holdB = await makeHold(ctx, checkIn, checkOut, rooms, fingerprint);
    const resA = await confirmReservation(prisma, { holdId: holdA.holdId, quoteFingerprint: fingerprint, leadGuest: guest, idempotencyKey: "test-idem-0002" });
    const resB = await confirmReservation(prisma, { holdId: holdB.holdId, quoteFingerprint: fingerprint, leadGuest: { ...guest, email: "other@example.com" }, idempotencyKey: "test-idem-0003" });

    const physical = await prisma.physicalRoom.findFirstOrThrow({ where: { roomTypeId: ctx.roomTypeId, active: true } });
    const actorId = (await prisma.user.findFirstOrThrow({ where: { role: 'OWNER' } })).id;
    const roomItemA = resA.reservation.rooms[0]!.id;
    const roomItemB = resB.reservation.rooms[0]!.id;

    await assignRoom(prisma, resA.reservation.id, { reservationRoomId: roomItemA, roomId: physical.id, actorId, actorRole: 'OWNER' });
    await expect(
      assignRoom(prisma, resB.reservation.id, { reservationRoomId: roomItemB, roomId: physical.id, actorId, actorRole: 'OWNER' }),
    ).rejects.toMatchObject({ code: 'ROOM_UNAVAILABLE' });
  });
});
