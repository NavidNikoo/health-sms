const express = require("express");
const twilio = require("twilio");
const db = require("../db");
const { authenticate } = require("../middleware/auth");
const { getClient } = require("../twilio");

const router = express.Router();

function normalizeUsNumber(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === "1") return `+${digits}`;
  if (String(raw).startsWith("+") && digits.length >= 10) return `+${digits}`;
  return null;
}

// ─── Browser Voice Token (optional WebRTC path) ──────────────────────────────

// GET /token — short-lived Access Token for browser calling (requires API Keys)
router.get("/token", authenticate, (req, res) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

  if (!accountSid || !apiKeySid || !apiKeySecret || !twimlAppSid) {
    return res.status(503).json({
      message:
        "Browser voice not configured. Set TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, and TWILIO_TWIML_APP_SID.",
    });
  }

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: twimlAppSid,
    incomingAllow: false,
  });

  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity: String(req.user.id),
    ttl: 3600,
  });
  token.addGrant(voiceGrant);

  res.json({ token: token.toJwt(), ttl: 3600 });
});

// ─── Phone-forwarded calling (Numberbarn-style) ───────────────────────────────

/**
 * POST /call
 *
 * Initiates an outbound call by first ringing the staff member's cell phone
 * (call_forward_to), then bridging them to the patient's number.
 * The patient sees the clinic number as caller ID.
 *
 * Only requires TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN — no extra config.
 *
 * Body: { to: "+19491234567", fromPhoneNumberId: "<uuid>" }
 */
router.post("/call", authenticate, async (req, res) => {
  const { to, fromPhoneNumberId } = req.body;

  if (!to || !fromPhoneNumberId) {
    return res.status(400).json({ message: "to and fromPhoneNumberId are required" });
  }

  const client = getClient();
  if (!client) {
    return res.status(503).json({ message: "Twilio not configured. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN." });
  }

  try {
    const result = await db.query(
      `SELECT
         pn.e164_number,
         COALESCE(afn.e164_number, pn.call_forward_to) AS call_forward_to
       FROM phone_numbers pn
       LEFT JOIN authorized_forward_numbers afn
         ON afn.id = pn.call_forward_authorized_number_id
       WHERE pn.id = $1 AND pn.org_id = $2`,
      [fromPhoneNumberId, req.user.orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Phone number not found" });
    }

    const { e164_number: clinicNumber, call_forward_to: staffCell } = result.rows[0];
    const staffCellE164 = normalizeUsNumber(staffCell) || staffCell;

    if (!staffCellE164) {
      return res.status(400).json({
        message: "No forwarding number set for this inbox. Add one in Call Settings.",
      });
    }

    // Normalize the destination number
    const patientDigits = to.replace(/\D/g, "");
    const patientE164 =
      patientDigits.length === 10 ? `+1${patientDigits}` :
      patientDigits.length === 11 && patientDigits[0] === "1" ? `+${patientDigits}` :
      to;

    // TwiML: after the staff member answers, bridge to the patient.
    // callerId ensures the patient sees the clinic number, not the staff's cell.
    const twimlResponse = new twilio.twiml.VoiceResponse();
    const dial = twimlResponse.dial({ callerId: clinicNumber, record: "do-not-record" });
    dial.number(patientE164);

    // Twilio calls the staff cell first. When they answer, TwiML bridges to patient.
    const call = await client.calls.create({
      to: staffCellE164,
      from: clinicNumber,
      twiml: twimlResponse.toString(),
    });

    res.json({ callSid: call.sid, status: call.status });
  } catch (err) {
    console.error("Error initiating call:", err);
    res.status(500).json({ message: err.message || "Failed to initiate call" });
  }
});

/**
 * DELETE /call/:sid
 *
 * Cancels an in-progress call by SID. Works as long as the call hasn't
 * connected yet (status is "queued" or "ringing").
 */
router.delete("/call/:sid", authenticate, async (req, res) => {
  const client = getClient();
  if (!client) {
    return res.status(503).json({ message: "Twilio not configured" });
  }

  try {
    await client.calls(req.params.sid).update({ status: "canceled" });
  } catch (err) {
    // Call may already be connected or ended — not an error for the caller
    console.log("Call cancel note:", err.message);
  }

  res.json({ message: "Canceled" });
});

// ─── TwiML Webhooks (called by Twilio, no JWT auth) ──────────────────────────

// POST /twiml/outbound — used by TwiML App when browser makes a call
router.post("/twiml/outbound", (req, res) => {
  const { To, From } = req.body;

  const twiml = new twilio.twiml.VoiceResponse();

  if (!To) {
    twiml.hangup();
    return res.type("text/xml").send(twiml.toString());
  }

  const dial = twiml.dial({ callerId: From || To, record: "do-not-record" });
  dial.number(To);

  res.type("text/xml").send(twiml.toString());
});

// POST /twiml/inbound — called when a patient calls a clinic number
router.post("/twiml/inbound", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  try {
    const inboxE164 = req.body?.To?.trim();

    if (!inboxE164) {
      twiml.hangup();
      return res.type("text/xml").send(twiml.toString());
    }

    const result = await db.query(
      `SELECT COALESCE(afn.e164_number, pn.call_forward_to) AS call_forward_to
       FROM phone_numbers pn
       LEFT JOIN authorized_forward_numbers afn
         ON afn.id = pn.call_forward_authorized_number_id
       WHERE pn.e164_number = $1`,
      [inboxE164]
    );

    if (result.rows.length > 0 && result.rows[0].call_forward_to) {
      const forwardTo = normalizeUsNumber(result.rows[0].call_forward_to) || result.rows[0].call_forward_to;
      const dial = twiml.dial({ record: "do-not-record" });
      dial.number(forwardTo);
    } else {
      twiml.say(
        { voice: "Polly.Joanna", language: "en-US" },
        "We are unable to take your call right now. Please try again later or send us a text message."
      );
      twiml.hangup();
    }
  } catch (err) {
    console.error("Inbound voice webhook error:", err);
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
});

module.exports = router;
