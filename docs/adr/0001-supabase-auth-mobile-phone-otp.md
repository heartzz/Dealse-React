# ADR 0001: Supabase Auth with mobile phone OTP

- **Status:** Accepted for a later milestone; implementation deferred
- **Implementation status:** Deferred. Current development milestone uses Supabase email + password on the DealSe websites.
- **Date:** 2026-11-08
- **Decision owners:** DealSe founder

## Context

DealSe needs customer and retailer authentication across native mobile apps and a web platform. The backend and local PostgreSQL/Prisma schema already use an external identity subject mapping and a provider-neutral JWT verification guard. Supabase Auth remains the approved identity provider. Phone SMS OTP was selected for mobile, then explicitly deferred by the founder so the first end-to-end milestone can use email + password on the existing websites.

## Decision

- Use Supabase Auth for customer and retailer identity and session management.
- Plan passwordless phone SMS OTP for the customer and retailer React Native apps in a later milestone. Do not add SMS-provider configuration or phone OTP flows to the current milestone.
- For the current website milestone, use Supabase email + password for customer and retailer registration and login. Keep Supabase Auth as the provider.
- Keep the existing local PostgreSQL/PostGIS database and Prisma schema as the system of record for DealSe users, profiles, retailer memberships, roles, stores, products, offers, and other business data. Do not migrate this data to Supabase.
- NestJS remains the API, JWT verification, identity-to-local-user mapping, and authorization boundary. Verify asymmetric Supabase JWTs through the configured JWKS endpoint.
- Keep retailer roles, memberships, store ownership and permissions in local PostgreSQL. Never derive DealSe authority from a Supabase `role`, app selection, or user-editable metadata.
- Store a verified phone number in E.164 form in the existing DealSe profile field. Keep `(provider, subject)` as the stable external identity mapping.
- Web sign-in method remains open. Any web flow must use the same Supabase identity and an HttpOnly-cookie/BFF boundary; it must not persist long-lived auth tokens in browser storage.
- Never expose Supabase service-role/secret keys to clients. Only the project URL and publishable key belong in client configuration.

## Consequences

- Current website flows use Supabase email + password, with cookie-backed session persistence and NestJS API token verification.
- The deferred mobile OTP milestone will require enabling Supabase Phone and configuring an SMS provider. It will need SMS budgeting, resend and verification limits, CAPTCHA/abuse controls, and confirmation of provider support and applicable country requirements. Supabase flags India's TRAI DLT rules for services sending SMS there.
- Native mobile refresh credentials must be protected by OS secure storage when those apps adopt Supabase Auth.
- OTP codes and passwords must never be written to logs.
- SMS adds direct per-message cost and abuse exposure; evaluate it before the deferred milestone.
- This decision does not require moving application data, changing database hosting, adding a service-role key, or changing retailer authorization tables.

## Required environment configuration

Use ignored local environment files. The API needs the provider ID, project issuer, authenticated audience, and JWKS URL. Web/mobile clients need the Supabase project URL and publishable key. Preserve the existing local `DATABASE_URL`. Actual values must come from the configured Supabase project; do not invent or commit credentials.

## Alternatives considered

- **Phone SMS OTP in the current milestone:** deferred by the founder to keep the first end-to-end release focused and avoid SMS provider setup.
- **Keep identity provider unselected:** rejected because the founder explicitly approved Supabase Auth.
- **Move DealSe business data to Supabase Database:** rejected; local PostgreSQL remains the system of record.
- **Store retailer roles in Supabase user metadata:** rejected because client/provider identity claims are not the source of DealSe authorization.
- **Use SMS as a second factor only:** rejected for the mobile sign-in flow; the requested behavior is passwordless OTP sign-in.

## Rollout and verification

1. Configure the existing Supabase project URL, publishable key, issuer, audience, and JWKS values in ignored local env files.
2. Implement and verify email/password sign-up and login on both website experiences, local profile provisioning, role enforcement, session persistence, and logout.
3. Keep the phone field and phone OTP ADR available for later; when scheduled, configure the Phone provider/SMS sender and then test fixed-code numbers before live delivery.
