const express = require("express");
const db = require("../db");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// GET /api/patients - list patients for user's organization
router.get("/", authenticate, async (req, res) => {
  try {
    // Filter patients by user's organization
    const result = await db.query(
      `
        SELECT id, full_name, primary_phone, created_at
        FROM patients
        WHERE org_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [req.user.orgId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching patients", err);
    res.status(500).json({ message: "Error fetching patients" });
  }
});

module.exports = router;

