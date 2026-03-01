-- Phase 2 migration: authorized forwarding numbers
-- Run: psql -U <user> -d <db> -f backend/scripts/migrate_v3.sql

CREATE TABLE IF NOT EXISTS authorized_forward_numbers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  e164_number        TEXT NOT NULL,
  label              TEXT,
  status             TEXT NOT NULL DEFAULT 'approved'
                     CHECK (status IN ('pending', 'approved', 'disabled')),
  verified_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, e164_number)
);

ALTER TABLE phone_numbers
  ADD COLUMN IF NOT EXISTS call_forward_authorized_number_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'phone_numbers_call_forward_authorized_number_id_fkey'
  ) THEN
    ALTER TABLE phone_numbers
      ADD CONSTRAINT phone_numbers_call_forward_authorized_number_id_fkey
      FOREIGN KEY (call_forward_authorized_number_id)
      REFERENCES authorized_forward_numbers(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_authorized_forward_numbers_org
  ON authorized_forward_numbers (org_id, created_at DESC);

-- Backfill existing call_forward_to values into authorized list
INSERT INTO authorized_forward_numbers (org_id, created_by_user_id, e164_number, label, status, verified_at)
SELECT
  pn.org_id,
  (
    SELECT u.id
    FROM users u
    WHERE u.org_id = pn.org_id
    ORDER BY u.created_at
    LIMIT 1
  ) AS created_by_user_id,
  pn.call_forward_to,
  'Imported forwarding number',
  'approved',
  now()
FROM phone_numbers pn
WHERE pn.call_forward_to IS NOT NULL
  AND btrim(pn.call_forward_to) <> ''
ON CONFLICT (org_id, e164_number) DO NOTHING;

UPDATE phone_numbers pn
SET call_forward_authorized_number_id = afn.id
FROM authorized_forward_numbers afn
WHERE afn.org_id = pn.org_id
  AND afn.e164_number = pn.call_forward_to
  AND pn.call_forward_authorized_number_id IS NULL;
