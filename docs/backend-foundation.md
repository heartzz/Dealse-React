# DealSe backend foundation — superseded prototype proposal

> **Superseded on 2026-10-05.** This document proposed a Cloudflare Worker + D1 backend. That direction is not approved for production. The current architecture source of truth is [`architecture.md`](architecture.md), which recommends NestJS + PostgreSQL/PostGIS and conditionally Redis. The Worker and migration remain historical experimental prototype artifacts only; do not configure or extend them as DealSe's production backend.

The material below records the state and reasoning of the earlier prototype proposal. Statements such as “implemented” refer only to disconnected Worker code, not a deployed or UI-integrated service.

**Status:** Initial API slice and proposed schema are in source; no production service is configured.
**Current state:** The web prototype still uses an in-memory React session. The Worker now has database-backed endpoints for code issue/check/confirm and retailer history, but the Sites hosting manifest has no D1, rate-limit, or identity binding. The UI is not connected to these endpoints.

## Recommendation

Keep the current Worker as the same-origin API and, if the deployed runtime is Cloudflare Workers, use **D1 for the first relational database**. This fits the existing Worker and Sites packaging and supports versioned SQL migrations. The recommendation depends on confirming that production will run on Cloudflare; do not add a live binding or credentials until that deployment choice is confirmed. If the deployment target is another provider, keep the API contract and choose its managed relational database instead.

Use the identity provider's stable subject as the user identity. Do not store passwords in DealSe. Keep uploaded binaries in object storage when a production upload flow is implemented; store only the object key and metadata with an offer. Do not persist base64 image data in SQL.

## Data model

The initial schema is in [`prototype/migrations/0001_backend_foundation.sql`](../prototype/migrations/0001_backend_foundation.sql). It defines:

- **Users and retailer memberships:** one identity can belong to multiple stores, with `owner`, `manager`, or `staff` access scoped to each store.
- **Stores:** the public business profile and its IANA time zone.
- **Offers:** retailer-authored terms, dates, status, optional redemption limit, and optional image object key. A public offer is visible only when published, within its validity window, and not exhausted.
- **Redemption codes:** one record per issued customer credential, bound to exactly one store and offer. Persist only the hash of a high-entropy token.
- **Redemption events:** immutable successful redemption records, unique per code, with the retailer staff identity and time. Dashboard activity and redemption totals derive from these rows.

All persisted timestamps use UTC ISO-8601 values. Each offer snapshots the store's IANA time zone when it is created. Date-only offer end dates are converted to the next local midnight and stored as an **exclusive** `ends_at` instant; validity is `starts_at <= now < ends_at`. The API returns localized labels only for display; it does not use browser-local time to decide validity. A later edit to the store's time zone will not silently change an existing offer's dates.

## API boundary

All endpoints are same-origin `/api` routes on the Worker. JSON errors use stable machine-readable codes and no sensitive stack details.

| Endpoint | Access | Behavior |
|---|---|---|
| `GET /api/retailer/me` | Cloudflare Access identity with provisioned user | Return identity and store memberships. |
| `GET /api/retailer/stores/:storeId` | Store member | Planned: return the store profile and counts derived from saved records. |
| `PATCH /api/retailer/stores/:storeId` | Owner/manager | Planned: validate and save editable store fields. |
| `GET /api/retailer/stores/:storeId/offers` | Store member | Planned: list drafts and published offers with server-derived status. |
| `POST /api/retailer/stores/:storeId/offers` | Owner/manager | Planned: create a draft; never publish implicitly. |
| `PATCH /api/retailer/stores/:storeId/offers/:offerId` | Owner/manager | Planned: update a draft or permitted published fields; validate ownership and state transitions. |
| `POST /api/offers/:offerId/redemption-codes` | Customer session | Implemented: issue an opaque, expiring code for a published, current offer, with a configured rate-limit binding. |
| `POST /api/retailer/stores/:storeId/redemptions/check` | Staff or above for that store | Implemented: check code, store binding, offer status, expiry, and remaining quantity without consuming it. |
| `POST /api/retailer/stores/:storeId/redemptions/confirm` | Staff or above for that store | Implemented: transactionally consume a code and record the successful event; requires an idempotency key. |
| `GET /api/retailer/stores/:storeId/redemptions` | Store member | Implemented: return the latest 100 successful events. |

