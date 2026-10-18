import type { DateString } from './dates.js';
import { nightsBetween, todayInTimeZone } from './dates.js';
import type { CurrencyCode, Money } from './money.js';

export interface Occupancy {
  adults: number;
  children: number;
  /** Required only when pricing/occupancy rules depend on child ages. */
  childAges?: number[];
}

export interface BookingRulesConfig {
  /** Minimum nights per stay. */
  minStayNights: number;
  /** Maximum nights per stay. */
  maxStayNights: number;
  /** How far ahead a guest may book, in days. */
  bookingWindowDays: number;
  /** Minimum lead time (same-day bookings may be disabled). */
  minLeadTimeDays: number;
  /** Maximum rooms per reservation. */
  maxRoomsPerReservation: number;
  /** Default maximum adults per room when a room type does not override. */
  defaultMaxAdults: number;
  defaultMaxChildren: number;
}

export const DEFAULT_BOOKING_RULES: BookingRulesConfig = {
  minStayNights: 1,
  maxStayNights: 30,
  bookingWindowDays: 540,
  minLeadTimeDays: 0,
  maxRoomsPerReservation: 5,
  defaultMaxAdults: 2,
  defaultMaxChildren: 2,
};

export interface StayValidationInput {
  checkIn: DateString;
  checkOut: DateString;
  rules?: Partial<BookingRulesConfig>;
  timeZone?: string;
  now?: Date;
}

export interface StayValidationResult {
  ok: boolean;
  nights: number;
  errors: { code: string; message: string }[];
}

export function validateStay(input: StayValidationInput): StayValidationResult {
  const rules = { ...DEFAULT_BOOKING_RULES, ...input.rules };
  const tz = input.timeZone ?? 'UTC';
  const today = todayInTimeZone(tz, input.now ?? new Date());
  const errors: StayValidationResult['errors'] = [];
  const nights = nightsBetween(input.checkIn, input.checkOut);

  if (nights <= 0) {
    errors.push({ code: 'INVALID_RANGE', message: 'Check-out must be after check-in.' });
  }
  if (input.checkIn < today) {
    errors.push({ code: 'PAST_CHECK_IN', message: 'Check-in date cannot be in the past.' });
  }
  if (nights > 0 && nights < rules.minStayNights) {
    errors.push({ code: 'MIN_STAY', message: `A minimum stay of ${rules.minStayNights} night(s) applies.` });
  }
  if (nights > rules.maxStayNights) {
    errors.push({ code: 'MAX_STAY', message: `A stay may not exceed ${rules.maxStayNights} nights.` });
  }
  const maxDate = addDaysString(today, rules.bookingWindowDays);
  if (input.checkIn > maxDate) {
    errors.push({ code: 'OUTSIDE_WINDOW', message: `Bookings are only accepted up to ${rules.bookingWindowDays} days ahead.` });
  }
  if (input.checkIn < addDaysString(today, rules.minLeadTimeDays)) {
    errors.push({ code: 'LEAD_TIME', message: 'This date is inside the minimum booking lead time.' });
  }

  return { ok: errors.length === 0, nights, errors };
}

function addDaysString(date: DateString, days: number): DateString {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface RoomTypePricing {
  roomTypeId: string;
  ratePlanId: string;
  currency: CurrencyCode;
  baseNightly: Money;
  nights: { date: DateString; nightly: Money }[];
  subtotal: Money;
  taxes: { code: string; label: string; amount: Money }[];
  fees: { code: string; label: string; amount: Money }[];
  total: Money;
}

export interface HoldSummary {
  holdId: string;
  expiresAt: string;
  reservationId: string;
  reference: string;
}
