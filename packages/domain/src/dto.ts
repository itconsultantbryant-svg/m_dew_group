import type { DateString } from './dates.js';
import type { CurrencyCode, Money } from './money.js';
import type { PaymentState, ReservationState, RoomReadinessState } from './states.js';

export interface AmenityDto {
  id: string;
  code: string;
  label: string;
  category: string;
  icon?: string | null;
}

export interface MediaDto {
  id: string;
  url: string;
  alt: string;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
  ratio?: string | null;
}

export interface RoomTypeDto {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  bedConfiguration: string;
  maxOccupancy: number;
  maxAdults: number;
  maxChildren: number;
  sizeSqm: number | null;
  sizeVerified: boolean;
  accessibility: string[];
  smokingPolicy: 'NON_SMOKING' | 'SMOKING' | 'DESIGNATED';
  amenities: AmenityDto[];
  media: MediaDto[];
  images: string[];
  baseCurrency: CurrencyCode;
  fromPrice: Money;
  checkInTime: string;
  checkOutTime: string;
  cancellationSummary: string;
  payAtProperty: boolean;
}

export interface AvailabilityRoomTypeDto {
  roomType: RoomTypeDto;
  availableCount: number;
  requestedCount: number;
  available: boolean;
  nightlyTotal: Money;
  stayTotal: Money;
  taxesAndFees: Money;
  grandTotal: Money;
  averageNightly: Money;
  ratePlanId: string;
  ratePlanName: string;
}

export interface AvailabilityResponseDto {
  propertyId: string;
  propertyName: string;
  checkIn: DateString;
  checkOut: DateString;
  nights: number;
  adults: number;
  children: number;
  rooms: number;
  currency: CurrencyCode;
  results: AvailabilityRoomTypeDto[];
  alternatives: { checkIn: DateString; checkOut: DateString; availableRoomTypes: number }[];
}

export interface QuoteLineDto {
  kind: 'ROOM' | 'EXTRA' | 'TAX' | 'FEE' | 'DISCOUNT';
  label: string;
  quantity: number;
  unitAmount: Money;
  amount: Money;
  metadata?: Record<string, unknown>;
}

export interface QuoteDto {
  quoteId: string;
  createdAt: string;
  expiresAt: string;
  currency: CurrencyCode;
  checkIn: DateString;
  checkOut: DateString;
  nights: number;
  lines: QuoteLineDto[];
  subtotal: Money;
  taxes: Money;
  fees: Money;
  discount: Money;
  total: Money;
  dueOnlineToday: Money;
  dueAtProperty: Money;
  settlementPolicy: 'PAY_AT_PROPERTY' | 'PAY_NOW';
  cancellationPolicyId: string;
  cancellationSummary: string;
  fingerprint: string;
}

export interface ReservationRoomDto {
  id: string;
  roomTypeId: string;
  roomTypeName: string;
  ratePlanId: string;
  quantity: number;
  adults: number;
  children: number;
  childAges: number[];
  assignedRoomId: string | null;
  assignedRoomNumber: string | null;
  nightly: Money[];
  subtotal: Money;
  taxesAndFees: Money;
  total: Money;
}

export interface ReservationDto {
  id: string;
  reference: string;
  propertyId: string;
  propertyName: string;
  status: ReservationState;
  paymentState: PaymentState;
  source: 'ONLINE' | 'WALK_IN' | 'PHONE' | 'STAFF';
  checkIn: DateString;
  checkOut: DateString;
  nights: number;
  currency: CurrencyCode;
  leadGuestName: string;
  leadGuestEmail: string | null;
  leadGuestPhone: string;
  estimatedArrivalTime: string | null;
  specialRequests: string | null;
  rooms: ReservationRoomDto[];
  quote: QuoteDto;
  balanceDue: Money;
  amountPaid: Money;
  holdExpiresAt: string | null;
  createdAt: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  cancelledAt: string | null;
}

export interface GuestStaySummaryDto {
  reference: string;
  status: ReservationState;
  checkIn: DateString;
  checkOut: DateString;
  propertyName: string;
  roomTypeNames: string[];
  total: Money;
  balanceDue: Money;
}

export interface PublicPropertyDto {
  id: string;
  name: string;
  tagline: string;
  description: string;
  addressLine: string;
  city: string;
  region: string;
  country: string;
  phone: string;
  email: string;
  latitude: number | null;
  longitude: number | null;
  timeZone: string;
  checkInTime: string;
  checkOutTime: string;
  currency: CurrencyCode;
  amenities: AmenityDto[];
}

export interface RoomReadinessDto {
  roomId: string;
  roomNumber: string;
  readiness: RoomReadinessState;
  updatedAt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}