For a code presented at the wrong store, use a generic unavailable response that does not reveal another store's identity. A repeated confirm returns the existing redemption result or an `already_redeemed` state; it must never create a second event. Owners and managers may edit store and offer details; staff can check and confirm redemptions; every role is scoped to its explicit store membership.

## Redemption invariants

1. Generate the code with a cryptographically secure random source and at least 128 bits of entropy. Store a SHA-256 digest (or keyed digest if the token format later allows lower entropy), never the raw bearer code.
2. Bind each code to one offer and its store. Derive validity from the offer and code records on the server; ignore client-supplied store, dates, status, and discount values.
3. Check offer publication, current store-local validity window, code expiry, code state, and any redemption limit on the server.
4. Confirm with a database transaction/atomic conditional update. Enforce a unique event per code and update quantity-limited offers in the same transaction. Concurrent requests must result in one success at most.
5. Require an idempotency key for confirm and return the same outcome for a safe retry. Do not make the UI's check step reserve or consume a code.
6. Require authenticated store membership for both check and confirm. Check staff membership on every request, not just at sign-in. Use CSRF protection for cookie-authenticated mutations, same-origin checks, rate limits, and security logging without logging raw tokens.
7. Never call a redemption “verified” from browser state alone. If the API is unavailable, offer a clear retry path and do not mark it successful locally.

For the first release, guest customer issuance can remain account-free: the opaque token itself is the bearer credential. Rate-limit issuance by offer and a privacy-conscious client/session signal. Customer accounts can later associate issued codes if product policy needs cross-device history.

## Current API configuration

The retailer routes verify the Cloudflare Access `Cf-Access-Jwt-Assertion` application-token signature against the issuer's published JWKS and require configured `ACCESS_ISSUER` and `ACCESS_AUD` values. The Access application must protect the retailer workspace/API path. A matching user and active store membership must already exist in D1; these endpoints do not silently grant retailer access. Bindings expected by the Worker are `DB` (D1) and `REDEMPTION_LIMITER` (Workers rate limiting), plus the `ACCESS_ISSUER` and `ACCESS_AUD` variables. Issuance is rate-limited by client IP. The public code endpoint returns `503` while required backend bindings are absent. No account creation, staff invitation, store/offer CRUD, database provisioning, migration runner, or UI API adapter has been added yet.

The confirmation uses a conditional code update and event insert in one D1 batch. The unique event constraint on `code_id` prevents a second redemption; a repeated idempotency key can read back its original result. D1 documents batch execution as sequential transactional statements that roll back together on failure ([D1 batch API](https://developers.cloudflare.com/d1/worker-api/d1-database/)).

## Delivery sequence

1. Confirm production hosting. The first Worker slice uses Cloudflare Access JWT verification; if the app will run elsewhere, replace that adapter before deployment. Confirm offer approval/publishing policy and whether guest redemption is allowed; the approved UX blueprint lists these as open product decisions.
2. Apply the migration to a disposable local database and seed a test store, staff member, and offer. Do not seed or expose real customer data.
3. Configure Access and provision a test user/store membership; connect the redemption UI to these endpoints behind an explicit backend-enabled state.
4. Implement offer reads/writes and draft/publish state transitions; connect the dashboard to those APIs.
5. Add account/store onboarding and operational data controls. Keep preview mode visibly separate until the full path runs against a configured backend.
6. Add camera QR scanning only after the same signed/opaque code works through the API. Scanning is an input method; the server remains the authority.
7. Add operational controls before launch: migration rollback/recovery, backups, rate limits, audit retention, monitoring, and a privacy/retention policy.

## Not included yet

No D1 database, Access application/audience, rate-limit binding, live persistence, or retailer/customer UI integration has been configured. The migration is a reviewable schema proposal, not a live database change. Product decisions on moderation, offer quantity semantics, customer account requirements, and record retention remain open.

## References

- [Cloudflare D1 Worker API](https://developers.cloudflare.com/d1/worker-api/d1-database/) — Worker bindings and transactional batch behavior.
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/) — versioned SQL migrations.
- [Cloudflare D1 index guidance](https://developers.cloudflare.com/d1/best-practices/use-indexes/) — indexes for query predicates and relationships.
- [Cloudflare Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) — verify the signed application token, issuer, audience, and rotating public keys.
