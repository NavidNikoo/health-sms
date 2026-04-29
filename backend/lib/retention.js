/**
 * Retention helpers — implement org-scoped PHI purges for HIPAA compliance.
 *
 * Default retention window is 90 days, configurable via RETENTION_DAYS or
 * passed in by the caller.
 *
 * `purgeOrg({ orgId, days })` deletes messages and internal notes older than
 * `days`, then deletes patients whose conversations contain no remaining
 * messages (i.e. fully aged-out patients). Active patients — those who still
 * have at least one message within the retention window — keep their
 * identifying fields so staff can continue to communicate with them.
 *
 * `deletePatient({ orgId, patientId })` honours individual right-to-erasure
 * requests: it fully deletes the patient when safe, otherwise it anonymizes
 * the PHI fields while preserving foreign-key references.
 */

const db = require("../db");

const DEFAULT_RETENTION_DAYS = Number(process.env.RETENTION_DAYS || 90);

const ANON_NAME_PREFIX = "Redacted Patient";
const ANON_PHONE_PREFIX = "+10000000";
const ANON_NOTES = null;

function clampDays(days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_RETENTION_DAYS;
  if (n > 3650) return 3650; // hard ceiling: 10 years
  return Math.floor(n);
}

async function purgeOrg({ orgId, days } = {}) {
  if (!orgId) throw new Error("orgId is required");
  const retentionDays = clampDays(days);

  const result = {
    orgId,
    retentionDays,
    deletedMessages: 0,
    deletedInternalNotes: 0,
    deletedPatients: 0,
    anonymizedPatients: 0,
  };

  await db.query("BEGIN");
  try {
    const msg = await db.query(
      `DELETE FROM messages
        USING conversations c
        WHERE messages.conversation_id = c.id
          AND c.org_id = $1
          AND messages.created_at < now() - ($2 || ' days')::interval
        RETURNING messages.id`,
      [orgId, retentionDays]
    );
    result.deletedMessages = msg.rowCount;

    const notes = await db.query(
      `DELETE FROM conversation_internal_notes
        WHERE org_id = $1
          AND created_at < now() - ($2 || ' days')::interval
        RETURNING id`,
      [orgId, retentionDays]
    );
    result.deletedInternalNotes = notes.rowCount;

    // Patients with no remaining messages anywhere in their conversations
    // are aged out. Cascade delete handles conversations + remaining notes.
    const dropped = await db.query(
      `DELETE FROM patients
        WHERE org_id = $1
          AND id IN (
            SELECT p.id
              FROM patients p
              LEFT JOIN conversations c ON c.patient_id = p.id
              LEFT JOIN messages m ON m.conversation_id = c.id
              WHERE p.org_id = $1
              GROUP BY p.id
              HAVING COUNT(m.id) = 0
          )
        RETURNING id`,
      [orgId]
    );
    result.deletedPatients = dropped.rowCount;

    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }

  return result;
}

/**
 * Delete a single patient by id. If there are no surviving conversations or
 * messages that depend on this patient, we delete the row outright. Otherwise
 * we anonymize the PHI columns and drop the conversations the patient owns.
 */
async function deletePatient({ orgId, patientId }) {
  if (!orgId || !patientId) throw new Error("orgId and patientId are required");

  await db.query("BEGIN");
  try {
    const owns = await db.query(
      "SELECT id FROM patients WHERE id = $1 AND org_id = $2",
      [patientId, orgId]
    );
    if (owns.rows.length === 0) {
      await db.query("ROLLBACK");
      const err = new Error("Patient not found");
      err.code = "patient_not_found";
      throw err;
    }

    // Drop all internal notes for this patient's conversations.
    await db.query(
      `DELETE FROM conversation_internal_notes
        WHERE conversation_id IN (
          SELECT id FROM conversations WHERE patient_id = $1 AND org_id = $2
        )`,
      [patientId, orgId]
    );

    // Drop all messages for this patient's conversations.
    await db.query(
      `DELETE FROM messages
        WHERE conversation_id IN (
          SELECT id FROM conversations WHERE patient_id = $1 AND org_id = $2
        )`,
      [patientId, orgId]
    );

    // Try to drop conversations — RESTRICT FKs may block; if so, anonymize.
    let canFullyDelete = true;
    try {
      await db.query(
        `DELETE FROM conversations WHERE patient_id = $1 AND org_id = $2`,
        [patientId, orgId]
      );
    } catch (err) {
      if (err.code === "23503") {
        canFullyDelete = false;
      } else {
        throw err;
      }
    }

    let outcome;
    if (canFullyDelete) {
      await db.query(
        `DELETE FROM patients WHERE id = $1 AND org_id = $2`,
        [patientId, orgId]
      );
      outcome = "deleted";
    } else {
      const anonPhone = `${ANON_PHONE_PREFIX}${Math.floor(Math.random() * 1e6)
        .toString()
        .padStart(6, "0")}`;
      await db.query(
        `UPDATE patients
            SET full_name = $1,
                primary_phone = $2,
                notes = $3
          WHERE id = $4 AND org_id = $5`,
        [`${ANON_NAME_PREFIX} ${patientId.slice(0, 8)}`, anonPhone, ANON_NOTES, patientId, orgId]
      );
      outcome = "anonymized";
    }

    await db.query("COMMIT");
    return { outcome, patientId };
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}

module.exports = {
  DEFAULT_RETENTION_DAYS,
  purgeOrg,
  deletePatient,
};
