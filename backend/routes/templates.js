const express = require("express");
const db = require("../db");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, body, created_by, created_at
       FROM templates WHERE org_id = $1 ORDER BY name ASC`,
      [req.user.orgId]
    );
    res.json(result.rows.map((r) => ({
      id: r.id, name: r.name, body: r.body,
      createdBy: r.created_by, createdAt: r.created_at,
    })));
  } catch (err) {
    console.error("Error fetching templates", err);
    res.status(500).json({ message: "Error fetching templates" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, name, body, created_by, created_at FROM templates WHERE id = $1 AND org_id = $2",
      [req.params.id, req.user.orgId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Template not found" });
    const r = result.rows[0];
    res.json({ id: r.id, name: r.name, body: r.body, createdBy: r.created_by, createdAt: r.created_at });
  } catch (err) {
    console.error("Error fetching template", err);
    res.status(500).json({ message: "Error fetching template" });
  }
});

router.post("/", authenticate, async (req, res) => {
  try {
    const { name, body } = req.body;
    if (!name?.trim() || !body?.trim()) {
      return res.status(400).json({ message: "name and body are required" });
    }
    const result = await db.query(
      `INSERT INTO templates (org_id, name, body, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, body, created_by, created_at`,
      [req.user.orgId, name.trim(), body.trim(), req.user.userId]
    );
    const r = result.rows[0];
    res.status(201).json({ id: r.id, name: r.name, body: r.body, createdBy: r.created_by, createdAt: r.created_at });
  } catch (err) {
    console.error("Error creating template", err);
    res.status(500).json({ message: "Error creating template" });
  }
});

router.put("/:id", authenticate, async (req, res) => {
  try {
    const { name, body } = req.body;
    if (!name?.trim() || !body?.trim()) {
      return res.status(400).json({ message: "name and body are required" });
    }
    const result = await db.query(
      `UPDATE templates SET name = $1, body = $2
       WHERE id = $3 AND org_id = $4
       RETURNING id, name, body, created_by, created_at`,
      [name.trim(), body.trim(), req.params.id, req.user.orgId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Template not found" });
    const r = result.rows[0];
    res.json({ id: r.id, name: r.name, body: r.body, createdBy: r.created_by, createdAt: r.created_at });
  } catch (err) {
    console.error("Error updating template", err);
    res.status(500).json({ message: "Error updating template" });
  }
});

router.delete("/:id", authenticate, async (req, res) => {
  try {
    const result = await db.query(
      "DELETE FROM templates WHERE id = $1 AND org_id = $2 RETURNING id",
      [req.params.id, req.user.orgId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Template not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("Error deleting template", err);
    res.status(500).json({ message: "Error deleting template" });
  }
});

module.exports = router;
