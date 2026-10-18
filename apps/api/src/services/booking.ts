import { Prisma, type PrismaClient } from '@prisma/client';
import {
  canTransitionReservation,
  nightsBetween,
  validateStay,
  type CurrencyCode,
  type QuoteDto,
  type ReservationDto,
} from '@mdg/domain';
import type { GuestDetails } from '@mdg/validation';
import type { Tx } from '../db/prisma.js';
import { AppError } from '../lib/errors.js';
import { newReference } from '../lib/ids.js';
import { signManageToken, signLookupToken } from '../lib/tokens.js';
import { applyInventoryDelta } from '../inventory/inventory.js';
import { buildQuote, type QuoteExtraInput, type QuoteRoomInput } from '../inventory/pricing.js';
import { consumeDeltasFromRooms, releaseDeltasForReservation, releaseExpiredHolds } from './holds.js';
import { enqueueNotification } from './notifications.js';
import { reservationInclude, toReservationDto, quoteFromSnapshot, type ReservationWithRelations } from './reservationMapper.js';

export interface CreateHoldInput {
  propertySlug: string;
  checkIn: string;
  checkOut: string;
  rooms: QuoteRoomInput[];
  extras?: QuoteExtraInput[];
  promotionCode?: string;
  quoteFingerprint: string;
  currency?: CurrencyCode;
}

export interface HoldResult {
  holdId: string;
  reservationId: string;
  reference: string;
  expiresAt: string;
  quote: QuoteDto;
}

async function uniqueReference(tx: Tx): Promise<string> {
  for (let i = 0; i < 6; i += 1) {
    const reference = newReference();
    const existing = await tx.reservation.findUnique({ where: { reference }, select: { id: true } });
    if (!existing) return reference;
  }
  throw new AppError(500, 'REFERENCE_GENERATION_FAILED', 'Could not allocate a booking reference. Please retry.');
}

export async function createHold(prisma: PrismaClient, input: CreateHoldInput): Promise<HoldResult> {
  const property = await prisma.property.findUnique({ where: { slug: input.propertySlug } });
  if (!property) throw AppError.notFound('Property not found.');

  const validation = validateStay({
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    timeZone: property.timeZone,
    rules: {
      minStayNights: property.minStayNights,
      maxStayNights: property.maxStayNights,
      bookingWindowDays: property.bookingWindowDays,
      minLeadTimeDays: property.minLeadTimeDays,
      maxRoomsPerReservation: property.maxRoomsPerReservation,
    },
  });
  if (!validation.ok) throw AppError.unprocessable('INVALID_STAY', validation.errors[0]?.message ?? 'Invalid stay', validation.errors);

  const totalRooms = input.rooms.reduce((acc, r) => acc + r.quantity, 0);
  if (totalRooms > property.maxRoomsPerReservation) {
    throw AppError.unprocessable('TOO_MANY_ROOMS', `A reservation may contain at most ${property.maxRoomsPerReservation} rooms.`);
  }

  return prisma.$transaction(async (tx) => {
    const built = await buildQuote(tx, {
      propertyId: property.id,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      rooms: input.rooms,
      extras: input.extras,
      promotionCode: input.promotionCode,
      currency: input.currency,
    });

    if (built.quote.fingerprint !== input.quoteFingerprint) {
      throw AppError.conflict('QUOTE_CHANGED', 'Prices or availability changed. Please review the updated total.', {
        quote: built.quote,
      });
    }

    await applyInventoryDelta(tx, consumeDeltasFromRooms(built.rooms));

    const reference = await uniqueReference(tx);
    const checkInDate = new Date(`${input.checkIn}T00:00:00.000Z`);
    const checkOutDate = new Date(`${input.checkOut}T00:00:00.000Z`);
    const expiresAt = new Date(Date.now() + property.holdTtlMinutes * 60_000);

    const reservation = await tx.reservation.create({
      data: {
        reference,
        propertyId: property.id,
        status: 'HELD',
        paymentState: 'UNPAID',
        source: 'ONLINE',
        currency: built.quote.currency,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        nights: built.quote.nights,
        adultsTotal: built.adultsTotal,
        childrenTotal: built.childrenTotal,
        leadGuestName: 'Pending',
        leadGuestPhone: 'Pending',
        subtotalMinor: built.quote.subtotal.amountMinor,
        taxesMinor: built.quote.taxes.amountMinor,
        feesMinor: built.quote.fees.amountMinor,
        discountMinor: built.quote.discount.amountMinor,
        totalMinor: built.quote.total.amountMinor,
        promotionCode: input.promotionCode ?? null,
        rateSnapshot: built.quote as unknown as Prisma.InputJsonValue,
        policySnapshot: {
          cancellationPolicyId: built.quote.cancellationPolicyId,
          cancellationSummary: built.quote.cancellationSummary,
          settlementPolicy: built.quote.settlementPolicy,
          holdTtlMinutes: property.holdTtlMinutes,
          arrivalCutoffTime: property.arrivalCutoffTime,
        } as Prisma.InputJsonValue,
        hold: { create: { expiresAt } },
      },
      include: { hold: true },
    });

    for (const room of built.rooms) {
      await tx.reservationRoom.create({
        data: {
          reservation: { connect: { id: reservation.id } },
          roomType: { connect: { id: room.roomTypeId } },
          ratePlan: { connect: { id: room.ratePlanId } },
          quantity: room.quantity,
          adults: room.adults,
          children: room.children,
          childAges: room.childAges,
          nightlyRates: room.nightly as unknown as Prisma.InputJsonValue,
          subtotalMinor: room.subtotalMinor,
          taxesMinor: room.taxesMinor,
          feesMinor: room.feesMinor,
          totalMinor: room.totalMinor,
          nights: {
            create: room.nightly.map((n) => ({
              reservation: { connect: { id: reservation.id } },
              roomTypeId: room.roomTypeId,
              date: new Date(`${n.date}T00:00:00.000Z`),
              quantity: room.quantity,
              nightlyMinor: n.minor,
            })),
          },
        },
      });
    }

    return {
      holdId: reservation.hold!.id,
      reservationId: reservation.id,
      reference: reservation.reference,
      expiresAt: expiresAt.toISOString(),
      quote: built.quote,
    };
  });
}

