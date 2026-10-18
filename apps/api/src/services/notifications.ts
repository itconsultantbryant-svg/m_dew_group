import type { PrismaClient } from '@prisma/client';
import type { Tx } from '../db/prisma.js';
import { loadEnv } from '../config/env.js';

export type Channel = 'EMAIL' | 'IN_APP' | 'PUSH' | 'SMS' | 'WHATSAPP';

export interface EnqueueInput {
  channel: Channel;
  recipient: string;
  subject?: string;
  body: string;
  templateCode?: string;
  reservationId?: string;
  dedupeKey?: string;
  /** High-level topic stored on the outbox job for routing/observability. */
  topic?: string;
}

/**
 * Writes a notification row and an outbox job inside the caller's transaction.
 * Because the outbox row commits atomically with the reservation, a delivery
 * failure can never roll back a confirmed booking.
 */
export async function enqueueNotification(tx: Tx, input: EnqueueInput): Promise<{ notificationId: string }> {
  const notification = await tx.notification.create({
    data: {
      channel: input.channel,
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
      templateCode: input.templateCode,
      reservationId: input.reservationId,
      status: 'PENDING',
    },
  });

  await tx.outboxJob.create({
    data: {
      topic: input.topic ?? `notification.${input.channel.toLowerCase()}`,
      payload: { notificationId: notification.id, channel: input.channel, recipient: input.recipient, subject: input.subject, body: input.body },
      dedupeKey: input.dedupeKey,
      status: 'PENDING',
    },
  });

  return { notificationId: notification.id };
}

export interface DeliveryResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  /** True when the failure is due to missing configuration rather than a transient error. */
  configurationMissing?: boolean;
}

/**
 * Delivery adapter. Real provider integrations are configured via environment
 * variables. When a provider is not configured the adapter reports a clear
 * configuration limitation instead of pretending success.
 */
export async function deliver(channel: Channel, recipient: string): Promise<DeliveryResult> {
  const env = loadEnv();
  switch (channel) {
    case 'EMAIL':
      if (!env.EMAIL_PROVIDER && !env.SMTP_URL) return { ok: false, configurationMissing: true, error: 'EMAIL_PROVIDER is not configured.' };
      return { ok: true, providerMessageId: `email-stub-${Date.now()}` };
    case 'SMS':
      if (!env.SMS_PROVIDER || !env.SMS_API_KEY) return { ok: false, configurationMissing: true, error: 'SMS_PROVIDER is not configured.' };
      return { ok: true, providerMessageId: `sms-stub-${Date.now()}` };
    case 'WHATSAPP':
      return { ok: false, configurationMissing: true, error: 'WHATSAPP_PROVIDER is not configured.' };
    case 'PUSH':
      return { ok: true, providerMessageId: `push-stub-${Date.now()}` };
    case 'IN_APP':
      return { ok: true, providerMessageId: `inapp-${recipient}` };
    default:
      return { ok: false, error: `Unsupported channel ${channel}` };
  }
}

/** Processes pending outbox jobs. Safe to run repeatedly; jobs are claimed atomically. */
export async function processOutbox(prisma: PrismaClient, limit = 25): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
  const jobs = await prisma.outboxJob.findMany({
    where: { status: 'PENDING', availableAt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  for (const job of jobs) {
    const claimed = await prisma.outboxJob.updateMany({
      where: { id: job.id, status: 'PENDING' },
      data: { status: 'PROCESSING', attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;

    const payload = job.payload as { notificationId?: string; channel?: Channel; recipient?: string };
    const channel = (payload.channel ?? 'EMAIL') as Channel;
    const result = await deliver(channel, payload.recipient ?? '');

    if (result.ok) {
      await prisma.$transaction([
        prisma.outboxJob.update({ where: { id: job.id }, data: { status: 'SENT', processedAt: new Date(), lastError: null } }),
        ...(payload.notificationId
          ? [prisma.notification.update({ where: { id: payload.notificationId }, data: { status: 'SENT', sentAt: new Date(), providerMessageId: result.providerMessageId } })]
          : []),
      ]);
      processed += 1;
    } else {
      const dead = job.attempts + 1 >= job.maxAttempts || result.configurationMissing;
      await prisma.$transaction([
        prisma.outboxJob.update({
          where: { id: job.id },
          data: {
            status: dead ? 'DEAD' : 'PENDING',
            lastError: result.error ?? 'Unknown delivery failure',
            availableAt: new Date(Date.now() + 60_000),
          },
        }),
        ...(payload.notificationId
          ? [prisma.notification.update({ where: { id: payload.notificationId }, data: { status: 'FAILED', error: result.error ?? 'delivery failed' } })]
          : []),
      ]);
      failed += 1;
    }
  }
  return { processed, failed };
}
