import type { ReservationDto } from '@mdg/domain';
import { API_BASE_URL } from '@/lib/format';

async function fetchReservation(reference: string, token: string): Promise<ReservationDto | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/reservations/${encodeURIComponent(reference)}?token=${encodeURIComponent(token)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as ReservationDto;
  } catch {
    return null;
  }
}

export { fetchReservation };
