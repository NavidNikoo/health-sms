-- Phase 4: 10DLC compliance tables
-- Run: psql -U postgres -d health_sms -f backend/scripts/migrate_10dlc.sql

-- Org-level 10DLC configuration
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS legal_name          TEXT,
  ADD COLUMN IF NOT EXISTS ein                 TEXT,
  ADD COLUMN IF NOT EXISTS business_address    TEXT,
  ADD COLUMN IF NOT EXISTS business_city       TEXT,
  ADD COLUMN IF NOT EXISTS business_state      TEXT,
  ADD COLUMN IF NOT EXISTS business_zip        TEXT,
  ADD COLUMN IF NOT EXISTS brand_type          TEXT DEFAULT 'SOLE_PROPRIETOR',
  ADD COLUMN IF NOT EXISTS trust_product_sid   TEXT,
  ADD COLUMN IF NOT EXISTS brand_registration_sid TEXT,
  ADD COLUMN IF NOT EXISTS brand_status        TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS campaign_sid        TEXT,
  ADD COLUMN IF NOT EXISTS campaign_status     TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS messaging_service_sid TEXT;

-- Per-number A2P status
ALTER TABLE phone_numbers
  ADD COLUMN IF NOT EXISTS a2p_status TEXT DEFAULT NULL
    CHECK (a2p_status IS NULL OR a2p_status IN ('pending', 'approved', 'failed'));
