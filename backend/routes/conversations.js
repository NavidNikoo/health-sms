const express = require("express");
const db = require("../db");
const { authenticate } = require("../middleware/auth");
const { sendSms } = require("../twilio");

const router = express.Router();

function decodeBody(enc) {
  if (!enc) return "";
  try {
    const decoded = Buffer.from(enc, "base64").toString("utf8");
    return /^[\x20-\x7E\n\r\t]+$/.test(decoded) ? decoded : enc;
  } catch {
    return enc;
  }
}

router.get("/", authenticate, async (req, res) => {
  try {
    const { q } = req.query;
    let whereExtra = "";
    const params = [req.user.orgId];

    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      whereExtra = ` AND (
        p.full_name ILIKE $2
        OR p.primary_phone ILIKE $2
        OR EXISTS (SELECT 1 FROM messages m2 WHERE m2.conversation_id = c.id AND m2.body_encrypted ILIKE $2)
      )`;
    }

    const matchSnippetSelect = q && q.trim()
      ? `, (SELECT m3.body_encrypted FROM messages m3 WHERE m3.conversation_id = c.id AND m3.body_encrypted ILIKE $2 ORDER BY m3.created_at DESC LIMIT 1) AS matched_message`
      : "";

    const result = await db.query(
      `
      SELECT
        c.id, c.patient_id, c.phone_number_id, c.status, c.last_message_at, c.created_at,
        p.full_name AS patient_name, p.primary_phone AS patient_phone,
        pn.e164_number AS inbox_number,
        (SELECT m.body_encrypted FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_body,
        (SELECT m.direction FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_direction
        ${matchSnippetSelect}
      FROM conversations c
      JOIN patients p ON p.id = c.patient_id
      JOIN phone_numbers pn ON pn.id = c.phone_number_id
      WHERE c.org_id = $1${whereExtra}
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
      LIMIT 50
      `,
      params
    );

    const conversations = result.rows.map((row) => ({
      id: row.id,
      patientId: row.patient_id,
      phoneNumberId: row.phone_number_id,
      status: row.status || "open",
      patientName: row.patient_name,
      patientPhone: row.patient_phone,
      inboxNumber: row.inbox_number,
      lastMessageAt: row.last_message_at,
      lastMessage: decodeBody(row.last_message_body) || "",
      lastMessageDirection: row.last_message_direction,
      matchedMessage: row.matched_message ? decodeBody(row.matched_message) : null,
      createdAt: row.created_at,
    }));

    res.json(conversations);
  } catch (err) {
    console.error("Error fetching conversations", err);
    res.status(500).json({ message: "Error fetching conversations" });
  }
});

router.post("/", authenticate, async (req, res) => {
  try {
    const { phoneNumber, phoneNumberId, body, patientName } = req.body;
    if (!phoneNumber || !phoneNumberId) {
      return res.status(400).json({ message: "phoneNumber and phoneNumberId are required" });
    }

    const normalized = phoneNumber.replace(/\D/g, "");
    const e164 = normalized.startsWith("1") ? `+${normalized}` : `+1${normalized}`;

    const pnCheck = await db.query(
      "SELECT id, e164_number, provider_sid, a2p_status FROM phone_numbers WHERE id = $1 AND org_id = $2",
      [phoneNumberId, req.user.orgId]
    );
    if (pnCheck.rows.length === 0) {
      return res.status(404).json({ message: "Phone number not found" });
    }

    let patientResult = await db.query(
      "SELECT id, full_name FROM patients WHERE org_id = $1 AND primary_phone = $2",
      [req.user.orgId, e164]
    );

    if (patientResult.rows.length === 0) {
      patientResult = await db.query(
        "INSERT INTO patients (org_id, full_name, primary_phone) VALUES ($1, $2, $3) RETURNING id, full_name",
        [req.user.orgId, patientName?.trim() || e164, e164]
      );
    }

    const patient = patientResult.rows[0];

    let convResult = await db.query(
      "SELECT id FROM conversations WHERE org_id = $1 AND patient_id = $2 AND phone_number_id = $3",
      [req.user.orgId, patient.id, phoneNumberId]
    );

    if (convResult.rows.length === 0) {
      convResult = await db.query(
        `INSERT INTO conversations (org_id, patient_id, phone_number_id, status, last_message_at)
         VALUES ($1, $2, $3, 'open', now()) RETURNING id`,
        [req.user.orgId, patient.id, phoneNumberId]
      );
    }

    const conversationId = convResult.rows[0].id;

    let message = null;
    if (body && body.trim()) {
      const pn = pnCheck.rows[0];

      // 10DLC gate: warn if this number hasn't been approved for A2P
      if (pn.a2p_status === "pending") {
        return res.status(403).json({
          message: "This number's 10DLC registration is still pending. SMS sending will be available once approved.",
        });
      }

      const fromNumber = pn.e164_number;
      const toNumber = e164;
      const bodyTrimmed = body.trim();
      let vendorMessageId = null;
      let status = "sent";

      if (pn.provider_sid && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        try {
          const { sid } = await sendSms(fromNumber, toNumber, bodyTrimmed);
          vendorMessageId = sid;
        } catch (twilioErr) {
          console.error("Twilio send failed:", twilioErr);
          status = "failed";
        }
      }

      const msgResult = await db.query(
        `INSERT INTO messages (conversation_id, direction, from_number, to_number, body_encrypted, status, sent_at, vendor_message_id)
         VALUES ($1, 'outbound', $2, $3, $4, $5, now(), $6)
         RETURNING id, direction, body_encrypted, status, sent_at, created_at`,
        [conversationId, fromNumber, toNumber, bodyTrimmed, status, vendorMessageId]
      );

      await db.query("UPDATE conversations SET last_message_at = now() WHERE id = $1", [conversationId]);
      message = msgResult.rows[0];
    }

    res.status(201).json({
      conversationId,
      patientId: patient.id,
      patientName: patient.full_name,
      message,
    });
  } catch (err) {
    console.error("Error creating conversation", err);
    res.status(500).json({ message: "Error creating conversation" });
  }
});

