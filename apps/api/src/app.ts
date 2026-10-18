import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { corsOrigins, loadEnv } from './config/env.js';
import { prisma } from './db/prisma.js';
import { AppError, toErrorBody } from './lib/errors.js';
import { registerPublicRoutes } from './routes/public.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerStaffRoutes } from './routes/staff.js';

export async function buildApp(): Promise<FastifyInstance> {
  const env = loadEnv();
  const app = Fastify({
    logger: { level: env.NODE_ENV === 'production' ? 'info' : 'warn' },
    trustProxy: true,
    bodyLimit: 1_048_576,
    genReqId: () => `req_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie, { secret: env.SESSION_SECRET });
  await app.register(cors, {
    origin: corsOrigins(env),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-CSRF-Token'],
    exposedHeaders: ['Idempotency-Key'],
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    allowList: [],
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Mountain Dew Group API',
        version: '0.1.0',
        description:
          'Shared REST API for the Mountain Dew Group website, mobile apps and staff portal. Accommodation booking is the primary service. Payment is collected at the property unless configured otherwise.',
      },
      servers: [{ url: env.PUBLIC_API_URL, description: 'Current environment' }],
      tags: [
        { name: 'public', description: 'Untrusted, cacheable public content' },
        { name: 'booking', description: 'Availability, quotes, holds and reservations' },
        { name: 'guest', description: 'Guest account and reservation management' },
        { name: 'staff', description: 'Staff operations (requires staff authentication)' },
        { name: 'services', description: 'Restaurant, boutique and experiences' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });

  // The interactive Swagger UI reads static assets from disk, which is fragile
  // on serverless platforms (Vercel) and unnecessary in production. The machine
  // readable /openapi.json below is always available; the UI is dev-only unless
  // ENABLE_API_DOCS=true is set explicitly.
  const enableDocsUi = env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true';
  if (enableDocsUi) {
    await app.register(swaggerUi, { routePrefix: '/docs', uiConfig: { docExpansion: 'list' } });
  }

  app.get('/health', async () => ({ status: 'ok', service: 'mdg-api', time: new Date().toISOString() }));

  app.get('/openapi.json', async () => app.swagger());

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;
    if (error instanceof AppError) {
      reply.status(error.statusCode).send(toErrorBody(error, requestId).body);
      return;
    }
    if ((error as { statusCode?: number }).statusCode === 429) {
      reply.status(429).send(toErrorBody(new AppError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.'), requestId).body);
      return;
    }
    const fastifyError = error as { validation?: unknown; statusCode?: number; message?: string };
    if (fastifyError.validation) {
      reply.status(400).send(toErrorBody(new AppError(400, 'VALIDATION_ERROR', 'The request could not be processed.', fastifyError.validation), requestId).body);
      return;
    }
    request.log.error({ err: error }, 'unhandled error');
    reply.status(500).send(toErrorBody(error, requestId).body);
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.', requestId: request.id } });
  });

  await app.register(async (instance) => registerPublicRoutes(instance), { prefix: '' });
  await app.register(async (instance) => registerAuthRoutes(instance), { prefix: '' });
  await app.register(async (instance) => registerStaffRoutes(instance), { prefix: '' });

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  return app;
}
