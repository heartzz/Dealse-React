ALTER TABLE "deals"
  ADD COLUMN "category_id" UUID,
  ADD COLUMN "original_price_minor" BIGINT,
  ADD COLUMN "offer_price_minor" BIGINT,
  ADD COLUMN "image_reference" VARCHAR(1000);

ALTER TABLE "deals"
  ADD CONSTRAINT "deals_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "deals_prices_positive_and_ordered_check"
    CHECK (
      ("original_price_minor" IS NULL AND "offer_price_minor" IS NULL)
      OR ("original_price_minor" > 0 AND "offer_price_minor" > 0 AND "offer_price_minor" < "original_price_minor")
    );

CREATE INDEX "deals_category_id_status_starts_at_ends_at_idx"
  ON "deals"("category_id", "status", "starts_at", "ends_at");

INSERT INTO "categories" ("id", "slug", "name", "sort_order", "is_active", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'fashion-accessories', 'Fashion & Accessories', 10, true, now(), now()),
  (gen_random_uuid(), 'food-beverages', 'Food & Beverages', 20, true, now(), now()),
  (gen_random_uuid(), 'home-living', 'Home & Living', 30, true, now(), now()),
  (gen_random_uuid(), 'beauty-wellness', 'Beauty & Wellness', 40, true, now(), now()),
  (gen_random_uuid(), 'electronics', 'Electronics', 50, true, now(), now()),
  (gen_random_uuid(), 'gifts-handicrafts', 'Gifts & Handicrafts', 60, true, now(), now()),
  (gen_random_uuid(), 'sports-fitness', 'Sports & Fitness', 70, true, now(), now()),
  (gen_random_uuid(), 'books-stationery', 'Books & Stationery', 80, true, now(), now()),
  (gen_random_uuid(), 'pets-pet-care', 'Pets & Pet Care', 90, true, now(), now())
ON CONFLICT ("slug") DO NOTHING;
