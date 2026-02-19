const express = require("express");
const db = require("../db");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, e164_number, label, provider_sid FROM phone_numbers
       WHERE org_id = $1 ORDER BY label NULLS LAST, e164_number`,
      [req.user.orgId]
    );
    const numbers = result.rows.map((row) => ({
      id: row.id,
      number: row.e164_number,
      label: row.label,
      providerSid: row.provider_sid,
      unreadCount: 0,
    }));
    res.json(numbers);
  } catch (err) {
    console.error("Error fetching phone numbers", err);
    res.status(500).json({ message: "Error fetching phone numbers" });
  }
});

module.exports = router;
