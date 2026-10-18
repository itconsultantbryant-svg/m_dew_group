# Deployment & operations guide

This guide covers taking the Mountain Dew Group platform from local development to production:
a managed PostgreSQL database, the Fastify API, the Next.js web app, and the Expo mobile builds.

> The application is designed to run **without online payments** (pay-at-property). Enabling a
> payment provider is optional and described at the end.

---

## 1. Services and topology

```
                 ┌───────────────────┐
  Guests ───────▶│  Web (Next.js)    │──┐
                 └───────────────────┘  │
                 ┌───────────────────┐  │      ┌──────────────────┐      ┌──────────────────┐
  Staff  ───────▶│  Staff portal     │──┼─────▶│  API (Fastify)   │─────▶│  PostgreSQL      │
                 │  (same Next app)  │  │      │  Node 20+        │      │  (managed)       │
                 └───────────────────┘  │      └───────┬──────────┘      └──────────────────┘
                 ┌───────────────────┐  │              │
  Mobile ───────▶│  Expo app         │──┘              ▼
                 └───────────────────┘        ┌──────────────────┐
                                              │ Outbox / email,  │
                                              │ SMS, push, S3    │
                                              └──────────────────┘
```

Recommended hosting: a managed PostgreSQL (e.g. Neon, Supabase, RDS), the API on any Node host
(Render, Fly.io, Railway, ECS, a small VPS behind a reverse proxy), the web app on Vercel or the
same Node host. The API is stateless apart from the database, so it scales horizontally.

