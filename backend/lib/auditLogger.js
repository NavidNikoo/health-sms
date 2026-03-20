/**
 * HIPAA audit logger — writes structured events to the audit_logs table.
 *
 * Redaction rules:
 *   - Never store raw message bodies (PHI).
 *   - Phone numbers are truncated to last 4 digits in metadata.
 *   - Only resource IDs and non-PHI descriptors are persisted.
 */

const db = require("../db");

function redactPhone(e164) {
  if (!e164 || e164.length < 4) return "****";
  return "***" + e164.slice(-4);
}

function safeMetadata(raw) {
  if (!raw || typeof raw !== "object") return raw ?? null;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (/body|message|content|text/i.test(k)) {
      out[k] = "[REDACTED]";
    } else if (/phone|number|from|to/i.test(k) && typeof v === "string" && /^\+?\d{7,}/.test(v)) {
      out[k] = redactPhone(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Write an audit log entry.
 *
 * @param {object} params
 * @param {string}      params.orgId        - Organization UUID
 * @param {string|null} params.userId       - User UUID (null for webhook/system events)
 * @param {string}      params.eventType    - e.g. "message.send", "patient.create", "auth.login"
 * @param {string}      params.resourceType - e.g. "message", "patient", "conversation"
 * @param {string|null} params.resourceId   - UUID of the affected resource
 * @param {object|null} params.metadata     - Extra context (auto-redacted)
 * @param {object|null} params.req          - Express request (to extract IP + user-agent)
 */
async function audit({ orgId, userId, eventType, resourceType, resourceId, metadata, req }) {
  try {
    const ip = req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim()
      || req?.headers?.["x-real-ip"]
      || req?.socket?.remoteAddress
      || null;
    const userAgent = req?.headers?.["user-agent"] || null;

    await db.query(
      `INSERT INTO audit_logs (org_id, user_id, event_type, resource_type, resource_id, metadata, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        orgId,
        userId || null,
        eventType,
        resourceType,
        resourceId || null,
        metadata ? safeMetadata(metadata) : null,
        ip,
        userAgent,
      ]
    );
  } catch (err) {
    // Audit failures must not break the primary request flow.
    console.error("[audit] Failed to write audit log:", err.message);
  }
}

module.exports = { audit, redactPhone, safeMetadata };
