# ADR 0005: Database-backed administrator access foundation

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

DealSe already uses Supabase Auth for identity, a PostgreSQL user mirror, an `admin` account role, AAL2 enforcement, moderation endpoints, and transactional audit logs. Admin Backoffice V1 needs finer authorization and a controlled first Root Admin without creating a second identity system or trusting browser state.

## Decision

Keep Supabase Auth and the NestJS API. Add database-backed administrator account status and hierarchy, explicit permission grants, invitation records, one-time bootstrap marker, and actor role/permission context on audit records. Every administrative API endpoint continues to require the existing ADMIN role and provider-verified AAL2, then also requires an active administrator record and the exact permission needed by that route. Root Admin has the complete permission set by role; Super Admin and Admin receive only explicit grants.

The first Root Admin is established by a server-side CLI after an operator has configured an existing active DealSe identity and a 32-character minimum bootstrap secret. The secret is entered via stdin and is never stored in the database or printed. A singleton database record makes bootstrap one-time and idempotent for the same identity.

Schema changes are additive. Existing marketplace status enums, records, and publishing/public visibility rules do not change. Existing generic ADMIN role assignments do not implicitly gain access to admin APIs until they have an active admin account and permissions.

## Consequences

- Admin API authorization is least-privilege and remains server-enforced.
- A trusted operator must establish the first Root Admin before the new admin API workspace is usable.
- Admin invitations and administrator management use the existing Supabase Auth identity provider. Invitation delivery requires API-only Supabase configuration; delivery through the live email provider must be verified in the configured development project.
- Existing local admin grants remain insufficient by themselves; the Root Admin bootstrap CLI is the supported root-establishment path.
- The migration must be reviewed and applied additively; it must never be run against production outside an approved release process.

## Verification

API integration tests cover ordinary-role denial, AAL2 enforcement, explicit permission boundaries, administrator-management restrictions, invitation acceptance and transactional audit behavior. Bootstrap allowlist behavior is exercised without running the bootstrap command. Live Supabase invitation delivery and authenticated administrator browser acceptance remain unverified.
