# DealSe authenticated E2E account setup

This is a **manual, development-only preparation guide** for the four dedicated accounts used by Milestone 3 browser tests. No account creation or database mutation is performed by the credential checker. Do not use production accounts or credentials.

## 1. Confirm the development project

1. Open the existing development Supabase project in the Dashboard. Confirm its project reference matches NEXT_PUBLIC_SUPABASE_URL in apps/web/.env.local and OIDC_ISSUER / OIDC_JWKS_URL in apps/api/.env. Do not copy or publish those values.
2. Confirm apps/web/.env.local contains only the project URL and publishable key for the browser client. Never add a Supabase service-role/secret key to a NEXT_PUBLIC_* variable, the web environment, or this setup file.
3. In Supabase **Authentication → Sign In / Providers → Email**, check whether **Confirm email** is enabled. The repository cannot tell which setting is currently active in the hosted development project.
4. If confirmation is enabled, ensure the project can deliver confirmation messages to all four test mailboxes. The hosted project's built-in sender is limited; use an approved development SMTP setup or addresses permitted by the project's current mail policy. Leave confirmation enabled when testing verified-email behavior. Do not disable confirmation merely to make the test pass.
5. Check **Authentication → URL Configuration**. The Playwright base URL defaults to http://127.0.0.1:3100; configure the matching local Site URL / allowed redirect URL in the development project if needed. The registration action does not supply a custom emailRedirectTo.

Supabase documents that signUp returns no session while email confirmation is pending; DealSe then displays “Your account was created. Check your email to confirm it, then log in.” Once confirmed, sign in through the normal DealSe login form. This flow uses the actual Supabase password identity and SSR cookie session. [Supabase password-based Auth](https://supabase.com/docs/guides/auth/passwords), [Supabase signUp reference](https://supabase.com/docs/reference/javascript/auth-signup).

## 2. Create the four identities through DealSe

Use four distinct, disposable email addresses whose inboxes you control. Keep the accounts separate; in particular, Retailer B must not be a member of Retailer A's business, and vice versa.

1. Start the local API and web app using the existing development configuration, then open the local DealSe origin.
2. Create Customer A and Customer B through /customer/register. Use each account's own display name and password (at least 8 characters). If email confirmation is enabled, open the confirmation email for each identity and follow its link, then sign in once through /customer/login.
3. Create Retailer A and Retailer B through /retailer/register, using a different business name for each. If email confirmation is enabled and the registration action returns to the confirmation message, verify the email, then sign in through /retailer/login. If no retailer profile exists yet, complete /retailer/setup after login.
4. Do not use direct inserts into auth.users, users, user_account_roles, retailers, or retailer_memberships to create these identities. The registration routes call Supabase Auth and the existing NestJS APIs, preserving normal identity resolution and ownership rules.

The first successful /auth/me API call creates a DealSe users row keyed by (auth_provider, auth_subject), a profile, and the default customer role. Retailer registration calls POST /api/v1/retailers, which creates a separate retailer row in pending status, an active owner membership for that signed-in user, and the retailer account role. If email confirmation prevented the registration action from completing, completing /retailer/setup after login creates those same retailer records through the application API.

## 3. Prepare approved ownership and publishing fixtures

For each retailer, create a separate store from that retailer's authenticated dashboard using a unique store name/slug, an active category, and a real development location with both latitude and longitude. Do not reuse the same retailer or store for A and B.

Expected records/states for retailer ownership and publish eligibility:

| Record | Retailer A / B expected state | How it is established |
|---|---|---|
| users | status=active; auth_provider=supabase; auth_subject matches that account's Supabase user ID | First normal authenticated call to /api/v1/auth/me |
| user_account_roles | One role=retailer row for each retailer owner; the default customer role may also exist | Normal retailer registration/setup API |
| retailers | Distinct row per account; created_by_user_id points to its owner; status=active for publish tests | Submit the retailer to review, then approve it in /admin |
| retailer_memberships | Distinct row per retailer; user_id is its owner; role=owner; status=active | Normal POST /api/v1/retailers API |
| stores | retailer_id belongs only to its matching retailer; status=active; verified_at non-null; verified_by_user_id identifies the reviewer; PostGIS location is set | Create through that retailer's dashboard, then verify in /admin after retailer approval |
| products | retailer_id and created_by_user_id belong to the owner; reference only that retailer's store and an active category; not archived | Create/edit through the retailer dashboard |
| publishable deal | store_id belongs to the same retailer; deal is a valid draft before publishing | Create/save/publish through the retailer dashboard |

Review and approve each pending retailer in the authenticated /admin workspace. Then review and verify its store. The existing admin flow requires an approved (active) retailer and store coordinates before verification; verification sets store status to active, verified_at, and verified_by_user_id, and writes the audit event. /admin requires an existing admin account and the configured AAL2/MFA policy. Use that normal admin review flow; do not update approval columns with SQL or grant extra roles for this task.

The relevant application rules are in apps/api/src/retailers/retailers.service.ts, apps/api/src/admin/admin.service.ts, apps/api/src/products/products.service.ts, and apps/api/src/deals/deals.service.ts. The corresponding data model is apps/api/prisma/schema.prisma. Publishing requires an active retailer, active store, and non-null verified_at; public discovery applies the same eligibility gate.

## 4. Store credentials locally and validate setup

Create apps/web/.env.test.local from the ignored-value template apps/web/e2e/test-accounts.env.example and fill all eight values locally:

    Copy-Item apps/web/e2e/test-accounts.env.example apps/web/.env.test.local

Set one email/password pair for each role. Do not paste credentials into chat, source code, Playwright fixtures, screenshots, terminal transcripts, or committed files. .gitignore excludes .env.*; apps/web/playwright.config.mts loads this file for the test runner and blanks all eight account variables in the API and Next.js web-server child environments. The browser receives credentials only through real form entry during a test; no password or token is printed.

Run the configuration-only check:

    pnpm --filter @dealse/web e2e:accounts:check

It lists account labels and missing variable names only. It does **not** check whether those credentials are valid in Supabase, create accounts, or run authenticated tests. The existing customer test reports missing Customer A variable names and skips when Customer A is incomplete.

## 5. Current harness limitations

- apps/web/e2e/customer-workflows.spec.ts has a real Supabase login and session-backed customer workflow behind Customer A credentials. It does not yet cover fresh registration/email confirmation, Customer B isolation, read-all, or a logout-then-login persistence cycle.
- There is no authenticated retailer browser suite yet. apps/web/e2e/retailer-offer-workflow.spec.ts targets /dev/retailer-offer-workflow, a local prototype fixture. It intercepts the media upload and association requests, so it is not real retailer authentication, real API ownership, or a real upload test.
- The real retailer harness still needs to log in as Retailer A, exercise the actual /retailer/dashboard and existing application APIs, upload a local image through the authenticated media proxy and API/local development storage, verify the persisted media association after refresh, and test publish/pause visibility as a customer. Retailer B and Customer B must be used for explicit cross-account denial checks. No auth token or session should be injected by a test.
- The checker validates presence only. It deliberately cannot prove email verification, role assignment, retailer approval, store verification, or credentials without a later real browser/API run.

## Approval boundary

This preparation does not create Supabase users, send emails, sign in, seed fixtures, grant admin roles, approve retailers, verify stores, or modify database records. After the four accounts are prepared and the checker reports all four pairs configured, review and approve any pending retailer/store in /admin using an already authorized admin account. Run the authenticated E2E suite only after separately approving that verification step.
