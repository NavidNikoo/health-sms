const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const router = express.Router();
const db = require("../db");
const { authenticate } = require("../middleware/auth");
const { audit } = require("../lib/auditLogger");

router.use(authenticate);

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function buildInviteLink(req, token) {
  const frontendBase =
    process.env.FRONTEND_URL ||
    (process.env.FRONTEND_ORIGIN || "").split(",")[0].trim() ||
    `${req.protocol}://${req.get("host").replace(/:\d+$/, "")}:5173`;
  return `${frontendBase.replace(/\/$/, "")}/accept-invite?token=${token}`;
}

/**
 * GET /api/users/org
 * Returns all users in the caller's organization with optional DM profile data.
 */
router.get("/org", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.role,
              up.handle, up.display_name, up.allow_dms
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.org_id = $1
       ORDER BY u.email ASC`,
      [req.user.orgId]
    );
    return res.json({ users: rows });
  } catch (err) {
    console.error("GET /users/org error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * DELETE /api/users/org/:id
 * Admin-only. Deletes a user in the caller's organization.
 * Safeguards: cannot delete yourself; cannot delete the last admin.
 */
router.delete("/org/:id", requireAdmin, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (!targetId) return res.status(400).json({ message: "User id required" });
    if (targetId === req.user.userId) {
      return res.status(400).json({ message: "You cannot remove yourself" });
    }

    const { rows: targets } = await db.query(
      "SELECT id, email, role FROM users WHERE id = $1 AND org_id = $2",
      [targetId, req.user.orgId]
    );
    if (targets.length === 0) return res.status(404).json({ message: "User not found" });

    const target = targets[0];

    if (target.role === "admin") {
      const { rows: adminCountRows } = await db.query(
        "SELECT COUNT(*)::int AS c FROM users WHERE org_id = $1 AND role = 'admin'",
        [req.user.orgId]
      );
      const adminCount = adminCountRows[0]?.c ?? 0;
      if (adminCount <= 1) {
        return res.status(409).json({ message: "Cannot remove the last admin" });
      }
    }

    await db.query("DELETE FROM users WHERE id = $1 AND org_id = $2", [
      targetId,
      req.user.orgId,
    ]);

    await audit({
      orgId: req.user.orgId,
      userId: req.user.userId,
      eventType: "org.user.remove",
      resourceType: "user",
      resourceId: targetId,
      metadata: { removedEmail: target.email, removedRole: target.role },
      req,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /users/org/:id error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/users/invites
 * Admin-only. Creates an invite for a new user to join the admin's org.
 * Returns the invite link (token shown once).
 */
router.post("/invites", requireAdmin, async (req, res) => {
  try {
    const { email, role } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();

    if (!normalizedEmail || !role) {
      return res.status(400).json({ message: "Email and role required" });
    }
    if (!["admin", "provider", "staff"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const existingUser = await db.query(
      "SELECT id FROM users WHERE org_id = $1 AND lower(email) = $2",
      [req.user.orgId, normalizedEmail]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "A user with this email is already in your organization" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    let rows;
    try {
      const result = await db.query(
        `INSERT INTO organization_invites
           (org_id, invited_email, role, token_hash, expires_at, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, invited_email, role, expires_at, created_at`,
        [req.user.orgId, normalizedEmail, role, tokenHash, expiresAt, req.user.userId]
      );
      rows = result.rows;
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({ message: "An active invite already exists for this email" });
      }
      throw err;
    }

    await audit({
      orgId: req.user.orgId,
      userId: req.user.userId,
      eventType: "org.invite.create",
      resourceType: "org_invite",
      resourceId: rows[0].id,
      metadata: { invitedEmail: normalizedEmail, role },
      req,
    });

    return res.status(201).json({
      invite: rows[0],
      inviteLink: buildInviteLink(req, token),
    });
  } catch (err) {
    console.error("POST /users/invites error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/users/invites
 * Admin-only. Lists all pending invites for the caller's org.
 */
router.get("/invites", requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT i.id, i.invited_email, i.role, i.expires_at, i.used_at, i.revoked_at,
              i.created_at, i.created_by_user_id,
              u.email AS created_by_email
       FROM organization_invites i
       LEFT JOIN users u ON u.id = i.created_by_user_id
       WHERE i.org_id = $1
       ORDER BY i.created_at DESC`,
      [req.user.orgId]
    );
    return res.json({ invites: rows });
  } catch (err) {
    console.error("GET /users/invites error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/users/my-invites
 * Returns pending (active) invites addressed to the authenticated user's email.
 * An invite is "active" if not used, not revoked, and not expired.
 */
router.get("/my-invites", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT i.id, i.org_id, i.invited_email, i.role, i.expires_at, i.created_at,
              o.name AS org_name,
              u.email AS invited_by_email
       FROM organization_invites i
       JOIN organizations o ON o.id = i.org_id
       LEFT JOIN users u ON u.id = i.created_by_user_id
       WHERE lower(i.invited_email) = lower($1)
         AND i.used_at IS NULL
         AND i.revoked_at IS NULL
         AND i.expires_at > now()
         AND i.org_id <> $2
       ORDER BY i.created_at DESC`,
      [req.user.email, req.user.orgId]
    );
    return res.json({ invites: rows });
  } catch (err) {
    console.error("GET /users/my-invites error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/users/my-invites/:id/accept
 * Accepts an org invite: moves the authenticated user's org_id + role to the invite's org.
 * Returns a fresh JWT (old one still has stale orgId/role until frontend swaps it).
 */
router.post("/my-invites/:id/accept", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, org_id, invited_email, role, expires_at, used_at, revoked_at
       FROM organization_invites
       WHERE id = $1`,
      [req.params.id]
    );

    if (rows.length === 0) return res.status(404).json({ message: "Invite not found" });

    const invite = rows[0];
    if (invite.used_at) return res.status(410).json({ message: "This invite has already been used" });
    if (invite.revoked_at) return res.status(410).json({ message: "This invite has been revoked" });
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ message: "This invite has expired" });
    }
    if (invite.invited_email.toLowerCase() !== (req.user.email || "").toLowerCase()) {
      return res.status(403).json({ message: "This invite is not for you" });
    }
    if (invite.org_id === req.user.orgId) {
      return res.status(409).json({ message: "You're already in this organization" });
    }

    const previousOrgId = req.user.orgId;

    const userResult = await db.query(
      `UPDATE users SET org_id = $1, role = $2 WHERE id = $3
       RETURNING id, org_id, email, role`,
      [invite.org_id, invite.role, req.user.userId]
    );
    const user = userResult.rows[0];

    await db.query(
      "UPDATE organization_invites SET used_at = now() WHERE id = $1",
      [invite.id]
    );

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Server configuration error" });
    }
    const newToken = jwt.sign(
      { userId: user.id, orgId: user.org_id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "24h" }
    );

    await audit({
      orgId: user.org_id,
      userId: user.id,
      eventType: "org.invite.accept",
      resourceType: "org_invite",
      resourceId: invite.id,
      metadata: { previousOrgId, newRole: user.role, inApp: true },
      req,
    });

    return res.json({
      token: newToken,
      user: {
        id: user.id,
        orgId: user.org_id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("POST /users/my-invites/:id/accept error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/users/my-invites/:id/decline
 * Marks an invite addressed to the caller as revoked (declined by recipient).
 */
router.post("/my-invites/:id/decline", async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE organization_invites
       SET revoked_at = now()
       WHERE id = $1
         AND lower(invited_email) = lower($2)
         AND used_at IS NULL
         AND revoked_at IS NULL
       RETURNING id, org_id, invited_email`,
      [req.params.id, req.user.email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Invite not found or already handled" });
    }

    await audit({
      orgId: rows[0].org_id,
      userId: req.user.userId,
      eventType: "org.invite.decline",
      resourceType: "org_invite",
      resourceId: rows[0].id,
      metadata: { invitedEmail: rows[0].invited_email },
      req,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("POST /users/my-invites/:id/decline error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * DELETE /api/users/invites/:id
 * Admin-only. Revokes a pending invite.
 */
router.delete("/invites/:id", requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE organization_invites
       SET revoked_at = now()
       WHERE id = $1 AND org_id = $2 AND used_at IS NULL AND revoked_at IS NULL
       RETURNING id, invited_email`,
      [req.params.id, req.user.orgId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Invite not found or already handled" });
    }

    await audit({
      orgId: req.user.orgId,
      userId: req.user.userId,
      eventType: "org.invite.revoke",
      resourceType: "org_invite",
      resourceId: rows[0].id,
      metadata: { invitedEmail: rows[0].invited_email },
      req,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /users/invites/:id error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