> **This project is configured for Neon (database) + Vercel (web and API as serverless functions).**
> See the step-by-step reference in [section 12](#12-neon--vercel-reference-deployment).

---

## 2. Environment variables

All variables are documented in [`.env.example`](../.env.example). The most important ones:

### API (`apps/api/.env` or host environment)

| Variable | Notes |
| --- | --- |
| `NODE_ENV` | `production` in production (enables stricter logging). |
| `DATABASE_URL` | **Pooled** PostgreSQL connection string (Neon `…-pooler.…`). Append `?sslmode=require`. |
| `DIRECT_URL` | **Unpooled** connection string (Neon direct endpoint). Used only by `prisma migrate`/introspection. |
| `API_PORT` / `API_HOST` | Default `4100` / `0.0.0.0`. Most hosts inject `PORT`; map it. |
| `CORS_ORIGINS` | Comma-separated list of exact browser origins (your web domain). |
| `PUBLIC_WEB_URL` | Public web origin, used to build links in messages. |
| `PUBLIC_API_URL` | Public API origin, used in the OpenAPI `servers` list. |
| `SESSION_SECRET`, `MANAGE_LINK_SECRET`, `CSRF_SECRET` | **Required.** 32+ byte random strings. |
| `ACCESS_TOKEN_TTL_MINUTES`, `REFRESH_TOKEN_TTL_DAYS`, `HOLD_TTL_MINUTES` | Token and hold lifetimes. |
| `REQUIRE_STAFF_MFA` | `true` to require TOTP for staff with MFA enabled. |
| `EMAIL_PROVIDER`, `SMTP_URL`, `EMAIL_FROM` | Outbound email. Blank = logged/limited mode. |
| `SMS_PROVIDER`, `SMS_API_KEY`, `WHATSAPP_*` | Outbound SMS/WhatsApp. |
| `EXPO_PUSH_ACCESS_TOKEN` | Expo push notifications for the mobile app. |
| `S3_*` | Media storage for uploaded images. |
| `RATE_LIMIT_HOLD_PER_HOUR`, `RATE_LIMIT_LOGIN_PER_15MIN` | Abuse throttles. |

Generate secrets with:

```bash
openssl rand -base64 48   # run three times, one per secret
```

### Web (`apps/web`)

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Public API origin reachable from the browser, e.g. `https://api.example.com`. |

> **Important:** notification and storage credentials are optional. When they are absent the system
> reports a **configuration limitation** in the notification queue instead of silently pretending a
> message was delivered. Check `GET /staff/notifications` after go-live.

---

## 3. Database

1. Provision PostgreSQL 15+ and obtain a pooled connection string (`DATABASE_URL`) and an unpooled
   one (`DIRECT_URL`). On Neon these are the two strings shown in the project's **Connection
   details** panel; both need `?sslmode=require`.
2. Apply migrations (never edit applied migrations). Migrate uses `DIRECT_URL`, so pass both:

   ```bash
   DATABASE_URL="postgres://…-pooler…" DIRECT_URL="postgres://…" \
     pnpm --filter @mdg/api db:migrate   # prisma migrate deploy
   ```

   A helper is available: `pnpm --filter @mdg/api db:migrate` reads `apps/api/.env`, so putting both
   strings there is usually simplest.

3. Seed **initial** reference data only where appropriate. Do **not** run the demonstration seed in
   production; instead create an owner user and real room types/rates via the database or a
   one-off, reviewed script. The demo seed writes placeholder prices that must not be presented as
   real.

Migrations are additive and safe to run on a live database with a rolling deploy (forward-only).
Take a backup before applying migrations that add non-null columns or indexes to large tables.

### Backups and retention

- Enable automated daily snapshots with point-in-time recovery on the managed database.
- Retain at least 30 days. Restore-test at least once per quarter.
- Reservations, payments, folios and audit logs are the records of business; treat them as
  financial data.

---

## 4. Deploying the API

### Option A — container image

```dockerfile
FROM node:24-slim AS base
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile && pnpm -r --filter './packages/**' build
ENV NODE_ENV=production
EXPOSE 4100
CMD ["pnpm", "--filter", "@mdg/api", "start"]
```

Run `prisma migrate deploy` as a release step (or a one-shot job) before starting new API
containers.

### Option B — host buildpack

- Build command: `pnpm install && pnpm -r --filter './packages/**' build`
- Start command: `pnpm --filter @mdg/api start`
- Health check path: `/health`

The API listens on `API_PORT` (map your host's `PORT` to it). Because it holds long-lived DB
connections, size the pool to the database's connection limit; with several API instances either
use a pooled connection string (PgBouncer / provider pooler) or set `connection_limit` in
`DATABASE_URL`.

---

## 5. Deploying the web app

- Build: `pnpm --filter @mdg/web build` (set `NEXT_PUBLIC_API_URL` at build time).
- Start: `pnpm --filter @mdg/web start` (or deploy to Vercel; set the env var in project settings).
- The public content pages and room detail pages are server-rendered on demand; the booking flow,
  manage-booking and staff portal are client components that call the API directly.

Ensure `CORS_ORIGINS` on the API includes the exact web origin (scheme, host, port).

---

## 6. Mobile app

- Configure `apps/mobile/.env` / EAS secrets with `EXPO_PUBLIC_API_URL` pointing at the public API.
- Build with EAS: `eas build --platform ios|android` (see `apps/mobile/README.md`).
- Add the Expo push token issuance to your notification provider and set `EXPO_PUSH_ACCESS_TOKEN`.

---

## 7. Security

- Serve everything over HTTPS/TLS; redirect HTTP to HTTPS at the edge.
- Keep `CORS_ORIGINS` tight; never use `*` with credentials.
- Rotate `SESSION_SECRET`, `MANAGE_LINK_SECRET` and `CSRF_SECRET` on a schedule and after any
  suspected exposure (rotating invalidates existing links/sessions).
- Enable `REQUIRE_STAFF_MFA=true` and enrol privileged staff in TOTP.
- The API sets security headers via `@fastify/helmet`, global rate limits, and stricter limits on
  login and hold creation.
- Staff passwords are stored as salted hashes; sign-in is locked after repeated failures.
- Never log secrets or full payment details.

---

## 8. Observability

- API logs are structured JSON; ship them to your log platform and alert on `level: 50` (errors).
- Monitor `GET /health` from an uptime checker.
- Watch the notification queue (`GET /staff/notifications`) for failed deliveries and the
  `outbox` processing errors in logs.
- Track key business metrics via `GET /staff/reports/summary` (occupancy, ADR, RevPAR, revenue,
  outstanding balances).

---

## 9. Enabling online payments (optional)

The platform collects payment **at the property** by default. To accept deposits online, integrate
the provider you contract with (e.g. Flutterwave/Stripe), set the corresponding secret keys, update
the quote's `settlementPolicy`/`dueOnlineToday` logic in `apps/api/src/inventory/pricing.ts`, and
record captured payments through the existing payment ledger (`recordPayment`). Always reconcile
provider webhooks against the ledger and keep idempotency keys on charge creation.

---

## 10. Go-live checklist

- [ ] Production PostgreSQL provisioned, migrations applied, backups scheduled.
- [ ] Real room types, physical rooms, rate plans and cancellation policy entered (demo seed NOT
      used in production).
- [ ] Taxes/fees configured and reviewed for the jurisdiction.
- [ ] `SESSION_SECRET` / `MANAGE_LINK_SECRET` / `CSRF_SECRET` set to unique random values.
- [ ] `NODE_ENV=production`, `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` correct.
- [ ] Owner account created; demo staff accounts removed or re-passworded; MFA enabled.
- [ ] Email/SMS provider configured; a test confirmation delivered end to end.
- [ ] Object storage configured if staff will upload media.
- [ ] TLS enforced; `GET /health` monitored; error logging shipped.
- [ ] A full booking made on production and cancelled; inventory verified restored.
- [ ] Contact details, address and policies reviewed and approved by the business.

---

## 11. Rollback

- **Web/API:** redeploy the previous image or revision (they are stateless).
- **Database:** migrations are forward-only. Prefer rolling forward with a fix; restore from a
  point-in-time backup only as a last resort, and re-run any missed migrations afterwards.
- After a rollback, re-check the notification queue and today's arrivals/departures on the staff
  dashboard.

---

## 12. Neon + Vercel reference deployment

This is the supported deployment shape for this repository: **Neon** for PostgreSQL, and **Vercel**
for both the web app and the API (the Fastify app is exported as a single serverless function).

> For a dedicated, copy-paste walkthrough (Neon CLI, secret generation, first-admin bootstrap,
> custom domains and troubleshooting), see
> **[`docs/DEPLOY-NEON-VERCEL.md`](DEPLOY-NEON-VERCEL.md)**. The section below is the condensed
> reference.

### 12.1 Prerequisites

- A Neon account (`npx neonctl auth` or the console) and a Vercel account.
- `npx neonctl@latest` and `npx vercel@latest` (or install the Vercel CLI globally).
- The repository pushed to Git (GitHub/GitLab/Bitbucket) — recommended for Vercel.

### 12.2 Create the Neon database

```bash
npx neonctl projects create \
  --name mountain-dew-group \
  --region-id aws-eu-west-2 \
  --pg-version 16
```

Copy the two connection strings from the output (or the Neon console → *Connection details*):

- **Pooled** (host contains `-pooler`) → `DATABASE_URL` for the running app.
- **Unpooled / direct** → `DIRECT_URL` for migrations.

Both must keep `?sslmode=require`.

### 12.3 Deploy the API project to Vercel

Create a Vercel project from the same repository with:

| Setting | Value |
| --- | --- |
| **Root Directory** | `apps/api` |
| Framework Preset | Other |
| Build Command | uses `apps/api/vercel.json` (`pnpm -w run vercel-build:api`) |
| Install Command | `pnpm install` (Vercel detects the pnpm workspace) |

Environment variables (Production **and** Preview):

| Key | Value |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** connection string |
| `DIRECT_URL` | Neon **direct** connection string |
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | `openssl rand -base64 48` |
| `MANAGE_LINK_SECRET` | `openssl rand -base64 48` |
| `CSRF_SECRET` | `openssl rand -base64 48` |
| `PUBLIC_API_URL` | `https://<api-project>.vercel.app` |
| `PUBLIC_WEB_URL` | `https://<web-project>.vercel.app` |
| `CORS_ORIGINS` | `https://<web-project>.vercel.app` (+ custom domain) |
| `REQUIRE_STAFF_MFA` | `true` once TOTP is enrolled |

Deploy. `apps/api/vercel.json` rewrites every path to the serverless entry `api/index.ts`, which
reuses one Fastify instance per warm lambda. `app/api/index.ts` imports the app from `src/`, and the
build runs `prisma generate` so the correct engine is bundled.

Health check: `GET https://<api-project>.vercel.app/health`.

### 12.4 Apply migrations and (optionally) seed

Migrations are **not** run automatically on Vercel. Run them once from a machine with the Neon
strings (use the **direct** URL for `DIRECT_URL`):

```bash
cd apps/api
DATABASE_URL="postgres://…-pooler…" DIRECT_URL="postgres://…" pnpm exec prisma migrate deploy
DATABASE_URL="postgres://…-pooler…" DIRECT_URL="postgres://…" pnpm exec prisma db seed   # DEMO only
```

> Do **not** run the demonstration seed in production. Create the owner account and real room
> types, physical rooms and rate plans deliberately (see [section 3](#3-database)).

### 12.5 Deploy the web project to Vercel

Second Vercel project from the same repository:

| Setting | Value |
| --- | --- |
| **Root Directory** | `apps/web` |
| Framework Preset | Next.js |
| Build Command | uses `apps/web/vercel.json` (`pnpm -w run vercel-build:web`) |

Environment variables:

| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://<api-project>.vercel.app` |

`NEXT_PUBLIC_API_URL` is inlined at **build time** — redeploy the web project after changing it.

Finally, make sure the API's `CORS_ORIGINS` contains the exact web origin (scheme + host, no trailing
slash) and redeploy the API if you change it.

### 12.6 The admin console

Staff sign in at `/staff/login` and can open the **Admin console** at `/admin`. It has a
permission-aware sidebar (items appear only if the signed-in role allows them) and refreshes
automatically:

| Section | Live data | Manage |
| --- | --- | --- |
| Overview | KPIs, arrivals/departures, activity feed (6 s) | — |
| Reservations | search results (8 s) | check in/out, assign rooms, cancel, no-show, resend |
| Rooms & housekeeping | rooms, tasks, blocks (8–15 s) | set readiness, advance tasks, block/release rooms |
| Payments | balances due (10 s) | take payments, approve refunds |
| Reports | occupancy, ADR, RevPAR, cash (20 s) | CSV export |
| Notifications | outbox + deliveries (8 s) | process the outbox now |
| Guests | profiles + history (12 s) | — |
| Content | catalogue (15 s) | publish/hide menu items, products and events; edit blocks |
| Team | staff accounts (15 s) | create accounts, change roles, reset passwords, disable |
| Audit log | every privileged change (10 s) | — |

The overview is served by `GET /staff/admin/overview` (a single call the dashboard polls), and team
management by `GET/POST/PATCH /staff/users`. Live screens poll on an interval, pause automatically
when the tab is hidden, and expose a **Live/Paused** toggle.

### 12.7 Serverless notes

- The Swagger **UI** (`/docs`) is disabled when `NODE_ENV=production` because it reads static assets
  from disk. The machine-readable `GET /openapi.json` is always available. Set `ENABLE_API_DOCS=true`
  if you really need the UI.
- Neon's free tier scales compute to zero; the first request after idle can take a second or two
  (visible as a cold start). Enable a higher minimum compute or warm the function if that matters.
- Background work (hold expiry sweep, outbox processing) runs lazily on request in serverless. For
  guaranteed scheduling, add a Vercel Cron hitting a small endpoint, or run the long-lived server
  below.

### 12.8 Alternative: long-running API host

If you prefer a always-on Node host (Render/Railway/Fly/VPS) instead of serverless, use:

- Build: `pnpm install && pnpm -r --filter './packages/**' build && pnpm --filter @mdg/api exec prisma generate`
- Start: `pnpm --filter @mdg/api start`
- Health check: `/health`

Everything else (Neon strings, secrets, CORS) is identical.
