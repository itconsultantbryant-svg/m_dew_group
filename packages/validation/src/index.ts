import { z } from 'zod';

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date')
  .refine((v) => {
    const [y, m, d] = v.split('-').map(Number);
    if (!y || !m || !d || m < 1 || m > 12) return false;
    return d >= 1 && d <= new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  }, 'Invalid calendar date');

export const occupancySchema = z.object({
  adults: z.number().int().min(1).max(12),
  children: z.number().int().min(0).max(8).default(0),
  childAges: z.array(z.number().int().min(0).max(17)).max(8).optional(),
});

export const roomSelectionSchema = z.object({
  roomTypeId: z.string().uuid(),
  ratePlanId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).max(10).default(1),
  adults: z.number().int().min(1).max(12),
  children: z.number().int().min(0).max(8).default(0),
  childAges: z.array(z.number().int().min(0).max(17)).max(8).optional(),
});

export const availabilityQuerySchema = z.object({
  checkIn: dateString,
  checkOut: dateString,
  rooms: z.coerce.number().int().min(1).max(10).default(1),
  adults: z.coerce.number().int().min(1).max(12).default(1),
  children: z.coerce.number().int().min(0).max(8).default(0),
  childAges: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((n) => Number.parseInt(n, 10)).filter((n) => Number.isFinite(n)) : undefined)),
  currency: z.enum(['USD', 'LRD']).optional(),
});

export const roomSelectionListSchema = z.array(roomSelectionSchema).min(1).max(5);

export const quoteRequestSchema = z.object({
  checkIn: dateString,
  checkOut: dateString,
  rooms: roomSelectionListSchema,
  currency: z.enum(['USD', 'LRD']).optional(),
  promotionCode: z.string().trim().max(40).optional(),
});

export const holdRequestSchema = z.object({
  checkIn: dateString,
  checkOut: dateString,
  rooms: roomSelectionListSchema,
  quoteFingerprint: z.string().min(6).max(128),
  promotionCode: z.string().trim().max(40).optional(),
});

export const guestDetailsSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  phoneCountryCode: z.string().trim().regex(/^\+\d{1,4}$/, 'Include leading + and country code'),
  phoneNumber: z.string().trim().min(5).max(20),
  estimatedArrivalTime: z.string().trim().max(20).optional().or(z.literal('')),
  specialRequests: z.string().trim().max(1000).optional().or(z.literal('')),
  additionalGuests: z
    .array(z.object({ name: z.string().trim().min(1).max(120), age: z.number().int().min(0).max(120).optional() }))
    .max(12)
    .optional(),
  communicationPreference: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'PHONE']).default('EMAIL'),
  marketingConsent: z.boolean().default(false),
  acceptTerms: z.literal(true),
  acceptPrivacy: z.literal(true),
});

export const createReservationSchema = z.object({
  holdId: z.string().uuid(),
  quoteFingerprint: z.string().min(6).max(128),
  leadGuest: guestDetailsSchema,
  idempotencyKey: z.string().min(8).max(128),
});

export const manageLookupSchema = z.object({
  reference: z.string().trim().min(4).max(24),
  lastName: z.string().trim().min(1).max(80),
});

export const guestLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
});

export const guestRegisterSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
  phoneCountryCode: z.string().trim().regex(/^\+\d{1,4}$/),
  phoneNumber: z.string().trim().min(5).max(20),
  password: z.string().min(8).max(200),
  marketingConsent: z.boolean().default(false),
});

export const modifyReservationSchema = z.object({
  checkIn: dateString.optional(),
  checkOut: dateString.optional(),
  rooms: roomSelectionListSchema.optional(),
  reason: z.string().trim().max(500).optional(),
  acceptedFingerprint: z.string().min(6).max(128).optional(),
  idempotencyKey: z.string().min(8).max(128),
});

export const cancelReservationSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().min(8).max(128),
});

// ---- staff schemas ----

export const staffLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
  totp: z.string().trim().regex(/^\d{6}$/).optional(),
});

export const recordPaymentSchema = z.object({
  reservationId: z.string().uuid(),
  amountMinor: z.number().int().min(1),
  currency: z.enum(['USD', 'LRD']),
  method: z.enum(['CASH', 'MTN_MOBILE_MONEY', 'ORANGE_MONEY', 'BANK_TRANSFER', 'CARD_TERMINAL']),
  transactionReference: z.string().trim().max(120).optional().or(z.literal('')),
  verified: z.boolean().default(false),
  settlementCurrency: z.enum(['USD', 'LRD']).optional(),
  exchangeRate: z.string().regex(/^\d+(\.\d{1,6})?$/).optional(),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});

export const refundSchema = z.object({
  paymentId: z.string().uuid(),
  amountMinor: z.number().int().min(1),
  reason: z.string().trim().min(3).max(500),
});

export const roomBlockSchema = z.object({
  roomId: z.string().uuid(),
  startDate: dateString,
  endDate: dateString,
  reason: z.string().trim().min(3).max(300),
  kind: z.enum(['MAINTENANCE', 'OUT_OF_ORDER', 'BLOCK']),
});

export const housekeepingTaskSchema = z.object({
  roomId: z.string().uuid(),
  type: z.enum(['CLEAN', 'INSPECT', 'MAINTENANCE', 'TURNDOWN']),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  dueAt: z.string().datetime().optional(),
  assigneeId: z.string().uuid().optional(),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});

export const guestRequestSchema = z.object({
  reservationId: z.string().uuid(),
  type: z.enum(['LATE_ARRIVAL', 'EARLY_CHECKIN', 'LATE_CHECKOUT', 'EXTRA_BED', 'AIRPORT_PICKUP', 'OTHER']),
  details: z.string().trim().max(1000),
});

export const tableRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phoneCountryCode: z.string().trim().regex(/^\+\d{1,4}$/),
  phoneNumber: z.string().trim().min(5).max(20),
  email: z.string().trim().email().optional().or(z.literal('')),
  date: dateString,
  time: z.string().trim().regex(/^\d{2}:\d{2}$/),
  partySize: z.number().int().min(1).max(30),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

export const boutiqueInquirySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  phoneCountryCode: z.string().trim().regex(/^\+\d{1,4}$/).optional().or(z.literal('')),
  phoneNumber: z.string().trim().max(20).optional().or(z.literal('')),
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  kind: z.enum(['INQUIRY', 'PICKUP_RESERVATION']),
  message: z.string().trim().max(1000).optional().or(z.literal('')),
});

export const eventInquirySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  phoneCountryCode: z.string().trim().regex(/^\+\d{1,4}$/),
  phoneNumber: z.string().trim().min(5).max(20),
  eventType: z.string().trim().min(2).max(120),
  preferredDate: dateString.optional(),
  partySize: z.number().int().min(1).max(500).optional(),
  details: z.string().trim().max(2000).optional().or(z.literal('')),
});

export const contactMessageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  phoneNumber: z.string().trim().max(30).optional().or(z.literal('')),
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(5).max(2000),
});

export const reviewSchema = z.object({
  reference: z.string().trim().min(4).max(24),
  lastName: z.string().trim().min(1).max(80),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional().or(z.literal('')),
  body: z.string().trim().min(5).max(2000),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
export type HoldRequest = z.infer<typeof holdRequestSchema>;
export type CreateReservationRequest = z.infer<typeof createReservationSchema>;
export type GuestDetails = z.infer<typeof guestDetailsSchema>;
export type RecordPaymentRequest = z.infer<typeof recordPaymentSchema>;
