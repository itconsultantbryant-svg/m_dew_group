import type {
  ApiErrorBody,
  AvailabilityResponseDto,
  PublicPropertyDto,
  QuoteDto,
  ReservationDto,
} from '@mdg/domain';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: number, body: ApiErrorBody | undefined, fallback: string) {
    super(body?.error?.message ?? fallback);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error?.code ?? 'UNKNOWN';
    this.details = body?.error?.details;
  }
}

export interface ClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Returns an Authorization header value when available. */
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  getCsrfToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Called when the API responds 401/403 so the app can re-authenticate. */
  onAuthError?: (status: number) => void;
  defaultHeaders?: Record<string, string>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  idempotencyKey?: string;
  credentials?: RequestCredentials;
  /** Skip Authorization for cross-boundary calls. */
  anonymous?: boolean;
}

function buildQuery(query: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export class ApiClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly options: ClientOptions;

  constructor(options: ClientOptions) {
    this.options = options;
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  private async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.options.defaultHeaders,
      ...opts.headers,
    };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    if (!opts.anonymous) {
      const token = await this.options.getToken?.();
      if (token) headers.Authorization = `Bearer ${token}`;
      const csrf = await this.options.getCsrfToken?.();
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

    const res = await this.fetchImpl(`${this.baseUrl}${path}${buildQuery(opts.query)}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      credentials: opts.credentials,
    });

    if (res.status === 204) return undefined as T;

    const text = await res.text();
    const data = text ? (JSON.parse(text) as unknown) : undefined;

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) this.options.onAuthError?.(res.status);
      throw new ApiError(res.status, data as ApiErrorBody | undefined, `Request failed (${res.status})`);
    }
    return data as T;
  }

  // ---- public / guest ----

  getProperty(slug = 'mountain-dew') {
    return this.request<PublicPropertyDto>(`/properties/${slug}`, { anonymous: true });
  }

  searchAvailability(query: {
    checkIn: string;
    checkOut: string;
    rooms?: number;
    adults?: number;
    children?: number;
    childAges?: number[];
    currency?: string;
  }) {
    return this.request<AvailabilityResponseDto>('/availability', {
      anonymous: true,
      query: {
        ...query,
        childAges: query.childAges?.join(','),
      },
    });
  }

  getRoomType(slug: string, query?: { checkIn?: string; checkOut?: string }) {
    return this.request<{ roomType: AvailabilityResponseDto['results'][number]['roomType']; availability?: AvailabilityResponseDto['results'][number] }>(
      `/room-types/${slug}`,
      { anonymous: true, query },
    );
  }

  listRoomTypes() {
    return this.request<{ roomTypes: AvailabilityResponseDto['results'][number]['roomType'][] }>('/room-types', { anonymous: true });
  }

  createQuote(body: {
    checkIn: string;
    checkOut: string;
    rooms: { roomTypeId: string; ratePlanId?: string; quantity: number; adults: number; children: number; childAges?: number[] }[];
    promotionCode?: string;
  }) {
    return this.request<QuoteDto>('/quotes', { method: 'POST', body, anonymous: true });
  }

  createHold(body: { checkIn: string; checkOut: string; rooms: unknown[]; quoteFingerprint: string; promotionCode?: string }) {
    return this.request<{ holdId: string; reservationId: string; reference: string; expiresAt: string; quote: QuoteDto }>(
      '/holds',
      { method: 'POST', body, anonymous: true },
    );
  }

  createReservation(body: { holdId: string; quoteFingerprint: string; leadGuest: unknown; idempotencyKey: string }) {
    return this.request<{ reservation: ReservationDto; manageToken: string }>('/reservations', {
      method: 'POST',
      body,
      anonymous: true,
      idempotencyKey: body.idempotencyKey,
    });
  }

  lookupReservation(body: { reference: string; lastName: string }) {
    return this.request<{ manageToken: string; reservation: ReservationDto }>('/reservations/lookup', {
      method: 'POST',
      body,
      anonymous: true,
    });
  }

  getReservation(reference: string, token: string) {
    return this.request<ReservationDto>(`/reservations/${reference}`, { query: { token }, anonymous: true });
  }

  cancelReservation(reference: string, body: { token: string; reason?: string; idempotencyKey: string }) {
    return this.request<ReservationDto>(`/reservations/${reference}/cancel`, {
      method: 'POST',
      body,
      anonymous: true,
      idempotencyKey: body.idempotencyKey,
    });
  }

  modifyReservation(reference: string, body: Record<string, unknown> & { token: string; idempotencyKey: string }) {
    return this.request<ReservationDto | { requiresAcceptance: true; newQuote: QuoteDto; fingerprint: string }>(
      `/reservations/${reference}/modify`,
      { method: 'POST', body, anonymous: true, idempotencyKey: body.idempotencyKey },
    );
  }

  requestGuestChange(reference: string, body: { token: string; type: string; details: string }) {
    return this.request<{ requestId: string; status: string }>(`/reservations/${reference}/requests`, {
      method: 'POST',
      body,
      anonymous: true,
    });
  }

  submitReview(body: { reference: string; lastName: string; rating: number; title?: string; body: string }) {
    return this.request<{ id: string; status: string }>('/reviews', { method: 'POST', body, anonymous: true });
  }

  createTableRequest(body: unknown) {
    return this.request<{ id: string; status: string }>('/restaurant/table-requests', { method: 'POST', body, anonymous: true });
  }

  createBoutiqueInquiry(body: unknown) {
    return this.request<{ id: string; status: string }>('/boutique/inquiries', { method: 'POST', body, anonymous: true });
  }

  createEventInquiry(body: unknown) {
    return this.request<{ id: string; status: string }>('/experiences/event-inquiries', { method: 'POST', body, anonymous: true });
  }

  sendContactMessage(body: unknown) {
    return this.request<{ id: string }>('/contact', { method: 'POST', body, anonymous: true });
  }

  subscribeNewsletter(email: string) {
    return this.request<{ ok: boolean }>('/newsletter', { method: 'POST', body: { email }, anonymous: true });
  }

  // ---- guest account ----

  register(body: unknown) {
    return this.request<{ guest: { id: string; email: string; firstName: string } }>('/auth/guest/register', {
      method: 'POST',
      body,
      anonymous: true,
      credentials: 'include',
    });
  }

  login(body: { email: string; password: string }) {
    return this.request<{ guest: { id: string; email: string; firstName: string } }>('/auth/guest/login', {
      method: 'POST',
      body,
      anonymous: true,
      credentials: 'include',
    });
  }

  logout() {
    return this.request<void>('/auth/guest/logout', { method: 'POST', credentials: 'include' });
  }

  me() {
    return this.request<{ guest: { id: string; email: string; firstName: string; lastName: string } }>('/auth/guest/me', {
      credentials: 'include',
    });
  }

  myStays() {
    return this.request<{ stays: import('@mdg/domain').GuestStaySummaryDto[] }>('/guest/reservations', { credentials: 'include' });
  }

  deleteAccount(idempotencyKey?: string) {
    return this.request<{ ok: boolean }>('/guest/account', { method: 'DELETE', credentials: 'include', idempotencyKey });
  }
}

export function createApiClient(options: ClientOptions): ApiClient {
  return new ApiClient(options);
}
