-- Health SMS - Seed data for local development
-- Run AFTER schema.sql: psql -U postgres -d health_sms -f scripts/seed.sql
-- Demo login: provider@clinic.demo / password123

INSERT INTO organizations (id, name)
VALUES ('11111111-1111-1111-1111-111111111111', 'Demo Clinic')
ON CONFLICT (id) DO NOTHING;

-- Password: password123 (bcrypt hash)
INSERT INTO users (id, org_id, email, password_hash, role)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'provider@clinic.demo',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'provider'
) ON CONFLICT (org_id, email) DO NOTHING;

INSERT INTO phone_numbers (id, org_id, e164_number, label)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  '+15551234567',
  'Main Line'
) ON CONFLICT (org_id, e164_number) DO NOTHING;

INSERT INTO patients (id, org_id, full_name, primary_phone, notes)
VALUES
  ('44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111', 'Jane Doe', '+15559876543', 'Prefers morning appointments'),
  ('44444444-4444-4444-4444-444444444442', '11111111-1111-1111-1111-111111111111', 'John Smith', '+15559876544', NULL),
  ('44444444-4444-4444-4444-444444444443', '11111111-1111-1111-1111-111111111111', 'Maria Garcia', '+15559876545', 'Spanish speaker')
ON CONFLICT (id) DO NOTHING;

INSERT INTO conversations (id, org_id, patient_id, phone_number_id, status, last_message_at)
VALUES (
  '55555555-5555-5555-5555-555555555551',
  '11111111-1111-1111-1111-111111111111',
  '44444444-4444-4444-4444-444444444441',
  '33333333-3333-3333-3333-333333333333',
  'open',
  now() - interval '1 hour'
) ON CONFLICT (id) DO NOTHING;

-- Messages: body_encrypted stores base64 placeholder for demo (real app would use proper encryption)
INSERT INTO messages (id, conversation_id, direction, from_number, to_number, body_encrypted, status, sent_at, created_at)
VALUES
  ('66666666-6666-6666-6666-666666666661', '55555555-5555-5555-5555-555555555551', 'outbound', '+15551234567', '+15559876543', 'aGVsbG8gSmFuZSwgeW91ciBhcHBvaW50bWVudCBpcyB0b21vcnJvdyBhdCA5YW0=', 'delivered', now() - interval '2 hours', now() - interval '2 hours'),
  ('66666666-6666-6666-6666-666666666662', '55555555-5555-5555-5555-555555555551', 'inbound', '+15559876543', '+15551234567', 'VGhhbmsgeW91ISBJbCBiZSB0aGVyZS4=', 'delivered', now() - interval '1 hour', now() - interval '1 hour')
ON CONFLICT (id) DO NOTHING;

INSERT INTO templates (id, org_id, name, body, created_by)
VALUES (
  '77777777-7777-7777-7777-777777777771',
  '11111111-1111-1111-1111-111111111111',
  'Appointment Reminder',
  'Hi {{name}}, this is a reminder for your appointment on {{date}} at {{time}}. Reply YES to confirm or NO to reschedule.',
  '22222222-2222-2222-2222-222222222222'
) ON CONFLICT (id) DO NOTHING;