export interface ConfirmInput {
  holdId: string;
  quoteFingerprint: string;
  leadGuest: GuestDetails;
  idempotencyKey: string;
}

export interface ConfirmResult {
  reservation: ReservationDto;
  manageToken: string;
}

export async function confirmReservation(prisma: PrismaClient, input: ConfirmInput): Promise<ConfirmResult> {
  await releaseExpiredHolds(prisma);

  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findFirst({
      where: { hold: { id: input.holdId } },
      include: { ...reservationInclude, hold: true, rooms: { include: { roomType: { select: { name: true } }, assignments: { where: { active: true }, include: { room: { select: { number: true } } } } } } },
    });
    if (!reservation) throw AppError.notFound('Hold not found.');

    if (['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'].includes(reservation.status)) {
      const manageToken = await signManageToken(reservation.id);
      return { reservation: toReservationDto(reservation, quoteFromSnapshot(reservation.rateSnapshot)), manageToken };
    }
    if (reservation.status !== 'HELD') {
      throw AppError.conflict('RESERVATION_NOT_HOLDABLE', `This reservation is ${reservation.status.toLowerCase()} and can no longer be confirmed.`);
    }
    if (!reservation.hold || reservation.hold.expiresAt.getTime() <= Date.now()) {
      throw AppError.gone('HOLD_EXPIRED', 'Your reservation hold has expired. Please search again to see current availability.');
    }

    const built = await buildQuote(tx, {
      propertyId: reservation.propertyId,
      checkIn: reservation.checkIn.toISOString().slice(0, 10),
      checkOut: reservation.checkOut.toISOString().slice(0, 10),
      rooms: reservation.rooms.map((r) => ({
        roomTypeId: r.roomTypeId,
        ratePlanId: r.ratePlanId,
        quantity: r.quantity,
        adults: r.adults,
        children: r.children,
        childAges: r.childAges,
      })),
      promotionCode: reservation.promotionCode ?? undefined,
      currency: reservation.currency as CurrencyCode,
    });

    if (built.quote.fingerprint !== input.quoteFingerprint) {
      throw AppError.conflict('QUOTE_CHANGED', 'Prices changed before confirmation. Please review the updated total and try again.', {
        quote: built.quote,
      });
    }

    const guest = input.leadGuest;
    const leadGuestName = `${guest.firstName} ${guest.lastName}`.trim();
    const leadGuestPhone = `${guest.phoneCountryCode}${guest.phoneNumber}`;

    const guestProfile = await tx.guestProfile.create({
      data: {
        firstName: guest.firstName,
        lastName: guest.lastName,
        email: guest.email || null,
        phoneCountryCode: guest.phoneCountryCode,
        phoneNumber: guest.phoneNumber,
        marketingConsent: guest.marketingConsent,
        notes: guest.specialRequests || null,
      },
    });

    const updated = await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        status: 'CONFIRMED',
        guestProfileId: guestProfile.id,
        leadGuestName,
        leadGuestPhone,
        leadGuestEmail: guest.email || null,
        estimatedArrivalTime: guest.estimatedArrivalTime || null,
        specialRequests: guest.specialRequests || null,
        communicationPreference: guest.communicationPreference,
        marketingConsent: guest.marketingConsent,
        rateSnapshot: built.quote as unknown as Prisma.InputJsonValue,
        policySnapshot: {
          cancellationPolicyId: built.quote.cancellationPolicyId,
          cancellationSummary: built.quote.cancellationSummary,
          settlementPolicy: built.quote.settlementPolicy,
          arrivalCutoffTime: (reservation.policySnapshot as Record<string, unknown> | null)?.arrivalCutoffTime ?? null,
        } as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
      include: { ...reservationInclude, hold: true },
    });

    if (reservation.promotionCode) {
      await tx.promotion.updateMany({ where: { code: reservation.promotionCode }, data: { usageCount: { increment: 1 } } });
    }

    await tx.hold.update({ where: { id: input.holdId }, data: { status: 'CONSUMED', consumedAt: new Date() } });

    const folio = await tx.folio.create({ data: { reservationId: reservation.id, currency: reservation.currency, status: 'OPEN' } });
    await tx.folioCharge.createMany({
      data: [
        ...updated.rooms.map((r) => ({
          folioId: folio.id,
          kind: 'ROOM',
          description: `${r.roomType.name} accommodation (${updated.nights} night${updated.nights === 1 ? '' : 's'})`,
          quantity: r.quantity,
          unitMinor: r.subtotalMinor,
          amountMinor: r.subtotalMinor,
        })),
        ...(updated.taxesMinor ? [{ folioId: folio.id, kind: 'TAX', description: 'Taxes', quantity: 1, unitMinor: updated.taxesMinor, amountMinor: updated.taxesMinor }] : []),
        ...(updated.feesMinor ? [{ folioId: folio.id, kind: 'FEE', description: 'Fees & service charges', quantity: 1, unitMinor: updated.feesMinor, amountMinor: updated.feesMinor }] : []),
        ...(updated.discountMinor ? [{ folioId: folio.id, kind: 'ADJUSTMENT', description: `Promotion ${updated.promotionCode ?? ''}`.trim(), quantity: 1, unitMinor: -updated.discountMinor, amountMinor: -updated.discountMinor }] : []),
      ],
    });

    await enqueueNotification(tx, {
      channel: guest.communicationPreference === 'SMS' ? 'SMS' : 'EMAIL',
      recipient: guest.communicationPreference === 'SMS' ? leadGuestPhone : guest.email || leadGuestPhone,
      subject: `Your Mountain Dew Group reservation ${updated.reference} is confirmed`,
      body: `Thank you, ${leadGuestName}. Your reservation is confirmed. Payment has not been collected and is due at the property on arrival. Reference: ${updated.reference}.`,
      templateCode: 'reservation.confirmed',
      reservationId: updated.id,
      dedupeKey: `reservation.confirmed:${updated.id}`,
      topic: 'notification.reservation_confirmed',
    });

    await tx.auditLog.create({
      data: { action: 'reservation.confirmed', entityType: 'Reservation', entityId: updated.id, after: { status: 'CONFIRMED', reference: updated.reference } },
    });

    const manageToken = await signManageToken(updated.id);
    return { reservation: toReservationDto(updated, built.quote), manageToken };
  });
}

