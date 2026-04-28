-- 2FA migration: add TOTP fields to users table
-- Run: psql -U postgres -d health_sms -f backend/scripts/migrate_2fa.sql
-- change "postgres" with your username
 
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret      TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS totp_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS totp_verified_at TIMESTAMPTZ DEFAULT NULL;
 
-- Index to quickly check 2FA status on login
CREATE INDEX IF NOT EXISTS idx_users_totp_enabled ON users (id, totp_enabled);