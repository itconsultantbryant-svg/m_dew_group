import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../app.js';
import { prisma } from '../db/prisma.js';

async function main(): Promise<void> {
  const app = await buildApp();
  await app.ready();
  const document = app.swagger();
  const here = dirname(fileURLToPath(import.meta.url));
  const target = resolve(here, '../../openapi.json');
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await app.close();
  await prisma.$disconnect();
  console.log(`OpenAPI document written to ${target}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
