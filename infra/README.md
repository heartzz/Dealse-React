# Infrastructure setup and account handover

Use this runbook when changing the owners/accounts for DealSe hosting, or moving
all services into new accounts. It describes the current token-based deployment;
it does not execute a transfer. Last reviewed: 2026-11-15.

For the initial build/release commands, see [deployment setup](../docs/deployment.md).
For application setup, see the [root README](../README.md).

## Quick start for the next operator or AI

Read this file and [the deployment workflow](../.github/workflows/deploy-staging.yml)
before changing accounts. First establish whether the request is an ownership
handover of the same resources or recreation in new accounts. Inventory the live
settings; the identifiers below are a dated snapshot, not proof they remain current.
Do not infer that a new account already contains the old data or permissions.

For an account change, follow sections 3–10 in order, then section 11 to verify
and cut over, and section 12 to rotate credentials. Obtain authorized access to
both old and new resources. If access or a backup is missing, report the exact
blocker and complete independent preparation; do not invent credentials or delete
the old service. This document is instructions, not authorization to migrate data.

### Where credentials are actually consumed

| Name | Consumer | Needed by normal GitHub deployment? |
| --- | --- | --- |
| `NETLIFY_AUTH_TOKEN` | GitHub Actions deployment step | Yes, Actions secret |
| `RENDER_API_KEY` | GitHub Actions deployment step | Yes, Actions secret |
| `GITHUB_TOKEN` | Actions publishes the private GHCR image | Yes, generated automatically per run |
| `GHCR_READ_TOKEN` | Local setup name for the PAT saved in Render's registry credential | No; Render uses the saved credential to pull images |
| `SUPABASE_ACCESS_TOKEN` | Local setup scripts calling the Supabase management API | No; not a runtime Auth key |
| `DATABASE_URL` | Render API runtime connects to Aiven | No live DB credential in CI; CI uses isolated test DBs/build placeholders |
| `SUPABASE_SERVICE_ROLE_KEY` | Render API accesses private storage and Auth Admin API | No; server-only runtime setting |

Connection path: browser → Next.js on Netlify → NestJS on Render → Aiven.
Supabase handles authentication and private media separately. Render injects
`DATABASE_URL`; `apps/api/src/database/prisma.service.ts` reads it into Prisma.
The deployed runtime DB user is separate from the administrator used for manual
migrations. Local ignored setup files may contain administrator credentials;
never copy those into the frontend or substitute them for the runtime role.

## 1. What each account owns

| Platform | Purpose | What must survive a move |
| --- | --- | --- |
| GitHub + GitHub Container Registry (GHCR) | Repository, Actions, private API images | Git history, deployment branch, Actions configuration, package permissions, rollback images |
| Netlify | Next.js frontend and server functions | Project settings, environment variables, deploys, custom domains, HTTPS |
| Render | NestJS API container | Runtime environment, Aiven CA file, private-registry credential, health check |
| Aiven | PostgreSQL/PostGIS application database | All application records, schema, migration history, roles/grants |
| Supabase | Auth identities and private media storage | Auth users/UUIDs, password hashes, MFA configuration, bucket objects, auth settings |
| Brevo | SMTP delivery through Supabase | Verified sender/domain, SMTP credentials, delivery settings |
| GoDaddy | `dealse.app` registration and DNS | Domain ownership, DNS records, renewal responsibility, email records |

Aiven and Supabase are separate: moving the Aiven database does **not** move
Supabase logins or uploaded files. Moving the frontend does not move either database.
Native Expo apps are not deployed by this pipeline.

Current non-secret inventory (verify these before a future move):

| Item | Current value |
| --- | --- |
| Repository | `heartzz/Dealse-React` |
| Deployment branch | `stabilization/retailer-offer-workflow` |
| Public website | `https://dealse.app` (`www` redirects here) |
| Netlify project | `hey-02e0f6` |
| Netlify project ID | `852f27a3-6306-4931-8d3e-d8a29260055d` |
| Netlify default hostname | `hey-02e0f6.netlify.app` |
| Render service | `dealse-api-staging`, ID `srv-dbsbtr3bc2fs73b5bsc0` |
| API origin | `https://dealse-api-staging.onrender.com` |
| GHCR image repository | `ghcr.io/heartzz/dealse-react-api` |
| Supabase project reference | `xnogtqkoynyfgmunfbwc` |
| Private storage bucket | `dealse-media` |
| Aiven database / application role | `defaultdb` / `dealse_app` |

