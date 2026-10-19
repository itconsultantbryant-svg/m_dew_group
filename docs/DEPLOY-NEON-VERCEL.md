# Deploying Mountain Dew Group on Neon + Vercel

A complete, copy-paste guide to run this repository in production with:

- **Neon** — serverless PostgreSQL (database)
- **Vercel** — the Next.js web app **and** the Fastify API (as a serverless function)

> This is the supported deployment shape. It takes about 20 minutes. Nothing here needs a Docker
> image or a long-running server.

---

## 0. What you are deploying

```
                 ┌──────────────────────────────┐
  Guests/Staff   │  Vercel project: web         │   Next.js 16  (apps/web)
  ─────────────▶ │  https://<web>.vercel.app    │
                 └───────────────┬──────────────┘
                                 │  NEXT_PUBLIC_API_URL (build-time)
                                 ▼
                 ┌──────────────────────────────┐
                 │  Vercel project: api         │   Fastify bundled as one function
                 │  https://<api>.vercel.app    │   (apps/api/api/index.ts)
                 └───────────────┬──────────────┘
                                 │  DATABASE_URL (pooled)  /  DIRECT_URL (migrations)
                                 ▼
                 ┌──────────────────────────────┐
                 │  Neon PostgreSQL 16          │
                 └──────────────────────────────┘
```

Two Vercel projects from **one** Git repository (different **Root Directory**), plus one Neon
database. The API config (`apps/api/vercel.standalone.json`, renamed to `vercel.json` for this
option) rewrites every path to a single serverless entry that reuses one Fastify instance per warm
lambda.

---

## 1. Prerequisites

