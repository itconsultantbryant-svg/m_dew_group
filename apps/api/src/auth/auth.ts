import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { hasPermission, type Permission, type Role } from '@mdg/domain';
import { Errors } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';

export interface AuthContext {
  kind: 'staff' | 'guest';
  id: string;
  role?: Role;
  fullName?: string;
  email?: string;
  viaCookie: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
    requestId?: string;
  }
}

const ACCESS_COOKIE = 'mdg_session';
const CSRF_COOKIE = 'mdg_csrf';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function getBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

export async function readAuth(request: FastifyRequest): Promise<AuthContext | null> {
  const bearer = getBearer(request);
  if (bearer) {
    try {
      const claims = await verifyAccessToken(bearer);
      return {
        kind: claims.scope === 'staff' ? 'staff' : 'guest',
        id: claims.sub,
        role: claims.role as Role,
        fullName: claims.fullName,
        email: claims.email,
        viaCookie: false,
      };
    } catch {
      return null;
    }
  }

  const cookieToken = request.cookies?.[ACCESS_COOKIE];
  if (cookieToken) {
    if (MUTATING.has(request.method)) {
      const header = request.headers['x-csrf-token'];
      const cookieCsrf = request.cookies?.[CSRF_COOKIE];
      if (typeof header !== 'string' || !cookieCsrf || header !== cookieCsrf) {
        throw Errors.forbidden('CSRF validation failed. Refresh the page and try again.');
      }
    }
    try {
      const claims = await verifyAccessToken(cookieToken);
      return {
        kind: claims.scope === 'staff' ? 'staff' : 'guest',
        id: claims.sub,
        role: claims.role as Role,
        fullName: claims.fullName,
        email: claims.email,
        viaCookie: true,
      };
    } catch {
      return null;
    }
  }
  return null;
}

export function requireAuth(...permissions: Permission[]): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const auth = await readAuth(request);
    if (!auth) throw Errors.unauthorized();
    if (permissions.length > 0) {
      if (auth.kind !== 'staff') throw Errors.forbidden();
      const allowed = permissions.some((p) => hasPermission(auth.role, p));
      if (!allowed) throw Errors.forbidden();
    }
    request.auth = auth;
  };
}

export function requireStaff(...permissions: Permission[]): preHandlerHookHandler {
  return async (request, _reply) => {
    const auth = await readAuth(request);
    if (!auth || auth.kind !== 'staff') throw Errors.unauthorized('Staff authentication required.');
    if (permissions.length > 0) {
      const allowed = permissions.some((p) => hasPermission(auth.role, p));
      if (!allowed) throw Errors.forbidden();
    }
    request.auth = auth;
  };
}

export function requireGuest(): preHandlerHookHandler {
  return async (request) => {
    const auth = await readAuth(request);
    if (!auth || auth.kind !== 'guest') throw Errors.unauthorized('Please sign in to continue.');
    request.auth = auth;
  };
}

export const cookies = { ACCESS_COOKIE, CSRF_COOKIE };

export function setGuestCookies(reply: FastifyReply, token: string, csrf: string, maxAgeSeconds: number, secure: boolean): void {
  reply.setCookie(ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: maxAgeSeconds,
  });
  reply.setCookie(CSRF_COOKIE, csrf, {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export function clearGuestCookies(reply: FastifyReply): void {
  reply.clearCookie(ACCESS_COOKIE, { path: '/' });
  reply.clearCookie(CSRF_COOKIE, { path: '/' });
}
