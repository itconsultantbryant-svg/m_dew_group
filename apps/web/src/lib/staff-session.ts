'use client';

import { ApiClient } from '@mdg/api-client';
import { API_BASE_URL } from '@/lib/format';

const TOKEN_KEY = 'mdg.staff.accessToken';
const USER_KEY = 'mdg.staff.user';

export interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStaffUser(): StaffUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StaffUser;
  } catch {
    return null;
  }
}

export function setStaffSession(token: string, user: StaffUser): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStaffSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export const staffApi = new ApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => getAccessToken(),
  onAuthError: () => {
    clearStaffSession();
  },
});

export class StaffRequestError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'StaffRequestError';
    this.status = status;
    this.code = code;
  }
}

export async function staffRequest<T>(path: string, init: Omit<RequestInit, 'body'> & { body?: unknown } = {}): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers as Record<string, string>) };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (res.status === 401 || res.status === 403) {
    clearStaffSession();
    throw new StaffRequestError(res.status, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.');
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const body = data as { error?: { code?: string; message?: string } } | undefined;
    throw new StaffRequestError(res.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? 'Request failed.');
  }
  return data as T;
}
