# ADR 0003: Media ingress and development storage

- Status: Accepted for the Web MVP
- Date: 2026-11-11

## Context

DealSe already has `media_assets` and store/product/deal image relation tables, but the retailer UI had no upload API. The platform must validate and optimize untrusted uploads, keep binaries out of PostgreSQL, and support local development without requiring a cloud storage account.

## Decision

- The web app sends a same-origin multipart request to a Next.js server route. The route reads the Supabase session cookie and forwards the access token to NestJS; it does not expose the token or any service-role credential to browser JavaScript.
- NestJS checks retailer membership and write role, validates the upload size and declared/decoded image type, decodes with a pixel limit, applies orientation, strips source metadata, resizes to at most 2000 by 2000, and re-encodes as WebP before storing.
- NestJS attaches a `READY` media asset to exactly one retailer-owned store, product, or deal in a PostgreSQL transaction. Replacements become the primary image; removal detaches and marks the asset deleted before best-effort object cleanup.
- Development defaults to an ignored local directory under `apps/api/.local-media`. This adapter is refused when `NODE_ENV=production`.
- Production uses a private Supabase Storage bucket through the API-only service-role credential. Images are served through an API route that exposes bytes only for an active public store/current published deal, or to a signed-in member of the owning retailer. The role credential never enters Next.js client bundles.
- Uploads are limited to 5 MiB and 20 per user per API process per minute. This local limiter is suitable for the single-instance MVP and must become shared infrastructure before horizontal scaling.

## Consequences

- Media upload does not require a database migration; the existing metadata and join tables are used.
- Server-side image decoding/re-encoding increases API CPU and memory use. The strict input and output limits bound the Web MVP path.
- Local development media is not production persistence, is ignored by Git, and must not be used for deployed environments.
- The first native apps may use the authenticated API upload path. A scoped signed-upload flow can be introduced if measured media volume makes API proxying inefficient; it must retain server-side verification and processing.
- CDN delivery and automated orphan cleanup remain deployment follow-ups. Supabase Storage must be provisioned with a private bucket before production media is enabled.
