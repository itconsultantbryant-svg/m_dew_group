/**
 * Vercel serverless entry point.
 *
 * `apps/api/vercel.json` rewrites every inbound path to this function, and the
 * Fastify instance is built once per warm lambda and then reused so that cold
 * starts stay cheap. The same application object powers the long-running server
 * (`src/server.ts`) and the tests, so behaviour is identical everywhere.
 *
 * Local smoke test:
 *   node --import tsx apps/api/api/dev-server.mjs
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

let appPromise: Promise<FastifyInstance> | undefined;

async function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = buildApp().then(async (app) => {
      await app.ready();
      return app;
    });
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getApp();
  app.server.emit('request', req, res);
}

export const config = { runtime: 'nodejs' };
