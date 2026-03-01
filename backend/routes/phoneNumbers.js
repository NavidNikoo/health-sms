const express = require("express");
const db = require("../db");
const { authenticate } = require("../middleware/auth");
const { getClient } = require("../twilio");

const router = express.Router();

function normalizeToE164(raw) {
  if (!raw || typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === "1") return `+${digits}`;
  if (raw.startsWith("+") && digits.length >= 10) return `+${digits}`;
  return null;
}

async function resolveAuthorizedForwarding(
  orgId,
  userId,
  { callMode, callForwardTo, callForwardAuthorizedNumberId, autoAuthorizeIfMissing = false }
) {
  // Explicit voicemail mode always clears forwarding.
  if (callMode === "voicemail") {
    return { forwardNumber: null, authorizedId: null };
  }

  // Explicit authorized-number selection is the source of truth for forward mode.
  if (callForwardAuthorizedNumberId) {
    const byId = await db.query(
      `SELECT id, e164_number
       FROM authorized_forward_numbers
       WHERE id = $1 AND org_id = $2 AND status <> 'disabled'`,
      [callForwardAuthorizedNumberId, orgId]
    );
    if (byId.rows.length === 0) {
      throw new Error("Selected forwarding number is not authorized");
    }
    return {
      forwardNumber: byId.rows[0].e164_number,
      authorizedId: byId.rows[0].id,
    };
  }

  // Backward-compat path (existing clients): resolve raw number against authorized list.
  if (callForwardTo) {
    const normalized = normalizeToE164(callForwardTo);
    if (!normalized) {
      throw new Error("Enter a valid forwarding phone number");
    }
    const byNumber = await db.query(
      `SELECT id, e164_number
       FROM authorized_forward_numbers
       WHERE org_id = $1 AND e164_number = $2 AND status <> 'disabled'`,
      [orgId, normalized]
    );
    if (byNumber.rows.length === 0) {
      if (autoAuthorizeIfMissing) {
        const inserted = await db.query(
          `INSERT INTO authorized_forward_numbers (
             org_id, created_by_user_id, e164_number, status, verified_at
           )
           VALUES ($1, $2, $3, 'approved', now())
           ON CONFLICT (org_id, e164_number)
           DO UPDATE SET status = 'approved', verified_at = COALESCE(authorized_forward_numbers.verified_at, now())
           RETURNING id, e164_number`,
          [orgId, userId, normalized]
        );
        return {
          forwardNumber: inserted.rows[0].e164_number,
          authorizedId: inserted.rows[0].id,
        };
      }
      throw new Error("This number is not authorized yet. Add it in Authorized Numbers first.");
    }
    return {
      forwardNumber: byNumber.rows[0].e164_number,
      authorizedId: byNumber.rows[0].id,
    };
  }

  // If no forwarding data is provided, clear forwarding.
  return { forwardNumber: null, authorizedId: null };
}

