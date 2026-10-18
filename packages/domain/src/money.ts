/**
 * Money is always stored and computed in integer minor units.
 * Never use floating point arithmetic for financial values.
 */

export type CurrencyCode = 'USD' | 'LRD';

export const SUPPORTED_CURRENCIES: readonly CurrencyCode[] = ['USD', 'LRD'];

export interface Money {
  /** Integer amount in the currency's minor unit (cents). */
  amountMinor: number;
  currency: CurrencyCode;
}

export function money(amountMinor: number, currency: CurrencyCode = 'USD'): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`Money amountMinor must be an integer, received ${amountMinor}`);
  }
  return { amountMinor, currency };
}

export function zero(currency: CurrencyCode = 'USD'): Money {
  return { amountMinor: 0, currency };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

export function multiply(m: Money, factor: number): Money {
  return { amountMinor: Math.round(m.amountMinor * factor), currency: m.currency };
}

export function sum(values: Money[], currency: CurrencyCode = 'USD'): Money {
  return values.reduce((acc, v) => add(acc, v), zero(currency));
}

export function isZero(m: Money): boolean {
  return m.amountMinor === 0;
}

export function isNegative(m: Money): boolean {
  return m.amountMinor < 0;
}

const SYMBOL: Record<CurrencyCode, string> = { USD: '$', LRD: 'L$' };

/** Formats minor units for display. Uses integer math only. */
export function formatMoney(m: Money, options?: { withCode?: boolean }): string {
  const negative = m.amountMinor < 0;
  const abs = Math.abs(m.amountMinor);
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  const grouped = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = `${SYMBOL[m.currency]}${grouped}.${minor.toString().padStart(2, '0')}`;
  const withSign = negative ? `-${body}` : body;
  return options?.withCode ? `${withSign} ${m.currency}` : withSign;
}

/** Converts to a plain decimal string for storage/export without FP error. */
export function toDecimalString(m: Money): string {
  const negative = m.amountMinor < 0;
  const abs = Math.abs(m.amountMinor);
  const major = Math.floor(abs / 100);
  const minor = (abs % 100).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${major}.${minor}`;
}

/** Converts a Prisma Decimal-like value (string) into integer minor units. */
export function decimalStringToMinorUnits(value: string): number {
  const trimmed = value.trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,}))?$/.exec(trimmed);
  if (!match) throw new Error(`Invalid decimal string: ${value}`);
  const sign = match[1] === '-' ? -1 : 1;
  const whole = match[2] ?? '0';
  const frac = (match[3] ?? '').padEnd(2, '0').slice(0, 2);
  return sign * (Number.parseInt(whole, 10) * 100 + Number.parseInt(frac || '0', 10));
}

/**
 * Applies an exchange rate without silently losing precision. The rate is a
 * decimal string with up to 6 places, e.g. "192.500000".
 */
export function convert(value: Money, rate: string, target: CurrencyCode): Money {
  const rateUnits = decimalStringToMinorUnits(rate); // rate * 100
  const raw = (value.amountMinor * rateUnits) / 100;
  return { amountMinor: Math.round(raw), currency: target };
}