These are identifiers, not passwords. The services retain staging names even
though the website now uses the public custom domain. Hosting verification is not
production-readiness certification. Known dependency vulnerabilities and real-user
acceptance checks remain open; consult the current security audit before release.

## 2. Choose ownership transfer or recreation

Prefer retaining the existing project when a supported ownership/team transfer
is available: fewer URLs, identities and data copies change. Recreating a service
means obtaining new IDs/keys and explicitly migrating its data.

- **Netlify:** use the project's transfer option with the required source and
  destination team permissions. Recheck the project ID, domains and all environment
  scopes afterward. Replace the Actions token with one authorized for the new team.
  See [Netlify transfers](https://docs.netlify.com/manage/projects/transfer-project/).
- **Supabase:** use Project Settings → General → Transfer Project when eligible.
  Confirm destination organization permissions, plan and project limits first.
  Verify the project reference, keys, Auth and Storage after transfer. For a new
  project instead, follow section 5; changing API keys alone cannot migrate users.
  See [Supabase transfers](https://supabase.com/docs/guides/platform/project-transfer).
- **Render:** its current [transfer policy](https://render.com/docs/faq) does not
  support moving services between workspaces. Recreate the image-backed service
  using section 7 and update its ID and origin everywhere. Recheck this policy at
  the time of a future move.
- **Aiven:** if retaining the existing organization/project, arrange supported
  owner/admin access and verify service access before removing the old owner.
  Otherwise use the database migration procedure in section 4.
- **Brevo/GoDaddy/GitHub:** transfer administrative ownership through the provider's
  supported process, or recreate the resources as described below. A domain
  registrar transfer is not required merely to point the website to another host.

Never share an old owner's login as the handover mechanism. Give the recipient
their own authorized account, enable MFA, and check free-plan seat restrictions
before inviting members or transferring into a paid team.

## 3. Prepare the move

1. Record old and new resource IDs, URLs, image digest, schema version, plans and
   DNS records in a private handover record. Keep secrets in a password manager.
2. Take and verify recoverable backups of Aiven data, Supabase Auth and media files.
   Rehearse restoration before the cutover. Free plans may not include automatic
   backups or point-in-time recovery; do not assume they do.
3. Set GitHub Actions variable `STAGING_DEPLOY_ENABLED=false` and wait for any
   running release to finish. This prevents subsequent service releases but still
   allows CI/image builds. Disable the workflow as well if those must stop too.
   Changing the variable does not cancel an already-running release.
4. Provision new resources and verify them on temporary hostnames. Keep old
   resources available for rollback. Do not delete data or detach the live domain yet.
5. For a data-copy migration, schedule a maintenance window and stop writes to
   **both** old app/API and Auth/Storage during the final copy. DealSe currently has
   no built-in maintenance-mode switch. Plan a real hosting/access restriction;
   displaying a maintenance page alone does not block direct API writes.
6. Reconcile final counts, IDs and storage objects, then switch the application
   configuration and DNS. Do not let old/new instances write to separate copies.

## 4. Aiven: database and TLS

In the destination Aiven account, create PostgreSQL on an explicitly free plan
if available. Match PostgreSQL/PostGIS compatibility to the source (currently
PostgreSQL 18). Do not accept a paid trial as a permanent zero-cost service.

Collect the host, port, database, migration-owner credentials and CA certificate
from the service connection details. Download the **destination** CA certificate.

For a **new empty installation**, review the checked-in migrations and run
`pnpm --filter @dealse/api db:migrate:deploy` with the migration owner's
`DATABASE_URL` supplied securely to that command. This is an explicit release
operation, not an automatic pipeline step. Do not run demo seeds on the hosted DB.

For an **existing installation**, restore a verified backup into a fresh target
before applying any additional pending migrations. Preserve primary keys, auth
identity mappings, media object keys, redemption/audit history and
`_prisma_migrations`. Do not restore a complete schema on top of a database already
initialized independently by Prisma. Follow [Aiven's pg_dump/pg_restore guide](https://aiven.io/docs/products/postgresql/howto/migrate-pg-dump-restore),
review extension/ownership differences, and restore roles/grants deliberately.
Use a compatible PostgreSQL client and verify the restore logs and row counts.
Never use `prisma migrate reset`, `migrate dev`, or `db push` against live data.

Create a separate `dealse_app` login for runtime access. Grant only database
CONNECT, schema USAGE, required application-table CRUD and sequence privileges;
configure default grants under the migration owner for future objects. It must
not be a superuser or own the schema, and must not access `_prisma_migrations`.
Review grants rather than copying the migration owner's permissions.

Current runtime role connection limit is 10 against a provider limit of 20;
recalculate for the destination, allowing for rolling deployments and maintenance.

On Render, add secret file `aiven-ca.pem`, accessible at `/etc/secrets/aiven-ca.pem`.
Set the runtime `DATABASE_URL` using the application role, for example:

```text
postgresql://dealse_app:<URL_ENCODED_PASSWORD>@<DB_HOST>:<DB_PORT>/<DB_NAME>?sslmode=verify-full&sslrootcert=/etc/secrets/aiven-ca.pem
```

This is a placeholder, not a usable credential. URL-encode reserved characters
in credentials. Never disable certificate verification to resolve a TLS error.
Redeploy Render after changing its DB URL or secret file; verify a database-backed
route, not only `/api/v1/health` (which tests process availability).

## 5. Supabase: identities, storage and authentication

If recreating, create a project in the destination organization and record its
project URL, publishable key, server-only `service_role` key and signing/JWKS setup.
The API validates RS256/ES256 tokens; check the new project's signing configuration.
A personal management access token is for setup automation only, not app runtime.

**Existing users require a real Auth migration.** Preserve Supabase user UUIDs:
Aiven maps identities by `auth_provider` and `auth_subject`. Recreating accounts
with the same email but different UUIDs can create different DealSe users and lose
access to existing retailer/admin records. Do not rewrite these mappings by email
without a separately reviewed migration. Verify password login, MFA, identities
and provider configuration, and plan for sessions to expire or require re-login.
Use the official [Auth migration guidance](https://supabase.com/kb/troubleshooting/migrating-auth-users-between-projects).

Recreate `dealse-media` as **private**, with a 5 MB file-size limit and allowed
MIME types `image/webp`, `image/jpeg`, `image/png`. Copy the actual object bytes,
keeping object keys and metadata consistent with Aiven's media records. A database
backup or project clone alone does not copy storage files; see [clone exclusions](https://supabase.com/docs/guides/platform/clone-project).
Verify an authenticated upload/read and denial of unauthorized private access.
Do not make the bucket public to solve a migration issue.

In Authentication → URL Configuration set:

- Site URL: `https://dealse.app`
- Allowed redirects: `https://dealse.app/**` and `https://www.dealse.app/**`
- Keep the current/new Netlify hostname allowlisted only if it is still used for
  testing or rollback; remove retired hosts after the move. Avoid unrestricted
  wildcards spanning unrelated domains.

Recreate SMTP and email templates (section 6), signup/confirmation settings,
rate limits, password/security settings and any configured OAuth providers.
Check actual reset/verification links land on the intended domain.

A changed Supabase project requires coordinated updates to Render's issuer,
JWKS URL, Supabase URL/key **and** both Netlify/GitHub public URL/key settings.
Rebuild the frontend because `NEXT_PUBLIC_*` values are bundled at build time.

## 6. Brevo: authentication email

In the new Brevo account, verify the intended sender and authenticate the sending
domain using the exact DNS records Brevo supplies. Preserve unrelated mail DNS.
Create an SMTP key and copy the SMTP server, port, login and sender details from
that account's SMTP settings; an SMTP key is not the same as a general API key.

In Supabase Authentication → Email/SMTP settings, enable custom SMTP and enter:

| Supabase field | Source |
| --- | --- |
| Sender email/name | Verified Brevo sender and intended DealSe display name |
| Host and port | Brevo SMTP settings; use its supported TLS configuration |
| Username | Brevo SMTP login |
| Password | Newly generated Brevo SMTP key |

SMTP credentials belong in Supabase, not GitHub variables, Netlify or client code.
Check sending limits in **both** providers. Send a real signup/reset test to an
owned test inbox and confirm delivery and the destination URL before retiring
old credentials. Do not recreate unrelated marketing contact lists for app hosting.

## 7. Render: recreate the API service

1. Create a destination workspace and API key authorized to deploy its service.
2. Create a private GHCR registry credential using the GitHub username and a
   classic PAT with `read:packages` for an account that can access the API image.
   Authorize organization SSO if required. Keep this token only in the registry
   credential store. Do not use the workflow's expiring `GITHUB_TOKEN` for pulls.
3. Create Web Service → Existing Image, select a known-good immutable
   `ghcr.io/<owner>/<repo>-api@sha256:<digest>` and attach that credential.
4. Select the free instance type, suitable region (current: Singapore), health
   path `/api/v1/health`, and leave start-command override empty. The Docker CMD
   starts the server. Do not add direct Git integration or a second auto-deployer.
5. Add the CA secret file and the following environment variables. Deploy and
   confirm private image pull, startup, health and database-backed discovery.

| Render variable | Value/source |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Destination Aiven **application-role** URI with verified TLS |
| `OIDC_PROVIDER_ID` | `supabase` (preserve the existing identity-provider label) |
| `OIDC_ISSUER` | `https://<project-ref>.supabase.co/auth/v1` |
| `OIDC_AUDIENCE` | `authenticated` |
| `OIDC_JWKS_URL` | `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| `MEDIA_STORAGE_PROVIDER` | `supabase` |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Destination project's server-only service-role key |
| `SUPABASE_MEDIA_BUCKET` | `dealse-media` |
| `ADMIN_INVITE_REDIRECT_URL` | `https://dealse.app/admin/accept-invitation` |

The admin invitation code also accepts `SUPABASE_SECRET_KEY` in preference to the
service-role key, but media storage currently requires `SUPABASE_SERVICE_ROLE_KEY`.
Do not substitute a management token or browser publishable key for these.

Copy the new service ID (`srv-...`) and HTTPS origin. Change `RENDER_SERVICE_ID`
and `DEALSE_API_URL` in GitHub, and `DEALSE_API_URL` in Netlify. Replace GitHub's
`RENDER_API_KEY` secret. Save-and-redeploy is required for runtime changes.

## 8. Netlify: transfer or recreate the website

Use the destination team's free plan and create a project without Git integration
if a project transfer is unavailable. Record its project ID and default hostname.
Create a personal access token authorized for that team; this becomes GitHub's
`NETLIFY_AUTH_TOKEN` secret. Update `NETLIFY_SITE_ID` when the project ID changes.

Build configuration is checked in at [apps/web/netlify.toml](../apps/web/netlify.toml):
repository-root base, `apps/web` package directory, `apps/web/.next` publish path.
The workflow uses `--filter @dealse/web`, the pinned Node/pnpm versions and the
Netlify Next.js adapter; do not upload only static HTML or the prototype build.

Set these three variables in Netlify for production Builds **and Functions**
(the free plan may expose all scopes together), and mirror them in GitHub:

| Variable | Value |
| --- | --- |
| `DEALSE_API_URL` | New Render HTTPS origin, without `/api/v1` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase public publishable key |

No database, SMTP, service-role or deployment tokens belong in web runtime settings.
Deploy on the new default hostname, confirm environment values, then set production
visibility Public when ready. Keep preview visibility private. Arrange a domain
handover from the old project to the new project; the same custom domain cannot be
assumed attachable to both simultaneously. Keep old deploys for rollback.

## 9. GitHub and GHCR: automatic deployment settings

Repository → Settings → Secrets and variables → Actions:

| Kind | Name | Where to get it |
| --- | --- | --- |
| Secret | `NETLIFY_AUTH_TOKEN` | Destination Netlify account's personal access token |
| Secret | `RENDER_API_KEY` | Destination Render account's API key |
| Variable | `NETLIFY_SITE_ID` | Destination Netlify Project configuration |
| Variable | `RENDER_SERVICE_ID` | Destination Render service ID |
| Variable | `DEALSE_API_URL` | Destination Render HTTPS origin |
| Variable | `NEXT_PUBLIC_SUPABASE_URL` | Destination Supabase project URL |
| Variable | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Destination Supabase publishable key |
| Variable | `STAGING_DEPLOY_ENABLED` | `false` during preparation; `true` at release |

GitHub creates `GITHUB_TOKEN` automatically for each workflow run. Do not manually
create a secret with that name. The image job grants it `packages:write`.
The workflow does not need Supabase management, Aiven admin or Brevo SMTP secrets.

If moving the GitHub repository, verify Actions is enabled and all secrets/variables
and package access work under the destination owner. Image names are derived from
`github.repository`, so a changed owner/repo creates a different GHCR path. Bootstrap
the destination image with deployment disabled, confirm the repository has package
write access, then configure Render's credential to read the new private package.
Do not assume old package ownership/access automatically follows a repository move.

[deploy-staging.yml](../.github/workflows/deploy-staging.yml) triggers on pushes to
`stabilization/retailer-offer-workflow`; both frontend and backend deploy after CI
passes. Local commits and pushes to other branches do not deploy. If changing the
branch, update **both** `on.push.branches` and the configuration job's `github.ref`
condition. The workflow always checks out the triggering commit. Schema migrations
remain explicit/manual. See the deployment guide for bootstrap and manual-dispatch
availability restrictions.

## 10. GoDaddy: custom domain and email DNS

For the existing Netlify project, these records were verified on 2026-11-15:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `75.2.60.5` |
| CNAME | `www` | `hey-02e0f6.netlify.app` |

When recreating Netlify, add `dealse.app` and `www.dealse.app` to the destination
project and use its current Pending DNS verification instructions. The `www`
CNAME must point to the **new** Netlify hostname. Confirm the apex target from
[Netlify's external DNS guide](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/)
rather than assuming this historical IP will always apply.

Keep `dealse.app` primary and verify `www` redirects to it. Wait for a valid HTTPS
certificate covering both names; never bypass certificate errors. Preserve MX,
SPF/DKIM/DMARC TXT records, provider verification records and unrelated subdomains.
If changing nameservers/registrars, inventory and reproduce the whole DNS zone
before delegation; merely editing the website records does not require that move.
Confirm the new owner controls renewals. Domain registration/renewal is separate
from free hosting and is not a zero-cost service.

## 11. Cutover, verification and rollback

After final data synchronization and new-service checks:

1. Verify all destination values against the tables above; check old and new
   accounts carefully before saving. Update Supabase's site/redirect URLs and
   Render's invitation redirect if the public domain is also changing.
2. Set `STAGING_DEPLOY_ENABLED=true`, push a reviewed commit to the configured
   branch, and wait for all jobs to pass. Compare the live Render image digest
   and Netlify deploy ID with that run. Avoid repeated empty pushes: they consume
   free build/deployment allowances.
3. Verify DNS, valid HTTPS, apex/www redirects, home/login pages, API health and
   database-backed discovery. Confirm the expected catalogue/data counts.
4. Using owned test accounts, verify signup/email delivery, reset/login/logout,
   retailer access, private media, offers, customer flows, admin MFA/permissions,
   cross-tenant denial and redemption. Use approved test data and clean it up.
5. Check no secrets appear in public bundles/responses/logs, `.env`/`.git` are not
   served, private endpoints reject missing/invalid tokens, and the media bucket
   remains private. Check the dependency audit; deployment success is not a
   security clearance.
6. Resume writes only after data and identity consistency are confirmed. Retain
   the old environment/backups through an agreed observation period.

Rollback: stop new releases, restore the previous GitHub/Netlify/Render configuration,
known-good image/deploy and DNS as needed. If the new database has accepted writes,
**do not** simply switch to an older database snapshot: freeze writes and reconcile
new data first. Avoid dual writers. Schema rollback must use a reviewed compatible
forward-fix/restore procedure, never a destructive reset.

## 12. Finish ownership and credential rotation

Once the new owner has verified access and the release works, rotate/revoke old
credentials and remove obsolete account access. Update each consumer before
revoking its old value:

| Credential changed | Where the replacement must go |
| --- | --- |
| Netlify token | GitHub secret `NETLIFY_AUTH_TOKEN` |
| Render API key | GitHub secret `RENDER_API_KEY` |
| GitHub GHCR read PAT | Render registry credential; verify an actual image pull |
| Aiven runtime password/host/CA | Render `DATABASE_URL` / secret file; redeploy |
| Aiven migration-owner password | Approved operator secret store, not app runtime |
| Supabase service-role key | Render `SUPABASE_SERVICE_ROLE_KEY`; redeploy |
| Optional Supabase admin secret key | Render `SUPABASE_SECRET_KEY`; redeploy |
| Supabase publishable key or URL | GitHub variables AND Netlify environment; rebuild |
| Supabase management token | Authorized setup tooling only; not required by CI |
| Brevo SMTP key | Supabase custom SMTP password; test delivery |

Keep real values out of this README, Git commits, issues, screenshots and chat.
Local `.env.deploy.local` and `.local-deploy/` are ignored setup artifacts, not a
backup or transferable secret store. Restrict access and remove obsolete copies
once the handover and rollback period are complete. Rotate credentials previously
shared during setup even if secret scans find no repository leak.

For each destination account, confirm its plan, free quota, billing alerts and
paid-usage controls. Accounts, deployments, email, bandwidth and registry storage
have separate limits; changing accounts or using API tokens does not remove them.
Do not enable paid capacity or add-ons merely to complete a transfer.