export interface CancelInput {
  reference: string;
  reason?: string;
  actorId?: string;
  actorRole?: string;
}

export async function cancelReservation(prisma: PrismaClient, reservationId: string, input: CancelInput): Promise<ReservationDto> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({ where: { id: reservationId }, include: reservationInclude });
    if (!reservation) throw AppError.notFound('Reservation not found.');

    if (reservation.status === 'CANCELLED') {
      return toReservationDto(reservation, quoteFromSnapshot(reservation.rateSnapshot));
    }
    if (!canTransitionReservation(reservation.status, 'CANCELLED')) {
      throw AppError.conflict('RESERVATION_NOT_CANCELLABLE', `A ${reservation.status.toLowerCase()} reservation cannot be cancelled.`);
    }

    const claimed = await tx.reservation.updateMany({
      where: { id: reservationId, status: reservation.status },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: input.actorId ?? null, cancellationReason: input.reason ?? null, version: { increment: 1 } },
    });
    if (claimed.count === 0) {
      const current = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: reservationInclude });
      return toReservationDto(current, quoteFromSnapshot(current.rateSnapshot));
    }

    const deltas = await releaseDeltasForReservation(tx, reservationId);
    await applyInventoryDelta(tx, deltas);
    await tx.hold.updateMany({ where: { reservationId, status: 'ACTIVE' }, data: { status: 'RELEASED', releasedAt: new Date() } });
    await releaseAssignments(tx, reservationId);

    await enqueueNotification(tx, {
      channel: reservation.leadGuestEmail ? 'EMAIL' : 'SMS',
      recipient: reservation.leadGuestEmail ?? reservation.leadGuestPhone,
      subject: `Reservation ${reservation.reference} cancelled`,
      body: `Your reservation ${reservation.reference} has been cancelled. No payment was collected online.`,
      templateCode: 'reservation.cancelled',
      reservationId,
      dedupeKey: `reservation.cancelled:${reservationId}`,
    });

    await tx.auditLog.create({ data: { action: 'reservation.cancelled', entityType: 'Reservation', entityId: reservationId, actorId: input.actorId ?? null, actorRole: input.actorRole ?? null, reason: input.reason ?? null } });

    const updated = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: reservationInclude });
    return toReservationDto(updated, quoteFromSnapshot(updated.rateSnapshot));
  });
}