- A **Neon** account — https://console.neon.tech
- A **Vercel** account — https://vercel.com
- The repository on **GitHub** (for Vercel's Git integration, recommended)
- Node ≥ 20 and pnpm on your machine (for the one-off migration step)
- Optional CLIs: `npx neonctl@latest`, `npx vercel@latest`

---

## 2. Step 1 — Create the Neon database

### Option A — Neon console (easiest)

1. **Create project** → name `mountain-dew-group`, Postgres **16**, pick a region near your users.
2. Open **Connection details** and copy **two** strings:

   | Purpose | Which one | Env var |
   | --- | --- | --- |
   | App runtime (connection pooling) | host contains **`-pooler`** | `DATABASE_URL` |
   | Migrations / introspection | the **direct** endpoint | `DIRECT_URL` |

   Keep `?sslmode=require` on both.

### Option B — Neon CLI

```bash
npx neonctl@latest auth
npx neonctl@latest projects create \
  --name mountain-dew-group \
  --region-id aws-eu-west-2 \
  --pg-version 16
# list connection strings (pooled + direct):
npx neonctl@latest connection-string <project-id>
```

> A project named `mountain-dew-group` (region `aws-eu-west-2`) may already exist for this repo
> (`project-id mute-truth-95418626`). Reuse it, or create a fresh one per environment.

---

## 3. Step 2 — Generate secrets

Run this once and paste the three values into the API environment:

```bash
printf 'SESSION_SECRET=%s\n'     "$(openssl rand -base64 48)"
printf 'MANAGE_LINK_SECRET=%s\n' "$(openssl rand -base64 48)"
printf 'CSRF_SECRET=%s\n'        "$(openssl rand -base64 48)"
```

Never reuse the development defaults in production.

---

## 4. Step 3 — Deploy the API project

### 4a. Import the repo (Vercel dashboard — recommended)

1. **Add New… → Project → Import** your Git repository.
2. Configure:
   - **Root Directory:** `apps/api`
   - **Framework Preset:** Other (Vercel reads `apps/api/vercel.json`)
   - Rename `apps/api/vercel.standalone.json` to `apps/api/vercel.json` before this option
   - Build/Install commands: leave as-is — `vercel.json` supplies them
     (`pnpm -w run vercel-build:api`, `pnpm install --no-frozen-lockfile`).
3. Add the **Environment Variables** below (tick **Production** *and* **Preview**).

| Key | Value |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** connection string |
| `DIRECT_URL` | Neon **direct** connection string |
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | from Step 2 |
| `MANAGE_LINK_SECRET` | from Step 2 |
| `CSRF_SECRET` | from Step 2 |
| `PUBLIC_API_URL` | `https://<api-project>.vercel.app` |
| `PUBLIC_WEB_URL` | `https://<web-project>.vercel.app` |
| `CORS_ORIGINS` | `https://<web-project>.vercel.app` (comma-separate more origins) |
| `REQUIRE_STAFF_MFA` | `true` once staff have enrolled TOTP (else `false`) |

4. **Deploy.**

### 4b. Or deploy with the Vercel CLI

```bash
npx vercel@latest login
cd apps/api
npx vercel@latest link                     # create/link the "api" project

# add variables (repeat for each, and for the "preview" environment)
npx vercel@latest env add DATABASE_URL production
npx vercel@latest env add DIRECT_URL   production
npx vercel@latest env add NODE_ENV     production   # value: production
npx vercel@latest env add SESSION_SECRET       production
npx vercel@latest env add MANAGE_LINK_SECRET   production
npx vercel@latest env add CSRF_SECRET          production
npx vercel@latest env add PUBLIC_API_URL       production
npx vercel@latest env add PUBLIC_WEB_URL       production
npx vercel@latest env add CORS_ORIGINS         production

npx vercel@latest --prod
```

Health check after deploy:

```bash
curl -s https://<api-project>.vercel.app/health
# {"status":"ok",...}
```

---

## 5. Step 4 — Run migrations against Neon

Migrations are **never** run automatically on Vercel. Apply them once from your machine, using the
**direct** URL for `DIRECT_URL`:

```bash
cd apps/api
export DATABASE_URL="postgresql://…-pooler…/neondb?sslmode=require"
export DIRECT_URL="postgresql://…/neondb?sslmode=require"

pnpm install
pnpm -w run build:packages              # build shared workspace packages
pnpm exec prisma migrate deploy         # apply migrations
```

> ⚠️ Do **not** run `prisma db seed` in production — it inserts clearly-marked **demonstration**
> data (demo rooms, menus, prices and demo logins). Create real records instead (Step 6).

Re-run `prisma migrate deploy` after every deploy that adds a migration.

---

## 6. Step 5 — Deploy the web project

Add a **second** Vercel project from the **same** repository:

| Setting | Value |
| --- | --- |
| **Root Directory** | `apps/web` |
| **Framework Preset** | Next.js |
| Build/Install | from `apps/web/vercel.json` (`pnpm -w run vercel-build:web`) |

(Rename `apps/web/vercel.standalone.json` to `apps/web/vercel.json` for this option.)

Environment variable:

| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://<api-project>.vercel.app` |

Deploy. `NEXT_PUBLIC_API_URL` is inlined at **build time** — after changing it, **redeploy** the web
project.

Finally, make sure the API's `CORS_ORIGINS` contains the **exact** web origin (scheme + host, no
trailing slash) and redeploy the API if you change it.

---

## 7. Step 6 — Create the first admin (production bootstrap)

The demo seed must not run in production, so create your first OWNER deliberately. This uses the
same password hashing the app uses:

```bash
cd apps/api
export DATABASE_URL="postgresql://…-pooler…/neondb?sslmode=require"
export DIRECT_URL="postgresql://…/neondb?sslmode=require"

pnpm exec tsx -e "
import { PrismaClient } from '@prisma/client';
import { hashPassword } from './src/lib/passwords.ts';
const prisma = new PrismaClient();
const email = process.argv[1];
const password = process.argv[2];
await prisma.user.upsert({
  where: { email },
  update: { passwordHash: hashPassword(password), role: 'OWNER', isActive: true },
  create: { email, fullName: 'Owner', role: 'OWNER', passwordHash: hashPassword(password) },
});
console.log('owner ready:', email);
await prisma.\$disconnect();
" you@yourdomain.com 'A-Strong-Passphrase!'
```