router.get("/:id/messages", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const convCheck = await db.query(
      "SELECT id FROM conversations WHERE id = $1 AND org_id = $2",
      [id, req.user.orgId]
    );
    if (convCheck.rows.length === 0) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const result = await db.query(
      `SELECT id, direction, from_number, to_number, body_encrypted, status, sent_at, delivered_at, created_at
       FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [id]
    );

    const messages = result.rows.map((row) => ({
      id: row.id,
      direction: row.direction,
      fromNumber: row.from_number,
      toNumber: row.to_number,
      body: decodeBody(row.body_encrypted),
      status: row.status,
      sentAt: row.sent_at,
      deliveredAt: row.delivered_at,
      createdAt: row.created_at,
    }));

    res.json(messages);
  } catch (err) {
    console.error("Error fetching messages", err);
    res.status(500).json({ message: "Error fetching messages" });
  }
});

router.post("/:id/messages", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { body } = req.body;
    if (!body || typeof body !== "string" || !body.trim()) {
      return res.status(400).json({ message: "Message body is required" });
    }

    const convResult = await db.query(
      `SELECT c.id, c.patient_id, c.phone_number_id, p.primary_phone,
              pn.e164_number, pn.provider_sid, pn.a2p_status
       FROM conversations c
       JOIN patients p ON p.id = c.patient_id
       JOIN phone_numbers pn ON pn.id = c.phone_number_id
       WHERE c.id = $1 AND c.org_id = $2`,
      [id, req.user.orgId]
    );
    if (convResult.rows.length === 0) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const conv = convResult.rows[0];

    if (conv.a2p_status === "pending") {
      return res.status(403).json({
        message: "This number's 10DLC registration is still pending. SMS sending will be available once approved.",
      });
    }

    const fromNumber = conv.e164_number;
    const toNumber = conv.primary_phone;
    const bodyTrimmed = body.trim();
    const providerSid = conv.provider_sid;

    let vendorMessageId = null;
    let status = "sent";

    if (providerSid && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        const { sid } = await sendSms(fromNumber, toNumber, bodyTrimmed);
        vendorMessageId = sid;
      } catch (twilioErr) {
        console.error("Twilio send failed:", twilioErr);
        status = "failed";
      }
    }

    const msgResult = await db.query(
      `INSERT INTO messages (conversation_id, direction, from_number, to_number, body_encrypted, status, sent_at, vendor_message_id)
       VALUES ($1, 'outbound', $2, $3, $4, $5, now(), $6)
       RETURNING id, direction, from_number, to_number, body_encrypted, status, sent_at, created_at`,
      [id, fromNumber, toNumber, bodyTrimmed, status, vendorMessageId]
    );

    await db.query("UPDATE conversations SET last_message_at = now() WHERE id = $1", [id]);

    const row = msgResult.rows[0];
    res.status(201).json({
      id: row.id,
      direction: row.direction,
      fromNumber: row.from_number,
      toNumber: row.to_number,
      body: row.body_encrypted,
      status: row.status,
      sentAt: row.sent_at,
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error("Error sending message", err);
    res.status(500).json({ message: "Error sending message" });
  }
});

router.patch("/:id", authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["open", "closed"];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${allowed.join(", ")}` });
    }
    const result = await db.query(
      "UPDATE conversations SET status = $1 WHERE id = $2 AND org_id = $3 RETURNING id, status",
      [status, req.params.id, req.user.orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating conversation", err);
    res.status(500).json({ message: "Error updating conversation" });
  }
});

module.exports = router;
