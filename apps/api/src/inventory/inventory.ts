import type { Tx } from '../db/prisma.js';
import { AppError } from '../lib/errors.js';

export interface InventoryDelta {
  roomTypeId: string;
  date: string; // YYYY-MM-DD
  /** Positive to consume inventory, negative to release. */
  quantity: number;
}

function sortDeltas(deltas: InventoryDelta[]): InventoryDelta[] {
  return [...deltas].sort((a, b) =>
    a.roomTypeId === b.roomTypeId ? (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) : a.roomTypeId < b.roomTypeId ? -1 : 1,
  );
}

export async function getRoomTypeCapacity(tx: Tx, roomTypeId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM physical_rooms
    WHERE "roomTypeId" = ${roomTypeId}::uuid AND active = true
  `;
  return Number(rows[0]?.count ?? 0n);
}

async function ensureNightRow(tx: Tx, roomTypeId: string, date: string, capacity: number): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO room_type_nights (id, "roomTypeId", date, capacity, sold, blocked, "updatedAt")
    VALUES (gen_random_uuid(), ${roomTypeId}::uuid, ${date}::date, ${capacity}, 0, 0, now())
    ON CONFLICT ("roomTypeId", date) DO NOTHING
  `;
}

/**
 * Atomically applies signed inventory changes. Positive quantities are guarded
 * by a conditional UPDATE (`sold + blocked + qty <= capacity`) which takes a
 * row-level lock, preventing overselling under concurrency. Deltas are applied
 * in a deterministic order to reduce deadlocks. Any failure aborts the
 * caller's transaction, leaving inventory untouched.
 */
export async function applyInventoryDelta(tx: Tx, deltas: InventoryDelta[]): Promise<void> {
  const capacityCache = new Map<string, number>();
  for (const delta of sortDeltas(deltas.filter((d) => d.quantity !== 0))) {
    let capacity = capacityCache.get(delta.roomTypeId);
    if (capacity === undefined) {
      capacity = await getRoomTypeCapacity(tx, delta.roomTypeId);
      capacityCache.set(delta.roomTypeId, capacity);
    }
    await ensureNightRow(tx, delta.roomTypeId, delta.date, capacity);

    if (delta.quantity > 0) {
      const updated = await tx.$queryRaw<{ sold: number }[]>`
        UPDATE room_type_nights
        SET sold = sold + ${delta.quantity}, capacity = ${capacity}, "updatedAt" = now()
        WHERE "roomTypeId" = ${delta.roomTypeId}::uuid
          AND date = ${delta.date}::date
          AND sold + blocked + ${delta.quantity} <= capacity
        RETURNING sold
      `;
      if (updated.length === 0) {
        throw new AppError(409, 'INSUFFICIENT_INVENTORY', 'The requested rooms are no longer available for one or more nights.', {
          roomTypeId: delta.roomTypeId,
          date: delta.date,
        });
      }
    } else {
      await tx.$executeRaw`
        UPDATE room_type_nights
        SET sold = GREATEST(sold + ${delta.quantity}, 0), capacity = ${capacity}, "updatedAt" = now()
        WHERE "roomTypeId" = ${delta.roomTypeId}::uuid AND date = ${delta.date}::date
      `;
    }
  }
}

/** Applies signed changes to the `blocked` counter (maintenance / out-of-order). */
export async function applyBlockDelta(tx: Tx, deltas: InventoryDelta[]): Promise<void> {
  const capacityCache = new Map<string, number>();
  for (const delta of sortDeltas(deltas.filter((d) => d.quantity !== 0))) {
    let capacity = capacityCache.get(delta.roomTypeId);
    if (capacity === undefined) {
      capacity = await getRoomTypeCapacity(tx, delta.roomTypeId);
      capacityCache.set(delta.roomTypeId, capacity);
    }
    await ensureNightRow(tx, delta.roomTypeId, delta.date, capacity);
    if (delta.quantity > 0) {
      await tx.$executeRaw`
        UPDATE room_type_nights
        SET blocked = LEAST(blocked + ${delta.quantity}, capacity), "updatedAt" = now()
        WHERE "roomTypeId" = ${delta.roomTypeId}::uuid AND date = ${delta.date}::date
      `;
    } else {
      await tx.$executeRaw`
        UPDATE room_type_nights
        SET blocked = GREATEST(blocked - ${Math.abs(delta.quantity)}, 0), "updatedAt" = now()
        WHERE "roomTypeId" = ${delta.roomTypeId}::uuid AND date = ${delta.date}::date
      `;
    }
  }
}

export interface NightAvailability {
  roomTypeId: string;
  date: string;
  capacity: number;
  sold: number;
  blocked: number;
  available: number;
}

export async function getNightAvailability(tx: Tx, roomTypeIds: string[], dates: string[]): Promise<NightAvailability[]> {
  if (roomTypeIds.length === 0 || dates.length === 0) return [];
  const rows = await tx.$queryRaw<
    { room_type_id: string; date: Date; capacity: number; sold: number; blocked: number }[]
  >`
    SELECT "roomTypeId" AS room_type_id, date, capacity, sold, blocked
    FROM room_type_nights
    WHERE "roomTypeId" = ANY(${roomTypeIds}::uuid[]) AND date = ANY(${dates}::date[])
  `;
  return rows.map((r) => ({
    roomTypeId: r.room_type_id,
    date: toDateString(r.date),
    capacity: r.capacity,
    sold: r.sold,
    blocked: r.blocked,
    available: r.capacity - r.sold - r.blocked,
  }));
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}
