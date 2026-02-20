const express = require("express");
const db = require("../db");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticate, async (req, res) => {
  try {
    const { q } = req.query;
    let query, params;

    if (q && q.trim()) {
      const search = `%${q.trim()}%`;
      query = `
        SELECT p.id, p.full_name, p.primary_phone, p.notes, p.created_at,
               (SELECT c.id FROM conversations c WHERE c.patient_id = p.id AND c.org_id = $1 ORDER BY c.last_message_at DESC NULLS LAST LIMIT 1) AS conversation_id,
               (SELECT m.body_encrypted FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.patient_id = p.id AND c.org_id = $1 ORDER BY m.created_at DESC LIMIT 1) AS last_message
        FROM patients p
        WHERE p.org_id = $1 AND (p.full_name ILIKE $2 OR p.primary_phone ILIKE $2 OR p.notes ILIKE $2)
        ORDER BY p.full_name ASC
        LIMIT 100`;
      params = [req.user.orgId, search];
    } else {
      query = `
        SELECT p.id, p.full_name, p.primary_phone, p.notes, p.created_at,
               (SELECT c.id FROM conversations c WHERE c.patient_id = p.id AND c.org_id = $1 ORDER BY c.last_message_at DESC NULLS LAST LIMIT 1) AS conversation_id,
               (SELECT m.body_encrypted FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.patient_id = p.id AND c.org_id = $1 ORDER BY m.created_at DESC LIMIT 1) AS last_message
        FROM patients p
        WHERE p.org_id = $1
        ORDER BY p.full_name ASC
        LIMIT 100`;
      params = [req.user.orgId];
    }

    const result = await db.query(query, params);

    const patients = result.rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      primaryPhone: r.primary_phone,
      notes: r.notes,
      createdAt: r.created_at,
      conversationId: r.conversation_id || null,
      lastMessage: r.last_message ? (() => {
        try { return Buffer.from(r.last_message, "base64").toString("utf8"); } catch { return r.last_message; }
      })() : null,
    }));

    res.json(patients);
  } catch (err) {
    console.error("Error fetching patients", err);
    res.status(500).json({ message: "Error fetching patients" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.id, p.full_name, p.primary_phone, p.notes, p.created_at,
              (SELECT count(*) FROM conversations c WHERE c.patient_id = p.id AND c.org_id = $2) AS conversation_count
       FROM patients p WHERE p.id = $1 AND p.org_id = $2`,
      [req.params.id, req.user.orgId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Patient not found" });

    const r = result.rows[0];
    res.json({
      id: r.id,
      fullName: r.full_name,
      primaryPhone: r.primary_phone,
      notes: r.notes,
      createdAt: r.created_at,
      conversationCount: parseInt(r.conversation_count, 10),
    });
  } catch (err) {
    console.error("Error fetching patient", err);
    res.status(500).json({ message: "Error fetching patient" });
  }
});

router.post("/", authenticate, async (req, res) => {
  try {
    const { fullName, primaryPhone, notes } = req.body;
    if (!fullName || !primaryPhone) {
      return res.status(400).json({ message: "fullName and primaryPhone are required" });
    }

    const normalized = primaryPhone.replace(/\D/g, "");
    const e164 = normalized.startsWith("1") ? `+${normalized}` : `+1${normalized}`;

    const dup = await db.query(
      "SELECT id FROM patients WHERE org_id = $1 AND primary_phone = $2",
      [req.user.orgId, e164]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ message: "A contact with this phone number already exists" });
    }

    const result = await db.query(
      "INSERT INTO patients (org_id, full_name, primary_phone, notes) VALUES ($1, $2, $3, $4) RETURNING id, full_name, primary_phone, notes, created_at",
      [req.user.orgId, fullName.trim(), e164, notes?.trim() || null]
    );

    const r = result.rows[0];
    res.status(201).json({ id: r.id, fullName: r.full_name, primaryPhone: r.primary_phone, notes: r.notes, createdAt: r.created_at });
  } catch (err) {
    console.error("Error creating patient", err);
    res.status(500).json({ message: "Error creating patient" });
  }
});

router.put("/:id", authenticate, async (req, res) => {
  try {
    const { fullName, primaryPhone, notes } = req.body;
    if (!fullName || !primaryPhone) {
      return res.status(400).json({ message: "fullName and primaryPhone are required" });
    }

    const normalized = primaryPhone.replace(/\D/g, "");
    const e164 = normalized.startsWith("1") ? `+${normalized}` : `+1${normalized}`;

    const dup = await db.query(
      "SELECT id FROM patients WHERE org_id = $1 AND primary_phone = $2 AND id != $3",
      [req.user.orgId, e164, req.params.id]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ message: "Another contact already has this phone number" });
    }

    const result = await db.query(
      `UPDATE patients SET full_name = $1, primary_phone = $2, notes = $3
       WHERE id = $4 AND org_id = $5
       RETURNING id, full_name, primary_phone, notes, created_at`,
      [fullName.trim(), e164, notes?.trim() || null, req.params.id, req.user.orgId]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: "Patient not found" });
    const r = result.rows[0];
    res.json({ id: r.id, fullName: r.full_name, primaryPhone: r.primary_phone, notes: r.notes, createdAt: r.created_at });
  } catch (err) {
    console.error("Error updating patient", err);
    res.status(500).json({ message: "Error updating patient" });
  }
});

router.delete("/:id", authenticate, async (req, res) => {
  try {
    const convs = await db.query(
      "SELECT id FROM conversations WHERE patient_id = $1 AND org_id = $2",
      [req.params.id, req.user.orgId]
    );
    const convIds = convs.rows.map((r) => r.id);

    if (convIds.length > 0) {
      await db.query("DELETE FROM messages WHERE conversation_id = ANY($1)", [convIds]);
      await db.query("DELETE FROM conversations WHERE id = ANY($1)", [convIds]);
    }

    const result = await db.query(
      "DELETE FROM patients WHERE id = $1 AND org_id = $2 RETURNING id",
      [req.params.id, req.user.orgId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Patient not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("Error deleting patient", err);
    res.status(500).json({ message: "Error deleting patient" });
  }
});

module.exports = router;