Then sign in at `https://<web-project>.vercel.app/staff/login` → **Admin console** (`/admin`).
From **Team** you can create the rest of the staff accounts and change roles.

You still need to create real **room types, physical rooms and rate plans** (via the API or a
bespoke seed) before taking bookings.

---

## 8. Step 7 — Verify

| Check | Command / URL |
| --- | --- |
| API health | `https://<api>.vercel.app/health` |
| OpenAPI document | `https://<api>.vercel.app/openapi.json` |
| Web home | `https://<web>.vercel.app/` |
| Staff sign-in | `https://<web>.vercel.app/staff/login` |
| Admin console | `https://<web>.vercel.app/admin` |
| Public booking flow | `https://<web>.vercel.app/book` |

Staff sign in at `/staff/login`, then open the live **Admin console** at `/admin`
(permission-aware sidebar, auto-refreshing screens).

---

## 9. Custom domains

1. Vercel **web** project → Settings → Domains → add `www.yourdomain.com` / `yourdomain.com`.
2. Vercel **api** project → Settings → Domains → add `api.yourdomain.com`.
3. Update and redeploy:
   - API: `CORS_ORIGINS=https://www.yourdomain.com,https://yourdomain.com`,
     `PUBLIC_WEB_URL=https://www.yourdomain.com`, `PUBLIC_API_URL=https://api.yourdomain.com`
   - Web: `NEXT_PUBLIC_API_URL=https://api.yourdomain.com` → **redeploy web**.

---

## 10. Continuous deployment

Both projects auto-deploy on push once imported via Git:

- `main` → **Production**; other branches / PRs → **Preview** deployments.
- Because the two projects share one repo, a change to `apps/web` still triggers an API build (and
  vice-versa). That is harmless; use Vercel's **Ignored Build Step** if you want to skip unchanged
  projects.
- Add your preview URLs to `CORS_ORIGINS` (comma-separated) if staff/guests must use them.

---

## 11. Background jobs

In serverless, hold-expiry sweeps and outbox processing run **lazily on request**. For guaranteed
scheduling, add a Vercel **Cron** that pings a lightweight endpoint (e.g. `/health`) every few
minutes, or run the always-on server in §13.

---

## 12. Environment variable reference (API)

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Neon **pooled** string (`-pooler` host) |
| `DIRECT_URL` | ✅ (migrations) | Neon **direct** string |
| `NODE_ENV` | ✅ | `production` |
| `API_BASE_PATH` | Services mode | `/api` when the API is a Vercel Service on a shared domain; empty otherwise |
| `SESSION_SECRET` | ✅ | ≥ 16 chars, random |
| `MANAGE_LINK_SECRET` | ✅ | ≥ 16 chars, random |
| `CSRF_SECRET` | ✅ | ≥ 16 chars, random |
| `PUBLIC_API_URL` | ✅ | Public API base (used in links/tokens) |
| `PUBLIC_WEB_URL` | ✅ | Public web base |
| `CORS_ORIGINS` | ✅ | Comma-separated exact origins |
| `REQUIRE_STAFF_MFA` | – | `true` to require TOTP |
| `ENABLE_API_DOCS` | – | `true` re-enables Swagger **UI** in production |
| `HOLD_TTL_MINUTES` | – | Default `15` |
| `ACCESS_TOKEN_TTL_MINUTES` / `REFRESH_TOKEN_TTL_DAYS` | – | Defaults `60` / `30` |
| `EMAIL_PROVIDER` / `EMAIL_FROM` / `SMTP_URL` | – | For confirmation emails |
| `SMS_PROVIDER` / `SMS_API_KEY` | – | Optional SMS |
| `EXPO_PUSH_ACCESS_TOKEN` | – | Mobile push |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_PUBLIC_BASE_URL` | – | Media storage |

**Web:** `NEXT_PUBLIC_API_URL` (only).

---

## 13. Alternative: one Vercel project with Services

Instead of **two** Vercel projects, the repository can deploy as a **single** project using
[Vercel Services](https://vercel.com/docs/services): one shared domain, the web app at `/` and the
API at `/api`. This is driven by the **root `vercel.json`** committed in the repo:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "services": {
    "api":     {
      "root": "apps/api",
      "framework": "fastify",
      "entrypoint": "app.ts",
      "installCommand": "pnpm install --no-frozen-lockfile",
      "buildCommand": "pnpm -w run vercel-build:api"
    },
    "web": {
      "root": "apps/web",
      "framework": "nextjs",
      "installCommand": "pnpm install --no-frozen-lockfile",
      "buildCommand": "pnpm -w run vercel-build:web",
      "bindings": [
        { "type": "service", "service": "api", "format": "url", "env": "API_URL" }
      ]
    }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": { "service": "api" } },
    { "source": "/(.*)", "destination": { "service": "web" } }
  ]
}
```