export async function releaseAssignments(tx: Tx, reservationId: string): Promise<void> {
  const assignments = await tx.roomAssignment.findMany({ where: { reservationId, active: true } });
  for (const a of assignments) {
    await tx.roomAssignmentNight.deleteMany({ where: { roomId: a.roomId, date: { gte: a.startDate, lt: a.endDate } } });
    await tx.roomAssignment.update({ where: { id: a.id }, data: { active: false, releasedAt: new Date() } });
  }
}

export interface ModifyInput {
  changes: { checkIn?: string; checkOut?: string; rooms?: QuoteRoomInput[] };
  acceptedFingerprint?: string;
  reason?: string;
  actorId?: string;
  actorRole?: string;
}

export type ModifyResult =
  | { requiresAcceptance: true; newQuote: QuoteDto; fingerprint: string }
  | { reservation: ReservationDto };

export async function modifyReservation(prisma: PrismaClient, reservationId: string, input: ModifyInput): Promise<ModifyResult> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({ where: { id: reservationId }, include: { ...reservationInclude, rooms: { include: { roomType: { select: { name: true } }, assignments: { where: { active: true }, include: { room: { select: { number: true } } } } } }, hold: true } });
    if (!reservation) throw AppError.notFound('Reservation not found.');
    if (!['HELD', 'CONFIRMED'].includes(reservation.status)) {
      throw AppError.conflict('RESERVATION_NOT_MODIFIABLE', `A ${reservation.status.toLowerCase()} reservation cannot be modified.`);
    }

    const checkIn = input.changes.checkIn ?? reservation.checkIn.toISOString().slice(0, 10);
    const checkOut = input.changes.checkOut ?? reservation.checkOut.toISOString().slice(0, 10);
    const rooms: QuoteRoomInput[] =
      input.changes.rooms ??
      reservation.rooms.map((r) => ({ roomTypeId: r.roomTypeId, ratePlanId: r.ratePlanId, quantity: r.quantity, adults: r.adults, children: r.children, childAges: r.childAges }));

    const built = await buildQuote(tx, {
      propertyId: reservation.propertyId,
      checkIn,
      checkOut,
      rooms,
      promotionCode: reservation.promotionCode ?? undefined,
      currency: reservation.currency as CurrencyCode,
    });

    const currentSnapshot = reservation.rateSnapshot as unknown as QuoteDto;
    if (built.quote.fingerprint !== currentSnapshot.fingerprint) {
      if (input.acceptedFingerprint !== built.quote.fingerprint) {
        return { requiresAcceptance: true as const, newQuote: built.quote, fingerprint: built.quote.fingerprint };
      }
    }

    const oldDeltas = await releaseDeltasForReservation(tx, reservationId);
    const newDeltas = consumeDeltasFromRooms(built.rooms);
    await applyInventoryDelta(tx, [...oldDeltas, ...newDeltas]);

    await tx.reservationRoomNight.deleteMany({ where: { reservationId } });
    await tx.reservationRoom.deleteMany({ where: { reservationId } });
    await releaseAssignments(tx, reservationId);

    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: {
        checkIn: new Date(`${checkIn}T00:00:00.000Z`),
        checkOut: new Date(`${checkOut}T00:00:00.000Z`),
        nights: built.quote.nights,
        adultsTotal: built.adultsTotal,
        childrenTotal: built.childrenTotal,
        subtotalMinor: built.quote.subtotal.amountMinor,
        taxesMinor: built.quote.taxes.amountMinor,
        feesMinor: built.quote.fees.amountMinor,
        discountMinor: built.quote.discount.amountMinor,
        totalMinor: built.quote.total.amountMinor,
        rateSnapshot: built.quote as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
      include: reservationInclude,
    });

    for (const room of built.rooms) {
      await tx.reservationRoom.create({
        data: {
          reservation: { connect: { id: reservationId } },
          roomType: { connect: { id: room.roomTypeId } },
          ratePlan: { connect: { id: room.ratePlanId } },
          quantity: room.quantity,
          adults: room.adults,
          children: room.children,
          childAges: room.childAges,
          nightlyRates: room.nightly as unknown as Prisma.InputJsonValue,
          subtotalMinor: room.subtotalMinor,
          taxesMinor: room.taxesMinor,
          feesMinor: room.feesMinor,
          totalMinor: room.totalMinor,
          nights: {
            create: room.nightly.map((n) => ({
              reservation: { connect: { id: reservationId } },
              roomTypeId: room.roomTypeId,
              date: new Date(`${n.date}T00:00:00.000Z`),
              quantity: room.quantity,
              nightlyMinor: n.minor,
            })),
          },
        },
      });
    }

    await tx.auditLog.create({ data: { action: 'reservation.modified', entityType: 'Reservation', entityId: reservationId, actorId: input.actorId ?? null, actorRole: input.actorRole ?? null, reason: input.reason ?? null, before: currentSnapshot as unknown as Prisma.InputJsonValue, after: built.quote as unknown as Prisma.InputJsonValue } });

    await enqueueNotification(tx, {
      channel: reservation.leadGuestEmail ? 'EMAIL' : 'SMS',
      recipient: reservation.leadGuestEmail ?? reservation.leadGuestPhone,
      subject: `Reservation ${reservation.reference} updated`,
      body: `Your reservation ${reservation.reference} has been updated. Please review the new dates and total.`,
      templateCode: 'reservation.modified',
      reservationId,
      dedupeKey: `reservation.modified:${reservationId}:${built.quote.fingerprint}`,
    });

    return { reservation: toReservationDto(updated, built.quote) };
  });
}

