# Token-based staging deployment

This guide targets `stabilization/retailer-offer-workflow`. Files are prepared for
Netlify + Render + Aiven + Supabase; this is not evidence of a live deployment.
No direct Netlify/Render GitHub repository integration is required.

## 1. GitHub configuration

Repository Settings → Secrets and variables → Actions:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `NETLIFY_AUTH_TOKEN` | Netlify personal access token |
| Secret | `RENDER_API_KEY` | Render account API key |
| Variable | `STAGING_DEPLOY_ENABLED` | Set to `true` only after cloud configuration and migrations are ready; otherwise pushes publish only the API image |
| Variable | `NETLIFY_SITE_ID` | Created Netlify project ID |
| Variable | `RENDER_SERVICE_ID` | Image-backed Render service ID (`srv-...`) |
| Variable | `DEALSE_API_URL` | Render HTTPS origin, without `/api/v1` |
| Variable | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| Variable | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public publishable key, never a service-role key |

Do not store database passwords, service-role keys or SMTP keys in these public
variables. Deploy tokens are passed only to their deployment steps. Tokens are
not Docker build arguments. Anyone who can modify a trusted deployment branch
can modify its workflow, so restrict branch write access and review workflow edits.

## 2. Bootstrap the backend image

Push the reviewed deployment files to the target branch. Until
`STAGING_DEPLOY_ENABLED=true`, pushes run CI and publish the API image only. This
solves first-image setup without requiring an existing Render service. Later,
explicitly request image-only mode with `image_only=true`:

```sh
gh workflow run deploy-staging.yml \
  --ref stabilization/retailer-offer-workflow \
  -f image_only=true
```

GitHub only exposes workflow_dispatch workflows present on its default branch.
If this workflow has not been added there yet, build/publish the initial image
locally with Docker and authenticated GHCR access, or first land the workflow on
the default branch through normal review. Do not change the repository default
branch just to enable dispatch. Automatic push triggers do not have that limitation.

```sh
docker buildx build --platform linux/amd64 \
  -f infra/deploy/api.Dockerfile \
  -t ghcr.io/heartzz/dealse-react-api:bootstrap --push .
```

Use the immutable `ghcr.io/heartzz/dealse-react-api@sha256:...` reference from the
build output/Actions summary. The image contains compiled API code and runtime
dependencies; no .env files, development media, Prisma migrations or demo seeds.
The workflow never makes packages public. Verify the package is private and grant
the repository Actions write access if needed. For Render pulls, create a classic
GitHub PAT with `read:packages` for an account authorized to read that package;
store it only as Render's GHCR registry credential. Actions publishing uses its
built-in GITHUB_TOKEN with packages:write, not that PAT.

## 3. Create the Render service

New → Web Service → Existing Image. Select the image above, add the private GHCR
registry credential, choose Free, and name it `dealse-api-staging`. Do not connect
source control. Health-check path: `/api/v1/health`. Leave the start command unset
so Docker's CMD runs. Copy its service ID and HTTPS origin to the GitHub variables.

Set these runtime environment variables on Render:

```dotenv
NODE_ENV=production
DATABASE_URL=<Aiven application connection URI with verified TLS>
OIDC_PROVIDER_ID=supabase
OIDC_ISSUER=https://<project-ref>.supabase.co/auth/v1
OIDC_AUDIENCE=authenticated
OIDC_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
MEDIA_STORAGE_PROVIDER=supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only service_role key>
SUPABASE_MEDIA_BUCKET=dealse-media
```

For Admin invitation email, configure the server-only Supabase Auth Admin
credential and ADMIN_INVITE_REDIRECT_URL after the web URL exists. Invitation
acceptance and production admin provisioning still have documented product/setup
limitations; do not use local bootstrap scripts on a hosted database.

Aiven's CA certificate can be installed as a Render secret file, with the
connection configured to verify that CA (for example the pg `sslrootcert`
connection parameter pointing to the secret-file path). Never work around TLS
errors with `rejectUnauthorized=false`. Verify the provider's database version,
PostGIS extensions and role privileges before applying any migrations. Keep the
runtime role separate from the migration owner; leave room under the free plan's
20-connection limit for rolling releases and maintenance.

The API health endpoint checks process availability, not full business readiness.
Validate database-backed routes as part of first-release acceptance.

## 4. Create the Netlify project

If a Netlify project already exists (for example `hey-02e0f6`), reuse it and copy
its Project ID from Project configuration; do not create a duplicate. Otherwise,
with NETLIFY_AUTH_TOKEN available securely in a local terminal, create the project
without Git integration:

```sh
pnpm --package=netlify-cli@27.19.0 dlx netlify sites:create --name <available-site-name> --account-slug <your-team-slug>
```

Record its ID as NETLIFY_SITE_ID. Set the site's package directory to `apps/web`
and leave the base directory at the repository root. The configuration lives in
`apps/web/netlify.toml`; the workflow selects it with `--filter @dealse/web`.

