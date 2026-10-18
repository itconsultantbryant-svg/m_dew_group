import { SignJWT, jwtVerify } from 'jose';
import { loadEnv } from '../config/env.js';

function secret(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export interface AccessTokenClaims {
  sub: string;
  role: string;
  scope: 'staff' | 'guest';
  fullName?: string;
  email?: string;
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  const env = loadEnv();
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer('mdg-api')
    .setAudience('mdg-app')
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_MINUTES}m`)
    .sign(secret(env.SESSION_SECRET));
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const env = loadEnv();
  const { payload } = await jwtVerify(token, secret(env.SESSION_SECRET), { issuer: 'mdg-api', audience: 'mdg-app' });
  return {
    sub: String(payload.sub ?? payload.sub),
    role: String(payload.role),
    scope: (payload.scope as 'staff' | 'guest') ?? 'guest',
    fullName: payload.fullName as string | undefined,
    email: payload.email as string | undefined,
  };
}

/** Signed, expiring link tokens for guest reservation management. */
export async function signManageToken(reservationId: string, expiresInDays = 30): Promise<string> {
  const env = loadEnv();
  return new SignJWT({ scope: 'manage', reservationId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer('mdg-api')
    .setAudience('mdg-manage')
    .setExpirationTime(`${expiresInDays}d`)
    .sign(secret(env.MANAGE_LINK_SECRET));
}

export async function verifyManageToken(token: string): Promise<{ reservationId: string }> {
  const env = loadEnv();
  const { payload } = await jwtVerify(token, secret(env.MANAGE_LINK_SECRET), { issuer: 'mdg-api', audience: 'mdg-manage' });
  return { reservationId: String(payload.reservationId) };
}

/** Short-lived token proving a successful reference + surname lookup. */
export async function signLookupToken(reservationId: string): Promise<string> {
  const env = loadEnv();
  return new SignJWT({ scope: 'lookup', reservationId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer('mdg-api')
    .setAudience('mdg-lookup')
    .setExpirationTime('30m')
    .sign(secret(env.MANAGE_LINK_SECRET));
}

export async function verifyLookupToken(token: string): Promise<{ reservationId: string }> {
  const env = loadEnv();
  const { payload } = await jwtVerify(token, secret(env.MANAGE_LINK_SECRET), { issuer: 'mdg-api', audience: 'mdg-lookup' });
  return { reservationId: String(payload.reservationId) };
}
