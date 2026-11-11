# DealSe repository guidance

## Read before changing architecture or product behavior

1. [`docs/architecture.md`](docs/architecture.md) is the platform source of truth.
2. [`docs/database-schema.md`](docs/database-schema.md) is the proposed data model; it is not an applied migration.
3. [`docs/design-system.md`](docs/design-system.md) and [`docs/web-ui-ux.md`](docs/web-ui-ux.md) are product/design references. Treat unresolved commercial, account, moderation and redemption rules as open decisions.
4. `prototype/AGENTS.md` applies to the current visual prototype. Preserve its supplied logo, selected home design and packaging files while that prototype remains in use.

## Architecture guardrails

- Target stack: React Native/Expo + TypeScript, Next.js, NestJS, PostgreSQL/PostGIS, REST/OpenAPI, one modular monolith.
- Do not introduce Flutter, a primary WebView app, microservices, GraphQL, MongoDB, Redis, pgvector, payments, or AI dependencies without a concrete requirement and an ADR explaining cost, alternatives and migration.
- PostgreSQL is the future system of record. The D1/Worker code and SQL are experimental/historical; do not extend them as the production backend.
- NestJS owns business rules, authorization, validation and persistence. UI flags and UUIDs do not grant access. Every retailer object query must be tenant-scoped server-side.
- Keep customer and retailer app targets separate; share generated API contracts/client and design tokens, not database entities or platform-specific UI.
- Do not create production schema or seed fake records as real data from architecture documents alone. Product gates listed in the architecture must be resolved before affected implementation.
- Use parameterized SQL for GIS/specialized queries. Do not add a second ORM or duplicate API contract source.
- Never commit secrets, store long-lived web auth tokens in browser storage, log session credentials/QR codes, or expose model-provider keys to clients.
- Treat all user-generated text, uploads and AI output as untrusted. AI cannot publish offers or make unreviewed business changes.

## Task discipline

- Implement only the requested acceptance criteria. Avoid broad rewrites, unrequested dependencies and unrelated design changes.
- Before editing, inspect repository status and the affected files. Preserve unrelated user edits and prototype packaging/config unless a task explicitly targets them.
- For architecture changes, add/update an ADR under `docs/adr/` and update the source-of-truth docs in the same change.
- For UI changes, include responsive states, loading/empty/error behavior, keyboard/touch accessibility and screenshots when a runnable app exists.
- For persistence/auth/redemption changes, include tests for constraints, failure paths, retries and cross-tenant denial. Use PostgreSQL/PostGIS in integration tests, not SQLite substitutes.
- Run the relevant lint, typecheck, tests and build for code changes; report exact commands and results. Do not claim a live backend or deployment unless it is configured and verified.
- Database migrations must be additive/compatible where practical, reviewed against existing data, and include rollout/rollback notes. Never run a production migration without an explicit release task.
- Do not add AI, payments, inventory complexity or background infrastructure to MVP work unless the user-approved acceptance criteria require it.

## Reporting

State what changed, why, what was verified, and what remains open. Distinguish repository facts from assumptions. Link to relevant files and identify any decision that still blocks a safe implementation.
