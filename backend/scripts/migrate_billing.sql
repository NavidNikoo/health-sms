-- Migration: per-org billing flag for cost-incurring actions.
-- Run: psql -d health_sms -f backend/scripts/migrate_billing.sql

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS billing_plan    TEXT,
  ADD COLUMN IF NOT EXISTS billing_notes   TEXT;
