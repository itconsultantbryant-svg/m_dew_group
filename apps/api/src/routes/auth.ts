import type { FastifyInstance } from 'fastify';
import { authenticator } from 'otplib';
import { guestLoginSchema, guestRegisterSchema, staffLoginSchema } from '@mdg/validation';
import { money, type GuestStaySummaryDto } from '@mdg/domain';
import { prisma } from '../db/prisma.js';
import { loadEnv } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { sha256, randomToken } from '../lib/ids.js';
import { signAccessToken } from '../lib/tokens.js';
import { clearGuestCookies, cookies, requireGuest, requireStaff, setGuestCookies } from '../auth/auth.js';

function parseOrThrow<T>(result: { success: true; data: T } | { success: false; error: { flatten: () => unknown } }): T {
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', result.error.flatten());
  return result.data;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const env = loadEnv();
  const secureCookies = env.NODE_ENV === 'production';
  const guestCookieMaxAge = 60 * 60 * 24 * env.REFRESH_TOKEN_TTL_DAYS;

  app.post('/auth/guest/register', { schema: { tags: ['guest'], summary: 'Create an optional guest account' } }, async (request, reply) => {
    const body = parseOrThrow(guestRegisterSchema.safeParse(request.body));
    const existing = await prisma.guestAccount.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) throw AppError.conflict('EMAIL_IN_USE', 'An account already exists for that email address.');
    const account = await prisma.guestAccount.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash: hashPassword(body.password),
        guestProfile: {
          create: {
            firstName: body.firstName,
            lastName: body.lastName,
            email: body.email.toLowerCase(),
            phoneCountryCode: body.phoneCountryCode,
            phoneNumber: body.phoneNumber,
            marketingConsent: body.marketingConsent,
          },
        },
      },
      include: { guestProfile: true },
    });
    const token = await signAccessToken({ sub: account.id, role: 'GUEST', scope: 'guest', email: account.email, fullName: `${body.firstName} ${body.lastName}` });
    const csrf = randomToken(24);
    setGuestCookies(reply, token, csrf, guestCookieMaxAge, secureCookies);
    return { guest: { id: account.id, email: account.email, firstName: body.firstName, lastName: body.lastName }, accessToken: token, csrfToken: csrf };
  });

  app.post(
    '/auth/guest/login',
    { config: { rateLimit: { max: env.RATE_LIMIT_LOGIN_PER_15MIN, timeWindow: '15 minutes' } }, schema: { tags: ['guest'], summary: 'Sign in to a guest account' } },
    async (request, reply) => {
      const body = parseOrThrow(guestLoginSchema.safeParse(request.body));
      const account = await prisma.guestAccount.findUnique({ where: { email: body.email.toLowerCase() }, include: { guestProfile: true } });
      if (!account || !verifyPassword(body.password, account.passwordHash)) {
        throw AppError.unauthorized('Email or password is incorrect.');
      }
      await prisma.guestAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
      const token = await signAccessToken({ sub: account.id, role: 'GUEST', scope: 'guest', email: account.email, fullName: `${account.guestProfile.firstName} ${account.guestProfile.lastName}` });
      const csrf = randomToken(24);
      setGuestCookies(reply, token, csrf, guestCookieMaxAge, secureCookies);
      return { guest: { id: account.id, email: account.email, firstName: account.guestProfile.firstName, lastName: account.guestProfile.lastName }, accessToken: token, csrfToken: csrf };
    },
  );

  app.post('/auth/guest/logout', { schema: { tags: ['guest'], summary: 'Sign out of a guest account' } }, async (_request, reply) => {
    clearGuestCookies(reply);
    return { ok: true };
  });

  app.get('/auth/guest/me', { preHandler: requireGuest(), schema: { tags: ['guest'], summary: 'Current guest account' } }, async (request) => {
    const account = await prisma.guestAccount.findUnique({ where: { id: request.auth!.id }, include: { guestProfile: true } });
    if (!account) throw AppError.unauthorized();
    return { guest: { id: account.id, email: account.email, firstName: account.guestProfile.firstName, lastName: account.guestProfile.lastName } };
  });

  app.get('/guest/reservations', { preHandler: requireGuest(), schema: { tags: ['guest'], summary: 'List the signed-in guest reservations' } }, async (request) => {
    const account = await prisma.guestAccount.findUnique({ where: { id: request.auth!.id }, select: { guestProfileId: true } });
    if (!account) throw AppError.unauthorized();
    const reservations = await prisma.reservation.findMany({
      where: { guestProfileId: account.guestProfileId },
      include: { property: { select: { name: true } }, rooms: { include: { roomType: { select: { name: true } } } } },
      orderBy: { checkIn: 'desc' },
    });
    const stays: GuestStaySummaryDto[] = reservations.map((r) => ({
      reference: r.reference,
      status: r.status,
      checkIn: r.checkIn.toISOString().slice(0, 10),
      checkOut: r.checkOut.toISOString().slice(0, 10),
      propertyName: r.property.name,
      roomTypeNames: r.rooms.map((room) => room.roomType.name),
      total: money(r.totalMinor, r.currency as 'USD' | 'LRD'),
      balanceDue: money(Math.max(0, r.totalMinor - r.amountPaidMinor), r.currency as 'USD' | 'LRD'),
    }));
    return { stays };
  });

  app.delete('/guest/account', { preHandler: requireGuest(), schema: { tags: ['guest'], summary: 'Delete a guest account subject to retention rules' } }, async (request, reply) => {
    const account = await prisma.guestAccount.findUnique({ where: { id: request.auth!.id }, include: { guestProfile: { include: { reservations: true } } } });
    if (!account) throw AppError.unauthorized();
    const today = new Date().toISOString().slice(0, 10);
    const hasActive = account.guestProfile.reservations.some(
      (r) => ['HELD', 'CONFIRMED', 'CHECKED_IN'].includes(r.status) && r.checkOut.toISOString().slice(0, 10) >= today,
    );
    if (hasActive) throw AppError.conflict('ACTIVE_RESERVATIONS', 'Please cancel or complete your upcoming stays before deleting your account.');
    await prisma.$transaction([
      prisma.guestAccount.delete({ where: { id: account.id } }),
      prisma.guestProfile.update({ where: { id: account.guestProfileId }, data: { email: null, notes: 'Account deleted at guest request; reservation records retained for legal retention.' } }),
    ]);
    clearGuestCookies(reply);
    return { ok: true };
  });

  // ---- staff authentication ----
  app.post(
    '/auth/staff/login',
    { config: { rateLimit: { max: env.RATE_LIMIT_LOGIN_PER_15MIN, timeWindow: '15 minutes' } }, schema: { tags: ['staff'], summary: 'Staff sign in (MFA optional per configuration)' } },
    async (request, reply) => {
      const body = parseOrThrow(staffLoginSchema.safeParse(request.body));
      const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
      if (!user || !user.isActive) throw AppError.unauthorized('Email or password is incorrect.');
      if (user.lockedUntil && user.lockedUntil > new Date()) throw AppError.tooMany('Account temporarily locked after repeated failed sign-ins.');
      if (!verifyPassword(body.password, user.passwordHash)) {
        const failedLogins = user.failedLogins + 1;
        await prisma.user.update({ where: { id: user.id }, data: { failedLogins, lockedUntil: failedLogins >= 5 ? new Date(Date.now() + 15 * 60_000) : null } });
        throw AppError.unauthorized('Email or password is incorrect.');
      }
      if (env.REQUIRE_STAFF_MFA && user.totpEnabled) {
        if (!body.totp) throw new AppError(401, 'MFA_REQUIRED', 'A verification code is required.');
        if (!user.totpSecret || !authenticator.verify({ token: body.totp, secret: user.totpSecret })) {
          throw new AppError(401, 'MFA_INVALID', 'The verification code is incorrect.');
        }
      }
      await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });

      const refresh = randomToken(32);
      await prisma.staffSession.create({
        data: {
          userId: user.id,
          refreshHash: sha256(refresh),
          userAgent: request.headers['user-agent'] ?? null,
          ip: request.ip,
          expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
        },
      });
      reply.setCookie('mdg_refresh', refresh, { httpOnly: true, sameSite: 'lax', secure: secureCookies, path: '/auth/staff', maxAge: 60 * 60 * 24 * env.REFRESH_TOKEN_TTL_DAYS });
      const accessToken = await signAccessToken({ sub: user.id, role: user.role, scope: 'staff', email: user.email, fullName: user.fullName });
      return { user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role }, accessToken };
    },
  );

  app.post('/auth/staff/refresh', { schema: { tags: ['staff'], summary: 'Exchange the refresh cookie for a new access token' } }, async (request) => {
    const refresh = request.cookies['mdg_refresh'];
    if (!refresh) throw AppError.unauthorized();
    const session = await prisma.staffSession.findUnique({ where: { refreshHash: sha256(refresh) }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.isActive) throw AppError.unauthorized();
    const accessToken = await signAccessToken({ sub: session.user.id, role: session.user.role, scope: 'staff', email: session.user.email, fullName: session.user.fullName });
    return { accessToken };
  });

  app.post('/auth/staff/logout', { schema: { tags: ['staff'], summary: 'Staff sign out' } }, async (request, reply) => {
    const refresh = request.cookies['mdg_refresh'];
    if (refresh) await prisma.staffSession.updateMany({ where: { refreshHash: sha256(refresh) }, data: { revokedAt: new Date() } });
    reply.clearCookie('mdg_refresh', { path: '/auth/staff' });
    return { ok: true };
  });

  app.get('/auth/staff/me', { preHandler: requireStaff(), schema: { tags: ['staff'], summary: 'Current staff user' } }, async (request) => {
    const user = await prisma.user.findUnique({ where: { id: request.auth!.id } });
    if (!user) throw AppError.unauthorized();
    return { user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, totpEnabled: user.totpEnabled } };
  });
}
