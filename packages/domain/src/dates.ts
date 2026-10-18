/**
 * Property-local calendar dates are represented as "YYYY-MM-DD" strings.
 * They are timezone-free and never constructed from local JS Date parsing,
 * which avoids off-by-one shifts on the server.
 */

export type DateString = string; // YYYY-MM-DD

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateString(value: unknown): value is DateString {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

export function assertDateString(value: unknown): DateString {
  if (!isValidDateString(value)) throw new Error(`Invalid date string: ${String(value)}`);
  return value;
}

/** Parses to a UTC midnight Date that is safe for arithmetic only. */
export function parseDate(value: DateString): Date {
  assertDateString(value);
  return new Date(`${value}T00:00:00.000Z`);
}

export function toDateString(date: Date): DateString {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: DateString, days: number): DateString {
  const d = parseDate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
}

export function nightsBetween(checkIn: DateString, checkOut: DateString): number {
  const start = parseDate(checkIn).getTime();
  const end = parseDate(checkOut).getTime();
  return Math.round((end - start) / 86_400_000);
}

/**
 * Returns each night occupied by a stay: check-in inclusive, check-out exclusive.
 * e.g. nightDates('2026-05-01','2026-05-04') => ['2026-05-01','2026-05-02','2026-05-03']
 */
export function nightDates(checkIn: DateString, checkOut: DateString): DateString[] {
  const nights = nightsBetween(checkIn, checkOut);
  if (nights <= 0) return [];
  const out: DateString[] = [];
  for (let i = 0; i < nights; i += 1) out.push(addDays(checkIn, i));
  return out;
}

export function compareDates(a: DateString, b: DateString): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBefore(a: DateString, b: DateString): boolean {
  return compareDates(a, b) < 0;
}

export function isOnOrBefore(a: DateString, b: DateString): boolean {
  return compareDates(a, b) <= 0;
}

export function overlaps(checkIn: DateString, checkOut: DateString, otherIn: DateString, otherOut: DateString): boolean {
  return isBefore(checkIn, otherOut) && isBefore(otherIn, checkOut);
}

/** 0 = Sunday ... 6 = Saturday, derived in UTC to avoid TZ drift. */
export function dayOfWeek(value: DateString): number {
  return parseDate(value).getUTCDay();
}

export function isWeekendNight(value: DateString, weekendDays: readonly number[] = [5, 6]): boolean {
  return weekendDays.includes(dayOfWeek(value));
}

export function todayInTimeZone(timeZone: string, now: Date = new Date()): DateString {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(now);
}

export function formatDateLong(value: DateString, timeZone = 'UTC'): string {
  const d = parseDate(value);
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}
