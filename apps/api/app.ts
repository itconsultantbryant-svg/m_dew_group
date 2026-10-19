/**
 * Serverless entry point for the API when it runs as a Vercel **Service**.
 *
 * Vercel detects the `fastify` framework for `apps/api` and, for framework
 * services, resolves the entry file by scanning the candidates
 * `app|index|server|src/app|src/index|src/server` for the first file that
 * imports `fastify`. This file wins that search (name `app`, and the type-only
 * import below satisfies the detector) and simply re-exports the default
 * `(req, res)` handler used by the standalone deployment, so both deployment
 * shapes share one implementation.
 *
 * The handler bridges Vercel's Node runtime into the pre-built Fastify instance
 * (`src/app.ts`), which is created once per warm lambda and reused.
 */
import type { FastifyInstance } from 'fastify';
import { buildApp } from './src/app.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

let appPromise: Promise<FastifyInstance> | undefined;

function getApp(): Promise<FastifyInstance> {
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
