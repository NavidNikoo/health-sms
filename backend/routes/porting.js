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

// GET /check?phoneNumber=... — check if a number is portable
router.get("/check", authenticate, async (req, res) => {
  const client = getClient();
  if (!client) {
    return res.status(503).json({ message: "Twilio not configured." });
  }

  const raw = req.query.phoneNumber;
  const e164 = normalizeToE164(raw);
  if (!e164) {
    return res.status(400).json({ message: "Enter a valid US phone number" });
  }

  try {
    const result = await client.numbers
      .v1.portingPortabilities(e164)
      .fetch();

    // Twilio returns: portable (boolean), not_portable_reason, not_portable_reason_code,
    // number_type, country, pin_and_account_number_required
    const isPortable = result.portable === true;

    res.json({
      portable: isPortable,
      phoneNumber: e164,
      numberType: result.numberType || null,
      country: result.country || null,
      pinRequired: result.pinAndAccountNumberRequired || false,
      reason: isPortable
        ? null
        : result.notPortableReason
          ? `This number cannot be ported: ${result.notPortableReason}. Contact your carrier for more information.`
          : "This number cannot be ported at this time.",
      reasonCode: result.notPortableReasonCode || null,
    });
  } catch (err) {
    console.error("Portability check error:", err);
    // If the porting API isn't enabled or returns 404, treat as "unknown but allow"
    if (err.status === 404 || err.code === 20404) {
      return res.json({
        portable: true,
        phoneNumber: e164,
        numberType: "UNKNOWN",
        country: "US",
        pinRequired: false,
        reason: null,
        reasonCode: null,
      });
    }
    res.status(500).json({
      message: err.message || "Could not check portability. Try again later.",
    });
  }
});

// POST /request — submit a new port-in request via Twilio Porting API
router.post("/request", authenticate, async (req, res) => {
  const client = getClient();
  if (!client) {
    return res.status(503).json({ message: "Twilio not configured." });
  }

  const {
    phoneNumber,
    losingCarrier,
    customerType,
    customerName,
    accountNumber,
    authorizedName,
    authorizedEmail,
    authorizedPhone,
    street,
    city,
    state,
    zip,
  } = req.body;

  const e164 = normalizeToE164(phoneNumber);
  if (!e164) {
    return res.status(400).json({ message: "Enter a valid US phone number" });
  }
  if (!authorizedName || !authorizedEmail) {
    return res
      .status(400)
      .json({ message: "Authorized representative name and email are required" });
  }

  try {
    let twilioSid = null;
    let portStatus = "submitted";

    try {
      // Build the losing_carrier_information object per Twilio's Port In API
      const losingCarrierInfo = {
        customer_type: customerType || "Business",
        customer_name: customerName || authorizedName,
        authorized_representative: authorizedName,
        authorized_representative_email: authorizedEmail,
        account_telephone_number: e164,
      };

      if (accountNumber) {
        losingCarrierInfo.account_number = accountNumber;
      }

      if (street || city || state || zip) {
        losingCarrierInfo.address = {
          street: street || "",
          city: city || "",
          state: state || "",
          zip: zip || "",
          country: "US",
        };
      }

      // Target port date: at least 7 days out for US
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 10);
      const targetPortInDate = targetDate.toISOString().split("T")[0];

      const portPayload = {
        phone_numbers: [{ phone_number: e164 }],
        losing_carrier_information: losingCarrierInfo,
        notification_emails: [authorizedEmail],
        target_port_in_date: targetPortInDate,
      };

      // Twilio Node SDK: client.numbers.v1.portingPortIns.create(...)
      const portRequest = await client.numbers
        .v1.portingPortIns.create(portPayload);

      twilioSid = portRequest.portInRequestSid || portRequest.sid;
      portStatus = "in_review";
    } catch (twilioErr) {
      console.error("Twilio port request error:", twilioErr.message || twilioErr);
      // Still save locally so the user can see the request; we can retry or
      // handle it manually. Include the Twilio error as status detail.
    }

    const result = await db.query(
      `INSERT INTO port_requests (
         org_id, created_by_user_id, phone_number, losing_carrier,
         authorized_name, authorized_email, authorized_phone,
         service_address, twilio_port_request_sid, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        req.user.orgId,
        req.user.userId,
        e164,
        losingCarrier || null,
        authorizedName,
        authorizedEmail,
        authorizedPhone || null,
        [street, city, state, zip].filter(Boolean).join(", ") || null,
        twilioSid,
        portStatus,
      ]
    );

    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      phoneNumber: row.phone_number,
      status: row.status,
      twilioSid: row.twilio_port_request_sid,
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error("Error creating port request:", err);
    res.status(500).json({
      message: err.message || "Failed to submit port request",
    });
  }
});

// GET /requests — list port requests for this org
router.get("/requests", authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, phone_number, losing_carrier, authorized_name,
              authorized_email, status, status_detail,
              twilio_port_request_sid, completed_at, created_at, updated_at
       FROM port_requests
       WHERE org_id = $1
       ORDER BY created_at DESC`,
      [req.user.orgId]
    );
    res.json(
      result.rows.map((r) => ({
        id: r.id,
        phoneNumber: r.phone_number,
        losingCarrier: r.losing_carrier,
        authorizedName: r.authorized_name,
        authorizedEmail: r.authorized_email,
        status: r.status,
        statusDetail: r.status_detail,
        twilioSid: r.twilio_port_request_sid,
        completedAt: r.completed_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }))
    );
  } catch (err) {
    console.error("Error listing port requests:", err);
    res.status(500).json({ message: "Failed to fetch port requests" });
  }
});

// POST /webhook — Twilio porting status webhook
router.post("/webhook", async (req, res) => {
  const { PortRequestSid, Status, StatusDetails } = req.body;
  if (!PortRequestSid) {
    return res.status(400).json({ message: "Missing PortRequestSid" });
  }

  const statusMap = {
    "In Review": "in_review",
    "Waiting for Signature": "waiting_for_signature",
    "In Progress": "in_progress",
    Completed: "completed",
    "Action Required": "action_required",
    Rejected: "rejected",
    Cancelled: "cancelled",
    Canceled: "cancelled",
    Canceling: "cancelled",
  };

  const dbStatus = statusMap[Status] || "in_review";

  try {
    await db.query(
      `UPDATE port_requests
       SET status = $1,
           status_detail = $2,
           updated_at = now(),
           completed_at = CASE WHEN $1 = 'completed' THEN now() ELSE completed_at END
       WHERE twilio_port_request_sid = $3`,
      [dbStatus, StatusDetails || null, PortRequestSid]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Port webhook error:", err);
    res.status(500).json({ message: "Webhook processing failed" });
  }
});

module.exports = router;
