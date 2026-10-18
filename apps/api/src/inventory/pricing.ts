import { money, type CurrencyCode, type Money, type QuoteDto, type QuoteLineDto } from '@mdg/domain';
import { nightDates } from '@mdg/domain';
import type { Tx } from '../db/prisma.js';
import { AppError } from '../lib/errors.js';
import { fingerprint } from '../lib/ids.js';

export interface QuoteRoomInput {
  roomTypeId: string;
  ratePlanId?: string;
  quantity: number;
  adults: number;
  children: number;
  childAges?: number[];
}

export interface QuoteExtraInput {
  code: string;
  quantity: number;
}

export interface BuildQuoteInput {
  propertyId: string;
  checkIn: string;
  checkOut: string;
  rooms: QuoteRoomInput[];
  extras?: QuoteExtraInput[];
  promotionCode?: string;
  currency?: CurrencyCode;
}

export interface ReservationRoomDraft {
  roomTypeId: string;
  roomTypeName: string;
  ratePlanId: string;
  ratePlanName: string;
  quantity: number;
  adults: number;
  children: number;
  childAges: number[];
  nightly: { date: string; minor: number }[];
  subtotalMinor: number;
  taxesMinor: number;
  feesMinor: number;
  totalMinor: number;
}

export interface BuildQuoteResult {
  quote: QuoteDto;
  rooms: ReservationRoomDraft[];
  adultsTotal: number;
  childrenTotal: number;
}

function round(n: number): number {
  return Math.round(n);
}

function parseSettingsExtras(raw: unknown): { code: string; label: string; priceMinor: number; currency: CurrencyCode; perStay: boolean }[] {
  if (!Array.isArray(raw)) return [];
  const out: { code: string; label: string; priceMinor: number; currency: CurrencyCode; perStay: boolean }[] = [];
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      if (typeof obj.code === 'string' && typeof obj.label === 'string' && typeof obj.priceMinor === 'number') {
        out.push({
          code: obj.code,
          label: obj.label,
          priceMinor: obj.priceMinor,
          currency: (obj.currency === 'LRD' ? 'LRD' : 'USD') as CurrencyCode,
          perStay: obj.perStay === true,
        });
      }
    }
  }
  return out;
}

