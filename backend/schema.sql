-- Health SMS - HIPAA-minded schema
-- Run: psql -U postgres -d health_sms -f schema.sql
-- (Or: createdb health_sms && psql -U postgres -d health_sms -f schema.sql)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Organizations (tenants)
CREATE TABLE organizations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 10DLC compliance fields
  legal_name             TEXT,
  ein                    TEXT,
  business_address       TEXT,
  business_city          TEXT,
  business_state         TEXT,
  business_zip           TEXT,
  brand_type             TEXT DEFAULT 'SOLE_PROPRIETOR',
  trust_product_sid      TEXT,
  brand_registration_sid TEXT,
  brand_status           TEXT,
  campaign_sid           TEXT,
  campaign_status        TEXT,
  messaging_service_sid  TEXT
);

-- Users (providers, staff, admins)
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'provider', 'staff')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  UNIQUE (org_id, email)
);

-- Authorized destination numbers for call forwarding
CREATE TABLE authorized_forward_numbers (
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

-- Phone numbers owned by an org (clinic-side)
CREATE TABLE phone_numbers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  e164_number      TEXT NOT NULL,
  label            TEXT,
  provider_sid     TEXT,
  call_forward_to  TEXT,
  call_forward_authorized_number_id UUID REFERENCES authorized_forward_numbers(id) ON DELETE SET NULL,
  a2p_status   TEXT CHECK (a2p_status IS NULL OR a2p_status IN ('pending', 'approved', 'failed')),
  UNIQUE (org_id, e164_number)
);

-- Patients (PHI - keep minimal for demo)
CREATE TABLE patients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  primary_phone TEXT NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conversations (thread between clinic number and patient)
CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  phone_number_id UUID NOT NULL REFERENCES phone_numbers(id) ON DELETE RESTRICT,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Messages (PHI - body stored encrypted at app layer)
CREATE TABLE messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction         TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number       TEXT NOT NULL,
  to_number         TEXT NOT NULL,
  body_encrypted    TEXT NOT NULL,
  vendor_message_id TEXT,
  status            TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  sent_at           TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  failed_at         TIMESTAMPTZ,
  error_code        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Message templates
CREATE TABLE templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Port-in requests
CREATE TABLE port_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  phone_number            TEXT NOT NULL,
  losing_carrier          TEXT,
  authorized_name         TEXT NOT NULL,
  authorized_email        TEXT NOT NULL,
  authorized_phone        TEXT,
  service_address         TEXT,
  twilio_port_request_sid TEXT,
  status                  TEXT NOT NULL DEFAULT 'submitted'
                          CHECK (status IN (
                            'submitted', 'in_review', 'waiting_for_signature',
                            'in_progress', 'completed', 'action_required',
                            'rejected', 'cancelled'
                          )),
  status_detail           TEXT,
  completed_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit logs (HIPAA - who did what, when)
CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   UUID,
  metadata      JSONB,
  ip            TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_messages_conversation_created ON messages (conversation_id, created_at DESC);
CREATE INDEX idx_audit_logs_org_created ON audit_logs (org_id, created_at DESC);
CREATE INDEX idx_conversations_org_last_message ON conversations (org_id, last_message_at DESC NULLS LAST);
CREATE INDEX idx_patients_org ON patients (org_id);
CREATE INDEX idx_users_org ON users (org_id);
CREATE INDEX idx_authorized_forward_numbers_org ON authorized_forward_numbers (org_id, created_at DESC);
CREATE INDEX idx_port_requests_org ON port_requests (org_id, created_at DESC);
