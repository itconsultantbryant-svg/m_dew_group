import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma, type PrismaClient } from '@prisma/client';
import { money, ROLES, type CurrencyCode } from '@mdg/domain';
import { housekeepingTaskSchema, modifyReservationSchema, recordPaymentSchema, refundSchema, roomBlockSchema, staffLoginSchema } from '@mdg/validation';
import { prisma } from '../db/prisma.js';
import { AppError } from '../lib/errors.js';
import { hashPassword } from '../lib/passwords.js';
import { requireStaff } from '../auth/auth.js';
import { assignRoom, checkIn, checkOut, markNoShow, recordPayment, recomputePaymentState, staffCreateReservation } from '../services/frontdesk.js';
import { cancelReservation, modifyReservation } from '../services/booking.js';
import { applyBlockDelta } from '../inventory/inventory.js';
import { releaseExpiredHolds } from '../services/holds.js';
import { processOutbox } from '../services/notifications.js';
import { enqueueNotification } from '../services/notifications.js';
import { reservationInclude, toReservationDto, quoteFromSnapshot } from '../services/reservationMapper.js';

function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', result.error.flatten());
  return result.data;
}

async function audit(actorId: string, actorRole: string, action: string, entityType: string, entityId: string | null, extra?: { before?: unknown; after?: unknown; reason?: string }) {
  await prisma.auditLog.create({
    data: {
      actorId,
      actorRole,
      action,
      entityType,
      entityId,
      before: extra?.before as Prisma.InputJsonValue | undefined,
      after: extra?.after as Prisma.InputJsonValue | undefined,
      reason: extra?.reason,
    },
  });
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function registerStaffRoutes(app: FastifyInstance): Promise<void> {
  app.get('/staff/dashboard', { preHandler: requireStaff('dashboard:view'), schema: { tags: ['staff'], summary: 'Operational dashboard' } }, async () => {
    await releaseExpiredHolds(prisma);
    const today = new Date();
    const todayStr = day(today);
    const start = new Date(`${todayStr}T00:00:00.000Z`);
    const end = new Date(`${todayStr}T23:59:59.999Z`);

    const [arrivals, departures, inHouse, rooms, dirty, pendingRequests, outstanding, heldCount] = await Promise.all([
      prisma.reservation.findMany({ where: { checkIn: { gte: start, lte: end }, status: { in: ['CONFIRMED', 'HELD'] } }, include: reservationInclude, orderBy: { leadGuestName: 'asc' } }),
      prisma.reservation.findMany({ where: { checkOut: { gte: start, lte: end }, status: 'CHECKED_IN' }, include: reservationInclude }),
      prisma.reservation.count({ where: { status: 'CHECKED_IN' } }),
      prisma.physicalRoom.findMany({ where: { active: true }, select: { id: true, number: true, readiness: true, roomTypeId: true } }),
      prisma.physicalRoom.count({ where: { readiness: { in: ['DIRTY', 'IN_PROGRESS'] }, active: true } }),
      prisma.guestRequest.count({ where: { status: 'PENDING' } }),
      prisma.reservation.findMany({ where: { status: { in: ['CONFIRMED', 'CHECKED_IN'] } }, select: { totalMinor: true, amountPaidMinor: true, currency: true } }),
      prisma.reservation.count({ where: { status: 'HELD' } }),
    ]);

    const outstandingMinor = outstanding.reduce((acc, r) => acc + Math.max(0, r.totalMinor - r.amountPaidMinor), 0);
    const outOfOrder = rooms.filter((r) => r.readiness === 'OUT_OF_ORDER').length;

    return {
      date: todayStr,
      arrivals: arrivals.map((r) => toReservationDto(r, quoteFromSnapshot(r.rateSnapshot))),
      departures: departures.map((r) => toReservationDto(r, quoteFromSnapshot(r.rateSnapshot))),
      inHouse,
      rooms: {
        total: rooms.length,
        available: rooms.length - dirty - outOfOrder,
        dirty,
        outOfOrder,
      },
      pendingRequests,
      holds: heldCount,
      outstanding: money(outstandingMinor),
    };
  });

  // ---- reservations ----
  app.get('/staff/reservations', { preHandler: requireStaff('reservation:read'), schema: { tags: ['staff'], summary: 'Search reservations' } }, async (request) => {
    const q = request.query as { q?: string; status?: string; from?: string; to?: string; page?: string; pageSize?: string };
    const page = Math.max(1, Number(q.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 25)));
    const where: Prisma.ReservationWhereInput = {};
    if (q.status) where.status = q.status as never;
    if (q.from) where.checkOut = { gte: new Date(`${q.from}T00:00:00.000Z`) };
    if (q.to) where.checkIn = { lte: new Date(`${q.to}T00:00:00.000Z`) };
    if (q.q) {
      where.OR = [
        { reference: { contains: q.q.toUpperCase() } },
        { leadGuestName: { contains: q.q, mode: 'insensitive' } },
        { leadGuestPhone: { contains: q.q } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.reservation.findMany({ where, include: reservationInclude, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.reservation.count({ where }),
    ]);
    return { items: items.map((r) => toReservationDto(r, quoteFromSnapshot(r.rateSnapshot))), page, pageSize, total };
  });

  app.get('/staff/reservations/:id', { preHandler: requireStaff('reservation:read'), schema: { tags: ['staff'], summary: 'Reservation detail with folio and requests' } }, async (request) => {
    const { id } = request.params as { id: string };
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { ...reservationInclude, requests: { orderBy: { createdAt: 'desc' } }, folio: { include: { charges: { orderBy: { createdAt: 'asc' } } } }, payments: { orderBy: { createdAt: 'desc' }, include: { refunds: true } } },
    });
    if (!reservation) throw AppError.notFound('Reservation not found.');
    return { reservation: toReservationDto(reservation, quoteFromSnapshot(reservation.rateSnapshot)), requests: reservation.requests, folio: reservation.folio, payments: reservation.payments };
  });

  app.post('/staff/reservations', { preHandler: requireStaff('reservation:create'), schema: { tags: ['staff'], summary: 'Create a walk-in, phone or staff reservation' } }, async (request) => {
    const body = parse(
      z.object({
        source: z.enum(['WALK_IN', 'PHONE', 'STAFF', 'ONLINE']).default('STAFF'),
        checkIn: z.string(),
        checkOut: z.string(),
        rooms: z.array(z.object({ roomTypeId: z.string().uuid(), ratePlanId: z.string().uuid().optional(), quantity: z.number().int().min(1), adults: z.number().int().min(1), children: z.number().int().default(0) })),
        leadGuest: z.object({ firstName: z.string().min(1), lastName: z.string().min(1), email: z.string().email().optional().or(z.literal('')), phoneCountryCode: z.string(), phoneNumber: z.string(), notes: z.string().optional() }),
        arrivalTime: z.string().optional(),
        specialRequests: z.string().optional(),
        initialPaymentMinor: z.number().int().min(0).optional(),
        paymentMethod: z.enum(['CASH', 'MTN_MOBILE_MONEY', 'ORANGE_MONEY', 'BANK_TRANSFER', 'CARD_TERMINAL']).optional(),
      }),
      request.body,
    );
    const property = await prisma.property.findFirstOrThrow({ where: { isPublished: true } });
    return staffCreateReservation(prisma, { ...body, propertyId: property.id, actorId: request.auth!.id, actorRole: request.auth!.role! });
  });

  app.post('/staff/reservations/:id/assign-room', { preHandler: requireStaff('reservation:assign_room'), schema: { tags: ['staff'], summary: 'Assign a physical room' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(z.object({ reservationRoomId: z.string().uuid(), roomId: z.string().uuid() }), request.body);
    return assignRoom(prisma, id, { ...body, actorId: request.auth!.id, actorRole: request.auth!.role! });
  });

  app.post('/staff/reservations/:id/checkin', { preHandler: requireStaff('reservation:checkin'), schema: { tags: ['staff'], summary: 'Check a guest in' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(z.object({ forceReason: z.string().max(300).optional() }), request.body ?? {});
    return checkIn(prisma, id, { id: request.auth!.id, role: request.auth!.role!, forceReason: body.forceReason });
  });

  app.post('/staff/reservations/:id/checkout', { preHandler: requireStaff('reservation:checkout'), schema: { tags: ['staff'], summary: 'Check a guest out and raise a cleaning task' } }, async (request) => {
    const { id } = request.params as { id: string };
    return checkOut(prisma, id, { id: request.auth!.id, role: request.auth!.role! });
  });

  app.post('/staff/reservations/:id/no-show', { preHandler: requireStaff('reservation:cancel'), schema: { tags: ['staff'], summary: 'Record a no-show (no money treated as collected)' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(z.object({ reason: z.string().max(300).optional() }), request.body ?? {});
    return markNoShow(prisma, id, { id: request.auth!.id, role: request.auth!.role!, reason: body.reason });
  });

  app.post('/staff/reservations/:id/cancel', { preHandler: requireStaff('reservation:cancel'), schema: { tags: ['staff'], summary: 'Cancel a reservation' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(z.object({ reason: z.string().max(300).optional() }), request.body ?? {});
    const reservation = await prisma.reservation.findUnique({ where: { id } });
    if (!reservation) throw AppError.notFound('Reservation not found.');
    return cancelReservation(prisma, id, { reference: reservation.reference, reason: body.reason, actorId: request.auth!.id, actorRole: request.auth!.role });
  });

  app.patch('/staff/reservations/:id', { preHandler: requireStaff('reservation:update'), schema: { tags: ['staff'], summary: 'Modify dates/rooms transactionally' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(modifyReservationSchema.omit({ idempotencyKey: true }).extend({ acceptedFingerprint: z.string().optional() }), request.body);
    return modifyReservation(prisma, id, { changes: { checkIn: body.checkIn, checkOut: body.checkOut, rooms: body.rooms }, acceptedFingerprint: body.acceptedFingerprint, reason: body.reason, actorId: request.auth!.id, actorRole: request.auth!.role });
  });

  app.post('/staff/reservations/:id/resend-confirmation', { preHandler: requireStaff('notification:retry'), schema: { tags: ['staff'], summary: 'Resend the confirmation message' } }, async (request) => {
    const { id } = request.params as { id: string };
    const reservation = await prisma.reservation.findUnique({ where: { id } });
    if (!reservation) throw AppError.notFound('Reservation not found.');
    await enqueueNotification(prisma as never, {
      channel: reservation.leadGuestEmail ? 'EMAIL' : 'SMS',
      recipient: reservation.leadGuestEmail ?? reservation.leadGuestPhone,
      subject: `Reservation ${reservation.reference}`,
      body: `Your reservation ${reservation.reference} is confirmed. Payment is due at the property on arrival.`,
      templateCode: 'reservation.confirmed',
      reservationId: id,
      topic: 'notification.resend',
    });
    return { ok: true };
  });

  // ---- rooms & inventory ----
  app.get('/staff/rooms', { preHandler: requireStaff('inventory:read'), schema: { tags: ['staff'], summary: 'Physical rooms and readiness' } }, async (request) => {
    const q = request.query as { date?: string };
    const rooms = await prisma.physicalRoom.findMany({ include: { roomType: { select: { name: true, slug: true } } }, orderBy: { number: 'asc' } });
    return { rooms };
  });

  app.get('/staff/room-calendar', { preHandler: requireStaff('inventory:read'), schema: { tags: ['staff'], summary: 'Occupancy calendar for a date range' } }, async (request) => {
    const q = request.query as { from?: string; to?: string };
    const from = q.from ?? new Date().toISOString().slice(0, 10);
    const to = q.to ?? day(new Date(Date.now() + 29 * 86_400_000));
    const [reservations, blocks] = await Promise.all([
      prisma.reservation.findMany({
        where: { status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] }, checkIn: { lt: new Date(`${to}T00:00:00.000Z`) }, checkOut: { gt: new Date(`${from}T00:00:00.000Z`) } },
        include: { rooms: { include: { assignments: { where: { active: true }, include: { room: { select: { id: true, number: true } } } } } } },
      }),
      prisma.maintenanceBlock.findMany({ where: { active: true, startDate: { lt: new Date(`${to}T00:00:00.000Z`) }, endDate: { gt: new Date(`${from}T00:00:00.000Z`) } }, include: { room: { select: { id: true, number: true } } } }),
    ]);
    return {
      from,
      to,
      reservations: reservations.map((r) => ({ id: r.id, reference: r.reference, status: r.status, checkIn: day(r.checkIn), checkOut: day(r.checkOut), assignedRoomIds: r.rooms.flatMap((room) => room.assignments.map((a) => a.room.id)) })),
      blocks: blocks.map((b) => ({ id: b.id, roomId: b.roomId, roomNumber: b.room.number, startDate: day(b.startDate), endDate: day(b.endDate), kind: b.kind, reason: b.reason })),
    };
  });

  app.get('/staff/room-blocks', { preHandler: requireStaff('maintenance:read'), schema: { tags: ['staff'], summary: 'List maintenance/out-of-order blocks' } }, async () => {
    return {
      blocks: await prisma.maintenanceBlock.findMany({ where: { active: true }, include: { room: { select: { number: true } } }, orderBy: { startDate: 'asc' } }),
    };
  });

  app.post('/staff/room-blocks', { preHandler: requireStaff('inventory:block'), schema: { tags: ['staff'], summary: 'Block a room for maintenance or out-of-order' } }, async (request) => {
    const body = parse(roomBlockSchema, request.body);
    const room = await prisma.physicalRoom.findUnique({ where: { id: body.roomId } });
    if (!room) throw AppError.notFound('Room not found.');
    if (body.endDate <= body.startDate) throw AppError.badRequest('INVALID_RANGE', 'End date must be after the start date.');
    return prisma.$transaction(async (tx) => {
      const block = await tx.maintenanceBlock.create({
        data: { roomId: body.roomId, startDate: new Date(`${body.startDate}T00:00:00.000Z`), endDate: new Date(`${body.endDate}T00:00:00.000Z`), kind: body.kind, reason: body.reason, createdById: request.auth!.id },
      });
      const dates = nightsBetween(body.startDate, body.endDate);
      await applyBlockDelta(tx, dates.map((d) => ({ roomTypeId: room.roomTypeId, date: d, quantity: 1 })));
      if (body.kind === 'OUT_OF_ORDER') await tx.physicalRoom.update({ where: { id: body.roomId }, data: { readiness: 'OUT_OF_ORDER' } });
      await tx.auditLog.create({ data: { action: 'inventory.blocked', entityType: 'PhysicalRoom', entityId: room.id, actorId: request.auth!.id, actorRole: request.auth!.role, after: { kind: body.kind, startDate: body.startDate, endDate: body.endDate } } });
      return block;
    });
  });

  app.delete('/staff/room-blocks/:id', { preHandler: requireStaff('inventory:block'), schema: { tags: ['staff'], summary: 'Release a maintenance block' } }, async (request) => {
    const { id } = request.params as { id: string };
    const block = await prisma.maintenanceBlock.findUnique({ where: { id }, include: { room: true } });
    if (!block) throw AppError.notFound('Block not found.');
    if (!block.active) return { ok: true };
    return prisma.$transaction(async (tx) => {
      await tx.maintenanceBlock.update({ where: { id }, data: { active: false, releasedAt: new Date() } });
      const dates = nightsBetween(day(block.startDate), day(block.endDate));
      await applyBlockDelta(tx, dates.map((d) => ({ roomTypeId: block.room.roomTypeId, date: d, quantity: -1 })));
      await tx.auditLog.create({ data: { action: 'inventory.unblocked', entityType: 'PhysicalRoom', entityId: block.roomId, actorId: request.auth!.id, actorRole: request.auth!.role } });
      return { ok: true };
    });
  });

  app.patch('/staff/rooms/:id/readiness', { preHandler: requireStaff('housekeeping:update'), schema: { tags: ['staff'], summary: 'Update room readiness' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(z.object({ readiness: z.enum(['CLEAN', 'DIRTY', 'IN_PROGRESS', 'INSPECTED', 'OUT_OF_ORDER']) }), request.body);
    const room = await prisma.physicalRoom.update({ where: { id }, data: { readiness: body.readiness } });
    await audit(request.auth!.id, request.auth!.role!, 'room.readiness', 'PhysicalRoom', id, { after: { readiness: body.readiness } });
    return room;
  });

  // ---- housekeeping ----
  app.get('/staff/housekeeping/tasks', { preHandler: requireStaff('housekeeping:read'), schema: { tags: ['staff'], summary: 'List housekeeping tasks' } }, async (request) => {
    const q = request.query as { status?: string };
    return {
      tasks: await prisma.housekeepingTask.findMany({ where: q.status ? { status: q.status as never } : {}, include: { room: { select: { number: true } }, assignee: { select: { fullName: true } } }, orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }] }),
    };
  });

  app.post('/staff/housekeeping/tasks', { preHandler: requireStaff('housekeeping:update'), schema: { tags: ['staff'], summary: 'Create a housekeeping task' } }, async (request) => {
    const body = parse(housekeepingTaskSchema, request.body);
    const task = await prisma.housekeepingTask.create({
      data: { roomId: body.roomId, type: body.type, priority: body.priority, dueAt: body.dueAt ? new Date(body.dueAt) : null, assigneeId: body.assigneeId ?? null, notes: body.notes || null, createdById: request.auth!.id },
    });
    return task;
  });

  app.patch('/staff/housekeeping/tasks/:id', { preHandler: requireStaff('housekeeping:update'), schema: { tags: ['staff'], summary: 'Update a housekeeping task' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'INSPECTED', 'CANCELLED']).optional(), assigneeId: z.string().uuid().nullable().optional(), notes: z.string().max(500).optional() }), request.body);
    const data: Prisma.HousekeepingTaskUpdateInput = {};
    if (body.status) {
      data.status = body.status;
      if (body.status === 'DONE') data.completedAt = new Date();
      if (body.status === 'INSPECTED') data.inspectedAt = new Date();
    }
    if (body.assigneeId !== undefined) data.assignee = body.assigneeId ? { connect: { id: body.assigneeId } } : { disconnect: true };
    if (body.notes !== undefined) data.notes = body.notes;
    const task = await prisma.housekeepingTask.update({ where: { id }, data });
    if (body.status === 'DONE') await prisma.physicalRoom.update({ where: { id: task.roomId }, data: { readiness: 'CLEAN' } });
    if (body.status === 'INSPECTED') {
      await prisma.physicalRoom.update({ where: { id: task.roomId }, data: { readiness: 'INSPECTED' } });
      await audit(request.auth!.id, request.auth!.role!, 'housekeeping.inspected', 'HousekeepingTask', id, {});
    }
    return task;
  });

  // ---- payments ----
  app.post('/staff/payments', { preHandler: requireStaff('payment:record'), schema: { tags: ['staff'], summary: 'Record a payment taken at the property' } }, async (request) => {
    const body = parse(recordPaymentSchema, request.body);
    return prisma.$transaction(async (tx) =>
      recordPayment(tx, {
        reservationId: body.reservationId,
        amountMinor: body.amountMinor,
        currency: body.currency,
        method: body.method,
        transactionReference: body.transactionReference || undefined,
        verified: body.verified,
        settlementCurrency: body.settlementCurrency,
        exchangeRate: body.exchangeRate,
        notes: body.notes || undefined,
        actorId: request.auth!.id,
      }),
    );
  });

  app.post('/staff/refunds', { preHandler: requireStaff('payment:refund'), schema: { tags: ['staff'], summary: 'Approve a refund' } }, async (request) => {
    const body = parse(refundSchema, request.body);
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: body.paymentId } });
      if (!payment) throw AppError.notFound('Payment not found.');
      const alreadyRefunded = await tx.refund.aggregate({ where: { paymentId: payment.id }, _sum: { amountMinor: true } });
      if ((alreadyRefunded._sum.amountMinor ?? 0) + body.amountMinor > payment.amountMinor) throw AppError.unprocessable('REFUND_EXCEEDS_PAYMENT', 'The refund exceeds the recorded payment.');
      const refund = await tx.refund.create({ data: { paymentId: payment.id, amountMinor: body.amountMinor, currency: payment.currency, reason: body.reason, approvedById: request.auth!.id } });
      await recomputePaymentState(tx, payment.reservationId);
      await tx.auditLog.create({ data: { action: 'payment.refunded', entityType: 'Refund', entityId: refund.id, actorId: request.auth!.id, actorRole: request.auth!.role, reason: body.reason, after: { amountMinor: body.amountMinor } } });
      return refund;
    });
  });

  // ---- reports ----
  app.get('/staff/reports/summary', { preHandler: requireStaff('report:view'), schema: { tags: ['staff'], summary: 'Occupancy, ADR, RevPAR, revenue and cash metrics' } }, async (request) => {
    const q = request.query as { from?: string; to?: string };
    const from = q.from ?? day(new Date(Date.now() - 29 * 86_400_000));
    const to = q.to ?? day(new Date());
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    const report = await computeReport(prisma, from, to, start, end);
    return report;
  });

  app.get('/staff/reports/export', { preHandler: requireStaff('report:export'), schema: { tags: ['staff'], summary: 'CSV export of reservations (spreadsheet-safe escaping)' } }, async (request, reply) => {
    const q = request.query as { from?: string; to?: string };
    const from = q.from ?? day(new Date(Date.now() - 29 * 86_400_000));
    const to = q.to ?? day(new Date());
    const reservations = await prisma.reservation.findMany({
      where: { checkIn: { lte: new Date(`${to}T00:00:00.000Z`) }, checkOut: { gte: new Date(`${from}T00:00:00.000Z`) } },
      include: { property: { select: { name: true } }, rooms: { include: { roomType: { select: { name: true } } } } },
      orderBy: { checkIn: 'asc' },
    });
    const header = ['reference', 'status', 'payment_state', 'source', 'check_in', 'check_out', 'nights', 'lead_guest', 'phone', 'room_types', 'total', 'paid', 'balance', 'currency'];
    const rows = reservations.map((r) => [
      r.reference,
      r.status,
      r.paymentState,
      r.source,
      day(r.checkIn),
      day(r.checkOut),
      String(r.nights),
      r.leadGuestName,
      r.leadGuestPhone,
      r.rooms.map((room) => room.roomType.name).join('; '),
      (r.totalMinor / 100).toFixed(2),
      (r.amountPaidMinor / 100).toFixed(2),
      (Math.max(0, r.totalMinor - r.amountPaidMinor) / 100).toFixed(2),
      r.currency,
    ]);
    const csv = [header, ...rows].map((cols) => cols.map(csvCell).join(',')).join('\r\n');
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="mdg-reservations-${from}-to-${to}.csv"`);
    return csv;
  });

  // ---- notifications ----
  app.get('/staff/notifications', { preHandler: requireStaff('notification:read'), schema: { tags: ['staff'], summary: 'Notification delivery queue and failures' } }, async (request) => {
    const q = request.query as { status?: string };
    return {
      notifications: await prisma.notification.findMany({ where: q.status ? { status: q.status as never } : {}, orderBy: { createdAt: 'desc' }, take: 100 }),
      jobs: await prisma.outboxJob.findMany({ where: { status: { in: ['PENDING', 'PROCESSING', 'FAILED', 'DEAD'] } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    };
  });

  app.post('/staff/notifications/process', { preHandler: requireStaff('notification:retry'), schema: { tags: ['staff'], summary: 'Process the outbox now' } }, async () => {
    return processOutbox(prisma);
  });

  // ---- guests ----
  app.get('/staff/guests', { preHandler: requireStaff('guest:read'), schema: { tags: ['staff'], summary: 'Search guest profiles' } }, async (request) => {
    const q = request.query as { q?: string };
    const where: Prisma.GuestProfileWhereInput = q.q
      ? { OR: [{ firstName: { contains: q.q, mode: 'insensitive' } }, { lastName: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }, { phoneNumber: { contains: q.q } }] }
      : {};
    return { guests: await prisma.guestProfile.findMany({ where, include: { reservations: { select: { reference: true, status: true, checkIn: true, checkOut: true } } }, orderBy: { updatedAt: 'desc' }, take: 50 }) };
  });

  // ---- content management ----
  app.get('/staff/content', { preHandler: requireStaff('content:read'), schema: { tags: ['staff'], summary: 'Content blocks and FAQs' } }, async () => ({
    blocks: await prisma.contentBlock.findMany({ orderBy: { key: 'asc' } }),
    faqs: await prisma.faq.findMany({ orderBy: { sortOrder: 'asc' } }),
  }));

  app.get('/staff/content/catalog', { preHandler: requireStaff('content:read'), schema: { tags: ['staff'], summary: 'Full content catalogue including unpublished items' } }, async () => {
    const [blocks, faqs, menuCategories, collections, events] = await Promise.all([
      prisma.contentBlock.findMany({ orderBy: { key: 'asc' } }),
      prisma.faq.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.restaurantMenuCategory.findMany({ include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } }),
      prisma.boutiqueCollection.findMany({ include: { products: { orderBy: { name: 'asc' } } }, orderBy: { sortOrder: 'asc' } }),
      prisma.event.findMany({ orderBy: { startsAt: 'asc' }, take: 100 }),
    ]);
    return { blocks, faqs, menuCategories, collections, events };
  });

  app.put('/staff/content/:key', { preHandler: requireStaff('content:edit'), schema: { tags: ['staff'], summary: 'Upsert a content block' } }, async (request) => {
    const { key } = request.params as { key: string };
    const body = parse(z.object({ title: z.string().max(200).optional(), body: z.string().max(10000).optional(), data: z.unknown().optional(), status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT') }), request.body);
    const property = await prisma.property.findFirst({ where: { isPublished: true } });
    const block = await prisma.contentBlock.upsert({
      where: { key },
      update: { title: body.title, body: body.body, data: body.data as Prisma.InputJsonValue | undefined, status: body.status, updatedById: request.auth!.id },
      create: { key, title: body.title, body: body.body, data: body.data as Prisma.InputJsonValue | undefined, status: body.status, propertyId: property?.id ?? null, updatedById: request.auth!.id },
    });
    await audit(request.auth!.id, request.auth!.role!, 'content.upsert', 'ContentBlock', block.id, { after: { key, status: body.status } });
    return block;
  });

  app.put('/staff/menu/items/:id', { preHandler: requireStaff('menu:manage'), schema: { tags: ['staff'], summary: 'Update a menu item (availability, sold-out, allergens)' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(z.object({ isAvailable: z.boolean().optional(), soldOut: z.boolean().optional(), priceMinor: z.number().int().min(0).optional(), allergens: z.array(z.string()).optional(), dietaryLabels: z.array(z.string()).optional(), isDailySpecial: z.boolean().optional() }), request.body);
    return prisma.menuItem.update({ where: { id }, data: body });
  });

  app.put('/staff/boutique/products/:id', { preHandler: requireStaff('boutique:manage'), schema: { tags: ['staff'], summary: 'Update a boutique product' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(z.object({ isPublished: z.boolean().optional(), priceMinor: z.number().int().min(0).optional(), description: z.string().max(4000).optional() }), request.body);
    return prisma.product.update({ where: { id }, data: body });
  });

  app.put('/staff/experiences/events/:id', { preHandler: requireStaff('events:manage'), schema: { tags: ['staff'], summary: 'Update an event' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(z.object({ isPublished: z.boolean().optional(), title: z.string().max(200).optional(), description: z.string().max(4000).optional() }), request.body);
    return prisma.event.update({ where: { id }, data: body });
  });

  app.get('/staff/audit', { preHandler: requireStaff('audit:read'), schema: { tags: ['staff'], summary: 'Recent audit log entries' } }, async () => ({
    entries: await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
  }));

  // ---- admin: real-time operations overview ----
  // A single endpoint the admin dashboard polls for live KPIs so the sidebar
  // shell never needs to fan out to a dozen requests every few seconds.
  app.get('/staff/admin/overview', { preHandler: requireStaff('dashboard:view'), schema: { tags: ['staff'], summary: 'Real-time operations overview for the admin dashboard' } }, async () => {
    await releaseExpiredHolds(prisma);
    const todayStr = day(new Date());
    const start = new Date(`${todayStr}T00:00:00.000Z`);
    const end = new Date(`${todayStr}T23:59:59.999Z`);
    const now = new Date();

    const [
      arrivals,
      departures,
      inHouse,
      roomTotal,
      dirty,
      outOfOrder,
      openTasks,
      inProgressTasks,
      pendingRequests,
      activeHolds,
      outstandingRows,
      paymentsToday,
      refundsToday,
      notificationsPending,
      notificationsFailed,
      activeSessions,
      recentReservations,
      auditEntries,
      occupancy,
    ] = await Promise.all([
      prisma.reservation.findMany({ where: { checkIn: { gte: start, lte: end }, status: { in: ['CONFIRMED', 'HELD'] } }, include: reservationInclude, orderBy: { leadGuestName: 'asc' }, take: 25 }),
      prisma.reservation.findMany({ where: { checkOut: { gte: start, lte: end }, status: 'CHECKED_IN' }, include: reservationInclude, take: 25 }),
      prisma.reservation.count({ where: { status: 'CHECKED_IN' } }),
      prisma.physicalRoom.count({ where: { active: true } }),
      prisma.physicalRoom.count({ where: { readiness: { in: ['DIRTY', 'IN_PROGRESS'] }, active: true } }),
      prisma.physicalRoom.count({ where: { readiness: 'OUT_OF_ORDER', active: true } }),
      prisma.housekeepingTask.count({ where: { status: 'OPEN' } }),
      prisma.housekeepingTask.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.guestRequest.count({ where: { status: 'PENDING' } }),
      prisma.reservation.count({ where: { status: 'HELD' } }),
      prisma.reservation.findMany({ where: { status: { in: ['CONFIRMED', 'CHECKED_IN'] } }, select: { totalMinor: true, amountPaidMinor: true } }),
      prisma.payment.aggregate({ where: { createdAt: { gte: start, lte: end }, voided: false }, _sum: { amountMinor: true }, _count: { _all: true } }),
      prisma.refund.aggregate({ where: { createdAt: { gte: start, lte: end } }, _sum: { amountMinor: true } }),
      prisma.notification.count({ where: { status: 'PENDING' as never } }),
      prisma.notification.count({ where: { status: 'FAILED' as never } }),
      prisma.staffSession.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
      prisma.reservation.findMany({ include: reservationInclude, orderBy: { createdAt: 'desc' }, take: 6 }),
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
      prisma.$queryRaw<{ occupied: bigint; available: bigint }[]>`
        SELECT
          (SELECT COUNT(*)::bigint
             FROM reservation_room_nights rn
             JOIN reservations r ON r.id = rn."reservationId"
            WHERE rn.date = ${todayStr}::date
              AND r.status IN ('CONFIRMED','CHECKED_IN','CHECKED_OUT')) AS occupied,
          (SELECT COALESCE(SUM(capacity - blocked), 0)::bigint
             FROM room_type_nights WHERE date = ${todayStr}::date) AS available
      `,
    ]);

    const outstandingMinor = outstandingRows.reduce((acc, r) => acc + Math.max(0, r.totalMinor - r.amountPaidMinor), 0);
    const occupied = Number(occupancy[0]?.occupied ?? 0n);
    const availableNights = Number(occupancy[0]?.available ?? 0n);
    const occupancyRatePercent = availableNights ? Math.round((occupied / availableNights) * 1000) / 10 : 0;

    return {
      generatedAt: now.toISOString(),
      date: todayStr,
      kpis: {
        inHouse,
        arrivals: arrivals.length,
        departures: departures.length,
        activeHolds,
        pendingRequests,
        openTasks,
        inProgressTasks,
        notificationsPending,
        notificationsFailed,
        activeSessions,
        occupancyRatePercent,
        outstanding: money(outstandingMinor),
        collectedToday: money(paymentsToday._sum.amountMinor ?? 0),
        paymentsTodayCount: paymentsToday._count._all,
        refundedToday: money(refundsToday._sum.amountMinor ?? 0),
      },
      rooms: { total: roomTotal, dirty, outOfOrder, available: Math.max(0, roomTotal - dirty - outOfOrder) },
      arrivals: arrivals.map((r) => toReservationDto(r, quoteFromSnapshot(r.rateSnapshot))),
      departures: departures.map((r) => toReservationDto(r, quoteFromSnapshot(r.rateSnapshot))),
      recentReservations: recentReservations.map((r) => toReservationDto(r, quoteFromSnapshot(r.rateSnapshot))),
      audit: auditEntries,
    };
  });

  // ---- admin: team / staff account management ----
  const userSelect = { id: true, email: true, fullName: true, role: true, isActive: true, totpEnabled: true, lastLoginAt: true, createdAt: true } as const;

  app.get('/staff/users', { preHandler: requireStaff('staff:manage'), schema: { tags: ['staff'], summary: 'List staff accounts' } }, async () => ({
    users: await prisma.user.findMany({ select: userSelect, orderBy: { createdAt: 'asc' } }),
    roles: ROLES,
  }));

  app.post('/staff/users', { preHandler: requireStaff('staff:manage'), schema: { tags: ['staff'], summary: 'Create a staff account' } }, async (request) => {
    const body = parse(
      z.object({
        email: z.string().email(),
        fullName: z.string().min(1).max(120),
        role: z.enum(ROLES as unknown as [string, ...string[]]),
        password: z.string().min(12).max(200),
      }),
      request.body,
    );
    const email = body.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw AppError.conflict('EMAIL_IN_USE', 'A user with that email address already exists.');
    const user = await prisma.user.create({ data: { email, fullName: body.fullName, role: body.role as never, passwordHash: hashPassword(body.password) }, select: userSelect });
    await audit(request.auth!.id, request.auth!.role!, 'staff.created', 'User', user.id, { after: { email, role: body.role } });
    return user;
  });

  app.patch('/staff/users/:id', { preHandler: requireStaff('staff:manage'), schema: { tags: ['staff'], summary: 'Update a staff account (role, name, password, active)' } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(
      z.object({
        isActive: z.boolean().optional(),
        role: z.enum(ROLES as unknown as [string, ...string[]]).optional(),
        fullName: z.string().min(1).max(120).optional(),
        password: z.string().min(12).max(200).optional(),
      }),
      request.body,
    );
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw AppError.notFound('User not found.');
    if (target.id === request.auth!.id && body.isActive === false) throw AppError.badRequest('CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account.');

    const data: Prisma.UserUpdateInput = {};
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.role) data.role = body.role as never;
    if (body.fullName) data.fullName = body.fullName;
    if (body.password) data.passwordHash = hashPassword(body.password);

    const user = await prisma.user.update({ where: { id }, data, select: userSelect });
    if (body.password || body.isActive === false) {
      await prisma.staffSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await audit(request.auth!.id, request.auth!.role!, 'staff.updated', 'User', id, { after: { isActive: user.isActive, role: user.role, passwordReset: Boolean(body.password) } });
    return user;
  });
}

function csvCell(value: string): string {
  // Neutralise spreadsheet formula injection and quote safely.
  const needsFormulaGuard = /^[=+\-@\t\r]/.test(value);
  const safe = needsFormulaGuard ? `'${value}` : value;
  if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

function nightsBetween(a: string, b: string): string[] {
  const out: string[] = [];
  const start = new Date(`${a}T00:00:00.000Z`);
  const end = new Date(`${b}T00:00:00.000Z`);
  for (let d = start; d < end; d = new Date(d.getTime() + 86_400_000)) out.push(d.toISOString().slice(0, 10));
  return out;
}

export async function computeReport(prismaClient: PrismaClient, from: string, to: string, start: Date, end: Date) {
  const occupied = await prismaClient.$queryRaw<{ nights: bigint; room_revenue: bigint; total_revenue: bigint }[]>`
    SELECT COUNT(*)::bigint AS nights,
           COALESCE(SUM(rn."nightlyMinor"), 0)::bigint AS room_revenue,
           COALESCE(SUM(rn."nightlyMinor"), 0)::bigint AS total_revenue
    FROM reservation_room_nights rn
    JOIN reservations r ON r.id = rn."reservationId"
    WHERE rn.date >= ${from}::date AND rn.date <= ${to}::date
      AND r.status IN ('CONFIRMED','CHECKED_IN','CHECKED_OUT')
  `;
  const capacity = await prismaClient.$queryRaw<{ available: bigint; blocked: bigint }[]>`
    SELECT COALESCE(SUM(capacity - blocked), 0)::bigint AS available, COALESCE(SUM(blocked), 0)::bigint AS blocked
    FROM room_type_nights WHERE date >= ${from}::date AND date <= ${to}::date
  `;
  const payments = await prismaClient.payment.aggregate({ where: { createdAt: { gte: start, lte: end }, voided: false }, _sum: { amountMinor: true } });
  const refunds = await prismaClient.refund.aggregate({ where: { createdAt: { gte: start, lte: end } }, _sum: { amountMinor: true } });
  const byStatus = await prismaClient.reservation.groupBy({ by: ['status'], _count: { _all: true }, where: { checkIn: { lte: end }, checkOut: { gte: start } } });
  const outstanding = await prismaClient.reservation.findMany({ where: { status: { in: ['CONFIRMED', 'CHECKED_IN'] } }, select: { totalMinor: true, amountPaidMinor: true } });

  const occupiedNights = Number(occupied[0]?.nights ?? 0n);
  const roomRevenueMinor = Number(occupied[0]?.room_revenue ?? 0n);
  const availableNights = Number(capacity[0]?.available ?? 0n);
  const adr = occupiedNights ? Math.round(roomRevenueMinor / occupiedNights) : 0;
  const revpar = availableNights ? Math.round(roomRevenueMinor / availableNights) : 0;
  const occupancyRate = availableNights ? Math.round((occupiedNights / availableNights) * 1000) / 10 : 0;
  const cashCollectedMinor = payments._sum.amountMinor ?? 0;
  const refundedMinor = refunds._sum.amountMinor ?? 0;

  return {
    range: { from, to },
    occupancyRatePercent: occupancyRate,
    occupiedRoomNights: occupiedNights,
    availableRoomNights: availableNights,
    adr: money(adr),
    revpar: money(revpar),
    roomRevenue: money(roomRevenueMinor),
    cashCollected: money(cashCollectedMinor),
    refunded: money(refundedMinor),
    netCash: money(cashCollectedMinor - refundedMinor),
    outstandingBalance: money(outstanding.reduce((acc, r) => acc + Math.max(0, r.totalMinor - r.amountPaidMinor), 0)),
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
    definitions: {
      occupiedRoomNights: 'Room nights for confirmed, checked-in and checked-out reservations (holds and cancelled/no-show/expired excluded).',
      availableRoomNights: 'Sum of nightly capacity minus maintenance/out-of-order blocks.',
      adr: 'Room revenue divided by occupied room nights.',
      revpar: 'Room revenue divided by available room nights.',
      cashCollected: 'Payments recorded within the date range minus approved refunds.',
    },
  };
}
