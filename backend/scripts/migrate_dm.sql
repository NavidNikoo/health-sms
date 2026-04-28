-- Team Chat: organization-scoped user-to-user messaging with encrypted bodies
-- Run: psql -d health_sms -f backend/scripts/migrate_dm.sql

-- User profiles for team chat identity and privacy
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  handle        TEXT UNIQUE,
  display_name  TEXT,
  allow_dms     TEXT NOT NULL DEFAULT 'requests'
                CHECK (allow_dms IN ('nobody', 'requests', 'anyone')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_handle
  ON user_profiles (lower(handle)) WHERE handle IS NOT NULL;

-- Team chat requests / connection records
CREATE TABLE IF NOT EXISTS user_dm_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'accepted', 'declined', 'blocked', 'cancelled')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  acted_at           TIMESTAMPTZ,
  CHECK (requester_user_id <> recipient_user_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_requests_recipient
  ON user_dm_requests (recipient_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_requests_requester
  ON user_dm_requests (requester_user_id, status, created_at DESC);

-- Block list
CREATE TABLE IF NOT EXISTS user_dm_blocks (
  blocker_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_user_id, blocked_user_id),
  CHECK (blocker_user_id <> blocked_user_id)
);

-- Team chat threads (canonical pair)
CREATE TABLE IF NOT EXISTS user_dm_threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_a_id, user_b_id),
  CHECK (user_a_id < user_b_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_threads_user_a
  ON user_dm_threads (user_a_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_dm_threads_user_b
  ON user_dm_threads (user_b_id, last_message_at DESC NULLS LAST);

-- Team chat messages (encrypted at app layer like SMS messages)
CREATE TABLE IF NOT EXISTS user_dm_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       UUID NOT NULL REFERENCES user_dm_threads(id) ON DELETE CASCADE,
  sender_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body_encrypted  TEXT NOT NULL,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_thread_created
  ON user_dm_messages (thread_id, created_at DESC);