Vercel auto-detects the **fastify** framework for `apps/api` (because `fastify` is a
dependency), and a framework service requires an `entrypoint`. `apps/api/app.ts` is that entry: it wins
Vercel's entry-file search (name `app`, plus a `fastify` import) and default-exports the same
`(req, res)` handler the standalone deployment uses, so both shapes share one implementation.

| Request | Service | Notes |
| --- | --- | --- |
| `GET /api/health` | `api` | Public. The service receives the **full** path `/api/health`. |
| `GET /` , `/rooms`, `/admin` … | `web` | Everything else. |
| server-side web → API | `api` | Over the private `API_URL` binding (no public hop). |

**How the repo matches this:**

- The API registers **every** route under `API_BASE_PATH`. Set the project environment variable
  `API_BASE_PATH=/api` so the Fastify app answers on `/api/*` (it forwards the path unchanged). Leave
  it unset locally so dev, tests and the mobile client keep using bare routes.
- The web app's **browser** calls use `NEXT_PUBLIC_API_URL=/api` (same origin).
- The web app's **server-side** calls read the binding-injected `API_URL`
  (`apps/web/src/lib/format.ts` → `serverApiBaseUrl()`), falling back to `NEXT_PUBLIC_API_URL` when no
  binding is present.

### Environment variables (single project)

Set these on the one Vercel project (Production **and** Preview):

| Key | Value |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** string |
| `DIRECT_URL` | Neon **direct** string |
| `NODE_ENV` | `production` |
| `API_BASE_PATH` | `/api` |
| `SESSION_SECRET` / `MANAGE_LINK_SECRET` / `CSRF_SECRET` | from Step 2 |
| `PUBLIC_WEB_URL` | `https://<project>.vercel.app` |
| `PUBLIC_API_URL` | `https://<project>.vercel.app/api` |
| `CORS_ORIGINS` | `https://<project>.vercel.app` |
| `NEXT_PUBLIC_API_URL` | `/api` |
| `REQUIRE_STAFF_MFA` | `true` once staff have enrolled TOTP |

Do **not** set `API_URL` — Vercel injects it from the binding.

### Deploy

```bash
npx vercel@latest link
npx vercel@latest env add API_BASE_PATH production    # value: /api
npx vercel@latest env add NEXT_PUBLIC_API_URL production   # value: /api
# …plus the DATABASE_URL / DIRECT_URL / secrets / URL vars above
npx vercel@latest --prod
```

Then run migrations as in Step 4, and the first-admin bootstrap as in Step 6 — the only difference is
the API base URL ends in `/api` and the web app is on the same domain.

