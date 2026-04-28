-- Internal Notes + Assignments for patient conversations
-- Run: psql -d health_sms -f backend/scripts/migrate_internal_notes.sql

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS conversation_internal_notes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  body_encrypted      TEXT NOT NULL,
  mentioned_user_ids  UUID[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_notes_conversation_created
  ON conversation_internal_notes (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_notes_mentions
  ON conversation_internal_notes USING GIN (mentioned_user_ids);
