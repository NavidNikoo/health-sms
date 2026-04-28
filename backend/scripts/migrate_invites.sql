-- Organization invites: admin-issued invite tokens for joining an org
-- Run: psql -d health_sms -f backend/scripts/migrate_invites.sql

CREATE TABLE IF NOT EXISTS organization_invites (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_email      TEXT NOT NULL,
  role               TEXT NOT NULL CHECK (role IN ('admin', 'provider', 'staff')),
  token_hash         TEXT NOT NULL UNIQUE,
  expires_at         TIMESTAMPTZ NOT NULL,
  used_at            TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_invites_org_created
  ON organization_invites (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_org_invites_token
  ON organization_invites (token_hash);

-- Only one active (not used, not revoked) invite per (org,email)
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_invites_active
  ON organization_invites (org_id, lower(invited_email))
  WHERE used_at IS NULL AND revoked_at IS NULL;
