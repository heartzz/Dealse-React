CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "href" VARCHAR(500),
    "store_id" UUID,
    "deal_id" UUID,
    "dedupe_key" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_kind_not_empty" CHECK (length(btrim("kind")) > 0),
    CONSTRAINT "notifications_title_not_empty" CHECK (length(btrim("title")) > 0),
    CONSTRAINT "notifications_body_not_empty" CHECK (length(btrim("body")) > 0),
    CONSTRAINT "notifications_user_id_dedupe_key_key" UNIQUE ("user_id", "dedupe_key"),
    CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "notifications_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "notifications_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at" DESC);
