import { Prisma, type PrismaClient } from '@prisma/client';
import { nightDates, type CurrencyCode, type ReservationDto } from '@mdg/domain';
import type { Tx } from '../db/prisma.js';
import { AppError } from '../lib/errors.js';
import { newReference } from '../lib/ids.js';
import { applyInventoryDelta } from '../inventory/inventory.js';
import { buildQuote, type QuoteRoomInput } from '../inventory/pricing.js';
import { consumeDeltasFromRooms, releaseDeltasForReservation } from '../services/holds.js';
import { enqueueNotification } from '../services/notifications.js';
import { reservationInclude, toReservationDto } from './reservationMapper.js';

async function uniqueReference(tx: Tx): Promise<string> {
  for (let i = 0; i < 6; i += 1) {
    const reference = newReference();
    if (!(await tx.reservation.findUnique({ where: { reference }, select: { id: true } }))) return reference;
  }
  throw new AppError(500, 'REFERENCE_GENERATION_FAILED', 'Could not allocate a booking reference.');
}

export interface StaffCreateInput {
  propertyId: string;
  source: 'WALK_IN' | 'PHONE' | 'STAFF' | 'ONLINE';
  checkIn: string;
  checkOut: string;
  rooms: QuoteRoomInput[];
  leadGuest: { firstName: string; lastName: string; email?: string; phoneCountryCode: string; phoneNumber: string; notes?: string };
  arrivalTime?: string;
  specialRequests?: string;
  actorId: string;
  actorRole: string;
  initialPaymentMinor?: number;
  paymentMethod?: 'CASH' | 'MTN_MOBILE_MONEY' | 'ORANGE_MONEY' | 'BANK_TRANSFER' | 'CARD_TERMINAL';
}

