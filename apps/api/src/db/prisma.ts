import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __mdgPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__mdgPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalThis.__mdgPrisma = prisma;

export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
