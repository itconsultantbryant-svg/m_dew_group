import { money, type CurrencyCode, type QuoteDto, type ReservationDto, type ReservationRoomDto } from '@mdg/domain';
import type { Prisma } from '@prisma/client';

export const reservationInclude = {
  property: { select: { id: true, name: true } },
  hold: { select: { expiresAt: true } },
  rooms: { include: { roomType: { select: { name: true } }, assignments: { where: { active: true }, include: { room: { select: { number: true } } } } } },
} satisfies Prisma.ReservationInclude;

export type ReservationWithRelations = Prisma.ReservationGetPayload<{ include: typeof reservationInclude }>;

export function toReservationDto(r: ReservationWithRelations, quote: QuoteDto): ReservationDto {
  const currency = r.currency as CurrencyCode;
  const rooms: ReservationRoomDto[] = r.rooms.map((room) => {
    const nightly = (room.nightlyRates as { date: string; minor: number }[]).map((n) => money(n.minor, currency));
    const activeAssignment = room.assignments.find((a) => a.active);
    return {
      id: room.id,
      roomTypeId: room.roomTypeId,
      roomTypeName: room.roomType.name,
      ratePlanId: room.ratePlanId,
      quantity: room.quantity,
      adults: room.adults,
      children: room.children,
      childAges: room.childAges,
      assignedRoomId: activeAssignment?.roomId ?? null,
      assignedRoomNumber: activeAssignment?.room.number ?? null,
      nightly,
      subtotal: money(room.subtotalMinor, currency),
      taxesAndFees: money(room.taxesMinor + room.feesMinor, currency),
      total: money(room.totalMinor, currency),
    };
  });

  const balance = Math.max(0, r.totalMinor - r.amountPaidMinor);

  return {
    id: r.id,
    reference: r.reference,
    propertyId: r.propertyId,
    propertyName: r.property.name,
    status: r.status,
    paymentState: r.paymentState,
    source: r.source,
    checkIn: r.checkIn.toISOString().slice(0, 10),
    checkOut: r.checkOut.toISOString().slice(0, 10),
    nights: r.nights,
    currency,
    leadGuestName: r.leadGuestName,
    leadGuestEmail: r.leadGuestEmail,
    leadGuestPhone: r.leadGuestPhone,
    estimatedArrivalTime: r.estimatedArrivalTime,
    specialRequests: r.specialRequests,
    rooms,
    quote,
    balanceDue: money(balance, currency),
    amountPaid: money(r.amountPaidMinor, currency),
    holdExpiresAt: r.hold ? r.hold.expiresAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    checkedInAt: r.checkedInAt?.toISOString() ?? null,
    checkedOutAt: r.checkedOutAt?.toISOString() ?? null,
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
  };
}

export function quoteFromSnapshot(snapshot: unknown): QuoteDto {
  return snapshot as QuoteDto;
}