export async function staffCreateReservation(prisma: PrismaClient, input: StaffCreateInput): Promise<ReservationDto> {
  return prisma.$transaction(async (tx) => {
    const built = await buildQuote(tx, {
      propertyId: input.propertyId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      rooms: input.rooms,
    });
    await applyInventoryDelta(tx, consumeDeltasFromRooms(built.rooms));
    const reference = await uniqueReference(tx);
    const guestProfile = await tx.guestProfile.create({
      data: {
        firstName: input.leadGuest.firstName,
        lastName: input.leadGuest.lastName,
        email: input.leadGuest.email || null,
        phoneCountryCode: input.leadGuest.phoneCountryCode,
        phoneNumber: input.leadGuest.phoneNumber,
        notes: input.leadGuest.notes || null,
      },
    });
    const reservation = await tx.reservation.create({
      data: {
        reference,
        propertyId: input.propertyId,
        status: 'CONFIRMED',
        paymentState: input.initialPaymentMinor ? 'PARTIALLY_PAID' : 'UNPAID',
        source: input.source,
        currency: built.quote.currency,
        checkIn: new Date(`${input.checkIn}T00:00:00.000Z`),
        checkOut: new Date(`${input.checkOut}T00:00:00.000Z`),
        nights: built.quote.nights,
        adultsTotal: built.adultsTotal,
        childrenTotal: built.childrenTotal,
        leadGuestName: `${input.leadGuest.firstName} ${input.leadGuest.lastName}`.trim(),
        leadGuestPhone: `${input.leadGuest.phoneCountryCode}${input.leadGuest.phoneNumber}`,
        leadGuestEmail: input.leadGuest.email || null,
        estimatedArrivalTime: input.arrivalTime ?? null,
        specialRequests: input.specialRequests ?? null,
        subtotalMinor: built.quote.subtotal.amountMinor,
        taxesMinor: built.quote.taxes.amountMinor,
        feesMinor: built.quote.fees.amountMinor,
        discountMinor: built.quote.discount.amountMinor,
        totalMinor: built.quote.total.amountMinor,
        guestProfileId: guestProfile.id,
        createdById: input.actorId,
        rateSnapshot: built.quote as unknown as Prisma.InputJsonValue,
        policySnapshot: { cancellationPolicyId: built.quote.cancellationPolicyId, cancellationSummary: built.quote.cancellationSummary, settlementPolicy: built.quote.settlementPolicy } as Prisma.InputJsonValue,
      },
      include: reservationInclude,
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

    const withRooms = await tx.reservation.findUniqueOrThrow({ where: { id: reservation.id }, include: reservationInclude });

    const folio = await tx.folio.create({ data: { reservationId: reservation.id, currency: reservation.currency, status: 'OPEN' } });
    await tx.folioCharge.createMany({
      data: [
        ...withRooms.rooms.map((r) => ({ folioId: folio.id, kind: 'ROOM', description: `Accommodation (${reservation.nights} night(s))`, quantity: r.quantity, unitMinor: r.subtotalMinor, amountMinor: r.subtotalMinor })),
        ...(reservation.taxesMinor ? [{ folioId: folio.id, kind: 'TAX', description: 'Taxes', quantity: 1, unitMinor: reservation.taxesMinor, amountMinor: reservation.taxesMinor }] : []),
        ...(reservation.feesMinor ? [{ folioId: folio.id, kind: 'FEE', description: 'Fees & service charges', quantity: 1, unitMinor: reservation.feesMinor, amountMinor: reservation.feesMinor }] : []),
      ],
    });

    if (input.initialPaymentMinor && input.paymentMethod && input.initialPaymentMinor > 0) {
      await recordPayment(tx, { reservationId: reservation.id, amountMinor: input.initialPaymentMinor, currency: reservation.currency as CurrencyCode, method: input.paymentMethod, verified: true, actorId: input.actorId });
    }

    await tx.auditLog.create({ data: { action: 'reservation.created', entityType: 'Reservation', entityId: reservation.id, actorId: input.actorId, actorRole: input.actorRole, after: { reference, source: input.source } } });

    const fresh = await tx.reservation.findUniqueOrThrow({ where: { id: reservation.id }, include: reservationInclude });
    return toReservationDto(fresh, built.quote);
  });
}

export interface AssignRoomInput {
  reservationRoomId: string;
  roomId: string;
  actorId: string;
  actorRole: string;
}

export async function assignRoom(prisma: PrismaClient, reservationId: string, input: AssignRoomInput): Promise<ReservationDto> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({ where: { id: reservationId }, include: reservationInclude });
    if (!reservation) throw AppError.notFound('Reservation not found.');
    if (!['HELD', 'CONFIRMED', 'CHECKED_IN'].includes(reservation.status)) throw AppError.conflict('NOT_ASSIGNABLE', 'Rooms can only be assigned to active reservations.');

    const room = await tx.physicalRoom.findUnique({ where: { id: input.roomId } });
    if (!room || !room.active) throw AppError.badRequest('ROOM_INACTIVE', 'That room is not available for assignment.');
    const reservationRoom = await tx.reservationRoom.findUnique({ where: { id: input.reservationRoomId } });
    if (!reservationRoom || reservationRoom.reservationId !== reservationId) throw AppError.badRequest('UNKNOWN_ROOM_ITEM', 'That room does not belong to this reservation.');
    if (room.roomTypeId !== reservationRoom.roomTypeId) throw AppError.unprocessable('ROOM_TYPE_MISMATCH', 'The physical room does not match the booked room type.');

    const dates = nightDates(reservation.checkIn.toISOString().slice(0, 10), reservation.checkOut.toISOString().slice(0, 10));
    // Insert night-by-night; the unique(roomId,date) index prevents overlap atomically.
    try {
      await tx.roomAssignmentNight.createMany({
        data: dates.map((d) => ({ roomId: room.id, date: new Date(`${d}T00:00:00.000Z`) })),
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw AppError.conflict('ROOM_UNAVAILABLE', 'That room is already occupied or blocked for one or more of those nights.');
      }
      throw err;
    }
    await tx.roomAssignment.create({
      data: {
        reservationId,
        reservationRoomId: reservationRoom.id,
        roomId: room.id,
        startDate: new Date(`${dates[0]}T00:00:00.000Z`),
        endDate: reservation.checkOut,
        assignedById: input.actorId,
      },
    });
    await tx.auditLog.create({ data: { action: 'reservation.room_assigned', entityType: 'Reservation', entityId: reservationId, actorId: input.actorId, actorRole: input.actorRole, after: { roomId: room.id, roomNumber: room.number } } });
    const fresh = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: reservationInclude });
    return toReservationDto(fresh, reservation.rateSnapshot as never);
  });
}

