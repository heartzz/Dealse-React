CREATE TYPE "admin_role" AS ENUM ('root_admin', 'super_admin', 'admin');
CREATE TYPE "admin_account_status" AS ENUM ('pending', 'active', 'suspended', 'revoked');
CREATE TYPE "admin_permission_key" AS ENUM (
  'dashboard.read',
  'retailers.read', 'retailers.review', 'retailers.suspend',
  'stores.read', 'stores.verify', 'stores.suspend',
  'offers.read', 'offers.review', 'offers.pause', 'offers.remove',
  'customers.read', 'customers.suspend', 'redemptions.read',
  'categories.read', 'categories.manage', 'analytics.read', 'audit.read',
  'admins.manage', 'settings.manage'
);

CREATE TABLE "admin_accounts" (
  "user_id" UUID NOT NULL,
  "role" "admin_role" NOT NULL,
  "status" "admin_account_status" NOT NULL DEFAULT 'pending',
  "invited_by_id" UUID,
  "accepted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "admin_accounts_pkey" PRIMARY KEY ("user_id")
);
CREATE INDEX "admin_accounts_role_status_idx" ON "admin_accounts"("role", "status");

CREATE TABLE "admin_permission_grants" (
  "user_id" UUID NOT NULL,
  "permission" "admin_permission_key" NOT NULL,
  "granted_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_permission_grants_pkey" PRIMARY KEY ("user_id", "permission")
);
CREATE INDEX "admin_permission_grants_permission_user_id_idx" ON "admin_permission_grants"("permission", "user_id");

CREATE TABLE "admin_invitations" (
  "id" UUID NOT NULL,
  "email_normalized" VARCHAR(320) NOT NULL,
  "role" "admin_role" NOT NULL,
  "permission_keys" "admin_permission_key"[] NOT NULL DEFAULT ARRAY[]::"admin_permission_key"[],
  "invited_by_id" UUID NOT NULL,
  "accepted_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "admin_invitations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admin_invitations_email_normalized_expires_at_idx" ON "admin_invitations"("email_normalized", "expires_at");
CREATE INDEX "admin_invitations_invited_by_id_created_at_idx" ON "admin_invitations"("invited_by_id", "created_at");

CREATE TABLE "admin_bootstrap" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "user_id" UUID NOT NULL,
  "established_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_bootstrap_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_bootstrap_singleton_id_check" CHECK ("id" = 1)
);
CREATE UNIQUE INDEX "admin_bootstrap_user_id_key" ON "admin_bootstrap"("user_id");

ALTER TABLE "audit_logs"
  ADD COLUMN "actor_admin_role" "admin_role",
  ADD COLUMN "actor_permissions" "admin_permission_key"[] NOT NULL DEFAULT ARRAY[]::"admin_permission_key"[];

ALTER TABLE "admin_accounts" ADD CONSTRAINT "admin_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admin_accounts" ADD CONSTRAINT "admin_accounts_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admin_permission_grants" ADD CONSTRAINT "admin_permission_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "admin_accounts"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_permission_grants" ADD CONSTRAINT "admin_permission_grants_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admin_invitations" ADD CONSTRAINT "admin_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admin_invitations" ADD CONSTRAINT "admin_invitations_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admin_bootstrap" ADD CONSTRAINT "admin_bootstrap_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