export async function buildQuote(tx: Tx, input: BuildQuoteInput): Promise<BuildQuoteResult> {
  const property = await tx.property.findUnique({ where: { id: input.propertyId } });
  if (!property) throw AppError.badRequest('UNKNOWN_PROPERTY', 'Property not found.');
  const currency: CurrencyCode = (input.currency ?? property.currency) as CurrencyCode;
  const dates = nightDates(input.checkIn, input.checkOut);
  if (dates.length === 0) throw AppError.badRequest('INVALID_RANGE', 'Check-out must be after check-in.');

  const roomTypeIds = [...new Set(input.rooms.map((r) => r.roomTypeId))];
  const roomTypes = await tx.roomType.findMany({
    where: { id: { in: roomTypeIds }, propertyId: input.propertyId },
    include: { ratePlans: { where: { isActive: true }, include: { rates: true, cancellationPolicy: true } } },
  });
  const roomTypeMap = new Map(roomTypes.map((rt) => [rt.id, rt]));

  const seasons = await tx.season.findMany({ where: { propertyId: input.propertyId }, orderBy: { priority: 'asc' } });
  const taxes = await tx.taxFee.findMany({
    where: { propertyId: input.propertyId, isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  let promotion: Awaited<ReturnType<typeof loadPromotion>> | null = null;
  if (input.promotionCode) {
    promotion = await loadPromotion(tx, input.propertyId, input.promotionCode, input.checkIn, input.checkOut);
    if (!promotion) throw AppError.unprocessable('INVALID_PROMOTION', 'That promotion code is not valid for these dates.');
  }

  const settingsExtras = await tx.setting.findUnique({
    where: { propertyId_key: { propertyId: input.propertyId, key: 'extras' } },
  });
  const extrasCatalog = parseSettingsExtras(settingsExtras?.value);

  const lines: QuoteLineDto[] = [];
  const roomDrafts: ReservationRoomDraft[] = [];
  let adultsTotal = 0;
  let childrenTotal = 0;
  let subtotalMinor = 0;
  let taxesMinor = 0;
  let feesMinor = 0;

  for (const selection of input.rooms) {
    const roomType = roomTypeMap.get(selection.roomTypeId);
    if (!roomType) throw AppError.badRequest('UNKNOWN_ROOM_TYPE', 'One of the selected room types is unavailable.');

    const maxAdults = roomType.maxAdults;
    const maxChildren = roomType.maxChildren;
    if (selection.adults > maxAdults || selection.children > maxChildren || selection.adults + selection.children > roomType.maxOccupancy) {
      throw AppError.unprocessable('OCCUPANCY_EXCEEDED', `The ${roomType.name} cannot host ${selection.adults + selection.children} guests.`, {
        roomTypeId: roomType.id,
      });
    }

    const ratePlan = selection.ratePlanId
      ? roomType.ratePlans.find((rp) => rp.id === selection.ratePlanId)
      : roomType.ratePlans.find((rp) => rp.isDefault) ?? roomType.ratePlans[0];
    if (!ratePlan) throw AppError.unprocessable('NO_RATE_PLAN', `No rate plan is configured for ${roomType.name}.`);

    const rateOverrideMap = new Map(ratePlan.rates.map((r) => [r.date.toISOString().slice(0, 10), r]));
    const nightly: { date: string; minor: number }[] = [];
    let roomSubtotal = 0;

    for (const date of dates) {
      const override = rateOverrideMap.get(date);
      if (override?.closedToArrival && date === input.checkIn) {
        throw AppError.unprocessable('CLOSED_TO_ARRIVAL', `${roomType.name} is not available for arrival on ${date}.`);
      }
      const resolved = resolveNightlyMinor({
        baseRateMinor: ratePlan.baseRateMinor,
        weekendRateMinor: ratePlan.weekendRateMinor,
        weekendDays: ratePlan.weekendDays,
        date,
        seasons: seasons.map((s) => ({ startDate: s.startDate.toISOString().slice(0, 10), endDate: s.endDate.toISOString().slice(0, 10), multiplierBps: s.multiplierBps })),
        overrideMinor: override?.nightlyMinor,
      });
      nightly.push({ date, minor: resolved });
      roomSubtotal += resolved;
    }

    const roomSubtotalAll = roomSubtotal * selection.quantity;
    const roomTaxes = computeCharges(taxes.filter((t) => t.kind === 'TAX'), roomSubtotalAll, false);
    const roomService = computeCharges(taxes.filter((t) => t.kind === 'SERVICE_CHARGE'), roomSubtotalAll, false);
    const roomFees = computeCharges(taxes.filter((t) => t.kind === 'FEE'), roomSubtotalAll, false);
    const taxesSum = roomTaxes.total + roomService.total;
    const feesSum = roomFees.total;

    lines.push({
      kind: 'ROOM',
      label: `${roomType.name} x${selection.quantity}`,
      quantity: selection.quantity,
      unitAmount: money(roomSubtotal, currency),
      amount: money(roomSubtotalAll, currency),
      metadata: { roomTypeId: roomType.id, ratePlanId: ratePlan.id, nights: dates.length },
    });
    for (const t of [...roomTaxes.lines, ...roomService.lines]) {
      lines.push({ kind: 'TAX', label: t.label, quantity: 1, unitAmount: money(t.amount, currency), amount: money(t.amount, currency) });
    }
    for (const f of roomFees.lines) {
      lines.push({ kind: 'FEE', label: f.label, quantity: 1, unitAmount: money(f.amount, currency), amount: money(f.amount, currency) });
    }

    subtotalMinor += roomSubtotalAll;
    taxesMinor += taxesSum;
    feesMinor += feesSum;
    adultsTotal += selection.adults * selection.quantity;
    childrenTotal += selection.children * selection.quantity;

    roomDrafts.push({
      roomTypeId: roomType.id,
      roomTypeName: roomType.name,
      ratePlanId: ratePlan.id,
      ratePlanName: ratePlan.name,
      quantity: selection.quantity,
      adults: selection.adults,
      children: selection.children,
      childAges: selection.childAges ?? [],
      nightly,
      subtotalMinor: roomSubtotalAll,
      taxesMinor: taxesSum,
      feesMinor: feesSum,
      totalMinor: roomSubtotalAll + taxesSum + feesSum,
    });
  }

  for (const extra of input.extras ?? []) {
    const def = extrasCatalog.find((e) => e.code === extra.code);
    if (!def) throw AppError.unprocessable('UNKNOWN_EXTRA', `Extra "${extra.code}" is not offered.`);
    const qty = def.perStay ? 1 : Math.max(1, extra.quantity);
    const amount = def.priceMinor * qty;
    lines.push({
      kind: 'EXTRA',
      label: def.label,
      quantity: qty,
      unitAmount: money(def.priceMinor, currency),
      amount: money(amount, currency),
      metadata: { code: def.code, perStay: def.perStay },
    });
  }

  const extrasTotal = (input.extras ?? []).reduce((acc, extra) => {
    const def = extrasCatalog.find((e) => e.code === extra.code);
    if (!def) return acc;
    const qty = def.perStay ? 1 : Math.max(1, extra.quantity);
    return acc + def.priceMinor * qty;
  }, 0);

  let discountMinor = 0;
  if (promotion) {
    if (promotion.kind === 'PERCENT') {
      discountMinor = round((subtotalMinor * (promotion.valueBps ?? 0)) / 10000);
    } else {
      discountMinor = Math.min(promotion.amountMinor ?? 0, subtotalMinor);
    }
    lines.push({
      kind: 'DISCOUNT',
      label: `Promotion ${promotion.code}`,
      quantity: 1,
      unitAmount: money(-discountMinor, currency),
      amount: money(-discountMinor, currency),
    });
  }

  const totalMinor = Math.max(0, subtotalMinor + taxesMinor + feesMinor + extrasTotal - discountMinor);

  const cancellationPolicy =
    roomTypes[0]?.ratePlans.find((rp) => rp.isDefault)?.cancellationPolicy ??
    roomTypes.flatMap((rt) => rt.ratePlans).find((rp) => rp.cancellationPolicy)?.cancellationPolicy ??
    null;
  const cancellationSummary = cancellationPolicy?.summary ?? 'Cancellation terms are confirmed at check-in. Reserve online and pay at the property.';

  const quoteInput = {
    propertyId: input.propertyId,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    currency,
    rooms: roomDrafts.map((r) => ({
      roomTypeId: r.roomTypeId,
      ratePlanId: r.ratePlanId,
      quantity: r.quantity,
      adults: r.adults,
      children: r.children,
      childAges: r.childAges.length ? [...r.childAges].sort((a, b) => a - b) : [],
    })),
    extras: [...(input.extras ?? [])].map((e) => ({ code: e.code, quantity: e.quantity })).sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)),
    promotionCode: input.promotionCode ?? null,
    subtotalMinor,
    taxesMinor,
    feesMinor,
    discountMinor,
    extrasTotal,
    totalMinor,
  };

  const quote: QuoteDto = {
    quoteId: fingerprint(quoteInput).slice(0, 24),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
    currency,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights: dates.length,
    lines,
    subtotal: money(subtotalMinor, currency),
    taxes: money(taxesMinor, currency),
    fees: money(feesMinor, currency),
    discount: money(discountMinor, currency),
    total: money(totalMinor, currency),
    dueOnlineToday: money(0, currency),
    dueAtProperty: money(totalMinor, currency),
    settlementPolicy: 'PAY_AT_PROPERTY',
    cancellationPolicyId: cancellationPolicy?.id ?? '',
    cancellationSummary,
    fingerprint: fingerprint(quoteInput),
  };

  return { quote, rooms: roomDrafts, adultsTotal, childrenTotal };
}

async function loadPromotion(tx: Tx, propertyId: string, code: string, checkIn: string, checkOut: string) {
  const promo = await tx.promotion.findFirst({ where: { propertyId, code: code.trim().toUpperCase(), isActive: true } });
  if (!promo) return null;
  if (promo.validFrom && checkIn < promo.validFrom.toISOString().slice(0, 10)) return null;
  if (promo.validTo && checkIn > promo.validTo.toISOString().slice(0, 10)) return null;
  if (promo.usageLimit != null && promo.usageCount >= promo.usageLimit) return null;
  return promo;
}

export function resolveNightlyMinor(args: {
  baseRateMinor: number;
  weekendRateMinor: number | null;
  weekendDays: number[];
  date: string;
  seasons: { startDate: string; endDate: string; multiplierBps: number }[];
  overrideMinor?: number | null;
}): number {
  if (args.overrideMinor != null) return args.overrideMinor;
  const dow = new Date(`${args.date}T00:00:00.000Z`).getUTCDay();
  const isWeekend = args.weekendDays.includes(dow);
  const base = isWeekend && args.weekendRateMinor != null ? args.weekendRateMinor : args.baseRateMinor;
  let multiplierBps = 10000;
  for (const season of args.seasons) {
    if (args.date >= season.startDate && args.date <= season.endDate) multiplierBps = season.multiplierBps;
  }
  return round((base * multiplierBps) / 10000);
}

function computeCharges(
  charges: { label: string; mode: string; valueBps: number | null; amountMinor: number | null; inclusive: boolean }[],
  base: number,
  _unused: boolean,
): { total: number; lines: { label: string; amount: number }[] } {
  let total = 0;
  const lines: { label: string; amount: number }[] = [];
  for (const c of charges) {
    const amount = c.mode === 'PERCENT' ? round((base * (c.valueBps ?? 0)) / 10000) : c.amountMinor ?? 0;
    if (!c.inclusive) total += amount;
    lines.push({ label: c.label, amount });
  }
  return { total, lines };
}