export async function checkIn(prisma: PrismaClient, reservationId: string, actor: { id: string; role: string; forceReason?: string }): Promise<ReservationDto> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({ where: { id: reservationId }, include: { ...reservationInclude, assignments: { where: { active: true }, include: { room: true } } } });
    if (!reservation) throw AppError.notFound('Reservation not found.');
    if (reservation.status !== 'CONFIRMED') throw AppError.conflict('NOT_CONFIRMED', 'Only confirmed reservations can be checked in.');

    const unready = reservation.assignments.filter((a) => a.room.readiness === 'OUT_OF_ORDER' || a.room.readiness === 'DIRTY');
    if (unready.length > 0 && !actor.forceReason) {
      throw AppError.unprocessable('ROOM_NOT_READY', `Room(s) ${unready.map((a) => a.room.number).join(', ')} are not ready. A supervisor override reason is required.`, { rooms: unready.map((a) => a.room.number) });
    }

    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: { status: 'CHECKED_IN', checkedInAt: new Date(), checkedInById: actor.id, version: { increment: 1 } },
      include: reservationInclude,
    });
    if (actor.forceReason) {
      await tx.auditLog.create({ data: { action: 'reservation.checkin_override', entityType: 'Reservation', entityId: reservationId, actorId: actor.id, actorRole: actor.role, reason: actor.forceReason } });
    }
    await tx.auditLog.create({ data: { action: 'reservation.checked_in', entityType: 'Reservation', entityId: reservationId, actorId: actor.id, actorRole: actor.role } });
    return toReservationDto(updated, reservation.rateSnapshot as never);
  });
}

export async function checkOut(prisma: PrismaClient, reservationId: string, actor: { id: string; role: string }): Promise<ReservationDto> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({ where: { id: reservationId }, include: reservationInclude });
    if (!reservation) throw AppError.notFound('Reservation not found.');
    if (reservation.status !== 'CHECKED_IN') throw AppError.conflict('NOT_CHECKED_IN', 'Only checked-in guests can be checked out.');

    const balance = reservation.totalMinor - reservation.amountPaidMinor;
    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: { status: 'CHECKED_OUT', checkedOutAt: new Date(), checkedOutById: actor.id, version: { increment: 1 } },
      include: { ...reservationInclude, assignments: { where: { active: true }, include: { room: true } } },
    });

    for (const assignment of updated.assignments) {
      await tx.roomAssignmentNight.deleteMany({ where: { roomId: assignment.roomId, date: { gte: assignment.startDate, lt: assignment.endDate } } });
      await tx.roomAssignment.update({ where: { id: assignment.id }, data: { active: false, releasedAt: new Date() } });
      await tx.physicalRoom.update({ where: { id: assignment.roomId }, data: { readiness: 'DIRTY' } });
      const existing = await tx.housekeepingTask.findFirst({ where: { roomId: assignment.roomId, status: { in: ['OPEN', 'IN_PROGRESS'] } } });
      if (!existing) {
        await tx.housekeepingTask.create({
          data: { roomId: assignment.roomId, type: 'CLEAN', priority: 'HIGH', status: 'OPEN', createdById: actor.id, notes: `Checkout cleaning for ${reservation.reference}` },
        });
      }
    }

    await tx.folio.updateMany({ where: { reservationId, status: 'OPEN' }, data: { status: 'CLOSED', closedAt: new Date() } });
    await tx.auditLog.create({ data: { action: 'reservation.checked_out', entityType: 'Reservation', entityId: reservationId, actorId: actor.id, actorRole: actor.role, after: { balanceMinor: Math.max(0, balance) } } });
    return toReservationDto(updated, reservation.rateSnapshot as never);
  });
}