export interface LookupInput {
  reference: string;
  lastName: string;
}

export async function lookupReservation(prisma: PrismaClient, input: LookupInput): Promise<{ manageToken: string; reservation: ReservationDto }> {
  const reservation = await prisma.reservation.findUnique({ where: { reference: input.reference.trim().toUpperCase() }, include: reservationInclude });
  const surnameMatches =
    reservation &&
    reservation.leadGuestName
      .toLowerCase()
      .split(/\s+/)
      .includes(input.lastName.trim().toLowerCase());
  if (!reservation || !surnameMatches) {
    // Identical error for "not found" and "wrong surname" to avoid leaking data.
    throw AppError.notFound('We could not find a reservation matching those details. Please check your reference and surname.');
  }
  const manageToken = await signManageToken(reservation.id);
  return { manageToken, reservation: toReservationDto(reservation, quoteFromSnapshot(reservation.rateSnapshot)) };
}

export async function getReservationByReference(prisma: PrismaClient, reference: string): Promise<ReservationWithRelations> {
  const reservation = await prisma.reservation.findUnique({ where: { reference: reference.trim().toUpperCase() }, include: reservationInclude });
  if (!reservation) throw AppError.notFound('Reservation not found.');
  return reservation;
}

export { signLookupToken, nightsBetween };
