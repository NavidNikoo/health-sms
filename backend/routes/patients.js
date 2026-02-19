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

// POST /api/patients - create a new patient
router.post("/", authenticate, async (req, res) => {
  try {
    const { fullName, primaryPhone, notes } = req.body;
    if (!fullName || !primaryPhone) {
      return res.status(400).json({ message: "fullName and primaryPhone are required" });
    }

    const result = await db.query(
      "INSERT INTO patients (org_id, full_name, primary_phone, notes) VALUES ($1, $2, $3, $4) RETURNING id, full_name, primary_phone, notes, created_at",
      [req.user.orgId, fullName.trim(), primaryPhone.trim(), notes?.trim() || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error creating patient", err);
    res.status(500).json({ message: "Error creating patient" });
  }
});

module.exports = router;