export async function markNoShow(prisma: PrismaClient, reservationId: string, actor: { id: string; role: string; reason?: string }): Promise<ReservationDto> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({ where: { id: reservationId }, include: reservationInclude });
    if (!reservation) throw AppError.notFound('Reservation not found.');
    if (reservation.status !== 'CONFIRMED') throw AppError.conflict('NOT_CONFIRMED', 'Only confirmed reservations can be marked as a no-show.');
    const claimed = await tx.reservation.updateMany({ where: { id: reservationId, status: 'CONFIRMED' }, data: { status: 'NO_SHOW', noShowAt: new Date(), version: { increment: 1 } } });
    if (claimed.count === 0) throw AppError.conflict('STATE_CHANGED', 'The reservation state changed. Please refresh.');
    const deltas = await releaseDeltasForReservation(tx, reservationId);
    await applyInventoryDelta(tx, deltas);
    await tx.auditLog.create({ data: { action: 'reservation.no_show', entityType: 'Reservation', entityId: reservationId, actorId: actor.id, actorRole: actor.role, reason: actor.reason ?? null } });
    const fresh = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: reservationInclude });
    return toReservationDto(fresh, reservation.rateSnapshot as never);
  });
}

export interface RecordPaymentInput {
  reservationId: string;
  amountMinor: number;
  currency: CurrencyCode;
  method: 'CASH' | 'MTN_MOBILE_MONEY' | 'ORANGE_MONEY' | 'BANK_TRANSFER' | 'CARD_TERMINAL';
  transactionReference?: string;
  verified?: boolean;
  settlementCurrency?: CurrencyCode;
  exchangeRate?: string;
  notes?: string;
  actorId: string;
}

export async function recomputePaymentState(tx: Tx, reservationId: string): Promise<void> {
  const reservation = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId } });
  const payments = await tx.payment.findMany({ where: { reservationId, voided: false } });
  const refunds = await tx.refund.findMany({ where: { payment: { reservationId } } });
  const paid = payments.reduce((acc, p) => acc + p.amountMinor, 0);
  const refunded = refunds.reduce((acc, r) => acc + r.amountMinor, 0);
  const net = paid - refunded;
  let state: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' = 'UNPAID';
  if (net <= 0 && refunded > 0) state = 'REFUNDED';
  else if (refunded > 0) state = 'PARTIALLY_REFUNDED';
  else if (net >= reservation.totalMinor && reservation.totalMinor > 0) state = 'PAID';
  else if (net > 0) state = 'PARTIALLY_PAID';
  await tx.reservation.update({ where: { id: reservationId }, data: { amountPaidMinor: net, paymentState: state } });
}

export async function recordPayment(tx: Tx, input: RecordPaymentInput): Promise<{ id: string }> {
  const reservation = await tx.reservation.findUnique({ where: { id: input.reservationId } });
  if (!reservation) throw AppError.notFound('Reservation not found.');
  const payment = await tx.payment.create({
    data: {
      reservationId: input.reservationId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      settlementCurrency: input.settlementCurrency ?? null,
      settlementAmountMinor: input.settlementCurrency && input.exchangeRate ? Math.round((input.amountMinor / 100) * Number(input.exchangeRate) * 100) : null,
      exchangeRate: input.exchangeRate ? new Prisma.Decimal(input.exchangeRate) : null,
      rateCapturedAt: input.exchangeRate ? new Date() : null,
      method: input.method,
      transactionReference: input.transactionReference || null,
      verified: input.verified ?? false,
      notes: input.notes || null,
      recordedById: input.actorId,
    },
  });
  await recomputePaymentState(tx, input.reservationId);
  await tx.auditLog.create({ data: { action: 'payment.recorded', entityType: 'Payment', entityId: payment.id, actorId: input.actorId, after: { amountMinor: input.amountMinor, currency: input.currency, method: input.method, verified: input.verified ?? false } } });
  return { id: payment.id };
}
