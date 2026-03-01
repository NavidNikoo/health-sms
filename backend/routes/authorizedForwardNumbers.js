const express = require("express");
const db = require("../db");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

function normalizeToE164(raw) {
  if (!raw || typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === "1") return `+${digits}`;
  if (raw.startsWith("+") && digits.length >= 10) return `+${digits}`;
  return null;
}

router.get("/", authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, e164_number, label, status, verified_at, created_at
       FROM authorized_forward_numbers
       WHERE org_id = $1 AND status <> 'disabled'
       ORDER BY created_at DESC`,
      [req.user.orgId]
    );

    res.json(
      result.rows.map((row) => ({
        id: row.id,
        number: row.e164_number,
        label: row.label,
        status: row.status,
        verifiedAt: row.verified_at,
        createdAt: row.created_at,
      }))
    );
  } catch (err) {
    console.error("Error fetching authorized forwarding numbers:", err);
    res.status(500).json({ message: "Failed to fetch authorized numbers" });
  }
});

router.post("/", authenticate, async (req, res) => {
  const { phoneNumber, label } = req.body || {};
  const normalized = normalizeToE164(phoneNumber);

  if (!normalized) {
    return res.status(400).json({ message: "Enter a valid US phone number" });
  }

  try {
    const result = await db.query(
      `INSERT INTO authorized_forward_numbers (
         org_id, created_by_user_id, e164_number, label, status, verified_at
       )
       VALUES ($1, $2, $3, $4, 'approved', now())
       ON CONFLICT (org_id, e164_number)
       DO UPDATE SET
         label = COALESCE(EXCLUDED.label, authorized_forward_numbers.label),
         status = 'approved',
         verified_at = COALESCE(authorized_forward_numbers.verified_at, now())
       RETURNING id, e164_number, label, status, verified_at, created_at`,
      [req.user.orgId, req.user.userId, normalized, label?.trim() || null]
    );

    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      number: row.e164_number,
      label: row.label,
      status: row.status,
      verifiedAt: row.verified_at,
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error("Error creating authorized forwarding number:", err);
    if (err.code === "23503") {
      return res.status(400).json({
        message: "Your session is invalid — please log out and log back in.",
      });
    }
    res.status(500).json({ message: err.message || "Failed to authorize number" });
  }
});

module.exports = router;
