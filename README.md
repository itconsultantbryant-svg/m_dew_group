# Mountain Dew Group — booking platform

A complete accommodation-booking platform for **Mountain Dew Group** (Monrovia, Liberia): a boutique
guest house and hotel with a restaurant serving Liberian dishes, a clothing boutique and an
entertainment centre with a cigar bar.

The **primary function is hotel booking** with persistent, reliable data. Restaurant, boutique and
entertainment enquiries are supported as secondary services.

This repository is a pnpm + TypeScript monorepo:

| Workspace | Package | Description |
| --- | --- | --- |
| `apps/api` | `@mdg/api` | Fastify + Prisma + PostgreSQL REST API (also used by staff and mobile) |
| `apps/web` | `@mdg/web` | Next.js 16 (App Router) + Tailwind CSS v4 public site, booking flow, guest management, staff portal and real-time admin console |
| `apps/mobile` | `@mdg/mobile` | Expo / React Native booking client (see `apps/mobile/README.md`) |
| `packages/domain` | `@mdg/domain` | Money, dates, states, roles and DTOs — the shared business core |
| `packages/validation` | `@mdg/validation` | Zod request schemas shared by API, web and mobile |
| `packages/api-client` | `@mdg/api-client` | Typed fetch client used by web and mobile |
| `packages/design-tokens` | `@mdg/design-tokens` | Brand palette, typography and spacing tokens (WCAG AA validated) |
| `packages/config` | `@mdg/config` | Shared tsconfig / lint base |

> **Demonstration data.** Room rates, taxes, menus, boutique items, events and contact details are
> clearly-marked placeholders awaiting business approval. Payment is collected **at the property**
> unless a payment provider is later configured. The seed data is not a source of truth for real
> prices or policies.

---

## Prerequisites

- **Node.js ≥ 20** (developed on Node 24)
- **pnpm 11** (`corepack enable` then `pnpm --version`)
- **PostgreSQL 15+** running locally (or a connection string to a managed database)

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Configure the API environment
cp .env.example apps/api/.env
#   edit apps/api/.env and set DATABASE_URL for your machine

# 3. Create the databases (once)
createdb mountain_dew_dev
createdb mountain_dew_test

# 4. Apply migrations and seed demonstration data
pnpm db:migrate          # prisma migrate deploy  (dev: pnpm --filter @mdg/api db:migrate:dev)
pnpm db:seed

# 5. Run the API (http://localhost:4100) and the web app (http://localhost:3000)
pnpm dev:api             # in one terminal
pnpm dev:web             # in another terminal
```

The API exposes interactive docs at `http://localhost:4100/docs` and the raw OpenAPI document at
`http://localhost:4100/openapi.json`. Regenerate the checked-in schema with
`pnpm --filter @mdg/api openapi`.

### Web environment

`apps/web` reads `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:4100`). Create
`apps/web/.env.local` when the API lives elsewhere:

```
NEXT_PUBLIC_API_URL="http://localhost:4100"
```

### Demonstration sign-in credentials

Created by the seed script — **change before any real use**:

| Role | Email | Password |
| --- | --- | --- |
| Owner | `owner@mountaindewgroup.test` | `OwnerAdmin!2026` |
| Front desk | `frontdesk@mountaindewgroup.test` | `Password!2026` |
| Finance | `finance@mountaindewgroup.test` | `Password!2026` |
| Guest | `guest@example.com` | `GuestUser!2026` |

---

## Common commands

