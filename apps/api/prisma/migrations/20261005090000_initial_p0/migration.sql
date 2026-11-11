-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'suspended', 'deleted');

-- CreateEnum
CREATE TYPE "retailer_status" AS ENUM ('pending', 'active', 'suspended', 'closed');

-- CreateEnum
CREATE TYPE "membership_role" AS ENUM ('owner', 'manager', 'staff');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('invited', 'active', 'revoked');

-- CreateEnum
CREATE TYPE "store_status" AS ENUM ('draft', 'pending_verification', 'active', 'paused', 'closed');

-- CreateEnum
CREATE TYPE "product_status" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "deal_status" AS ENUM ('draft', 'published', 'paused', 'ended');

-- CreateEnum
CREATE TYPE "offer_type" AS ENUM ('percentage', 'fixed_amount', 'buy_x_get_y', 'other');

-- CreateEnum
CREATE TYPE "media_purpose" AS ENUM ('store', 'product', 'deal', 'avatar');

-- CreateEnum
CREATE TYPE "media_processing_status" AS ENUM ('pending', 'quarantined', 'ready', 'rejected', 'deleted');

-- CreateEnum
CREATE TYPE "redemption_code_status" AS ENUM ('issued', 'redeemed', 'expired', 'revoked');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "auth_provider" VARCHAR(64) NOT NULL,
    "auth_subject" VARCHAR(255) NOT NULL,
    "email_normalized" VARCHAR(320),
    "email_verified_at" TIMESTAMPTZ(6),
    "status" "user_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_signed_in_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(120),
    "phone_e164" VARCHAR(20),
    "locale" VARCHAR(16) NOT NULL DEFAULT 'en',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "retailers" (
    "id" UUID NOT NULL,
    "display_name" VARCHAR(180) NOT NULL,
    "legal_name" VARCHAR(255),
    "status" "retailer_status" NOT NULL DEFAULT 'pending',
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "retailers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retailer_memberships" (
    "id" UUID NOT NULL,
    "retailer_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "membership_role" NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'invited',
    "invited_email" VARCHAR(320),
    "invited_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "retailer_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL,
    "retailer_id" UUID NOT NULL,
    "category_id" UUID,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "phone" VARCHAR(32),
    "email" VARCHAR(320),
    "address_line1" VARCHAR(255),
    "address_line2" VARCHAR(255),
    "locality" VARCHAR(120),
    "city" VARCHAR(100) NOT NULL,
    "region" VARCHAR(100) NOT NULL,
    "postal_code" VARCHAR(24),
    "country_code" CHAR(2) NOT NULL DEFAULT 'IN',
    "location" geography(Point, 4326),
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    "opening_hours" JSONB,
    "status" "store_status" NOT NULL DEFAULT 'draft',
    "verified_at" TIMESTAMPTZ(6),
    "verified_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "retailer_id" UUID NOT NULL,
    "store_id" UUID,
    "category_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "brand" VARCHAR(120),
    "status" "product_status" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "storage_provider" VARCHAR(32) NOT NULL,
    "bucket" VARCHAR(128) NOT NULL,
    "object_key" VARCHAR(512) NOT NULL,
    "purpose" "media_purpose" NOT NULL,
    "mime_type" VARCHAR(127) NOT NULL,
    "byte_size" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "checksum_sha256" CHAR(64),
    "processing_status" "media_processing_status" NOT NULL DEFAULT 'pending',
    "alt_text" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "ready_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_images" (
    "store_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "store_images_pkey" PRIMARY KEY ("store_id","media_asset_id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "product_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("product_id","media_asset_id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "summary" VARCHAR(320),
    "details" TEXT,
    "terms" TEXT NOT NULL,
    "offer_type" "offer_type" NOT NULL,
    "discount_bps" INTEGER,
    "discount_amount_minor" BIGINT,
    "currency" CHAR(3),
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "store_timezone" VARCHAR(64) NOT NULL,
    "status" "deal_status" NOT NULL DEFAULT 'draft',
    "max_redemptions" INTEGER,
    "redemption_count" INTEGER NOT NULL DEFAULT 0,
    "per_customer_limit" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_products" (
    "deal_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "display_order" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "deal_products_pkey" PRIMARY KEY ("deal_id","product_id")
);

-- CreateTable
CREATE TABLE "deal_images" (
    "deal_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "deal_images_pkey" PRIMARY KEY ("deal_id","media_asset_id")
);

-- CreateTable
CREATE TABLE "favourites" (
    "user_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favourites_pkey" PRIMARY KEY ("user_id","deal_id")
);

-- CreateTable
CREATE TABLE "followed_stores" (
    "user_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "followed_stores_pkey" PRIMARY KEY ("user_id","store_id")
);

-- CreateTable
CREATE TABLE "redemption_codes" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "status" "redemption_code_status" NOT NULL DEFAULT 'issued',
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "redeemed_at" TIMESTAMPTZ(6),

    CONSTRAINT "redemption_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemptions" (
    "id" UUID NOT NULL,
    "code_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "redeemed_by_user_id" UUID NOT NULL,
    "customer_redemption_number" INTEGER NOT NULL DEFAULT 1,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_id" UUID,
    "redeemed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_type" VARCHAR(32) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" UUID,
    "retailer_id" UUID,
    "request_id" UUID,
    "before_snapshot" JSONB,
    "after_snapshot" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_status_created_at_idx" ON "users"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_provider_auth_subject_key" ON "users"("auth_provider", "auth_subject");

-- CreateIndex
CREATE INDEX "retailers_status_created_at_idx" ON "retailers"("status", "created_at");

-- CreateIndex
CREATE INDEX "retailer_memberships_user_id_status_idx" ON "retailer_memberships"("user_id", "status");

-- CreateIndex
CREATE INDEX "retailer_memberships_retailer_id_status_idx" ON "retailer_memberships"("retailer_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "retailer_memberships_retailer_id_user_id_key" ON "retailer_memberships"("retailer_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_sort_order_idx" ON "categories"("parent_id", "sort_order");

-- CreateIndex
CREATE INDEX "categories_is_active_sort_order_idx" ON "categories"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "stores_retailer_id_status_idx" ON "stores"("retailer_id", "status");

-- CreateIndex
CREATE INDEX "stores_city_region_status_idx" ON "stores"("city", "region", "status");

-- CreateIndex
CREATE UNIQUE INDEX "stores_retailer_id_slug_key" ON "stores"("retailer_id", "slug");

-- CreateIndex
CREATE INDEX "products_retailer_id_status_updated_at_idx" ON "products"("retailer_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "products_category_id_status_idx" ON "products"("category_id", "status");

-- CreateIndex
CREATE INDEX "products_store_id_status_idx" ON "products"("store_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "products_retailer_id_slug_key" ON "products"("retailer_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_object_key_key" ON "media_assets"("object_key");

-- CreateIndex
CREATE INDEX "media_assets_owner_user_id_created_at_idx" ON "media_assets"("owner_user_id", "created_at");

-- CreateIndex
CREATE INDEX "media_assets_processing_status_created_at_idx" ON "media_assets"("processing_status", "created_at");

-- CreateIndex
CREATE INDEX "store_images_media_asset_id_idx" ON "store_images"("media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_images_store_id_sort_order_key" ON "store_images"("store_id", "sort_order");

-- CreateIndex
CREATE INDEX "product_images_media_asset_id_idx" ON "product_images"("media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_images_product_id_sort_order_key" ON "product_images"("product_id", "sort_order");

-- CreateIndex
CREATE INDEX "deals_store_id_created_at_idx" ON "deals"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "deals_status_starts_at_ends_at_idx" ON "deals"("status", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "deals_store_id_slug_key" ON "deals"("store_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "deals_id_store_id_key" ON "deals"("id", "store_id");

-- CreateIndex
CREATE INDEX "deal_products_product_id_deal_id_idx" ON "deal_products"("product_id", "deal_id");

-- CreateIndex
CREATE INDEX "deal_images_media_asset_id_idx" ON "deal_images"("media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "deal_images_deal_id_sort_order_key" ON "deal_images"("deal_id", "sort_order");

-- CreateIndex
CREATE INDEX "favourites_deal_id_created_at_idx" ON "favourites"("deal_id", "created_at");

-- CreateIndex
CREATE INDEX "followed_stores_store_id_created_at_idx" ON "followed_stores"("store_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "redemption_codes_token_hash_key" ON "redemption_codes"("token_hash");

-- CreateIndex
CREATE INDEX "redemption_codes_deal_id_status_expires_at_idx" ON "redemption_codes"("deal_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "redemption_codes_customer_user_id_issued_at_idx" ON "redemption_codes"("customer_user_id", "issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "redemption_codes_id_deal_id_customer_user_id_key" ON "redemption_codes"("id", "deal_id", "customer_user_id");

-- CreateIndex
CREATE INDEX "redemptions_store_id_redeemed_at_idx" ON "redemptions"("store_id", "redeemed_at");

-- CreateIndex
CREATE INDEX "redemptions_deal_id_redeemed_at_idx" ON "redemptions"("deal_id", "redeemed_at");

-- CreateIndex
CREATE INDEX "redemptions_customer_user_id_redeemed_at_idx" ON "redemptions"("customer_user_id", "redeemed_at");

-- CreateIndex
CREATE UNIQUE INDEX "redemptions_deal_id_customer_user_id_customer_redemption_nu_key" ON "redemptions"("deal_id", "customer_user_id", "customer_redemption_number");

-- CreateIndex
CREATE UNIQUE INDEX "redemptions_code_id_deal_id_customer_user_id_key" ON "redemptions"("code_id", "deal_id", "customer_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "redemptions_store_id_idempotency_key_key" ON "redemptions"("store_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_retailer_id_created_at_idx" ON "audit_logs"("retailer_id", "created_at");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailers" ADD CONSTRAINT "retailers_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_memberships" ADD CONSTRAINT "retailer_memberships_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_memberships" ADD CONSTRAINT "retailer_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_memberships" ADD CONSTRAINT "retailer_memberships_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_images" ADD CONSTRAINT "store_images_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_images" ADD CONSTRAINT "store_images_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_products" ADD CONSTRAINT "deal_products_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_products" ADD CONSTRAINT "deal_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_images" ADD CONSTRAINT "deal_images_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_images" ADD CONSTRAINT "deal_images_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followed_stores" ADD CONSTRAINT "followed_stores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followed_stores" ADD CONSTRAINT "followed_stores_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemption_codes" ADD CONSTRAINT "redemption_codes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemption_codes" ADD CONSTRAINT "redemption_codes_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_code_id_deal_id_customer_user_id_fkey" FOREIGN KEY ("code_id", "deal_id", "customer_user_id") REFERENCES "redemption_codes"("id", "deal_id", "customer_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_deal_id_store_id_fkey" FOREIGN KEY ("deal_id", "store_id") REFERENCES "deals"("id", "store_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_redeemed_by_user_id_fkey" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invariants Prisma's schema language cannot yet model directly.
ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized_lowercase_check"
    CHECK ("email_normalized" IS NULL OR "email_normalized" = lower("email_normalized"));

ALTER TABLE "stores" ADD CONSTRAINT "stores_country_code_uppercase_check"
    CHECK ("country_code" ~ '^[A-Z]{2}$');
ALTER TABLE "stores" ADD CONSTRAINT "stores_active_verified_and_geocoded_check"
    CHECK ("status" <> 'active' OR ("verified_at" IS NOT NULL AND "verified_by_user_id" IS NOT NULL AND "location" IS NOT NULL));
ALTER TABLE "stores" ADD CONSTRAINT "stores_timezone_nonblank_check"
    CHECK (length(trim("timezone")) > 0);

ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_byte_size_positive_check"
    CHECK ("byte_size" > 0);
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_dimensions_positive_check"
    CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0));
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_ready_timestamp_check"
    CHECK ("processing_status" <> 'ready' OR "ready_at" IS NOT NULL);

ALTER TABLE "store_images" ADD CONSTRAINT "store_images_sort_order_nonnegative_check"
    CHECK ("sort_order" >= 0);
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_sort_order_nonnegative_check"
    CHECK ("sort_order" >= 0);
ALTER TABLE "deal_images" ADD CONSTRAINT "deal_images_sort_order_nonnegative_check"
    CHECK ("sort_order" >= 0);
CREATE UNIQUE INDEX "store_images_one_primary_per_store_idx"
    ON "store_images"("store_id") WHERE "is_primary";
CREATE UNIQUE INDEX "product_images_one_primary_per_product_idx"
    ON "product_images"("product_id") WHERE "is_primary";
CREATE UNIQUE INDEX "deal_images_one_primary_per_deal_idx"
    ON "deal_images"("deal_id") WHERE "is_primary";

ALTER TABLE "deal_products" ADD CONSTRAINT "deal_products_display_order_nonnegative_check"
    CHECK ("display_order" >= 0);
ALTER TABLE "deals" ADD CONSTRAINT "deals_valid_window_check"
    CHECK ("starts_at" < "ends_at");
ALTER TABLE "deals" ADD CONSTRAINT "deals_nonblank_content_check"
    CHECK (length(trim("title")) > 0 AND length(trim("terms")) > 0);
ALTER TABLE "deals" ADD CONSTRAINT "deals_published_timestamp_check"
    CHECK ("status" <> 'published' OR "published_at" IS NOT NULL);
ALTER TABLE "deals" ADD CONSTRAINT "deals_positive_limits_check"
    CHECK (("max_redemptions" IS NULL OR "max_redemptions" > 0) AND "per_customer_limit" > 0 AND "redemption_count" >= 0 AND "version" > 0);
ALTER TABLE "deals" ADD CONSTRAINT "deals_redemption_count_within_cap_check"
    CHECK ("max_redemptions" IS NULL OR "redemption_count" <= "max_redemptions");
ALTER TABLE "deals" ADD CONSTRAINT "deals_discount_fields_match_type_check"
    CHECK (
      ("offer_type" = 'percentage' AND "discount_bps" IS NOT NULL AND "discount_bps" BETWEEN 1 AND 10000 AND "discount_amount_minor" IS NULL AND "currency" IS NULL)
      OR ("offer_type" = 'fixed_amount' AND "discount_amount_minor" IS NOT NULL AND "discount_amount_minor" > 0 AND "currency" IS NOT NULL AND "currency" ~ '^[A-Z]{3}$' AND "discount_bps" IS NULL)
      OR ("offer_type" IN ('buy_x_get_y', 'other') AND "discount_bps" IS NULL AND "discount_amount_minor" IS NULL AND "currency" IS NULL)
    );
CREATE INDEX "deals_published_store_window_idx"
    ON "deals"("store_id", "starts_at", "ends_at") WHERE "status" = 'published';

ALTER TABLE "redemption_codes" ADD CONSTRAINT "redemption_codes_expiry_after_issue_check"
    CHECK ("expires_at" > "issued_at" AND "expires_at" <= "issued_at" + INTERVAL '5 minutes');
ALTER TABLE "redemption_codes" ADD CONSTRAINT "redemption_codes_sha256_hash_length_check"
    CHECK (octet_length("token_hash") = 32);
ALTER TABLE "redemption_codes" ADD CONSTRAINT "redemption_codes_status_timestamp_check"
    CHECK (("status" = 'redeemed') = ("redeemed_at" IS NOT NULL));
ALTER TABLE "redemption_codes" ADD CONSTRAINT "redemption_codes_redeemed_before_expiry_check"
    CHECK ("redeemed_at" IS NULL OR "redeemed_at" < "expires_at");
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_customer_sequence_positive_check"
    CHECK ("customer_redemption_number" > 0);

CREATE INDEX "stores_location_gist_idx" ON "stores" USING GIST ("location") WHERE "location" IS NOT NULL;
