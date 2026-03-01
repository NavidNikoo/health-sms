-- Phase 2 migration: add voice calling support
-- Run against an existing database (schema.sql already applied):
--   psql -h <HOST> -U <USER> -d health_sms -f backend/scripts/migrate_v2.sql

ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS call_forward_to TEXT;
