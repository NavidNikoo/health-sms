const express = require("express");
const db = require("../db");

const router = express.Router();

/**
 * POST /api/webhooks/twilio/sms
 *
 * Twilio sends: From, To, Body, MessageSid, etc. as application/x-www-form-urlencoded.
 * No JWT auth — Twilio calls this directly.
 *
 * Flow:
 *   1. Look up the clinic phone number by To (e164).
 *   2. Find or create a patient by From number within that org.
 *   3. Find or create a conversation for that patient + inbox.
 *   4. Insert inbound message.
 *   5. Return empty TwiML so Twilio knows we handled it.
 */
router.post("/twilio/sms", async (req, res) => {
  try {
    const { From, To, Body, MessageSid } = req.body;

    if (!From || !To || !Body) {
      console.error("Webhook missing required fields", { From, To, Body });
      return res.type("text/xml").status(400).send("<Response></Response>");
    }

    const patientPhone = From.trim();
    const inboxE164 = To.trim();
    const messageBody = Body.trim();

    // 1. Find the clinic phone number (inbox) by e164
    const phoneResult = await db.query(
      "SELECT id, org_id FROM phone_numbers WHERE e164_number = $1",
      [inboxE164]
    );

    if (phoneResult.rows.length === 0) {
      console.error("Inbound SMS to unknown number:", inboxE164);
      return res.type("text/xml").status(200).send("<Response></Response>");
    }

    const { id: phoneNumberId, org_id: orgId } = phoneResult.rows[0];

    // 2. Find or create patient by phone number within this org
    let patientResult = await db.query(
      "SELECT id FROM patients WHERE org_id = $1 AND primary_phone = $2",
      [orgId, patientPhone]
    );

    let patientId;
    if (patientResult.rows.length > 0) {
      patientId = patientResult.rows[0].id;
    } else {
      const newPatient = await db.query(
        "INSERT INTO patients (org_id, full_name, primary_phone) VALUES ($1, $2, $3) RETURNING id",
        [orgId, patientPhone, patientPhone]
      );
      patientId = newPatient.rows[0].id;
    }

    // 3. Find or create conversation for this patient + inbox
    let convResult = await db.query(
      "SELECT id FROM conversations WHERE org_id = $1 AND patient_id = $2 AND phone_number_id = $3",
      [orgId, patientId, phoneNumberId]
    );

    let conversationId;
    if (convResult.rows.length > 0) {
      conversationId = convResult.rows[0].id;
    } else {
      const newConv = await db.query(
        "INSERT INTO conversations (org_id, patient_id, phone_number_id, status, last_message_at) VALUES ($1, $2, $3, 'open', now()) RETURNING id",
        [orgId, patientId, phoneNumberId]
      );
      conversationId = newConv.rows[0].id;
    }

    // 4. Insert inbound message
    await db.query(
      `INSERT INTO messages (conversation_id, direction, from_number, to_number, body_encrypted, vendor_message_id, status, sent_at)
       VALUES ($1, 'inbound', $2, $3, $4, $5, 'delivered', now())`,
      [conversationId, patientPhone, inboxE164, messageBody, MessageSid || null]
    );

    // Update conversation timestamp
    await db.query(
      "UPDATE conversations SET last_message_at = now() WHERE id = $1",
      [conversationId]
    );

    console.log(`Inbound SMS from ${patientPhone} to ${inboxE164}: "${messageBody}"`);

    // 5. Return empty TwiML
    res.type("text/xml").status(200).send("<Response></Response>");
  } catch (err) {
    console.error("Webhook error:", err);
    res.type("text/xml").status(500).send("<Response></Response>");
  }
});

module.exports = router;
