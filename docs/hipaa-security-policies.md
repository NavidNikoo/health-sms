# Health SMS — HIPAA-Aligned Security Policies

This document describes the operational, administrative, and technical safeguards implemented in Health SMS to protect electronic Protected Health Information (ePHI) in alignment with the HIPAA Security Rule.

---

## 1. Business Associate Agreements (BAAs)

Health SMS relies on third-party sub-processors that may access or store ePHI. A signed BAA must be in place with each before production use.

| Vendor | Service | BAA Process |
|--------|---------|-------------|
| **Twilio** | SMS, voice, phone numbers | Sign the Twilio BAA via the Twilio Console under *Settings > Compliance > BAA*. Twilio provides a self-service HIPAA-eligible product when the BAA is active. |
| **AWS** | EC2, RDS (PostgreSQL), S3, CloudFront, SSM, KMS | Accept the AWS BAA through *AWS Artifact* in the AWS Console. This enables HIPAA-eligible services on the account. Restrict use to [HIPAA-eligible AWS services](https://aws.amazon.com/compliance/hipaa-eligible-services-reference/). |
| **Domain/DNS provider** | DNS hosting | If the DNS provider processes or stores any ePHI headers (unlikely for DNS alone), evaluate whether a BAA is needed. |

**Action items before production deployment:**
- [ ] Accept the AWS BAA via AWS Artifact.
- [ ] Sign the Twilio BAA via the Twilio Console.
- [ ] Confirm both BAAs are on file and dated.

---

## 2. Access Control

### 2.1 User Authentication
- All API endpoints (except Twilio webhooks) require a valid JWT issued at login.
- Passwords are hashed with bcrypt (cost factor 10) and never stored in plaintext.
- JWT tokens expire after 24 hours (configurable via `JWT_EXPIRES_IN`).

### 2.2 Role-Based Access Control (RBAC)
- Users are assigned one of three roles: `admin`, `provider`, `staff`.
- All data queries are scoped to the user's `org_id` to enforce multi-tenant isolation.

### 2.3 Principle of Least Privilege
- **AWS IAM**: The EC2 instance role has only `ssm:GetParametersByPath` and `kms:Decrypt` permissions. No admin or broad IAM policies are attached to the application role.
- **Database**: The application connects with a dedicated PostgreSQL user that has only DML (SELECT, INSERT, UPDATE, DELETE) privileges on the `health_sms` database — no DDL or superuser access.
- **Twilio**: API credentials are scoped to the specific Twilio sub-account used for this application.

### 2.4 Workforce Access
- Team members with AWS Console access must use individual IAM users (no shared root credentials).
- MFA should be enabled for all IAM users with Console access.
- Access should be reviewed quarterly and revoked when no longer needed.

---

## 3. Encryption

### 3.1 Encryption in Transit
- All client-to-server communication uses HTTPS (TLS 1.2+) enforced by nginx with HSTS headers (`max-age=63072000`).
- Internal EC2-to-RDS connections use SSL (`DB_SSL=true`).
- Twilio webhook callbacks are over HTTPS.

### 3.2 Encryption at Rest
- **Application-layer**: Message bodies (PHI) are encrypted with AES-256-GCM before being stored in PostgreSQL. Each message has a unique IV. The encryption key (`PHI_ENCRYPTION_KEY`) is stored as a SecureString in AWS SSM Parameter Store, encrypted by KMS.
- **Infrastructure-layer**: RDS instances should be created with encryption enabled (AWS manages the KMS key). S3 buckets hosting the frontend use SSE-S3 default encryption.

### 3.3 Key Management
- `PHI_ENCRYPTION_KEY` is a 256-bit key stored in AWS SSM Parameter Store as a SecureString.
- The SSM SecureString is encrypted with the account's default KMS key.
- Key rotation: generate a new key and re-encrypt existing rows as part of a scheduled maintenance window (recommended annually or after suspected compromise).

---

## 4. Audit Logging

### 4.1 Application Audit Logs
Every significant user and system action writes an entry to the `audit_logs` table:

| Field | Description |
|-------|-------------|
| `event_type` | e.g., `auth.login`, `message.send`, `patient.create`, `phone_number.provision` |
| `resource_type` | e.g., `user`, `message`, `patient`, `phone_number` |
| `resource_id` | UUID of the affected resource |
| `user_id` | Authenticated user who performed the action (null for webhooks) |
| `org_id` | Organization scope |
| `ip` | Source IP address (from `X-Forwarded-For` or socket) |
| `user_agent` | Browser/client user-agent string |
| `metadata` | JSONB context — **PHI is never stored here** (message bodies are redacted, phone numbers are truncated) |

### 4.2 Redaction Rules
- Raw message bodies are never written to audit logs.
- Phone numbers are truncated to last 4 digits in audit metadata.
- Error objects are logged as `.message` only — no full stack traces containing request payloads.

### 4.3 Retention
- Audit logs should be retained for a minimum of **6 years** per HIPAA requirements.
- A retention policy should be enforced via a scheduled job or RDS automated backups.
- Old logs may be archived to S3 Glacier for cost-effective long-term storage.

---

## 5. Incident Response

### 5.1 Breach Notification
Under HIPAA, a breach of unsecured ePHI must be reported:
- **To affected individuals**: within 60 days of discovery.
- **To HHS**: within 60 days (or annually for breaches affecting fewer than 500 individuals).
- **To media**: if the breach affects 500+ individuals in a single state/jurisdiction.

### 5.2 Incident Response Process
1. **Detect**: monitor application logs, audit logs, and AWS CloudWatch/GuardDuty alerts.
2. **Contain**: disable affected credentials, revoke compromised tokens, take affected services offline if necessary.
3. **Investigate**: review audit_logs entries, Twilio logs, and AWS CloudTrail for the scope of access.
4. **Remediate**: patch the vulnerability, rotate keys/credentials, restore from backups if needed.
5. **Report**: notify affected individuals, HHS, and legal counsel per the timeline above.
6. **Post-mortem**: document root cause, timeline, and preventive measures.

---

## 6. Data Retention and Deletion

| Data Type | Retention Period | Deletion Method |
|-----------|-----------------|-----------------|
| Messages (ePHI) | Per clinic's records retention policy (typically 7-10 years) | Hard delete from PostgreSQL + confirm no backups contain the data, or use crypto-shredding (destroy the encryption key) |
| Audit logs | Minimum 6 years | Archive to S3 Glacier, then delete |
| Patient records | Per state medical records law | Hard delete with cascade |
| User accounts | Duration of employment + 90 days | Deactivate, then delete after retention period |
| Backups (RDS snapshots) | 35 days (default automated) | RDS automatically deletes snapshots beyond the retention window |

---

## 7. Backup and Disaster Recovery

- **Database**: RDS automated backups with 7-day retention (adjustable to 35 days). Point-in-time recovery is available within the retention window.
- **Application code**: stored in GitHub; deployable to a new EC2 instance within 30 minutes using `deploy/setup.sh`.
- **Secrets**: stored in AWS SSM Parameter Store (regional). For multi-region DR, replicate parameters to a secondary region.
- **Frontend**: S3 + CloudFront (inherently durable and distributed).
- **RPO (Recovery Point Objective)**: < 5 minutes (continuous RDS backup).
- **RTO (Recovery Time Objective)**: < 1 hour (new EC2 + restore from latest RDS snapshot).

---

## 8. Network Security

- The EC2 instance Security Group allows only ports 80 and 443 (HTTP/HTTPS) inbound and port 22 (SSH) restricted to known admin IPs.
- The RDS instance is in a private subnet, accessible only from the EC2 instance's security group.
- All management access (SSH) requires key-based authentication — no password-based SSH.

---

## 9. Secure Development Practices

- Secrets are never committed to the repository. The `.gitignore` excludes `.env` files.
- Dependencies are reviewed for known vulnerabilities (`npm audit`).
- Twilio webhook endpoints validate request signatures to prevent spoofing.
- All user input is parameterized in SQL queries (no string concatenation) to prevent SQL injection.

---

## Document Control

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0 | 2026-03-18 | Health SMS Team | Initial HIPAA security policies document |
