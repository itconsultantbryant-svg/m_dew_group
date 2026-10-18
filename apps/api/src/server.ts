import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { prisma } from './db/prisma.js';
import { startHoldSweeper } from './services/holds.js';
import { processOutbox } from './services/notifications.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp();

  startHoldSweeper(prisma, 60_000);
  const outboxTimer = setInterval(() => {
    processOutbox(prisma).catch((err) => app.log.error({ err }, 'outbox processing failed'));
  }, 30_000);
  outboxTimer.unref?.();

  try {
    await app.listen({ port: env.API_PORT, host: env.API_HOST });
    app.log.warn(`Mountain Dew Group API listening on ${env.API_HOST}:${env.API_PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.warn(`Received ${signal}, shutting down`);
    clearInterval(outboxTimer);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
