/**
 * routes/auth.js  (updated for 2FA)
 *
 * Login flow change:
 *   - If user has totp_enabled = TRUE, password check succeeds but returns a
 *     short-lived pre-auth token instead of a full session token.
 *     The client must complete the second step at POST /api/2fa/verify.
 *   - If totp_enabled = FALSE, behaviour is unchanged (full token returned).
 *
 * Admins who have not yet set up 2FA are flagged with requires2faSetup: true
 * in the login response so the frontend can redirect them to the setup page.
 */

const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { authenticate } = require("../middleware/auth");
const { audit } = require("../lib/auditLogger");

const router = express.Router();

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const userResult = await db.query(
      "SELECT id, org_id, email, password_hash, role, totp_enabled FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = userResult.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET not configured");
      return res.status(500).json({ message: "Server configuration error" });
    }

    // ── 2FA path: user has TOTP enabled ──────────────────────────────────────
    if (user.totp_enabled) {
      // Issue a short-lived pre-auth token — not usable for protected routes
      const preAuthToken = jwt.sign(
        { userId: user.id, type: "pre-auth" },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }
      );

      await audit({
        orgId: user.org_id,
        userId: user.id,
        eventType: "auth.login.password_ok_awaiting_2fa",
        resourceType: "user",
        resourceId: user.id,
        metadata: { email: user.email },
        req,
      });

      return res.json({
        requires2fa: true,
        preAuthToken,
      });
    }

    // ── No 2FA: issue full session token ──────────────────────────────────────
    await db.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);

    const token = jwt.sign(
      { userId: user.id, orgId: user.org_id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    await audit({
      orgId: user.org_id,
      userId: user.id,
      eventType: "auth.login",
      resourceType: "user",
      resourceId: user.id,
      metadata: { email: user.email },
      req,
    });

    // Flag admins who haven't set up 2FA yet so the frontend can prompt them
    const requires2faSetup = user.role === "admin" && !user.totp_enabled;

    res.json({
      token,
      requires2faSetup,
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

// ─── POST /api/auth/signup ────────────────────────────────────────────────────

router.post("/signup", async (req, res) => {
  try {
    const { orgName, email, password } = req.body;

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

    const token = jwt.sign(
      { userId: user.id, orgId: user.org_id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

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
      // New admins must set up 2FA before doing anything else
      requires2faSetup: true,
      user: { id: user.id, orgId: user.org_id, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error("Signup error:", error.message);
    res.status(500).json({ message: "Signup failed" });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get("/me", authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.org_id, u.email, u.role, u.totp_enabled
       FROM users u
       JOIN organizations o ON o.id = u.org_id
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
      totpEnabled: user.totp_enabled,
    });
  } catch (error) {
    console.error("Get me error:", error);
    res.status(500).json({ message: "Failed to get user info" });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

router.post("/logout", authenticate, (req, res) => {
  // TODO: add token denylist (Redis) for true invalidation
  res.json({ message: "Logged out successfully" });
});

module.exports = router;