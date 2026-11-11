-- Proposed D1 / SQLite-compatible schema. Not applied to a live database.
-- Migration policy and API invariants: docs/backend-foundation.md

PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  auth_provider TEXT NOT NULL,
  auth_subject TEXT NOT NULL,
  email TEXT,
  display_name TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (auth_provider, auth_subject)
);

CREATE TABLE stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  phone TEXT,
  email TEXT,
  address TEXT NOT NULL,
  area TEXT NOT NULL,
  city TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'Gujarat',
  postal_code TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  image_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE retailer_memberships (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'revoked')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (store_id, user_id)
);

CREATE INDEX idx_retailer_memberships_user_status
  ON retailer_memberships(user_id, status);

CREATE TABLE offers (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  terms TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'paused', 'archived')),
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  image_key TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (ends_at > starts_at),
  UNIQUE (id, store_id)
);

CREATE INDEX idx_offers_store_status_dates
  ON offers(store_id, status, starts_at, ends_at);

CREATE TABLE redemption_codes (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  offer_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('unused', 'redeemed', 'revoked')),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  redeemed_at TEXT,
  redeemed_by TEXT REFERENCES users(id),
  CHECK (
    (status = 'redeemed' AND redeemed_at IS NOT NULL AND redeemed_by IS NOT NULL)
    OR (status != 'redeemed' AND redeemed_at IS NULL AND redeemed_by IS NULL)
  ),
  FOREIGN KEY (offer_id, store_id) REFERENCES offers(id, store_id) ON DELETE RESTRICT,
  UNIQUE (id, offer_id, store_id)
);

CREATE INDEX idx_redemption_codes_store_status
  ON redemption_codes(store_id, status, issued_at DESC);
CREATE INDEX idx_redemption_codes_offer_status
  ON redemption_codes(offer_id, status);

CREATE TABLE redemption_events (
  id TEXT PRIMARY KEY,
  code_id TEXT NOT NULL UNIQUE,
  offer_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  redeemed_at TEXT NOT NULL,
  FOREIGN KEY (code_id, offer_id, store_id) REFERENCES redemption_codes(id, offer_id, store_id) ON DELETE RESTRICT
);

CREATE INDEX idx_redemption_events_store_time
  ON redemption_events(store_id, redeemed_at DESC);
CREATE INDEX idx_redemption_events_offer_time
  ON redemption_events(offer_id, redeemed_at DESC);
