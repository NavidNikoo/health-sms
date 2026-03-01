-- Phase 3: Porting tables
-- Run: psql -U postgres -d health_sms -f backend/scripts/migrate_porting.sql

CREATE TABLE IF NOT EXISTS port_requests (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  phone_number           TEXT NOT NULL,
  losing_carrier         TEXT,
  authorized_name        TEXT NOT NULL,
  authorized_email       TEXT NOT NULL,
  authorized_phone       TEXT,
  service_address        TEXT,
  twilio_port_request_sid TEXT,
  status                 TEXT NOT NULL DEFAULT 'submitted'
                         CHECK (status IN (
                           'submitted', 'in_review', 'waiting_for_signature',
                           'in_progress', 'completed', 'action_required',
                           'rejected', 'cancelled'
                         )),
  status_detail          TEXT,
  completed_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_port_requests_org ON port_requests (org_id, created_at DESC);