| Command | Purpose |
| --- | --- |
| `pnpm dev:api` / `pnpm dev:web` | Start the API / web app in watch mode |
| `pnpm build` | Build all packages, the API (typecheck) and the web app |
| `pnpm typecheck` | Typecheck every workspace |
| `pnpm test` | Run all tests |
| `pnpm test:concurrency` | Inventory-integrity / concurrency test suite |
| `pnpm db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `pnpm db:seed` | Seed demonstration data |
| `pnpm db:reset` | Drop, re-migrate and re-seed the dev database |
| `pnpm --filter @mdg/api openapi` | Write `apps/api/openapi.json` |

---

## How booking works

1. **Search availability** — `GET /availability` reads precomputed nightly inventory.
2. **Price the stay** — `POST /quotes` returns line-item pricing and a deterministic `fingerprint`.
3. **Hold inventory** — `POST /holds` atomically reserves rooms for `HOLD_TTL_MINUTES` (default 15).
4. **Confirm** — `POST /reservations` validates the fingerprint, converts the hold into a
   `CONFIRMED` reservation and returns a signed management token.
5. **Manage** — guests look up a booking with reference + surname, then view or cancel it via a
   signed link (`GET /reservations/:reference`, `POST /reservations/:reference/cancel`).
6. **Front desk** — staff assign physical rooms, check guests in/out, record payments and no-shows
   from `apps/web/src/app/staff`.

### Data integrity guarantees

- **No overselling.** Nightly inventory lives in `room_type_nights (capacity, sold, blocked)`.
  Availability is consumed with an atomic conditional update,
  `UPDATE ... WHERE sold + blocked + qty <= capacity`, so concurrent requests cannot oversell.
- **No double assignment.** `room_assignment_nights` has a `UNIQUE(roomId, date)` constraint, so a
  physical room can never be assigned to two overlapping stays.
- **Idempotency.** Holds map 1:1 to reservations; cancellation and confirmation are idempotent, and
  mutating endpoints accept an `Idempotency-Key`.
- **Hold expiry.** Expired holds are released exactly once by a sweeper (on demand and every 60s).
- **Money.** All amounts are integer **minor units** (cents), never floats, in USD or LRD.

The `apps/api/test/concurrency` suite proves the oversell, idempotency, hold-expiry and
room-assignment invariants against a dedicated test database.

---

## Admin console

Staff sign in at `/staff/login`, then open the **Admin console** at `/admin`. The console uses a
permission-aware sidebar (entries appear only for roles that hold the required permission) and
keeps every screen live by polling on a short interval — pausing automatically when the tab is in
the background — with a manual **Refresh now** and a Live/Paused toggle.

- **Overview** — live KPIs (in-house, arrivals, occupancy, cash taken today, outstanding balance,
  open tasks, notification issues), arrivals/departures, latest bookings and an activity feed.
- **Reservations** — search and filter, open a stay to assign rooms, check in/out, record no-shows,
  resend confirmations, take payments and approve refunds.
- **Rooms & housekeeping** — update readiness, advance housekeeping tasks, and create/release
  maintenance or out-of-order blocks.
- **Payments** — see every outstanding balance and take a payment in one click.
- **Reports** — occupancy, ADR, RevPAR, revenue, cash and outstanding, with CSV export.
- **Notifications** — inspect the outbox queue and delivery history, and process the queue now.
- **Guests**, **Content** (publish/hide menu items, products and events; edit content blocks),
  **Team** (create accounts, change roles, reset passwords, disable staff) and **Audit log**.

The live overview is served by a single endpoint, `GET /staff/admin/overview`, from
`apps/api/src/routes/staff.ts`.

---

## Deploying (Neon + Vercel)

The project ships ready for **Neon** (PostgreSQL) and **Vercel**:

- **Two projects** (web + API as separate Vercel projects), or
- **One project with [Vercel Services](https://vercel.com/docs/services)** — the committed root
  `vercel.json` serves the web app at `/` and the API at `/api` on a shared domain, with the web's
  server-side calls reaching the API over a private `API_URL` binding.

The API serves everything under `API_BASE_PATH` (empty by default; `/api` in services mode), managed
by `apps/api/vercel.json` / root `vercel.json`, and Prisma uses a pooled `DATABASE_URL` (runtime) plus
an unpooled `DIRECT_URL` (migrations) for Neon.

See **[docs/DEPLOY-NEON-VERCEL.md](docs/DEPLOY-NEON-VERCEL.md)** for the full step-by-step guide
and **[docs/DEPLOYMENT.md §12](docs/DEPLOYMENT.md#12-neon--vercel-reference-deployment)** for the
condensed reference (project creation, environment variables, migrations and CORS).

---

## Repository layout

```
apps/
  api/        Fastify REST API, Prisma schema + migrations, seed, OpenAPI
  web/        Next.js App Router site (public, booking, manage, staff)
  mobile/     Expo / React Native client
packages/
  domain/       Money, dates, states, roles, DTOs
  validation/   Zod schemas
  api-client/   Typed HTTP client
  design-tokens/Brand tokens (colors, type, spacing)
  config/       Shared tsconfig / lint base
docs/
  DEPLOYMENT.md Deployment and operations guide
```

## Documentation

- [`docs/DEPLOY-NEON-VERCEL.md`](docs/DEPLOY-NEON-VERCEL.md) — step-by-step production deploy on
  **Neon + Vercel** (database, secrets, migrations, first admin, domains, troubleshooting).
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — broader production guide: secrets, migrations,
  backups, observability, container/host options and a go-live checklist.

## License

Proprietary — © Mountain Dew Group. All rights reserved.
