import { money, nightDates, type AvailabilityResponseDto, type AvailabilityRoomTypeDto, type CurrencyCode, type RoomTypeDto } from '@mdg/domain';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { buildQuote } from './pricing.js';
import { getNightAvailability } from './inventory.js';
import { releaseExpiredHolds } from '../services/holds.js';
import type { RoomTypeDto as RT } from '@mdg/domain';

function toRoomTypeDto(rt: {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  bedConfiguration: string;
  maxOccupancy: number;
  maxAdults: number;
  maxChildren: number;
  sizeSqm: number | null;
  sizeVerified: boolean;
  accessibility: string[];
  accessibilityVerified: boolean;
  smokingPolicy: string;
  baseCurrency: string;
  amenities: { amenity: { id: string; code: string; label: string; category: string; icon: string | null } }[];
  media: { id: string; url: string; alt: string; caption: string | null; width: number | null; height: number | null; ratio: string | null; sortOrder: number }[];
  ratePlans: { baseRateMinor: number; currency: string }[];
  _property: { checkInTime: string; checkOutTime: string };
}): RT {
  const images = [...rt.media].sort((a, b) => a.sortOrder - b.sortOrder).map((m) => m.url);
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
    smokingPolicy: rt.smokingPolicy as RoomTypeDto['smokingPolicy'],
    amenities: rt.amenities.map((a) => ({ id: a.amenity.id, code: a.amenity.code, label: a.amenity.label, category: a.amenity.category, icon: a.amenity.icon })),
    media: [...rt.media]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m) => ({ id: m.id, url: m.url, alt: m.alt, caption: m.caption, width: m.width, height: m.height, ratio: m.ratio })),
    images: images.length ? images : ['/images/room-placeholder.svg'],
    baseCurrency: rt.baseCurrency as CurrencyCode,
    fromPrice: money(fromMinor, rt.baseCurrency as CurrencyCode),
    checkInTime: rt._property.checkInTime,
    checkOutTime: rt._property.checkOutTime,
    cancellationSummary: 'Free cancellation up to the day before arrival, subject to the property policy.',
    payAtProperty: true,
  };
}

const roomTypeInclude = {
  amenities: { include: { amenity: true } },
  media: true,
  ratePlans: { where: { isActive: true } },
} satisfies Prisma.RoomTypeInclude;

export interface SearchAvailabilityInput {
  propertySlug: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children: number;
  childAges?: number[];
  currency?: CurrencyCode;
}

