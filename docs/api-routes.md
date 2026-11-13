# DealSe REST API route reference

**Status (reviewed 2026-11-14):** Manually maintained route inventory from the current NestJS controllers. `packages/contracts/openapi.yaml` is a legacy, incomplete contract and is not generated or kept in sync with this route set. Treat controllers and DTOs as authoritative until contract reconciliation and drift checks are implemented. Base path is `/api/v1`.

## Authentication and response rules

- Protected routes accept `Authorization: Bearer <Supabase access token>`. NestJS verifies signature, issuer, audience and expiry using the configured JWKS, then reads DealSe roles from PostgreSQL.
- `CUSTOMER` and `RETAILER` routes require the corresponding PostgreSQL role. Retailer operations also scope the retailer ID and resource ID through active membership on the server.
- Every `/admin` route requires the PostgreSQL `ADMIN` role and a signed Supabase `aal2` claim from a verified second factor. Admin roles are never accepted from client input or Supabase user metadata.
- Public routes are explicitly marked public. Public deal results/details and saved favourites use the current published, unexpired, active-retailer, verified-active-store policy.
- NestJS global validation transforms DTOs, rejects unknown fields and enforces the DTO constraints. Admin list routes accept `page` (default 1) and `limit` (default 20, maximum 100) and return `{ items, page, limit, total, totalPages }`.
- The API currently uses NestJS standard HTTP errors. Consumers should use the HTTP status and `message`; there is no separate generated client/schema in the repository yet.

## Identity and retailer workspace

| Method and path | Access | Purpose |
|---|---|---|
| `GET /health` | Public | Process health check. |
| `GET /auth/me` | Authenticated | Resolve the local DealSe user, profile and role list. |
| `PUT /auth/me/profile` | Authenticated | Update the display name. Body: `{ "displayName": "…" }`. |
| `POST /retailers` | Authenticated | Create retailer profile and owner membership. Body: `{ "displayName": "…", "legalName"?: "…" }`. New retailers start pending. |
| `GET /retailers/mine` | Retailer | List the current user's retailer memberships. |
| `GET /retailers/:retailerId/stores` | Retailer + membership | List only stores owned by the scoped retailer. |
| `POST /retailers/:retailerId/stores` | Retailer + membership | Create a store draft. Store DTO validates address, category and optional coordinates. |
| `PATCH /retailers/:retailerId/stores/:storeId` | Retailer + membership | Edit an owned store; does not grant public verification. |
| `GET /retailers/:retailerId/products` | Retailer + membership | List active products for the retailer. |
| `POST /retailers/:retailerId/products` | Retailer + membership | Create a product. |
| `GET /retailers/:retailerId/products/:productId` | Retailer + membership | Read one owned product. |
| `PATCH /retailers/:retailerId/products/:productId` | Retailer + membership | Edit an owned product. |
| `DELETE /retailers/:retailerId/products/:productId` | Retailer + membership | Archive an owned product. |
| `GET /retailers/:retailerId/deals` | Retailer + membership | List the retailer's own offers. |
| `POST /retailers/:retailerId/deals` | Retailer + membership | Create a draft offer. |
| `GET /retailers/:retailerId/deals/:dealId/preview` | Retailer + membership | Return the customer-shaped preview for an owned offer. |
| `PATCH /retailers/:retailerId/deals/:dealId` | Retailer + membership | Edit an owned draft/eligible offer. A moderation-held offer cannot be edited. |
| `POST /retailers/:retailerId/deals/:dealId/publish` | Retailer + membership | Publish only if retailer/store approval and offer validation pass. |
| `POST /retailers/:retailerId/deals/:dealId/pause` | Retailer + membership | Pause an owned published offer. |
| `POST /media/upload` | Retailer owner/manager | Multipart `file`, `retailerId`, `targetId`, `purpose` (`STORE`, `PRODUCT`, `DEAL`), optional `altText`, retry `uploadId` (UUIDv4) and `replaceMediaId`. Accepts JPEG/PNG/WebP up to 5 MiB and 40 megapixels; Sharp verifies and re-encodes to WebP, then appends or atomically replaces an image on a retailer-owned record. Reusing an upload ID with the same content is idempotent. Maximum 20 uploads per user per API process per minute. |
| `PATCH /media/associations` | Retailer owner/manager | Set a target gallery's ordered `mediaIds` and `primaryMediaId` (1–20 IDs). All IDs must already belong to that exact retailer-owned target and purpose; updates are transactional. |
| `DELETE /media/:mediaId?retailerId=:retailerId` | Retailer owner/manager | Detach and soft-delete an image, scoped to the retailer that owns its target record. |
| `GET /media/:mediaId/content` | Public for any image attached to a visible store or currently public deal (including a featured product image); otherwise active retailer member | Serve optimized image bytes. Optional bearer auth enables retailer previews; private/unknown assets return 404. |

## Administrator and invitation management

