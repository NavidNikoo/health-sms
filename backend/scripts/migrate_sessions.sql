-- Migration: refresh-token sessions for short-lived access tokens.
-- Run: psql -d health_sms -f backend/scripts/migrate_sessions.sql

CREATE TABLE IF NOT EXISTS user_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       UUID NOT NULL,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  last_used_at    TIMESTAMPTZ,
  rotated_at      TIMESTAMPTZ,
  rotated_to_id   UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
  revoked_at      TIMESTAMPTZ,
  revoked_reason  TEXT,
  ip              TEXT,
  user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active
  ON user_sessions (user_id) WHERE revoked_at IS NULL AND rotated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_sessions_family
  ON user_sessions (family_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires
  ON user_sessions (expires_at);