export async function searchAvailability(prisma: PrismaClient, input: SearchAvailabilityInput): Promise<AvailabilityResponseDto> {
  await releaseExpiredHolds(prisma);

  const property = await prisma.property.findUnique({ where: { slug: input.propertySlug } });
  if (!property) throw AppError.notFound('Property not found.');
  const currency = (input.currency ?? property.currency) as CurrencyCode;
  const dates = nightDates(input.checkIn, input.checkOut);
  if (dates.length === 0) throw AppError.badRequest('INVALID_RANGE', 'Check-out must be after check-in.');

  const roomTypes = await prisma.roomType.findMany({
    where: { propertyId: property.id, isPublished: true },
    include: { ...roomTypeInclude, property: { select: { checkInTime: true, checkOutTime: true } } },
    orderBy: { sortOrder: 'asc' },
  });

  const roomTypeIds = roomTypes.map((rt) => rt.id);
  const nightRows = await getNightAvailability(prisma, roomTypeIds, dates);
  const capacityByRoomType = new Map<string, number>();
  const grouped = await prisma.physicalRoom.groupBy({
    by: ['roomTypeId'],
    where: { propertyId: property.id, active: true, roomTypeId: { in: roomTypeIds } },
    _count: { _all: true },
  });
  for (const g of grouped) capacityByRoomType.set(g.roomTypeId, g._count._all);

  const nightsIndex = new Map<string, Map<string, number>>();
  for (const row of nightRows) {
    if (!nightsIndex.has(row.roomTypeId)) nightsIndex.set(row.roomTypeId, new Map());
    nightsIndex.get(row.roomTypeId)!.set(row.date, row.available);
  }

  const results: AvailabilityRoomTypeDto[] = [];
  for (const rt of roomTypes) {
    const capacity = capacityByRoomType.get(rt.id) ?? 0;
    let availableCount = capacity;
    for (const date of dates) {
      const free = nightsIndex.get(rt.id)?.get(date);
      availableCount = Math.min(availableCount, free === undefined ? capacity : free);
    }
    const base = toRoomTypeDto({ ...rt, _property: rt.property });
    if (capacity === 0) {
      results.push({ roomType: base, availableCount: 0, requestedCount: input.rooms, available: false, nightlyTotal: money(0, currency), stayTotal: money(0, currency), taxesAndFees: money(0, currency), grandTotal: money(0, currency), averageNightly: money(0, currency), ratePlanId: '', ratePlanName: '' });
      continue;
    }
    const perRoomAdults = Math.min(rt.maxAdults, Math.max(1, Math.ceil(input.adults / input.rooms)));
    const perRoomChildren = Math.min(rt.maxChildren, Math.max(0, Math.ceil(input.children / input.rooms)));
    const built = await buildQuote(prisma, {
      propertyId: property.id,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      currency,
      rooms: [{ roomTypeId: rt.id, quantity: 1, adults: perRoomAdults, children: perRoomChildren, childAges: input.childAges }],
    });
    const roomLine = built.quote.lines.find((l) => l.kind === 'ROOM');
    results.push({
      roomType: base,
      availableCount,
      requestedCount: input.rooms,
      available: availableCount >= 1,
      nightlyTotal: money(roomLine?.unitAmount.amountMinor ?? 0, currency),
      stayTotal: money(built.quote.subtotal.amountMinor, currency),
      taxesAndFees: money(built.quote.taxes.amountMinor + built.quote.fees.amountMinor, currency),
      grandTotal: money(built.quote.total.amountMinor, currency),
      averageNightly: money(dates.length ? Math.round((roomLine?.unitAmount.amountMinor ?? 0) / dates.length) : 0, currency),
      ratePlanId: built.rooms[0]?.ratePlanId ?? '',
      ratePlanName: built.rooms[0]?.ratePlanName ?? '',
    });
  }

  const alternatives = await computeAlternatives(prisma, property.id, input, capacityByRoomType);

  return {
    propertyId: property.id,
    propertyName: property.name,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights: dates.length,
    adults: input.adults,
    children: input.children,
    rooms: input.rooms,
    currency,
    results,
    alternatives,
  };
}

async function computeAlternatives(
  prisma: PrismaClient,
  propertyId: string,
  input: SearchAvailabilityInput,
  capacityByRoomType: Map<string, number>,
): Promise<{ checkIn: string; checkOut: string; availableRoomTypes: number }[]> {
  const out: { checkIn: string; checkOut: string; availableRoomTypes: number }[] = [];
  const roomTypeIds = [...capacityByRoomType.keys()];
  const shifts = [1, -1, 2, -2, 3, 7];
  for (const shift of shifts) {
    const checkIn = shiftDate(input.checkIn, shift);
    const checkOut = shiftDate(input.checkOut, shift);
    if (checkIn < new Date().toISOString().slice(0, 10)) continue;
    const dates = nightDates(checkIn, checkOut);
    const rows = await getNightAvailability(prisma, roomTypeIds, dates);
    const index = new Map<string, Map<string, number>>();
    for (const row of rows) {
      if (!index.has(row.roomTypeId)) index.set(row.roomTypeId, new Map());
      index.get(row.roomTypeId)!.set(row.date, row.available);
    }
    let availableRoomTypes = 0;
    for (const [roomTypeId, capacity] of capacityByRoomType) {
      let min = capacity;
      for (const d of dates) {
        const free = index.get(roomTypeId)?.get(d);
        min = Math.min(min, free === undefined ? capacity : free);
      }
      if (min >= 1) availableRoomTypes += 1;
    }
    if (availableRoomTypes > 0) out.push({ checkIn, checkOut, availableRoomTypes });
    if (out.length >= 3) break;
  }
  return out;
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