All `/admin/admin-users` routes require `ADMIN`, verified `aal2`, an active Admin account and `admins.manage`. The invitation acceptance endpoint requires an authenticated invited identity; invite delivery depends on API-only Supabase Admin configuration.

| Method and path | Access | Purpose |
|---|---|---|
| `GET /admin/admin-users` | Admin + `admins.manage` | Search/filter and paginate administrator accounts, permissions and invitation status. |
| `GET /admin/admin-users/:adminId` | Admin + `admins.manage` | Read an administrator record and its audit history, subject to manager hierarchy rules. |
| `GET /admin/admin-users/invitations` | Admin + `admins.manage` | List active invitations. |
| `POST /admin/admin-users/invitations` | Admin + `admins.manage` | Invite an administrator with an allowed role and explicit permissions; Root Admin cannot be invited. |
| `POST /admin/admin-users/invitations/:invitationId/resend` | Admin + `admins.manage` | Resend an eligible invitation with an audit reason. |
| `POST /admin/admin-users/invitations/:invitationId/revoke` | Admin + `admins.manage` | Revoke an invitation with an audit reason. |
| `POST /auth/admin-invitations/accept` | Authenticated invitee | Accept an invitation belonging to the authenticated identity. |
| `PATCH /admin/admin-users/:adminId` | Admin + `admins.manage` | Change permitted role/permission assignments, subject to Root/Super Admin hierarchy rules. |
| `POST /admin/admin-users/:adminId/{suspend,reactivate,revoke}` | Admin + `admins.manage` | Change an Admin account's status with an audited reason. |

## Customer discovery and engagement

| Method and path | Access | Purpose |
|---|---|---|
| `GET /categories` | Public | List active categories. |
| `GET /deals` | Public | Paginated discovery. Supports page/limit, text/category/city and optional latitude/longitude/radiusKm filters. `sort` is allowlisted to `newest` (default), `discount` (highest percentage discount first), or `nearest` (requires paired coordinates). Nearby radius defaults to 10 km and is bounded to 1–50 km. Results include `distanceMeters` when coordinates are supplied. Only currently eligible published offers are returned. |
| `GET /deals/:dealId` | Public | Read one currently eligible published offer with store/category details. |
| `GET /stores/:storeId` | Public | Read a verified active store profile and up to 100 currently eligible published offers. Draft, paused, expired and unverified business records are excluded. |
| `GET /customers/me/favourites` | Customer | List the current customer's saved eligible offers. |
| `POST /customers/me/favourites/:dealId` | Customer | Save an eligible offer; repeated saves are safe. |
| `DELETE /customers/me/favourites/:dealId` | Customer | Remove a saved offer. |
| `GET /customers/me/followed-stores` | Customer | List verified, active stores followed by the current customer. |
| `POST /customers/me/followed-stores/:storeId` | Customer | Follow a verified, active store. Repeated requests are idempotent. |
| `DELETE /customers/me/followed-stores/:storeId` | Customer | Unfollow a store; repeated requests are safe. |
| `GET /notifications/me?page=1&limit=20` | Customer or retailer | Read the caller's notification inbox; returns paginated items and the unread count. |
| `PATCH /notifications/me/:notificationId/read` | Customer or retailer | Mark one owned notification as read; other users' IDs return 404. |
| `POST /notifications/me/read-all` | Customer or retailer | Mark all of the caller's notifications read. |
| `POST /deals/:dealId/reports` | Customer | Submit one report for a published offer. Body: `{ "reason": "misleading" \| "expired" \| "inappropriate" \| "other", "details"?: "…" }`. A duplicate report by the same customer returns conflict. |

In-app notices are persisted in PostgreSQL. Publishing creates a retailer confirmation and notifies active customers following that store; updating a currently valid published deal notifies customers who saved it. Notification creation shares the deal transaction and deduplicates by deal version. This phase does not send email, SMS, web push or mobile push.

## QR redemption

| Method and path | Access | Purpose |
|---|---|---|
| `POST /customers/me/claims` | Customer | Claim an eligible published offer. Body: `{ "dealId": "…" }`. Returns claim metadata and the raw QR credential only when a new credential is issued. Repeated requests return the existing claim metadata without another raw credential. |
| `GET /customers/me/claims?page=1&limit=20&status=...&dealId=...` | Customer | List the caller's own claim metadata; credentials and hashes are never returned. |
| `POST /customers/me/claims/:claimId/credential/rotate` | Customer | Rotate an expired, unused claim. Returns the new raw credential once and invalidates the old one. |
| `DELETE /customers/me/claims/:claimId` | Customer | Cancel an unused, unexpired claim; repeated cancellation is safe and cancellation is audited. |
| `POST /retailers/:retailerId/stores/:storeId/redemptions/validate` | Retailer + active membership | Validate a credential without changing redemption state. Body: `{ "credential": "…" }`. Returns a safe offer/store preview with terms, dates and existing discount/pricing fields; no customer identity data is returned. |
| `POST /retailers/:retailerId/stores/:storeId/redemptions/confirm` | Retailer + active membership | Explicitly redeem a valid credential. Requires `Idempotency-Key` (1–128 characters) and the same credential body as validate. |
| `GET /retailers/:retailerId/stores/:storeId/redemptions?page=1&limit=20&dealId=...&from=...&to=...` | Retailer + active membership | Paginated redemption history for the owned store only. |
| `GET /admin/redemptions` and `GET /admin/redemptions/:redemptionId` | Admin + AAL2 + `redemptions.read` | Inspect redemption records. |
| `GET /admin/redemption-claims` and `GET /admin/redemption-claims/:claimId` | Admin + AAL2 + `redemptions.read` | Inspect claim metadata and its redemption/audit linkage. Credential hashes are not exposed. |

