# ADR 0007: Token-based staging deployment

Date: 2026-11-15
Status: Accepted for staging configuration; hosted deployment not yet verified.

## Context

The user selected free Netlify, Render, Aiven, Supabase and Brevo accounts,
rejected Oracle, and requested deployment through API credentials instead of
hosting-provider GitHub integrations. Pushes to
`stabilization/retailer-offer-workflow` should deploy automatically.

## Decision

GitHub Actions runs the existing CI as a reusable workflow, builds an API container,
publishes it to GHCR, deploys its immutable digest through Render's API, waits for
that deployment and its health endpoint, then builds/deploys Next.js through the
Netlify CLI and Next.js adapter. No cloud database credentials enter the build.
The jobs are serialized per environment. Bootstrap mode publishes only the image.

Use Aiven PostgreSQL/PostGIS for business data, Supabase for Auth and private
media, and Brevo SMTP configured in Supabase. NestJS remains the only business
backend. There is no production migration, seed, automatic account bootstrap or
schema mutation in the deployment workflow. Hosted migrations are a separately
reviewed release operation.

## Cost and alternatives

Free allowances can suspend service and constrain deployment frequency. API-key
uploads still consume Netlify deployment credits. GitHub Actions/Packages quotas
also apply; use spending controls and avoid paid upgrades. This is a staging
baseline, not an availability commitment for shop-floor redemption.

Direct Git integrations would be simpler but conflict with the requested access
model. Vercel Hobby is not a business-hosting baseline. Moving the NestJS service
to Workers would require runtime changes. Oracle was explicitly rejected.

## Rollout and recovery

Follow `docs/deployment.md` to create the first image, private registry credential,
service IDs and runtime environment. Verify managed PostgreSQL version/PostGIS/TLS,
then test real authentication, media and redemption on HTTPS. Keep GHCR packages
private; do not change visibility automatically. API and web changes must remain
backward-compatible because hosting updates are sequential, not atomic.

Rollback each service to the last known-good image/site deploy. Database rollback
is not automatic: preserve data and use the schema-specific rollout notes. Retain
known-good images and external backups. A provider change requires configuration
and adapter verification, not a rewrite of the business model.
