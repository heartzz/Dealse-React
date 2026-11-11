# DealSe product decisions proposal

**Status:** Defaults approved by the user on 2026-10-05. Recommendations below are now the P0 implementation policy. Legal/privacy review and pilot retailer category selection remain launch follow-ups.

## Established product context

- DealSe has separate customer and retailer experiences, plus a web platform.
- The customer journey includes local offer discovery, offer details, saving/engaging, and a visible Redeem action.
- Retailers need onboarding, store setup, product and offer management, and a redemption workflow.
- Ahmedabad has appeared repeatedly in the product material and the user requested Ahmedabad skyline artwork. This suggests Ahmedabad as the pilot, but does not by itself confirm it.
- PostgreSQL/PostGIS, Prisma, NestJS, React Native and Next.js are the approved technical direction.

## Recommended defaults

| Decision | Recommended P0 default | Why this is a reasonable starting point | Schema/API impact |
|---|---|---|---|
| Pilot market | Ahmedabad city first; store city/region/country and coordinates are structured fields so more cities can follow. Confirm the initial categories with pilot retailers. | Ahmedabad is the only city consistently evidenced in the current materials. | Store address and geography; no hard-coded city restriction in core tables. |
| Customer identity | Browse without an account. Require sign-in to save/follow and redeem. Start with managed OIDC email sign-in; add Google only if the identity provider supports it cleanly. Defer phone OTP. | Keeps discovery low-friction while tying saved state and redemption to an account; avoids SMS cost and abuse work. | Internal user UUID mapped to provider subject; favourites/follows require user ID. |
| Retailer onboarding | Retailer may create a draft profile and store. Require a manual admin verification before the store is publicly discoverable. Active retailer memberships apply across all stores owned by that retailer; no store assignment layer in P0. | Protects marketplace trust while the supply side is small. | Retailer/store status includes pending, active and suspended; verification actor/time audit fields. |
| Offer publication | Verified retailers can publish their own offers without per-offer admin approval. Admin can pause a store or offer for support/safety. Offer has draft, published, paused and ended states; it is visible only while published and within its validity window. Pausing blocks new codes and confirmation of outstanding codes while paused. | Keeps publishing quick while preserving a basic moderation control. | Deal state, timestamps and creator; state changes enforced in API and audited. |
| Offer rules | Store-local dates/times interpreted in the store's IANA time zone and stored as UTC instants. Require title, terms, start and end. No inventory count in P0. Optional redemption cap only if redemption is included in the pilot. | Prevents ambiguous expiry and avoids treating marketing copy as inventory truth. | `starts_at`, `ends_at`, `store_timezone_snapshot`; check `starts_at < ends_at`; no stock tables. |
| Redemption | Include online-only single-use QR redemption in the pilot because the Redeem action and retailer redemption flow have already been requested. Sign-in required. QR carries an opaque random token valid for 5 minutes; the retailer confirms it online and the server atomically consumes it. No offline success state. Default one successful redemption per customer per deal unless a deal explicitly says otherwise. | Delivers the already discussed end-to-end action with a bounded anti-replay rule. | Redemption/code tables, expiry, token hash, unique constraints and idempotency; this is the largest P0 schema addition. |
| Product catalog | Simple products only: no variants, barcode or quantity tracking in P0. Deals may reference zero or more products, with the deal itself remaining valid if catalog stock is unknown. | Product variants and stock semantics have not been established and could complicate retailer onboarding. | Product and deal-product tables only; no variant/inventory tables. |
| Language and privacy | English UI first; preserve Unicode and avoid schema assumptions that prevent Gujarati/Hindi later. Collect the minimum profile data; do not collect date of birth or precise customer location history by default. Final retention/privacy/support policy requires review before public launch. | Supports a focused pilot while keeping future localization possible and reducing unnecessary personal data. | Locale can be nullable/defaulted; user deletion/deactivation and event-retention behavior remain a launch checklist item. |
| Monetization | Free pilot; no subscriptions, payments, payouts or promised reach/results in P0. | The immediate proof is whether local retailers publish offers that customers discover and engage with. | No billing tables or payment integration in initial schema. |

## Follow-ups that do not block the initial schema

These can be refined without blocking the approved first migration:

1. Confirm the launch category taxonomy with pilot retailers before seeding categories.
2. Complete legal/privacy review of notices, data retention, support and complaint handling before public launch.
3. Confirm the managed OIDC vendor and exact email sign-in method during authentication implementation.
4. Review whether any specific retailer requires per-deal approval or different redemption limits before onboarding them.

## Implementation boundary after approval

The approved P0 scope is now represented in the Prisma schema and initial migration: users/profiles, retailer memberships, stores with PostGIS location, categories, simple products, media metadata, deals and product links, favourites/follows, audit logs, and single-use redemptions. Apply and verify the migration on a fresh PostGIS database before feature code relies on it. Add synthetic fixtures after category confirmation. Keep variants, inventory, notifications, AI tracking, subscriptions and advanced analytics deferred.