In Netlify environment variables, set these for **both Builds and Functions**, in
the production context (the CLI uses `--prod` for the staging site's primary URL):

```dotenv
DEALSE_API_URL=https://<your-api>.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Use the same values in GitHub's variables. The dashboard configuration is required
for server-side functions, not just build-time substitution. Never put database,
service-role, Render, or SMTP credentials in the web site's runtime environment.

Set Supabase's site URL and exact allowed auth redirects to the final HTTPS web
URL. Configure Brevo SMTP in Supabase and verify an actual confirmation/reset
email. Keep the media bucket private.

## 5. First release and subsequent pushes

Before the first hosted release, review/apply the checked-in additive migrations
to the intended staging database using a migration owner's connection. This guide
and the auto-deploy workflow do not execute that operation or seed demo records.
See database-schema.md for migration/rollback notes. Supply actual staging data
through the application only after setup and access checks are complete.

Once services, environment and schema are ready, set `STAGING_DEPLOY_ENABLED=true`.
A push to the target branch then:

1. Validates required deployment settings.
2. Runs workspace lint/typecheck/build, PostGIS API tests and public browser tests.
3. Builds and publishes a linux/amd64 API image tagged by commit SHA.
4. Requests that exact image digest on Render, waits up to 15 minutes for live,
   then checks `/api/v1/health`.
5. Builds and uploads Next.js using the Netlify adapter and API token.

The workflow does not cancel an in-progress release. GitHub concurrency may
coalesce pending runs during rapid pushes; this deploys the latest pending change,
not every intermediate commit. API/web changes must be backward-compatible.
If API rollout fails, the website is not published. If web deployment fails after
API succeeds, the prior website remains; roll back the API if compatibility needs it.

After first deploy test signed-out discovery, customer/retailer login, a private
upload, tenant denial, publishing, and actual QR redemption. A deploy success alone
is not production acceptance. Physical-camera and Admin AAL2 acceptance remain open.

## 6. Costs and rollback

API tokens do not bypass limits. Netlify production deployments consume credits;
Render sleeps on idle. GitHub Actions and private registry quotas also apply.
Stay on free plans, keep paid usage disabled where available, and inspect account
limits before enabling frequent deployments. Do not auto-delete known-good images.

For rollback, use Render's prior immutable image and Netlify's prior deploy. If
needed, pause the Actions workflow while restoring. Do not undo migrations by
dropping data; follow the schema-specific compatible rollback or forward-fix plan.

## Local verification

```sh
node --test scripts/deploy/render.test.mjs
pnpm check
docker build -f infra/deploy/api.Dockerfile -t dealse-api:verify .
```

The local `pnpm check` requires a DATABASE_URL for Prisma generation but does not
need to connect to a database. API integration/browser suites require a disposable
PostgreSQL/PostGIS instance. Deployment script tests use a fake transport and do
not contact providers or disclose tokens.

CI creates a synthetic retailer identity only in its disposable loopback `dealse_dev`
database before loading the existing demo catalogue. This fixture refuses remote
databases and production mode; it never creates a Supabase account.

## Verification during preparation (2026-11-15)

- `pnpm install --frozen-lockfile`: passed (initial host pnpm 11.25.0).
- `DATABASE_URL=<local build placeholder> npm exec --yes --package=node@24.15.0 --package=pnpm@11.19.0 -- pnpm check`: passed, with ten existing image optimization warnings.
- `node --test scripts/deploy/render.test.mjs`: six passed.
- `pnpm exec eslint scripts/deploy/*.mjs scripts/ci/*.mjs`: passed.
- `go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.7`: passed.
- `docker build -f infra/deploy/api.Dockerfile -t dealse-api:verify .`: passed on local ARM64. The container ran non-root, loaded sharp and returned HTTP 200 from `/api/v1/health` against disposable Postgres. CI builds Linux AMD64; that architecture has not yet been executed here.
- `pnpm --package=netlify-cli@27.19.0 dlx netlify build --offline --context production --filter @dealse/web`: passed under the pinned Node/pnpm versions, including server and edge function packaging. No upload was performed.
- `pnpm --filter @dealse/api db:migrate:deploy` and `pnpm --filter @dealse/api test`: all eight migrations applied to disposable local PostgreSQL 18/PostGIS; 45 tests passed. No hosted migration was run.

`pnpm --filter @dealse/web test:e2e` with CI fixture settings: 11 passed, one passed on retry after a transient API network error, 17 skipped for missing live credentials/opt-in suites. The first run exposed the loading-state race described below.

The browser loading-state assertion now holds and releases a real server action
instead of requiring a fast transient indicator to remain visible. Authenticated
browser tests still require dedicated live test accounts. Hosted credentials,
registry pulls, HTTPS acceptance and automatic deployment remain unverified.

## Hosted staging setup (2026-11-15)

The preparation-only limitations above were subsequently resolved for the initial
hosted deployment:

- Web: https://hey-02e0f6.netlify.app (Netlify free; production public, previews private).
- API: https://dealse-api-staging.onrender.com (Render free, Singapore, private GHCR image).
- All eight existing migrations applied successfully to the isolated Aiven staging
  database. No demo catalogue or synthetic retailer identities were seeded there.
- Runtime database access uses a separate non-superuser role with a ten-connection
  limit and verified TLS using the Aiven CA. Migration-table access is revoked.
- Supabase Auth redirect URLs point to the website; media bucket remains private.
  SMTP configuration is present, but email delivery and authenticated user journeys
  have not been verified with a real test account.
- Initial GitHub bootstrap run 43634939521 passed. Its Linux AMD64 image was pulled
  and started successfully by Render. API health/discovery and web home/login
  returned HTTP 200; anonymous admin access redirected to login.
- Repository variable `STAGING_DEPLOY_ENABLED` is enabled for subsequent branch
  pushes. Release verification is recorded in GitHub Actions.

Provider credentials and setup state are kept only in ignored local files and
provider/GitHub secret stores. Rotate credentials shared during setup and update
all corresponding stores; the GHCR read credential is held by Render, while image
publishing uses the workflow's short-lived `GITHUB_TOKEN`.
