/**
 * Reservation and payment state models are intentionally separate.
 * A confirmed pay-on-arrival booking is still unpaid.
 */

export const RESERVATION_STATES = [
  'HELD',
  'CONFIRMED',
  'CHECKED_IN',
  'CHECKED_OUT',
  'CANCELLED',
  'NO_SHOW',
  'EXPIRED',
] as const;
export type ReservationState = (typeof RESERVATION_STATES)[number];

export const PAYMENT_STATES = [
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

export const ROOM_READINESS_STATES = ['CLEAN', 'DIRTY', 'IN_PROGRESS', 'INSPECTED', 'OUT_OF_ORDER'] as const;
export type RoomReadinessState = (typeof ROOM_READINESS_STATES)[number];

/** Whether a reservation state consumes nightly inventory. */
export const INVENTORY_CONSUMING_STATES: readonly ReservationState[] = ['HELD', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'];

export function consumesInventory(state: ReservationState): boolean {
  return INVENTORY_CONSUMING_STATES.includes(state);
}

/** Active reservations block room assignment. Cancelled/no-show/expired do not. */
export const ACTIVE_ASSIGNMENT_STATES: readonly ReservationState[] = ['HELD', 'CONFIRMED', 'CHECKED_IN'];

export function blocksRoomAssignment(state: ReservationState): boolean {
  return ACTIVE_ASSIGNMENT_STATES.includes(state);
}

export const RESERVATION_TRANSITIONS: Record<ReservationState, readonly ReservationState[]> = {
  HELD: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['CHECKED_OUT'],
  CHECKED_OUT: [],
  CANCELLED: [],
  NO_SHOW: [],
  EXPIRED: [],
};

export const PAYMENT_TRANSITIONS: Record<PaymentState, readonly PaymentState[]> = {
  UNPAID: ['PARTIALLY_PAID', 'PAID'],
  PARTIALLY_PAID: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  PAID: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  PARTIALLY_REFUNDED: ['REFUNDED', 'PAID'],
  REFUNDED: [],
};

export function canTransitionReservation(from: ReservationState, to: ReservationState): boolean {
  return RESERVATION_TRANSITIONS[from].includes(to);
}

export function canTransitionPayment(from: PaymentState, to: PaymentState): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

/** Roles permitted to perform each reservation transition. */
export const RESERVATION_TRANSITION_ROLES: Record<string, readonly string[]> = {
  'HELD->CONFIRMED': ['SYSTEM', 'FRONT_DESK', 'GENERAL_MANAGER', 'OWNER'],
  'HELD->CANCELLED': ['SYSTEM', 'FRONT_DESK', 'GENERAL_MANAGER', 'OWNER', 'GUEST'],
  'HELD->EXPIRED': ['SYSTEM'],
  'CONFIRMED->CHECKED_IN': ['FRONT_DESK', 'GENERAL_MANAGER', 'OWNER'],
  'CONFIRMED->CANCELLED': ['FRONT_DESK', 'GENERAL_MANAGER', 'OWNER', 'GUEST'],
  'CONFIRMED->NO_SHOW': ['FRONT_DESK', 'GENERAL_MANAGER', 'OWNER'],
  'CHECKED_IN->CHECKED_OUT': ['FRONT_DESK', 'GENERAL_MANAGER', 'OWNER'],
};

export const RESERVATION_STATE_EFFECTS: Record<ReservationState, string> = {
  HELD: 'Consumes nightly inventory until expiry; no payment required.',
  CONFIRMED: 'Consumes nightly inventory. Balance remains due at the property.',
  CHECKED_IN: 'Guest is on property. Room assignment is active. Folio accrues charges.',
  CHECKED_OUT: 'Stay complete. Releases future room assignment; triggers housekeeping.',
  CANCELLED: 'Releases inventory once. Idempotent.',
  NO_SHOW: 'Releases inventory. No money is treated as collected.',
  EXPIRED: 'Hold expired before confirmation. Inventory released automatically.',
};