> The two-project configs live as `apps/api/vercel.standalone.json` and
> `apps/web/vercel.standalone.json`. They are **renamed** (not `vercel.json`) because a service
> builder reads a `vercel.json` inside its own root: the old `apps/api/vercel.json` declared
> `"framework": null`, which made Vercel build the API service as a static site and fail with
> `STATIC_BUILD_NO_OUT_DIR`. Keep the standalone names so services mode reads only the root
> `vercel.json`; restore/copy them to `vercel.json` only if you switch to the two-project option.

---

## 14. Alternative: long-running API host

If you would rather run the API on an always-on Node host (Render / Railway / Fly / a VPS) instead
of serverless:

- **Build:** `pnpm install && pnpm -r --filter './packages/**' build && pnpm --filter @mdg/api exec prisma generate`
- **Start:** `pnpm --filter @mdg/api start`
- **Health check:** `/health`

The Neon strings, secrets and CORS rules are identical.

---

## 15. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Can't reach database server` | `DATABASE_URL` missing or not the pooled string; confirm `?sslmode=require`. |
| Migrations hang / `P1002` | Set `DIRECT_URL` to the **unpooled** endpoint. |
| `ERR_PNPM_...` / pnpm not found on Vercel | Vercel must honour `packageManager: pnpm@11.3.0`. If it rejects v11, set the project env `ENABLE_EXPERIMENTAL_COREPACK=1`, or pin `packageManager` to a supported version (e.g. `pnpm@10`). |
| `ERR_PNPM_IGNORED_BUILDS` on install | pnpm 11 replaced `onlyBuiltDependencies` with `allowBuilds`; keep it in `pnpm-workspace.yaml`. |
| `NODE_TYPESCRIPT_ERROR … Cannot find module '@mdg/domain' / '@mdg/validation'` | The API service's `apps/api` → `vercel-build` must compile the shared packages first: `pnpm -w run build:packages && prisma generate`. |
| `STATIC_BUILD_NO_OUT_DIR: No Output Directory named "public"` | A `vercel.json` inside the service root set `framework: null`. Keep the per-app configs named `vercel.standalone.json`. |
| `MISSING_SERVICE_CONFIG … specify an "entrypoint"` | Set `entrypoint: "app.ts"` on the api service; `apps/api/app.ts` must exist. |
| Web calls fail / CORS error | `CORS_ORIGINS` must equal the web origin exactly (scheme + host, no trailing slash); include preview URLs. |
| API 500 on `/docs` | Swagger **UI** is off in production by design; use `/openapi.json` or set `ENABLE_API_DOCS=true`. |
| Cold start felt by users | Neon free tier scales compute to zero; raise minimum compute or add a Cron warm-up (§11). |
| Change to `NEXT_PUBLIC_API_URL` had no effect | It is inlined at build time — **redeploy** the web project. |

---

## 16. Rollback

- **Vercel:** Deployments → pick the last good deployment → **Promote to Production**.
- **Database:** Neon supports **point-in-time restore** (Branches → restore). Migrations are applied
  forward only, so pair a code rollback with a database restore when a migration cannot be reversed.

---

## 17. Go-live checklist

- [ ] Neon project created; `DATABASE_URL` (pooled) and `DIRECT_URL` (direct) set on the API project
- [ ] `SESSION_SECRET`, `MANAGE_LINK_SECRET`, `CSRF_SECRET` set to strong random values
- [ ] `NODE_ENV=production`, `CORS_ORIGINS` = exact web origin(s)
- [ ] `pnpm exec prisma migrate deploy` applied
- [ ] First **OWNER** account created (demo seed **not** run)
- [ ] Real room types, physical rooms and rate plans created
- [ ] `NEXT_PUBLIC_API_URL` set on the web project and the web app redeployed
- [ ] `/health`, `/staff/login`, `/admin` verified on the production URL
- [ ] Custom domains added and CORS/URL vars updated
- [ ] Demo sign-in credentials removed
- [ ] Backups/retention confirmed in Neon
