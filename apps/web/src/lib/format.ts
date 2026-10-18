export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100';

export { formatMoney } from '@mdg/domain';

export function formatDate(value: string, opts: { withYear?: boolean } = {}): string {
  const dateOnly = value.slice(0, 10);
  const [y, m, d] = dateOnly.split('-').map(Number);
  if (!y || !m || !d) return value;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: opts.withYear === false ? undefined : 'numeric',
    timeZone: 'UTC',
  });
}

export function formatDateRange(checkIn: string, checkOut: string): string {
  return `${formatDate(checkIn, { withYear: false })} – ${formatDate(checkOut)}`;
}

export function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const RESERVATION_STATUS_LABELS: Record<string, string> = {
  HELD: 'On hold',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked in',
  CHECKED_OUT: 'Checked out',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No show',
  EXPIRED: 'Expired',
};

const PAYMENT_STATE_LABELS: Record<string, string> = {
  UNPAID: 'Payment due at property',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid in full',
  PARTIALLY_REFUNDED: 'Partially refunded',
  REFUNDED: 'Refunded',
};

export function reservationStatusLabel(status: string): string {
  return RESERVATION_STATUS_LABELS[status] ?? status;
}

export function paymentStateLabel(state: string): string {
  return PAYMENT_STATE_LABELS[state] ?? state;
}

export function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (status) {
    case 'CONFIRMED':
    case 'CHECKED_IN':
    case 'PAID':
      return 'success';
    case 'HELD':
    case 'PARTIALLY_PAID':
      return 'warning';
    case 'CANCELLED':
    case 'NO_SHOW':
    case 'EXPIRED':
      return 'danger';
    case 'CHECKED_OUT':
    case 'PARTIALLY_REFUNDED':
      return 'info';
    default:
      return 'neutral';
  }
}

export function nightsLabel(nights: number): string {
  return `${nights} ${nights === 1 ? 'night' : 'nights'}`;
}
