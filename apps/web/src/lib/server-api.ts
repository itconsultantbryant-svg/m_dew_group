import type {
  AvailabilityResponseDto,
  PublicPropertyDto,
  RoomTypeDto,
} from '@mdg/domain';
import { API_BASE_URL } from './format';

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface HomeContent {
  blocks: { key: string; title: string | null; body: string | null; data: unknown }[];
  faqs: { id: string; question: string; answer: string; category: string | null }[];
  gallery: { id: string; url: string; alt: string; caption: string | null }[];
  reviews: {
    id: string;
    rating: number;
    title: string | null;
    body: string;
    guestName: string | null;
    publishedAt: string | null;
  }[];
}

export interface MenuCategory {
  id: string;
  name: string;
  description: string | null;
  items: {
    id: string;
    name: string;
    description: string | null;
    priceMinor: number;
    currency: string;
    isAvailable: boolean;
    allergens: unknown;
    dietaryTags: unknown;
  }[];
}

export interface MenuResponse {
  demoContent: boolean;
  hours: unknown;
  categories: MenuCategory[];
}

export interface BoutiqueCollection {
  id: string;
  name: string;
  description: string | null;
  products: {
    id: string;
    name: string;
    description: string | null;
    priceMinor: number;
    currency: string;
    media: { id: string; url: string; alt: string }[];
    variants: { id: string; name: string; priceMinor: number }[];
  }[];
}

export interface EventsResponse {
  events: {
    id: string;
    title: string;
    description: string | null;
    startsAt: string;
    endsAt: string | null;
    venue: string | null;
    ticketPriceMinor: number | null;
    media: { id: string; url: string; alt: string }[];
  }[];
  venueRules: unknown;
}

export async function getProperty(slug = 'mountain-dew'): Promise<PublicPropertyDto | null> {
  return getJson<PublicPropertyDto>(`/properties/${slug}`);
}

export async function getRoomTypes(): Promise<RoomTypeDto[]> {
  const data = await getJson<{ roomTypes: RoomTypeDto[] }>('/room-types');
  return data?.roomTypes ?? [];
}

export async function getRoomType(
  slug: string,
  query?: { checkIn?: string; checkOut?: string },
): Promise<{ roomType: RoomTypeDto; availability?: AvailabilityResponseDto['results'][number] } | null> {
  const params = new URLSearchParams();
  if (query?.checkIn) params.set('checkIn', query.checkIn);
  if (query?.checkOut) params.set('checkOut', query.checkOut);
  const qs = params.toString();
  return getJson(`/room-types/${slug}${qs ? `?${qs}` : ''}`);
}

export async function searchAvailability(query: {
  checkIn: string;
  checkOut: string;
  rooms?: number;
  adults?: number;
  children?: number;
}): Promise<AvailabilityResponseDto | null> {
  const params = new URLSearchParams({
    checkIn: query.checkIn,
    checkOut: query.checkOut,
    rooms: String(query.rooms ?? 1),
    adults: String(query.adults ?? 2),
    children: String(query.children ?? 0),
  });
  return getJson<AvailabilityResponseDto>(`/availability?${params.toString()}`);
}

export async function getHomeContent(): Promise<HomeContent | null> {
  return getJson<HomeContent>('/content/home');
}

export async function getMenu(): Promise<MenuResponse | null> {
  return getJson<MenuResponse>('/restaurant/menu');
}

export async function getBoutique(): Promise<{ collections: BoutiqueCollection[] } | null> {
  return getJson<{ collections: BoutiqueCollection[] }>('/boutique/catalog');
}

export async function getEvents(): Promise<EventsResponse | null> {
  return getJson<EventsResponse>('/experiences/events');
}

export async function getFaqs(): Promise<{ id: string; question: string; answer: string; category: string | null }[]> {
  const data = await getJson<{ faqs: { id: string; question: string; answer: string; category: string | null }[] }>('/faqs');
  return data?.faqs ?? [];
}
