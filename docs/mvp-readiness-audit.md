# DealSe implementation and readiness audit

**Audit date:** 2026-11-14
**Scope:** Current Next.js web experience, NestJS API, Prisma/PostgreSQL/PostGIS schema, Admin Backoffice, QR redemption, CI, and available local verification.
**Evidence rule:** Source presence is implementation evidence only. API integration tests, browser tests, manual checks, and production operations are reported separately. Passing a focused journey does not prove unrelated authenticated or production behavior.

## Executive result

DealSe is a functioning local web/API marketplace implementation, not an empty app shell and not a production deployment. It includes customer discovery and account pages, retailer store/product/offer workflows, image upload and galleries, notifications/follows, Admin moderation and administrator management, and a complete web/API QR claim and redemption path. PostgreSQL/PostGIS is the application system of record. Eight additive Prisma migrations are checked in; all eight were previously verified applied to the existing local `dealse_dev` database. Production has not been migrated or deployed.

The 2026-11-14 local verification recorded 45 passing API tests, API lint/typecheck/build, web lint/typecheck/build, and seven passing focused browser tests with one skipped Admin test. Web lint reported ten `<img>` optimization warnings and no errors. The focused browser tests used configured real customer/retailer test accounts for redemption journeys. They do not verify every authenticated workflow, Admin AAL2 browser acceptance, physical-camera scanning, mobile apps, staging, or production.

## Status vocabulary

- **Implemented:** the code path is present in the current application.
- **API integration tested:** PostgreSQL/PostGIS tests exercise the stated behavior.
- **Browser tested:** Playwright exercised the stated web path in a local environment. This does not imply manual testing.
- **Manually verified:** an operator performed and recorded a direct manual check; no manual physical-camera or production verification is claimed here.
- **Not yet verified:** implementation exists but the stated path lacks evidence.
- **Planned:** intentionally not implemented yet.
- **Blocked by external configuration:** requires a service, credential, host, device, or operational setup that is not currently available/configured.

## Feature status and evidence

| Feature | Current implementation | Verification and limits |
|---|---|---|
| Customer marketplace | Public Next.js home, search/category/city/sort, opt-in nearby discovery, offer dialog and canonical deal/store pages, favourites, followed stores, profile and notification pages. | API integration tests cover discovery, PostGIS ordering, favourites/follows and notifications. Public browser coverage exists in CI and local Playwright. Authenticated profile/save/follow/notification behavior is not fully browser-verified. |
| Retailer workspace | Web registration/setup routes, tenant-scoped store/product/offer CRUD, draft/preview/publish/pause, map-coordinate entry, media upload/crop/gallery management, and notifications. | API integration tests cover authorization, lifecycle, media validation/retry and tenant denial. Focused browser coverage checks store coordinate capture. Broad authenticated editing/upload journeys remain not yet verified. |
| Admin Backoffice | `/admin` login/dashboard, retailer/store/offer review and detail pages, approve/reject/pause/suspend/resume/reactivate actions where applicable, category/report management, admin user/invitation management, private image review and audit history. API checks require database Admin role, verified AAL2, active account and exact permission. | API integration tests passed in the 45-test suite, including hierarchy/permission, moderation, store-coordinate verification and transactional audit cases. Browser test for anonymous redirects passed. Authenticated Admin sign-in, AAL2 and responsive workflows were skipped because a real AAL2 Admin account/TOTP was not configured. Live Supabase MFA is not verified. |
| Customer QR claim | Customer can claim an eligible offer, display a one-time QR credential, close the dialog, view claim status/history and cancel a claim. Credentials are not returned in claim history. | API integration tests cover session-scoped identity, hash-only credential storage, retry, cancellation, expiry and customer claims. Customer redemption Playwright tests passed for QR presentation, expiry, cancellation, history and network-failure retry using a configured real test account. |
| Retailer QR redemption | Retailer can validate a credential without consuming it, confirm it explicitly, and view paginated store-scoped redemption history. Browser camera scanner has manual credential entry and validation/confirmation UI. | API integration tests cover invalid/expired/redeemed tokens, tenant scope, idempotency, atomic count/audit writes and concurrency. Browser tests passed for denied camera permission/manual entry, retryable history failure, and stopping camera tracks on close. Physical camera scanning and device permission behavior have not been manually verified. |
| Redemption limits | `perCustomerLimit` is independently counted by both offer/deal ID and the authenticated customer user ID. `maxRedemptions` is checked against offer-wide `redemptionCount`. Only confirmation increments global count; locks/conditional updates prevent concurrent over-capacity confirmations. | PostgreSQL integration test covers customers A/B/C, per-customer isolation and concurrent confirmations at global capacity. No separate production traffic/race test has been run. |
| Admin redemption access | Admin API provides permission-scoped redemption and claim inspection, with safe metadata and no credential hash disclosure. | API integration coverage passed. Root Admin redemption reports/analytics dashboards are not implemented. |
| Media | Authenticated Next.js proxy and NestJS upload API validate/optimize images, manage store/product/offer galleries and use local development storage or the Supabase Storage adapter. | API integration covers content validation, retry, replacement, ordering, associations, visibility and tenant denial. Crop editor adjustment/export has browser coverage. A private production storage bucket, production credential, CDN policy and lifecycle operations are not configured. |
| Native apps | Separate Expo Router customer and retailer app shells share design tokens. | Product workflows are planned; no React Native functionality, device build, native QR scan, or WebView behavior is claimed as implemented or tested. |
| Analytics | Existing dashboard displays operational/derived counts. | Retailer redemption analytics, a durable analytics event API, and Root Admin redemption reports are not implemented. |
| OpenAPI | Controllers/DTOs define the running API. `packages/contracts/openapi.yaml` and typed client cover a subset/legacy shape. | The YAML is not synchronized with the current NestJS routes. Contract reconciliation, generated-client coverage and CI drift checks are outstanding. |

