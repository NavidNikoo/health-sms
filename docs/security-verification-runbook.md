# Health SMS — Security Verification Runbook

Use this checklist to demonstrate and prove that the HIPAA-aligned security controls are working. Each section includes the exact commands or steps to verify, the expected result, and a checkbox for sign-off.

---

## Prerequisites

- Backend is running (locally or on EC2).
- You have `psql` access to the database.
- You have `curl` installed.
- For TLS checks, the app must be deployed behind nginx with HTTPS.

---

## 1. PHI Encryption at Rest

**Goal**: Prove that message bodies stored in PostgreSQL are encrypted ciphertext, not readable plaintext.

### Steps

1. Set `PHI_ENCRYPTION_KEY` in your `.env` (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).

2. Restart the backend server.

3. Send a message through the app (e.g., "Hello, this is a test message").

4. Query the database directly:

```sql
SELECT id, body_encrypted FROM messages ORDER BY created_at DESC LIMIT 5;
```

### Expected Result

The `body_encrypted` column should contain values starting with `enc:v1:` followed by hex strings — NOT readable text like "Hello, this is a test message".

Example:
```
enc:v1:a1b2c3d4e5f6a1b2c3d4e5f6:0011223344556677:89abcdef01234567...
```

### Verification

- [ ] New messages are stored as `enc:v1:...` ciphertext.
- [ ] The app still displays decrypted messages correctly in the UI.
- [ ] Legacy (pre-encryption) messages still display correctly (backward compatible).

---

## 2. Audit Log Entries

**Goal**: Prove that user actions generate audit log entries with redacted metadata.

### Steps

1. Log in to the app.

2. Perform several actions:
   - Create a patient.
   - Send a message.
   - Update a phone number's call settings.

3. Query the audit log table:

```sql
SELECT
  event_type,
  resource_type,
  resource_id,
  user_id,
  ip,
  metadata,
  created_at
FROM audit_logs
ORDER BY created_at DESC
LIMIT 20;
```

### Expected Result

You should see rows like:

| event_type | resource_type | metadata |
|------------|---------------|----------|
| auth.login | user | `{"email": "navid@test.com"}` |
| patient.create | patient | `null` |
| message.send | message | `{"conversationId": "...", "status": "sent"}` |
| message.inbound | message | `{"conversationId": "...", "vendorMessageId": "SM..."}` |

### Verification

- [ ] Every significant action produces an audit_logs row.
- [ ] No raw message bodies appear in the `metadata` column.
- [ ] Phone numbers in metadata are truncated (e.g., `***2950`).
- [ ] IP addresses and user-agent strings are recorded.

---

## 3. Twilio Webhook Signature Validation

**Goal**: Prove that spoofed webhook requests are rejected.

### Steps

1. Ensure `TWILIO_AUTH_TOKEN` and `BASE_URL` are set in your `.env`.

2. Restart the backend.

3. Send a spoofed webhook request (no valid signature):

```bash
curl -X POST http://localhost:3000/api/webhooks/twilio/sms \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=%2B15551234567&To=%2B18312732950&Body=Spoofed+message&MessageSid=SM_FAKE"
```

### Expected Result

The request should be rejected with HTTP 403 and a TwiML response containing `<Say>Forbidden</Say>`.

If `BASE_URL` is not set (local dev), the middleware is a no-op and the request will be accepted — this is expected for development only.

### Verification

- [ ] With `BASE_URL` and `TWILIO_AUTH_TOKEN` set, spoofed requests return 403.
- [ ] Real Twilio webhooks (with valid `X-Twilio-Signature`) are accepted.
- [ ] Without `BASE_URL`, the middleware passes through (dev mode).

---

## 4. Log Redaction

**Goal**: Prove that no PHI (message content, full phone numbers) appears in server console logs.

### Steps

1. Start the backend and watch the console output.

2. Send a message and trigger an inbound webhook.

3. Grep the server output for message content:

```bash
# If using PM2:
pm2 logs health-sms --lines 100 | grep -i "hello\|test message\|body"
```

