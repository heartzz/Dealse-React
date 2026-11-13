# DealSe backend integration status and remaining plan

**Reviewed:** 2026-11-14
**Purpose:** Track the implemented local web/API integration and the remaining work toward a controlled staging and production release. This is a status document, not a release approval. Refer to the [MVP readiness audit](mvp-readiness-audit.md) for command-by-command test evidence.

## Current implementation

- **API:** NestJS modular monolith, Prisma/PostgreSQL/PostGIS persistence, OIDC/JWKS token verification, DTO validation, tenant-scoped retailer operations, customer discovery, retailer stores/products/offers, notifications/follows, media upload and Admin moderation/management.
- **Customer web:** Supabase SSR sessions; public marketplace, offer/store details, saved offers, profile and notification pages; claim issuance, one-time QR presentation, claim cancellation and claim history.
- **Retailer web:** retailer workspace for store/product/offer workflows, map coordinates, QR validation/confirmation and redemption history. A browser scanner using camera APIs is implemented, but a physical-camera scan has not been manually verified.
- **Admin web/API:** role, AAL2, active-account and explicit permission checks; retailer/store/offer review and moderation, category/report workflows, administrator/invitation management, private image review, audit history, and permission-scoped redemption inspection. API tests pass; authenticated Admin browser acceptance remains unverified.
- **Database:** eight checked-in additive Prisma migrations. The local `dealse_dev` database was previously verified with all eight applied. Production has not been migrated.
- **Mobile:** separate Expo/React Native customer and retailer app shells exist. Their product workflows and native QR scanning are not implemented or device-tested.

The exact route and access inventory is in [api-routes.md](api-routes.md). The OpenAPI YAML at `packages/contracts/openapi.yaml` is a legacy, incomplete document and does not describe all current NestJS routes; the controllers and DTOs are the implementation reference until the contract is reconciled.

## Local setup

Use Node.js 24.15.0 and pnpm 11.19.0, as pinned by `.node-version`, root `packageManager`, and CI. The root `engines.node` metadata currently specifies a lower compatibility floor (`>=22.13.0`); the documented and CI-tested runtime is 24.15.0.

```sh
pnpm install --frozen-lockfile
pnpm db:setup:local
pnpm dev:api
pnpm dev:web
```

`pnpm db:setup:local` is a guarded Windows setup for an absent `dealse_dev` database and `dealse_dev_app` role; it stops without changing either when they already exist. For an existing local DB, inspect it first, configure from [`apps/api/.env.example`](../apps/api/.env.example), and use `pnpm --filter @dealse/api db:migrate:deploy` to apply reviewed pending migrations. Configure web values from [`apps/web/.env.example`](../apps/web/.env.example). Never commit local `.env` files or place server-only Supabase credentials in web/mobile config.

API default: `http://127.0.0.1:3001`; health: `/api/v1/health`. Web default: port 3000; on PowerShell, run `$env:PORT='3100'; pnpm dev:web` when using port 3100.

## QR redemption behavior

The customer endpoint issues a high-entropy credential once; PostgreSQL stores its SHA-256 hash only. A repeated claim request returns existing metadata without returning the credential again. The customer UI presents the newly issued QR, while the retailer can scan or manually enter it, validate without consuming it, then confirm explicitly. Credentials expire after five minutes or at the earlier offer end; the flow is online-only.

The API binds a claim to the deal and authenticated customer from the session. `perCustomerLimit` is counted by both `dealId` and authenticated `customerUserId`; `maxRedemptions` is checked against the offer's global `redemptionCount`. Confirmation serializes capacity updates and writes the redeemed code, count, redemption and audit event atomically. Tests cover customers A/B/C, per-customer isolation, global capacity and concurrent confirmations. See [route behavior](api-routes.md) and [database invariants](database-schema.md).

## Verification snapshot

The local verification recorded on 2026-11-14 included 45 passing API tests, API lint/typecheck/build, web lint/typecheck/build, and seven passing focused browser tests with one skip. Browser coverage exercised customer redemption, retailer scanner error/manual-entry handling, scanner track cleanup, retailer location entry, and unauthenticated Admin redirects. The authenticated Admin browser case skipped because a real AAL2 Admin test account/TOTP configuration was not available. Passing browser tests do not verify a physical camera, every authenticated account workflow, staging, or production.

See [mvp-readiness-audit.md](mvp-readiness-audit.md) for exact files and limitations.

## Remaining work

1. Reconcile the legacy OpenAPI YAML with the full NestJS controller/DTO surface and add a contract drift check before generating or expanding clients.
2. Add retailer redemption analytics and Root Admin redemption reports; current retailer history and Admin record inspection are operational views, not analytics/reporting.
3. Run authenticated Admin browser tests with a dedicated real AAL2 test account. Broader customer/retailer session, profile, media and notification journeys also need dedicated acceptance coverage.
4. Test browser-camera permissions and scans with real devices, and test native camera/WebView behavior on supported iOS/Android devices after implementing the mobile product flows.
5. Provision isolated staging hosting, domains/TLS, Supabase, PostgreSQL/PostGIS and private object storage. Staging deployment has not been verified.
6. Establish production monitoring, log retention, backups and restore drills, incident ownership, migration rollout/rollback, rate limits, privacy/retention and support processes before release.

No live credentials should be added to documentation or source control. Production migrations require a separately reviewed release task; local setup instructions are not production instructions.
