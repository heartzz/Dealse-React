# DealSe

DealSe is a local-discovery marketplace that connects customers with nearby retailers and time-limited offers. The current product is a web-first local implementation for browsing offers, managing retailer workspaces, moderating marketplace content, and redeeming offers in store with short-lived QR credentials. The repository also contains separate Expo app shells; the native product flows are not implemented.

This repository is an active development/staging candidate, **not a production deployment or production-ready service**. See the [MVP readiness audit](docs/mvp-readiness-audit.md) for verified scope and open work.

## Current implementation

- **Customers:** public offer and store discovery, search/category/city filters, opt-in nearby search, offer/store details, favourites, followed stores, profile editing, in-app notifications, and a redemption-claims list.
- **Retailers:** website registration/session routes, tenant-scoped store/product/offer workflows, image galleries, draft/preview/publish/pause, store map coordinates, QR validation/confirmation, and store-scoped redemption history.
- **Admin:** role- and permission-guarded Backoffice for retailer, store, offer, report, category and administrator review/management, private image review, and audit history. Admin API access requires the database Admin role, an active account, AAL2 and the route permission.
- **QR redemption:** customers request a claim for an eligible offer. The API returns a high-entropy credential once and persists only its SHA-256 hash. The web client displays a QR; a retailer scans it or enters the credential, validates it without changing state, then explicitly confirms redemption. Confirmation is transactional, idempotent and checks the offer-wide cap independently from the authenticated customer’s per-customer cap. Claims expire after five minutes or at the earlier offer end. There is no offline redemption.
- **Marketplace data:** PostgreSQL/PostGIS is the system of record. Prisma migrations and PostgreSQL integration tests cover marketplace, moderation, notifications and redemption invariants.

The browser redemption workflow has focused local Playwright coverage. A successful manual scan using a physical camera, production-like hosting, live Admin AAL2 browser acceptance, and mobile app flows have not been verified. A web scanner component using browser camera APIs is implemented; see the audit for its test boundaries.

## Technology

- Node.js and pnpm workspaces; TypeScript
- Next.js App Router, React, server actions and Supabase SSR for the web experience
- NestJS REST API with DTO validation and OIDC/JWKS access-token verification
- PostgreSQL 18 with PostGIS; Prisma schema, client and migrations
- Expo Router / React Native shells for distinct customer and retailer apps
- Playwright for web browser checks; Node test runner for API integration suites

## Repository layout

```text
apps/api/                 NestJS modules, Prisma schema/migrations, API tests
apps/web/                 Next.js customer, retailer and Admin web workspaces
apps/customer-mobile/     Expo customer app shell (native flows not implemented)
apps/retailer-mobile/     Expo retailer app shell (native flows not implemented)
packages/contracts/       Existing OpenAPI YAML; currently legacy/incomplete
packages/api-client/      Typed client for the operations it currently covers
packages/design-tokens/   Shared design tokens
prototype/                Vite/React product reference and prototype tests
docs/                     Architecture, routes, schema, readiness and setup notes
infra/local/              Optional local Docker Compose services
```

NestJS controllers and DTOs are the current API implementation source. The checked-in OpenAPI YAML has not been reconciled with the full current route set and must not be treated as a complete generated contract.

## Prerequisites

- Node.js **24.15.0** (the version in `.node-version` and GitHub Actions)
- pnpm **11.19.0** (the root `packageManager` and GitHub Actions version)
- PostgreSQL **18** with PostGIS available, either installed locally or through the optional Docker Compose configuration
- A Supabase project for real web authentication; local API integration tests use test identity fixtures and do not require a live Supabase login

The root `engines.node` field currently advertises a compatibility floor of `>=22.13.0`; the repository-pinned and CI-tested version is 24.15.0. Use the pinned version for local development and CI parity.

## Local development

Install the locked workspace dependencies:

```sh
pnpm install --frozen-lockfile
```

For a new local PostgreSQL setup, use the guarded Windows setup script:

```powershell
pnpm db:setup:local
```

It creates only the dedicated `dealse_dev` database and `dealse_dev_app` role, applies the checked-in migrations, and stops without modifying anything if either already exists. Review the setup script and [database documentation](docs/database-schema.md) before using another PostgreSQL environment. Docker alternatives are `pnpm db:up` and `pnpm db:down`.

Configure local environments with values from your own services:

- API: use [`apps/api/.env.example`](apps/api/.env.example) as the variable reference. On a new database, `pnpm db:setup:local` creates ignored `apps/api/.env` with the app `DATABASE_URL`; add the required OIDC values without replacing that database setting. For an existing local database, create/configure the ignored file deliberately and do not rerun the guarded setup script.
- Web: [`apps/web/.env.example`](apps/web/.env.example) → ignored `apps/web/.env.local`
- Playwright test accounts (optional): [`apps/web/e2e/test-accounts.env.example`](apps/web/e2e/test-accounts.env.example) → ignored `apps/web/.env.test.local`

Do not put credentials in this README, source control, browser storage, or client bundles. The API environment contains database/OIDC and server-only media/admin settings. The web example contains the public Supabase URL/key and API origin. Keep Supabase service-role/secret keys on the API server only. Real authenticated E2E credentials belong only in `.env.test.local`; they are not needed for the API integration suite.

The local API listens on port 3001 by default. The web app defaults to Next.js port 3000; to use the commonly configured local port 3100 in PowerShell:

```powershell
$env:PORT='3100'; pnpm dev:web
```

Start the API separately with:

```sh
pnpm dev:api
```

Health check: `http://127.0.0.1:3001/api/v1/health`.

## Database and migrations

The Prisma schema and additive migrations live in `apps/api/prisma/`. The repository currently contains eight migrations, including account roles, marketplace fields, moderation, notifications, Admin support, and the one-issued-code-per-customer/deal constraint. They preserve redemption history; the latest index applies only to issued claims. The local `dealse_dev` database was previously verified with all eight applied. Production has not been migrated.

Inspect migration state and apply pending migrations only to the intended development database:

```sh
pnpm --filter @dealse/api exec prisma migrate status
pnpm --filter @dealse/api db:migrate:deploy
```

For schema development on a disposable local database, the API also exposes `pnpm --filter @dealse/api db:migrate:dev`. Do not use development migration commands against production. Review [the schema and migration notes](docs/database-schema.md) before changing persistent data.

## Development and verification commands

```sh
# Development servers
pnpm dev:api
pnpm dev:web

# Native app shells only; native product workflows are not implemented
pnpm dev:customer
pnpm dev:retailer

# API checks
pnpm --filter @dealse/api lint
pnpm --filter @dealse/api typecheck
pnpm --filter @dealse/api test
pnpm --filter @dealse/api build

# Web checks
pnpm --filter @dealse/web lint
pnpm --filter @dealse/web typecheck
pnpm --filter @dealse/web test:e2e
pnpm --filter @dealse/web build

# Workspace lint, typecheck and production builds
pnpm check
```

The API suite requires PostgreSQL/PostGIS. Playwright may use real disposable accounts from the optional test env file; tests that require unavailable credentials skip rather than creating mocked authenticated sessions. CI also runs API integration tests against PostgreSQL/PostGIS and a Chromium browser job for the public web acceptance paths. For exact scope and latest local results, see the [readiness audit](docs/mvp-readiness-audit.md).

## Deployment status and roadmap

Token-based staging deployment files are available for Netlify and Render, triggered by pushes to `stabilization/retailer-offer-workflow`. Follow [deployment setup](docs/deployment.md) for first-image bootstrap, private registry access, service IDs, environment variables and rollback. The hosted staging deployment and automatic branch deployment have been verified; the website now uses `https://dealse.app`. See the [infrastructure handover runbook](infra/README.md) for account changes and the deployment guide for verification boundaries.

The public domain and TLS do not establish production readiness. Real-user acceptance, security dependency remediation, monitoring, backups/restore drills, incident operations and migration rollback verification remain open. The services retain staging names. Future production work should establish the required isolation and operational checks described in [the architecture](docs/architecture.md).

## Documentation

- [Infrastructure account transfer and migration runbook](infra/README.md)

- [Architecture and deployment decisions](docs/architecture.md)
- [Backend integration status and remaining plan](docs/backend-integration-plan.md)
- [MVP readiness and verification evidence](docs/mvp-readiness-audit.md)
- [REST API route reference](docs/api-routes.md)
- [PostgreSQL/Prisma schema and migration notes](docs/database-schema.md)
- [Local Admin setup](docs/admin-backoffice-local-setup.md)
- [Design system](docs/design-system.md)
- [ADR index](docs/adr/)
