# DealSe REST API route reference

**Status:** Manually maintained route inventory from the NestJS controllers. There is not yet a generated OpenAPI document; DTOs and controllers remain the contract source. Base path is `/api/v1`.

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

## Admin operations

All endpoints below require both the database `ADMIN` role and verified AAL2.

| Method and path | Purpose |
|---|---|
| `GET /admin/overview` | Counts for pending retailers, unreviewed stores, published offers and open reports. |
| `GET /admin/retailers?status=pending\|active\|suspended\|closed` | Paginated retailer review/status list; defaults to pending. |
| `POST /admin/retailers/:retailerId/approve` | Approve a pending retailer. |
| `POST /admin/retailers/:retailerId/suspend` | Suspend an active retailer. Body: `{ "reason": "…" }`. |
| `POST /admin/retailers/:retailerId/reactivate` | Reactivate a suspended retailer. |
| `GET /admin/stores?status=draft\|pending_verification\|active\|paused\|closed` | Paginated store review list; defaults to draft and pending verification. Includes `hasCoordinates`. |
| `POST /admin/stores/:storeId/verify` | Activate a store only after retailer approval and coordinate validation; records verifier/time. |
| `POST /admin/stores/:storeId/pause` | Pause an active store. Body: `{ "reason": "…" }`. |
| `POST /admin/stores/:storeId/resume` | Resume a previously verified paused store if its retailer is active. |
| `GET /admin/deals?status=draft\|published\|paused\|ended` | Paginated offer moderation list; defaults to published. |
| `POST /admin/deals/:dealId/pause` | Place a published offer on moderation hold. Body: `{ "reason": "…" }`. Public visibility is removed immediately. |
| `POST /admin/deals/:dealId/release` | Clear moderation hold and return the offer to draft; the retailer must review and republish. |
| `GET /admin/categories` | List categories including inactive ones. |
| `POST /admin/categories` | Create a category. Body: `{ "slug": "…", "name": "…", "sortOrder"?: 0 }`. |
| `PATCH /admin/categories/:categoryId` | Update category `name`, `sortOrder` and/or `isActive`; no hard delete. |
| `GET /admin/reports?status=open\|resolved\|dismissed` | Paginated customer-report list; defaults to open. |
| `PATCH /admin/reports/:reportId` | Resolve/dismiss a report. Body: `{ "status": "resolved" \| "dismissed", "resolution": "…" }`. |
| `GET /admin/audit-logs?entityType=...` | Paginated recent administrative events, optionally filtered by entity type. |

State-changing admin actions and their audit snapshots are committed in one database transaction. Status conflicts return `409`; missing or out-of-scope resources return `404` where applicable.

## Not yet exposed

There is no redemption API, analytics event API, or generated OpenAPI artifact in the current application. The media API supports local development storage and a Supabase Storage adapter; production bucket configuration remains a deployment prerequisite. See [`mvp-readiness-audit.md`](mvp-readiness-audit.md) for current implementation and verification status.