## Redemption invariants

- Customer identity is supplied by the authenticated API principal. Client-supplied customer IDs do not determine ownership or limits.
- `perCustomerLimit` is per `(dealId, authenticated customerUserId)`. Another customer's redemptions do not count against the caller.
- `maxRedemptions` is global to the deal and is checked independently against `redemptionCount`.
- A claim does not reserve global capacity. Successful confirmation increments the count inside the transaction.
- The raw high-entropy QR credential is returned once; only its SHA-256 hash is stored. Claims expire after five minutes or at the earlier offer end.
- Confirmation is online, retailer-authorized, idempotent, and writes code status, redemption count, redemption history and audit together.
- The additive partial unique index allows at most one issued code per customer/deal while retaining redeemed, expired and revoked history.

## Database and migrations

The schema covers users/roles/profiles, retailers/memberships, stores with PostGIS locations, categories, products, media, deals and moderation, reports, favourites/follows, notifications, Admin accounts/permissions/invitations, redemption claims/redemptions and audit logs. Eight additive Prisma migrations are checked in; the local `dealse_dev` database was previously verified with all eight applied. No database recreation or production migration is claimed.

The most recent migration, `20261113120000_one_issued_redemption_code_per_customer_deal`, preflights duplicate issued claims and adds the partial unique index. Integration tests verify the migration/index behavior and preservation of historical redemption states. See [database-schema.md](database-schema.md) for the full migration inventory and rollout cautions.

## Verification recorded on 2026-11-14

### API

- `pnpm --filter @dealse/api test` — **45 passed, 0 failed**, against the configured local PostgreSQL/PostGIS environment. This includes Admin, auth, marketplace/media and redemption integration tests.
- `pnpm --filter @dealse/api lint` — passed.
- `pnpm --filter @dealse/api typecheck` — passed.
- `pnpm --filter @dealse/api build` — passed.

### Web

- `pnpm --filter @dealse/web lint` — passed with 0 errors and 10 `@next/next/no-img-element` optimization warnings.
- `pnpm --filter @dealse/web typecheck` — passed.
- `pnpm --filter @dealse/web build` — passed.
- Focused Playwright command:

  ```sh
  pnpm --filter @dealse/web exec playwright test \
    e2e/customer-redemption.spec.ts \
    e2e/retailer-redemption.spec.ts \
    e2e/retailer-store-location.spec.ts \
    e2e/admin-moderation.spec.ts
  ```

  **7 passed, 1 skipped.** The skipped test is authenticated Admin sign-in/moderation and requires a real AAL2 test account/TOTP configuration. The public anonymous Admin redirect test passed. Customer and retailer redemption tests used configured real test accounts; no mocked authenticated sessions were installed.

- `git diff --check` passed for the implementation changes preceding this documentation review.

These are local test results, not staging/production evidence. CI has three jobs: workspace lint/typecheck/build, API integration tests against PostgreSQL/PostGIS, and Chromium public-marketplace browser tests with a demo catalogue. CI does not currently establish authenticated Admin browser behavior or physical-device scanning.

## Outstanding work

- Retailer redemption analytics and Root Admin redemption reports.
- Authenticated Admin browser testing with a real dedicated AAL2 account; live Supabase MFA behavior remains unverified.
- Real mobile camera scanning, native customer/retailer flows, and WebView/device testing.
- Broader authenticated browser acceptance for customer and retailer profile, notification, store/offer editing and media journeys.
- Staging hosting, domains/TLS and configuration. The repository contains a deployment plan, but staging deployment is not verified.
- Production hosting, Supabase/PostgreSQL/PostGIS configuration, private object storage and CDN policy.
- Operational monitoring, error alerts, log retention, backup/restore drills, incident ownership, and migration rollout/rollback.
- API-wide distributed rate limiting, privacy/retention and support procedures, OpenAPI reconciliation and contract drift checks.

No production readiness or deployment claim is made. See [architecture.md](architecture.md), [backend-integration-plan.md](backend-integration-plan.md), and [api-routes.md](api-routes.md) for related decisions and interfaces.