// GET / — list org's phone numbers
router.get("/", authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         pn.id,
         pn.e164_number,
         pn.label,
         pn.provider_sid,
         pn.call_forward_to,
         pn.call_forward_authorized_number_id,
         afn.e164_number AS authorized_forward_number,
         afn.label AS authorized_forward_label
       FROM phone_numbers pn
       LEFT JOIN authorized_forward_numbers afn
         ON afn.id = pn.call_forward_authorized_number_id
       WHERE pn.org_id = $1
       ORDER BY pn.label NULLS LAST, pn.e164_number`,
      [req.user.orgId]
    );
    const numbers = result.rows.map((row) => ({
      id: row.id,
      number: row.e164_number,
      label: row.label,
      providerSid: row.provider_sid,
      callForwardTo: row.authorized_forward_number || row.call_forward_to,
      callForwardAuthorizedNumberId: row.call_forward_authorized_number_id,
      callForwardAuthorizedNumber: row.call_forward_authorized_number
        ? {
            id: row.call_forward_authorized_number_id,
            number: row.authorized_forward_number,
            label: row.authorized_forward_label,
          }
        : null,
      unreadCount: 0,
    }));
    res.json(numbers);
  } catch (err) {
    console.error("Error fetching phone numbers", err);
    res.status(500).json({ message: "Error fetching phone numbers" });
  }
});

// GET /available?areaCode=831 — search Twilio for purchasable numbers
router.get("/available", authenticate, async (req, res) => {
  const client = getClient();
  if (!client) {
    return res.status(503).json({ message: "Twilio not configured. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN." });
  }

  const { areaCode } = req.query;
  if (!areaCode || !/^\d{3}$/.test(areaCode.trim())) {
    return res.status(400).json({ message: "areaCode must be exactly 3 digits" });
  }

  try {
    const numbers = await client.availablePhoneNumbers("US").local.list({
      areaCode: areaCode.trim(),
      limit: 10,
      voiceEnabled: true,
      smsEnabled: true,
    });

    res.json(
      numbers.map((n) => ({
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        locality: n.locality || "",
        region: n.region || "",
      }))
    );
  } catch (err) {
    console.error("Error searching available numbers:", err);
    res.status(500).json({ message: err.message || "Failed to search available numbers" });
  }
});

// POST / — provision a Twilio number and add it to the org
router.post("/", authenticate, async (req, res) => {
  const client = getClient();
  if (!client) {
    return res.status(503).json({ message: "Twilio not configured. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN." });
  }

  const { phoneNumber, label, callForwardTo, callForwardAuthorizedNumberId, callMode } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ message: "phoneNumber is required" });
  }

  const baseUrl = process.env.BASE_URL;

  try {
    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber,
      ...(baseUrl
        ? {
            voiceUrl: `${baseUrl}/api/voice/twiml/inbound`,
            voiceMethod: "POST",
            smsUrl: `${baseUrl}/api/webhooks/twilio/sms`,
            smsMethod: "POST",
          }
        : {}),
    });

    const forwardConfig = await resolveAuthorizedForwarding(req.user.orgId, req.user.userId, {
      callMode,
      callForwardTo,
      callForwardAuthorizedNumberId,
      autoAuthorizeIfMissing: true,
    });

    const result = await db.query(
      `INSERT INTO phone_numbers (
         org_id, e164_number, label, provider_sid, call_forward_to, call_forward_authorized_number_id
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, e164_number, label, provider_sid, call_forward_to, call_forward_authorized_number_id`,
      [
        req.user.orgId,
        purchased.phoneNumber,
        label?.trim() || null,
        purchased.sid,
        forwardConfig.forwardNumber,
        forwardConfig.authorizedId,
      ]
    );

    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      number: row.e164_number,
      label: row.label,
      providerSid: row.provider_sid,
      callForwardTo: row.call_forward_to,
      callForwardAuthorizedNumberId: row.call_forward_authorized_number_id,
      unreadCount: 0,
    });
  } catch (err) {
    console.error("Error provisioning phone number:", err);
    const isValidationError =
      err.message?.includes("authorized") ||
      err.message?.includes("valid forwarding");
    res.status(isValidationError ? 400 : 500).json({ message: err.message || "Failed to provision number" });
  }
});

// GET /twilio-owned — list Twilio incomingPhoneNumbers not yet claimed in this org
router.get("/twilio-owned", authenticate, async (req, res) => {
  const client = getClient();
  if (!client) {
    return res.status(503).json({ message: "Twilio not configured." });
  }

  try {
    const claimed = await db.query(
      "SELECT provider_sid FROM phone_numbers WHERE org_id = $1 AND provider_sid IS NOT NULL",
      [req.user.orgId]
    );
    const claimedSids = new Set(claimed.rows.map((r) => r.provider_sid));

    const twilioNumbers = await client.incomingPhoneNumbers.list({ limit: 100 });
    const unclaimed = twilioNumbers
      .filter((n) => !claimedSids.has(n.sid))
      .map((n) => ({
        sid: n.sid,
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        capabilities: n.capabilities,
      }));

    res.json(unclaimed);
  } catch (err) {
    console.error("Error listing Twilio-owned numbers:", err);
    res.status(500).json({ message: err.message || "Failed to list Twilio numbers" });
  }
});

// POST /claim — claim a Twilio number that already exists in the account
router.post("/claim", authenticate, async (req, res) => {
  const client = getClient();
  if (!client) {
    return res.status(503).json({ message: "Twilio not configured." });
  }

  const { providerSid, label } = req.body;
  if (!providerSid) {
    return res.status(400).json({ message: "providerSid is required" });
  }

  try {
    const existing = await db.query(
      "SELECT id FROM phone_numbers WHERE provider_sid = $1",
      [providerSid]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "This number is already connected" });
    }

    const twilioNum = await client.incomingPhoneNumbers(providerSid).fetch();

    const baseUrl = process.env.BASE_URL;
    if (baseUrl) {
      await client.incomingPhoneNumbers(providerSid).update({
        voiceUrl: `${baseUrl}/api/voice/twiml/inbound`,
        voiceMethod: "POST",
        smsUrl: `${baseUrl}/api/webhooks/twilio/sms`,
        smsMethod: "POST",
      });
    }

    const result = await db.query(
      `INSERT INTO phone_numbers (org_id, e164_number, label, provider_sid)
       VALUES ($1, $2, $3, $4)
       RETURNING id, e164_number, label, provider_sid`,
      [req.user.orgId, twilioNum.phoneNumber, label?.trim() || null, providerSid]
    );

    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      number: row.e164_number,
      label: row.label,
      providerSid: row.provider_sid,
      unreadCount: 0,
    });
  } catch (err) {
    console.error("Error claiming phone number:", err);
    if (err.code === 20404 || err.status === 404) {
      return res.status(404).json({ message: "Number not found in your Twilio account" });
    }
    res.status(500).json({ message: err.message || "Failed to claim number" });
  }
});

// PATCH /:id — update label and/or call forwarding number
router.patch("/:id", authenticate, async (req, res) => {
  try {
    const { label, callForwardTo, callForwardAuthorizedNumberId, callMode } = req.body;
    const forwardConfig = await resolveAuthorizedForwarding(req.user.orgId, req.user.userId, {
      callMode,
      callForwardTo,
      callForwardAuthorizedNumberId,
    });

    const result = await db.query(
      `UPDATE phone_numbers
       SET label = COALESCE($1, label),
           call_forward_to = $2,
           call_forward_authorized_number_id = $3
       WHERE id = $4 AND org_id = $5
       RETURNING id, e164_number, label, provider_sid, call_forward_to, call_forward_authorized_number_id`,
      [
        label === undefined ? null : label?.trim() || null,
        forwardConfig.forwardNumber,
        forwardConfig.authorizedId,
        req.params.id,
        req.user.orgId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Phone number not found for your account. Try logging out and back in.",
      });
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      number: row.e164_number,
      label: row.label,
      providerSid: row.provider_sid,
      callForwardTo: row.call_forward_to,
      callForwardAuthorizedNumberId: row.call_forward_authorized_number_id,
    });
  } catch (err) {
    console.error("Error updating phone number:", err);
    if (err.code === "23503") {
      return res.status(400).json({
        message: "Your session is invalid — please log out and log back in.",
      });
    }
    const msg = err.message || "Error updating phone number";
    const isValidationError =
      msg.includes("authorized") ||
      msg.includes("valid forwarding");
    res.status(isValidationError ? 400 : 500).json({ message: msg });
  }
});

// DELETE /:id — release number in Twilio and remove from DB
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const existing = await db.query(
      "SELECT provider_sid FROM phone_numbers WHERE id = $1 AND org_id = $2",
      [req.params.id, req.user.orgId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: "Phone number not found" });
    }

    const { provider_sid } = existing.rows[0];
    const client = getClient();

    if (client && provider_sid) {
      try {
        await client.incomingPhoneNumbers(provider_sid).remove();
      } catch (twilioErr) {
        console.error("Failed to release Twilio number:", twilioErr.message);
      }
    }

    await db.query(
      "DELETE FROM phone_numbers WHERE id = $1 AND org_id = $2",
      [req.params.id, req.user.orgId]
    );

    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("Error deleting phone number:", err);
    res.status(500).json({ message: "Error deleting phone number" });
  }
});

module.exports = router;
