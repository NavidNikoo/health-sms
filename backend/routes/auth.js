const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../db");
const { authenticate } = require("../middleware/auth");
const { audit } = require("../lib/auditLogger");

const router = express.Router();

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * POST /api/auth/login
 * Login endpoint - validates credentials and returns JWT token
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    // Find user by email
    const userResult = await db.query(
      "SELECT id, org_id, email, password_hash, role FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = userResult.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Update last_login_at
    await db.query(
      "UPDATE users SET last_login_at = now() WHERE id = $1",
      [user.id]
    );

    // Generate JWT token
    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET not configured");
      return res.status(500).json({ message: "Server configuration error" });
    }

    const tokenPayload = {
      userId: user.id,
      orgId: user.org_id,
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "24h",
    });

    await audit({
      orgId: user.org_id,
      userId: user.id,
      eventType: "auth.login",
      resourceType: "user",
      resourceId: user.id,
      metadata: { email: user.email },
      req,
    });

    res.json({
      token,
      user: {
        id: user.id,
        orgId: user.org_id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ message: "Login failed" });
  }
});

/**
 * POST /api/auth/signup
 * Creates a new organization and user in one step, returns JWT
 */
router.post("/signup", async (req, res) => {
  try {
    const { orgName, email, password, fullName } = req.body;

    if (!orgName?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ message: "Organization name, email, and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const existing = await db.query("SELECT id FROM users WHERE email = $1", [email.trim().toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const orgResult = await db.query(
      "INSERT INTO organizations (name) VALUES ($1) RETURNING id",
      [orgName.trim()]
    );
    const orgId = orgResult.rows[0].id;

    const userResult = await db.query(
      `INSERT INTO users (org_id, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       RETURNING id, org_id, email, role`,
      [orgId, email.trim().toLowerCase(), passwordHash]
    );
    const user = userResult.rows[0];

    const tokenPayload = {
      userId: user.id,
      orgId: user.org_id,
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "24h",
    });

    await audit({
      orgId: user.org_id,
      userId: user.id,
      eventType: "auth.signup",
      resourceType: "user",
      resourceId: user.id,
      metadata: { email: user.email },
      req,
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        orgId: user.org_id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Signup error:", error.message);
    res.status(500).json({ message: "Signup failed" });
  }
});

/**
 * GET /api/auth/me
 * Returns current authenticated user info
 */
router.get("/me", authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.org_id, u.email, u.role,
              up.handle AS dm_handle, up.display_name AS dm_display_name, up.allow_dms AS dm_allow_dms
       FROM users u
       JOIN organizations o ON o.id = u.org_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = $1`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Account no longer exists. Please log in again." });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      orgId: user.org_id,
      email: user.email,
      role: user.role,
      dmHandle: user.dm_handle || null,
      dmDisplayName: user.dm_display_name || null,
      dmAllowDMs: user.dm_allow_dms || null,
    });
  } catch (error) {
    console.error("Get me error:", error);
    res.status(500).json({ message: "Failed to get user info" });
  }
});

/**
 * POST /api/auth/logout
 * Logout endpoint (for now, just returns success)
 * In production, you might want to blacklist tokens
 */
router.post("/logout", authenticate, (req, res) => {
  res.json({ message: "Logged out successfully" });
});

/**
 * GET /api/auth/invites/:token
 * Public preview of an invite — used by the accept-invite page.
 * Returns minimal info: org name, invited email, role, expiry status.
 */
router.get("/invites/:token", async (req, res) => {
  try {
    const tokenHash = hashToken(req.params.token);
    const { rows } = await db.query(
      `SELECT i.id, i.invited_email, i.role, i.expires_at, i.used_at, i.revoked_at,
              o.name AS org_name
       FROM organization_invites i
       JOIN organizations o ON o.id = i.org_id
       WHERE i.token_hash = $1`,
      [tokenHash]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Invalid invite link" });
    }

    const invite = rows[0];
    if (invite.used_at) return res.status(410).json({ message: "This invite has already been used" });
    if (invite.revoked_at) return res.status(410).json({ message: "This invite has been revoked" });
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ message: "This invite has expired" });
    }

    res.json({
      invite: {
        email: invite.invited_email,
        role: invite.role,
        orgName: invite.org_name,
        expiresAt: invite.expires_at,
      },
    });
  } catch (err) {
    console.error("GET /auth/invites/:token error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/auth/accept-invite
 * Public. Accepts an invite and creates a user account in the invited org.
 * Body: { token, password }
 * Returns JWT + user (same shape as login).
 */
router.post("/accept-invite", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: "Token and password required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const tokenHash = hashToken(token);
    const inviteResult = await db.query(
      `SELECT id, org_id, invited_email, role, expires_at, used_at, revoked_at
       FROM organization_invites
       WHERE token_hash = $1`,
      [tokenHash]
    );

    if (inviteResult.rows.length === 0) {
      return res.status(404).json({ message: "Invalid invite link" });
    }

    const invite = inviteResult.rows[0];
    if (invite.used_at) return res.status(410).json({ message: "This invite has already been used" });
    if (invite.revoked_at) return res.status(410).json({ message: "This invite has been revoked" });
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ message: "This invite has expired" });
    }

    const existing = await db.query(
      "SELECT id FROM users WHERE lower(email) = $1",
      [invite.invited_email]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const userResult = await db.query(
      `INSERT INTO users (org_id, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, org_id, email, role`,
      [invite.org_id, invite.invited_email, passwordHash, invite.role]
    );
    const user = userResult.rows[0];

    await db.query(
      "UPDATE organization_invites SET used_at = now() WHERE id = $1",
      [invite.id]
    );

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET not configured");
      return res.status(500).json({ message: "Server configuration error" });
    }

    const tokenPayload = {
      userId: user.id,
      orgId: user.org_id,
      email: user.email,
      role: user.role,
    };
    const jwtToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "24h",
    });

    await audit({
      orgId: user.org_id,
      userId: user.id,
      eventType: "org.invite.accept",
      resourceType: "org_invite",
      resourceId: invite.id,
      metadata: { email: user.email, role: user.role },
      req,
    });

    res.status(201).json({
      token: jwtToken,
      user: {
        id: user.id,
        orgId: user.org_id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("POST /auth/accept-invite error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
