import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://user@localhost:5432/mountain_dew_test?schema=public';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export default function globalSetup(): void {
  // Prisma Migrate/Introspection use DIRECT_URL (the unpooled endpoint). The
  // test database must override BOTH so migrations never touch the dev/Neon DB.
  const env = {
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
    DIRECT_URL: TEST_DATABASE_URL,
    NODE_ENV: 'test',
  } as NodeJS.ProcessEnv;

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'reset', '--force', '--skip-generate', '--skip-seed'], {
    cwd: apiRoot,
    env,
    stdio: 'inherit',
  });

  execFileSync('pnpm', ['exec', 'prisma', 'db', 'seed'], { cwd: apiRoot, env, stdio: 'inherit' });
}
