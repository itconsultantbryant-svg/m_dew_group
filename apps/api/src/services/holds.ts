import type { PrismaClient } from '@prisma/client';
import type { Tx } from '../db/prisma.js';
import { applyInventoryDelta, type InventoryDelta } from '../inventory/inventory.js';

/** Builds release deltas from a reservation's persisted room-night ledger. */
export async function releaseDeltasForReservation(tx: Tx, reservationId: string): Promise<InventoryDelta[]> {
  const nights = await tx.reservationRoomNight.findMany({
    where: { reservationId },
    select: { roomTypeId: true, date: true, quantity: true },
  });
  return nights.map((n) => ({ roomTypeId: n.roomTypeId, date: n.date.toISOString().slice(0, 10), quantity: -n.quantity }));
}

/** Builds consume deltas (positive) from a set of room drafts. */
export function consumeDeltasFromRooms(
  rooms: { roomTypeId: string; quantity: number; nightly: { date: string }[] }[],
): InventoryDelta[] {
  const out: InventoryDelta[] = [];
  for (const room of rooms) {
    for (const night of room.nightly) {
      out.push({ roomTypeId: room.roomTypeId, date: night.date, quantity: room.quantity });
    }
  }
  return out;
}

/**
 * Expires stale holds and releases their inventory exactly once. The hold row
 * is claimed with a conditional update so concurrent sweeps cannot double
 * release. Returns the number of holds released.
 */
export async function releaseExpiredHolds(prisma: PrismaClient, limit = 50): Promise<number> {
  const now = new Date();
  const candidates = await prisma.hold.findMany({
    where: { status: 'ACTIVE', expiresAt: { lt: now } },
    select: { id: true, reservationId: true },
    take: limit,
  });

  let released = 0;
  for (const candidate of candidates) {
    const didRelease = await prisma.$transaction(async (tx) => {
      const claimed = await tx.hold.updateMany({
        where: { id: candidate.id, status: 'ACTIVE' },
        data: { status: 'EXPIRED', releasedAt: now },
      });
      if (claimed.count === 0) return false;

      const reservation = await tx.reservation.findUnique({ where: { id: candidate.reservationId }, select: { status: true } });
      if (!reservation || reservation.status !== 'HELD') return false;

      const deltas = await releaseDeltasForReservation(tx, candidate.reservationId);
      await applyInventoryDelta(tx, deltas);
      await tx.reservation.update({ where: { id: candidate.reservationId }, data: { status: 'EXPIRED' } });
      await tx.auditLog.create({
        data: {
          action: 'reservation.expired',
          entityType: 'Reservation',
          entityId: candidate.reservationId,
          reason: 'Hold TTL elapsed',
        },
      });
      return true;
    });
    if (didRelease) released += 1;
  }
  return released;
}

/** Starts a periodic sweep. Returns a stop function. */
export function startHoldSweeper(prisma: PrismaClient, intervalMs = 60_000): () => void {
  const timer = setInterval(() => {
    releaseExpiredHolds(prisma).catch((err) => console.error('hold sweep failed', err));
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
