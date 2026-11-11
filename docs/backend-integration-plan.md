# DealSe backend integration plan

This plan moves the current mock preview toward a working local marketplace. The Vite prototype remains a visual reference; production UI and integrations belong in `apps/web`, `apps/customer-mobile`, and `apps/retailer-mobile`.

## Current checkpoint

- The NestJS API, Prisma/PostGIS schema, one initial migration, OIDC JWT verification guard, `/api/v1/auth/me`, retailer creation, store creation/listing, OpenAPI contract, and a typed fetch client exist in the repository.
- PostgreSQL 18 is running locally on port `5432`. The dedicated `dealse_dev` database is connected through its app role, PostGIS 3.6.2 is installed, and the initial Prisma migration is applied and verified; Docker is not required.
- Supabase Auth is selected. The active milestone is email + password for customer and retailer website flows; mobile SMS OTP is deferred. The project URL, publishable key, issuer, and JWKS values are not configured. The API validates provider-issued access tokens; Supabase owns login, refresh, and logout.
- Production Next.js and React Native entry screens are still shells. The new sign-in/profile screens in `prototype/` use temporary in-memory state and are not connected to the API.
- The API does not yet implement product, deal, discovery, favourites/follows, or redemption handlers. The OpenAPI document currently lists a redemption operation without a corresponding NestJS controller; do not wire that operation until its implementation and contract agree.

## Sequence and completion gates

### 1. Prepare a working development environment

Use the repository-pinned Node.js 24.15.0 and pnpm 11.19.0. Use the installed PostgreSQL 18 service and run `pnpm db:setup:local`; it requests the superuser password through a hidden prompt, creates only `dealse_dev` and its dedicated app role, stores the generated app connection in ignored `apps/api/.env`, and applies the existing migrations. If the target database or app role already exists, the script stops without modifying it.

**Done when:** the local script verifies PostgreSQL/PostGIS, records the migration, and confirms the app-role connection; workspace dependency install and `pnpm check` work with the selected runtime.

### 2. Apply and verify the first database migration

**Status: complete (2026-11-08).** The migration `20261005090000_initial_p0` is applied to `dealse_dev`. The app-role connection, PostGIS 3.6.2 extension, core tables, spatial index, and Prisma migration state were verified.

Apply the initial migration only to an empty development database:

```sh
pnpm --filter @dealse/api db:migrate:dev
```

Verify PostGIS, the geography index, constraints, and Prisma migration state. Add only synthetic development category/store data after confirming the initial category list. Never use the local migration command against production.

**Done when:** the migration is recorded by Prisma and the API can connect to the resulting schema.

### 3. Configure Supabase Auth and website email/password

Supabase Auth is selected. For this milestone, use email/password sign-up and login for customer and retailer flows in the existing Next.js website, cookie-based session persistence, and logout. Set the project URL/publishable key in the ignored web env file, and configure the API issuer, audience, JWKS URL, and provider ID in the ignored API env without changing `DATABASE_URL`. Never configure a service-role key in clients. The first authenticated API request provisions the local user/profile and CUSTOMER role; retailer profile creation adds the RETAILER role and owner membership. Retailer authorization remains based on local PostgreSQL roles and membership/ownership. Keep the phone OTP implementation deferred.

**Done when:** customer and retailer website users can register, log in, retain their session across reloads, create/read their local profile through NestJS, access role-protected pages, and log out; retailer requests are role- and membership-scoped in PostgreSQL.

### 4. Complete the first vertical slice: customer and retailer website accounts

Use the existing Next.js app for both customer and retailer experiences. Keep Supabase sessions in secure HttpOnly cookies, and do not put long-lived tokens in browser storage. Connect the server actions to `/auth/me`, `/auth/me/profile`, `POST /retailers`, and the retailer membership-scoped reads. Native app sign-in remains a later task; mobile phone OTP stays deferred.

**Done when:** a new signed-in retailer creates an account and draft store, reloads, and sees the persisted store through a tenant-scoped API read; a second user cannot read or edit it.

### 5. Complete retailer products and deals

Add and document the NestJS product and deal modules before connecting their screens. Implement draft creation, validation, image metadata, retailer ownership, explicit review/publish transitions, and status rules. Keep product variants and inventory out of P0.

**Done when:** an authorized retailer can add a product, create a deal draft, preview it, and publish only through the approved state transition; data survives reload and cannot cross retailer boundaries.

### 6. Complete customer discovery and account

Add public category/store/deal discovery endpoints backed by PostgreSQL/PostGIS, then connect the customer web preview and customer mobile app. Implement sign-in, profile resolution, favourites/followed stores, and empty/loading/error states. Public discovery must work signed out; account identity is required for saved state.

**Done when:** a customer can discover nearby published deals, open details, save/follow, reload, and see their account data persisted; unpublished/expired deals are not exposed as active.

### 7. Add redemption and operational hardening

Implement and reconcile the redemption OpenAPI operation with a NestJS controller and service. Enforce short-lived single-use credentials, store/deal/customer binding, transactional confirmation, idempotency, server-side limits, and audit records. Add notifications, AI, analytics, and payments only after the marketplace pilot proves the need.

**Done when:** customer issuance and retailer confirmation work end to end, retries cannot double-redeem, and the production release path has backups, monitoring, rate limits, privacy retention, and migration procedures.

## Immediate next action

The database foundation is ready. Supabase Auth remains selected; website email/password is the current milestone and mobile SMS OTP is deferred. Configure the existing Supabase project's URL, publishable key, issuer, and JWKS values in ignored local env files, then verify customer registration and retailer registration end to end.