### Expected Result

No message content should appear in the logs. Error messages should show only `.message` strings, not full error objects or stack traces containing request bodies.

### Verification

- [ ] Console output does not contain message text.
- [ ] Error logs show only `err.message`, not full objects.
- [ ] The old `console.log(... "${messageBody}")` line in webhooks is removed.

---

## 5. TLS and Security Headers

**Goal**: Prove that the deployed application enforces HTTPS and sends proper security headers.

### Steps (on deployed EC2 instance)

1. Check HTTP-to-HTTPS redirect:

```bash
curl -I http://YOUR_DOMAIN/api/health
```

Expected: `301 Moved Permanently` with `Location: https://...`

2. Check HTTPS and security headers:

```bash
curl -I https://YOUR_DOMAIN/api/health
```

### Expected Result

Response headers should include:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'self'; ...
```

3. Check TLS version:

```bash
openssl s_client -connect YOUR_DOMAIN:443 -tls1_2 < /dev/null 2>&1 | grep "Protocol"
```

Expected: `Protocol  : TLSv1.2` (or TLSv1.3)

### Verification

- [ ] HTTP requests redirect to HTTPS (301).
- [ ] HSTS header is present with max-age >= 63072000.
- [ ] X-Frame-Options, X-Content-Type-Options, X-XSS-Protection headers are present.
- [ ] TLS 1.2+ is enforced (TLS 1.0/1.1 are rejected).
- [ ] Helmet middleware is active in Express (check response headers from /api/health).

---

## 6. Secrets Management

**Goal**: Prove that secrets are not in the codebase and are loaded securely.

### Steps

1. Confirm no secrets in the repo:

```bash
git log --all --diff-filter=A -- '*.env' | head -20
grep -r "TWILIO_AUTH_TOKEN=" backend/ --include="*.js" | grep -v "process.env"
```

Expected: No actual secret values committed.

2. Confirm SSM loading works (on EC2):

```bash
# Check that secrets load at startup
pm2 logs health-sms --lines 5 | grep "loadSecrets"
```

Expected: `[loadSecrets] Loaded N secret(s) from SSM prefix "/health-sms/prod/"`

### Verification

- [ ] `.env` files are in `.gitignore` and not committed.
- [ ] Production uses SSM Parameter Store (SecureString) for all secrets.
- [ ] `PHI_ENCRYPTION_KEY` is stored as a SecureString in SSM.
- [ ] No hardcoded credentials in source code.

---

## 7. Access Control

**Goal**: Prove that multi-tenant isolation and authentication work correctly.

### Steps

1. Try an API call without a token:

```bash
curl -I http://localhost:3000/api/conversations
```

Expected: `401 Unauthorized` with `{"message": "No token provided"}`.

2. Log in as user A, then try to access user B's data:

```bash
# User A's token should not return User B's patients
curl http://localhost:3000/api/patients \
  -H "Authorization: Bearer <USER_A_TOKEN>"
```

Expected: Only User A's organization data is returned.

### Verification

- [ ] Unauthenticated requests are rejected with 401.
- [ ] Users can only see data from their own organization.
- [ ] JWT tokens expire after the configured period.

---

## Summary Checklist for Graders

| # | Control | Status |
|---|---------|--------|
| 1 | PHI encrypted at rest (AES-256-GCM) | [ ] |
| 2 | Audit logging with PHI redaction | [ ] |
| 3 | Twilio webhook signature validation | [ ] |
| 4 | No PHI in server logs | [ ] |
| 5 | TLS 1.2+ enforced with HSTS | [ ] |
| 6 | Security headers (CSP, X-Frame, etc.) | [ ] |
| 7 | Secrets in SSM, not in code | [ ] |
| 8 | Multi-tenant access control | [ ] |
| 9 | BAA documentation (Twilio + AWS) | [ ] |
| 10 | Incident response plan documented | [ ] |
| 11 | Data retention policy documented | [ ] |
| 12 | Backup/DR strategy documented | [ ] |
