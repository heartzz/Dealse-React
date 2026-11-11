CREATE TYPE "account_role" AS ENUM ('customer', 'retailer');

CREATE TABLE "user_account_roles" (
    "user_id" UUID NOT NULL,
    "role" "account_role" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_account_roles_pkey" PRIMARY KEY ("user_id", "role"),
    CONSTRAINT "user_account_roles_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "user_account_roles_role_created_at_idx"
    ON "user_account_roles"("role", "created_at");

INSERT INTO "user_account_roles" ("user_id", "role")
SELECT "id", 'customer'::"account_role"
FROM "users"
ON CONFLICT DO NOTHING;

INSERT INTO "user_profiles" ("user_id", "updated_at")
SELECT "id", CURRENT_TIMESTAMP
FROM "users"
ON CONFLICT DO NOTHING;
