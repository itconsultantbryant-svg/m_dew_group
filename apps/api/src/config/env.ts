import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  // Unpooled connection used by Prisma migrate/introspect (Neon direct endpoint).
  DIRECT_URL: z.string().optional(),
  API_PORT: z.coerce.number().int().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  PUBLIC_WEB_URL: z.string().default('http://localhost:3000'),
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),
  SESSION_SECRET: z.string().min(16).default('dev-session-secret-not-for-production-use-only'),
  MANAGE_LINK_SECRET: z.string().min(16).default('dev-manage-link-secret-not-for-production-use-only'),
  CSRF_SECRET: z.string().min(16).default('dev-csrf-secret-not-for-production-use-only'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().default(60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),
  HOLD_TTL_MINUTES: z.coerce.number().int().default(15),
  REQUIRE_STAFF_MFA: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  EMAIL_PROVIDER: z.string().default(''),
  EMAIL_FROM: z.string().default('reservations@example.com'),
  SMTP_URL: z.string().default(''),
  SMS_PROVIDER: z.string().default(''),
  SMS_API_KEY: z.string().default(''),
  EXPO_PUSH_ACCESS_TOKEN: z.string().default(''),
  RATE_LIMIT_HOLD_PER_HOUR: z.coerce.number().int().default(20),
  RATE_LIMIT_LOGIN_PER_15MIN: z.coerce.number().int().default(10),
  S3_ENDPOINT: z.string().default(''),
  S3_BUCKET: z.string().default(''),
  S3_PUBLIC_BASE_URL: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }
  cached = parsed.data;
  return cached;
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
}
