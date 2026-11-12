# ADR 0006: Explicit moderation rejection states

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

Retailer, store, and offer moderation need to distinguish a rejected application/submission from a pending one, a temporarily paused record, a suspended record, and a closed/ended record. The existing enums did not represent rejection. Reusing `CLOSED`, `PAUSED`, or `ENDED` would conflate separate lifecycle meanings and produce ambiguous filters, reactivation rules, retailer edit behavior, and audit history.

## Decision

Add one additive `rejected` value to each existing PostgreSQL status enum: `retailer_status`, `store_status`, and `deal_status`. Rejection reason, administrator identity, before/after state, and action time use the existing transactional `audit_logs` snapshots. No table or column is added and no existing record is rewritten.

Retailer publishing continues to require an active retailer and active verified store. A retailer cannot publish a rejected offer; an administrator may approve a rejected offer only through the same publication eligibility validator used by retailer publishing. Store and retailer rejection remain separate from suspension and reactivation.

## Consequences

- API filters can expose rejected state without overloading pause/closure semantics.
- The migration is additive but PostgreSQL enum additions are not safely reversible after values are stored. Recovery should be forward-only or use a reviewed enum rebuild.
- Admin UI/API must handle the new values. Rejected retailer/store resubmission remains through the existing application workflows; there is no dedicated admin override.

## Verification

`20261112160000_moderation_rejected_states` was applied to local `dealse_dev` without resetting data. API integration tests verify rejection reasons, audit writes, publishing denial for rejected offers, and admin publication through the shared eligibility validator. Production migration has not been applied.
