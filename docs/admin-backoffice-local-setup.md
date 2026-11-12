# Admin Backoffice local setup

This setup applies only to the local `dealse_dev` database and an existing identity in the development Supabase project. It does not create Supabase identities, change retailer data, or grant access to a production project.

## Apply the additive schema migration

From the repository root, ensure `apps/api/.env` points at the local `dealse_dev` database. Inspect the pending migration at `apps/api/prisma/migrations/20261112140000_admin_backoffice_foundation/migration.sql`, then run:

```powershell
pnpm --filter @dealse/api db:migrate:deploy
```

This uses Prisma's deploy mode to apply pending migrations and does not reset the database. Never point this local setup command at production.

## Establish the first Root Admin

1. Create or use a trusted user in the development Supabase project and complete a normal DealSe sign-in so an active user exists in the local DealSe `users` table. Do not use public registration to grant admin rights.
2. Obtain the exact existing `auth_provider` and `auth_subject` from the local operator's trusted identity mapping. Do not use a browser-supplied role or Supabase user metadata.
3. In a private PowerShell session, set `NODE_ENV=development`, `ADMIN_BOOTSTRAP_ENV=development`, `ADMIN_BOOTSTRAP_AUTH_PROVIDER`, `ADMIN_BOOTSTRAP_AUTH_SUBJECT`, `DATABASE_URL` from `apps/api/.env`, and a randomly generated `ADMIN_BOOTSTRAP_SECRET` of at least 32 characters. The script accepts only the explicit local target `dealse_dev_app@127.0.0.1:5432/dealse_dev` with the `public` schema. It rejects unknown, remote, staging and production targets regardless of environment flags. Keep the secret in process memory only; do not put it in tracked files or command-line arguments.
4. Run `pnpm --filter @dealse/api admin:bootstrap-root` and enter the same secret when prompted. Input is hidden for interactive terminals. The script prints only a generic failure message or a success statement; it never prints the secret or database URL/credentials.
5. Clear the bootstrap environment variables from the PowerShell process after completion. Verify access by signing in at `/admin/login` and completing Supabase TOTP AAL2. Do not alter the `admin_accounts`, `admin_bootstrap`, or permission tables manually to work around a failure.

The bootstrap requires both environment settings to explicitly equal `development`, an already active DealSe user, the exact allowlisted database target, and the one-time bootstrap secret supplied through hidden terminal input. It transactionally inserts the Root Admin, the normal `admin` application role, the singleton bootstrap marker, and an audit row. Re-running it for the same identity is idempotent; a different identity is refused. The browser receives only the normal Supabase session and never receives a service-role key. This command is not an HTTP endpoint and must only be run by an authorized local database operator.

## Invitations and administrator management

Administrator management is available at `/admin/admin-users` and `/admin/admin-users/[adminId]`. Root Admin can invite Admin and Super Admin accounts; Super Admin can invite Admin accounts only when granted `admins.manage`. Root Admin alone can promote or change permissions for a Super Admin. Root Admin cannot be created through invitations; the one-time bootstrap is the only supported establishment path. Administrators cannot change their own role, and Super Admins cannot modify their own permissions or grant permissions outside their own scope.

Invitations are delivered by the NestJS API through the Supabase Auth Admin API. Configure `SUPABASE_URL`, a server-only `SUPABASE_SECRET_KEY` (or the legacy server-only `SUPABASE_SERVICE_ROLE_KEY`), and `ADMIN_INVITE_REDIRECT_URL` in the API environment. Allow that exact redirect URL in Supabase Auth URL Configuration. Never configure the secret key in a `NEXT_PUBLIC_` variable or expose it to the browser. The invitation expires after one hour; resending revokes the previous invitation and creates a replacement. Acceptance requires the signed-in Supabase identity to have a verified email matching the invitation and consumes the invitation once. The invitee chooses their password through Supabase Auth. Admin API access continues to require AAL2.

An existing `user_account_roles.role=admin` row alone does not grant access. The active `admin_accounts` row and backend permission checks remain authoritative. Root Admin bypasses permission grants; all other admin routes require their assigned permission. Do not bulk-promote or grant all permissions as part of migration.