QR credentials are high-entropy random values. PostgreSQL stores only SHA-256 hashes. The raw credential is returned only on issuance/rotation and cannot be retrieved again; a lost credential cannot be rotated until its claim is expired and unused. Credentials expire after five minutes or at the earlier deal end. The authenticated session supplies the customer identity; a caller cannot choose a customer ID. At issue and confirmation, the service checks `perCustomerLimit` using redemptions filtered by both `dealId` and that customer ID, independently from the global `maxRedemptions`/`redemptionCount` cap. Claims do not reserve global capacity; only successful confirmations increment the count. Confirmation and audit writes are atomic, and a repeated confirmation with the same store-scoped idempotency key, actor and credential returns the original result.

Capacity failures return HTTP `409`: the global-capacity response is distinct from the per-customer response. A different customer's redemption does not count toward the current caller's per-customer limit.

## Admin operations

All endpoints below require both the database `ADMIN` role and verified AAL2.

| Method and path | Purpose |
|---|---|
| `GET /admin/overview` | Counts for pending retailers, unreviewed stores, published offers and open reports. |
| `GET /admin/retailers?status=...` | Paginated retailer review/status list; defaults to pending and supports status/search filters. |
| `POST /admin/retailers/:retailerId/approve` | Approve a pending retailer. |
| `POST /admin/retailers/:retailerId/reject` | Reject an application with a reason and audit record. |
| `POST /admin/retailers/:retailerId/suspend` | Suspend an active retailer. Body: `{ "reason": "…" }`. |
| `POST /admin/retailers/:retailerId/reactivate` | Reactivate a suspended retailer. |
| `GET /admin/stores?status=...` | Paginated store review/status list; defaults to draft and pending verification. Includes `hasCoordinates` and supports filters. |
| `POST /admin/stores/:storeId/verify` | Activate a store only after retailer approval and coordinate validation; records verifier/time. |
| `POST /admin/stores/:storeId/reject` | Reject store verification with a reason and audit record. |
| `POST /admin/stores/:storeId/{pause,suspend}` | Pause/suspend a store with a reason. |
| `POST /admin/stores/:storeId/{resume,reactivate}` | Resume a previously verified paused/suspended store if its retailer is active. |
| `GET /admin/deals?status=...` | Paginated offer moderation list; defaults to published and supports status/search filters. |
| `POST /admin/deals/:dealId/approve` | Approve and publish an eligible offer. |
| `POST /admin/deals/:dealId/reject` | Reject an offer with a reason and audit record. |
| `POST /admin/deals/:dealId/pause` | Place a published offer on moderation hold. Body: `{ "reason": "…" }`. Public visibility is removed immediately. |
| `POST /admin/deals/:dealId/{resume,reactivate}` | Resume an eligible paused/suspended offer. |
| `POST /admin/deals/:dealId/release` | Clear moderation hold and return the offer to draft; the retailer must review and republish. |
| `GET /admin/categories` | List categories including inactive ones. |
| `POST /admin/categories` | Create a category. Body: `{ "slug": "…", "name": "…", "sortOrder"?: 0 }`. |
| `PATCH /admin/categories/:categoryId` | Update category `name`, `sortOrder` and/or `isActive`; no hard delete. |
| `GET /admin/reports?status=open\|resolved\|dismissed` | Paginated customer-report list; defaults to open. |
| `PATCH /admin/reports/:reportId` | Resolve/dismiss a report. Body: `{ "status": "resolved" \| "dismissed", "resolution": "…" }`. |
| `GET /admin/audit-logs?entityType=...` | Paginated recent administrative events, optionally filtered by entity type. |

State-changing admin actions and their audit snapshots are committed in one database transaction. Status conflicts return `409`; missing or out-of-scope resources return `404` where applicable.

## Not yet exposed

There is no analytics event API. The checked-in OpenAPI YAML is legacy/incomplete and needs reconciliation with current controllers before it can be used as a complete contract or client-generation source. Retailer redemption analytics and Root Admin redemption reports are not implemented; current retailer history and Admin record inspection are implemented. The media API supports local development storage and a Supabase Storage adapter; private production bucket configuration remains a deployment prerequisite. See [`mvp-readiness-audit.md`](mvp-readiness-audit.md) for implementation and verification status.
