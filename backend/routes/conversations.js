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
    const result = await db.query(
      `
      SELECT
        c.id, c.patient_id, c.phone_number_id, c.last_message_at, c.created_at,
        p.full_name AS patient_name, p.primary_phone AS patient_phone,
        pn.e164_number AS inbox_number,
        (SELECT m.body_encrypted FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_body,
        (SELECT m.direction FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_direction
      FROM conversations c
      JOIN patients p ON p.id = c.patient_id
      JOIN phone_numbers pn ON pn.id = c.phone_number_id
      WHERE c.org_id = $1
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
      LIMIT 50
      `,
      [req.user.orgId]
    );

    const conversations = result.rows.map((row) => ({
      id: row.id,
      patientId: row.patient_id,
      phoneNumberId: row.phone_number_id,
      patientName: row.patient_name,
      patientPhone: row.patient_phone,
      inboxNumber: row.inbox_number,
      lastMessageAt: row.last_message_at,
      lastMessage: decodeBody(row.last_message_body) || "",
      lastMessageDirection: row.last_message_direction,
      createdAt: row.created_at,
    }));

    res.json(conversations);
  } catch (err) {
    console.error("Error fetching conversations", err);
    res.status(500).json({ message: "Error fetching conversations" });
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
      `SELECT c.id, c.patient_id, c.phone_number_id, p.primary_phone, pn.e164_number, pn.provider_sid
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

module.exports = router;
