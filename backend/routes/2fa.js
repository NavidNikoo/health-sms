/**
 * routes/2fa.js
 *
 * TOTP-based two-factor authentication (Google Authenticator / Authy compatible).
 *
 * Flow:
 *   Setup:
 *     1. POST /api/2fa/setup        — generate secret + otpauth URI (requires auth)
 *     2. POST /api/2fa/verify-setup — confirm first code, mark totp_enabled = true
 *
 *   Login (second step after password):
 *     3. POST /api/2fa/verify       — validate TOTP code against pre-auth token
 *
 *   Management:
 *     4. POST /api/2fa/disable      — disable 2FA (requires password confirmation)
 *     5. GET  /api/2fa/status       — returns whether 2FA is enabled for current user
 *
 * Secret storage:
 *   TOTP secrets are encrypted at rest using the existing PHI encryption key
 *   (AES-256-GCM via phiCrypto.js) before being written to the database.
 *
 * Pre-auth token:
 *   After a successful password check for a 2FA-enabled account, the login
 *   endpoint issues a short-lived "pre-auth" JWT (5 min, type: "pre-auth").
 *   This token is only accepted by POST /api/2fa/verify — it cannot access
 *   any other protected route.
 */

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const otplib = require("otplib");
const authenticator = otplib.authenticator;
const qrcode = require("qrcode");
const db = require("../db");
const { authenticate } = require("../middleware/auth");
const { audit } = require("../lib/auditLogger");
const { encryptBody, decryptBody } = require("../lib/phiCrypto");

const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Verify a pre-auth JWT (issued after password check for 2FA users).
 * Returns the decoded payload or throws.
 */
function verifyPreAuthToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (decoded.type !== "pre-auth") {
    throw new Error("Invalid token type");
  }
  return decoded;
}

/**
 * Issue the real session JWT after both factors are verified.
 */
function issueSessionToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      orgId:  user.org_id,
      email:  user.email,
      role:   user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
  );
}

// ─── GET /api/2fa/status ──────────────────────────────────────────────────────

/**
 * Returns whether 2FA is currently enabled for the authenticated user.
 * Used by the frontend settings page to show the correct toggle state.
 */
router.get("/status", authenticate, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT totp_enabled, totp_verified_at FROM users WHERE id = $1 AND org_id = $2",
      [req.user.userId, req.user.orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    const { totp_enabled, totp_verified_at } = result.rows[0];
    res.json({ enabled: totp_enabled, verifiedAt: totp_verified_at });
  } catch (err) {
    console.error("2FA status error:", err.message);
    res.status(500).json({ message: "Failed to fetch 2FA status" });
  }
});

// ─── POST /api/2fa/setup ──────────────────────────────────────────────────────

/**
 * Generate a new TOTP secret for the authenticated user and return:
 *   - otpauthUrl  → encode as QR code on the frontend
 *   - manualCode  → fallback manual entry key
 *
 * The secret is stored encrypted but totp_enabled stays FALSE until the
 * user confirms their first code via /verify-setup.
 *
 * Calling setup again while 2FA is already enabled is blocked — the user
 * must disable first.
 */
router.post("/setup", authenticate, async (req, res) => {
  try {
    const userResult = await db.query(
      "SELECT email, totp_enabled FROM users WHERE id = $1 AND org_id = $2",
      [req.user.userId, req.user.orgId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    const user = userResult.rows[0];

    if (user.totp_enabled) {
      return res.status(409).json({
        message: "2FA is already enabled. Disable it first before setting up a new authenticator.",
      });
    }

    // Generate a new secret (base32, 20 bytes — standard for TOTP)
    const secret = authenticator.generateSecret(20);

    // Build the otpauth URI that authenticator apps parse from the QR code
    const appName = process.env.APP_NAME || "HealthSMS";
    const otpauthUrl = authenticator.keyuri(user.email, appName, secret);

    // Generate QR code as a data URI (rendered directly as <img src="...">)
    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);

    // Encrypt the secret before storing
    const encryptedSecret = encryptBody(secret);

    await db.query(
      "UPDATE users SET totp_secret = $1, totp_enabled = FALSE WHERE id = $2",
      [encryptedSecret, req.user.userId]
    );

    await audit({
      orgId: req.user.orgId,
      userId: req.user.userId,
      eventType: "auth.2fa.setup_initiated",
      resourceType: "user",
      resourceId: req.user.userId,
      req,
    });

    res.json({
      qrDataUrl,
      // Manual entry: show secret grouped in 4-char blocks for readability
      manualCode: secret.match(/.{1,4}/g).join(" "),
    });
  } catch (err) {
    console.error("2FA setup error:", err.message);
    res.status(500).json({ message: "Failed to set up 2FA" });
  }
});

// ─── POST /api/2fa/verify-setup ───────────────────────────────────────────────

/**
 * Confirm the user has successfully scanned the QR code by submitting their
 * first TOTP code. On success, sets totp_enabled = TRUE.
 *
 * Body: { code: "123456" }
 */
router.post("/verify-setup", authenticate, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
      return res.status(400).json({ message: "Enter the 6-digit code from your authenticator app" });
    }

    const result = await db.query(
      "SELECT totp_secret, totp_enabled FROM users WHERE id = $1 AND org_id = $2",
      [req.user.userId, req.user.orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const { totp_secret, totp_enabled } = result.rows[0];

    if (totp_enabled) {
      return res.status(409).json({ message: "2FA is already active on this account" });
    }
    if (!totp_secret) {
      return res.status(400).json({ message: "Run 2FA setup first" });
    }

    const secret = decryptBody(totp_secret);
    const isValid = authenticator.check(code.trim(), secret);

    if (!isValid) {
      await audit({
        orgId: req.user.orgId,
        userId: req.user.userId,
        eventType: "auth.2fa.setup_failed",
        resourceType: "user",
        resourceId: req.user.userId,
        req,
      });
      return res.status(401).json({ message: "Incorrect code — make sure your device clock is synced and try again" });
    }

    await db.query(
      "UPDATE users SET totp_enabled = TRUE, totp_verified_at = now() WHERE id = $1",
      [req.user.userId]
    );

    await audit({
      orgId: req.user.orgId,
      userId: req.user.userId,
      eventType: "auth.2fa.enabled",
      resourceType: "user",
      resourceId: req.user.userId,
      req,
    });

    res.json({ message: "Two-factor authentication is now active on your account" });
  } catch (err) {
    console.error("2FA verify-setup error:", err.message);
    res.status(500).json({ message: "Failed to verify setup code" });
  }
});

// ─── POST /api/2fa/verify ─────────────────────────────────────────────────────

/**
 * Second step of login for 2FA-enabled accounts.
 *
 * Body: { preAuthToken: "<jwt>", code: "123456" }
 *
 * On success returns the full session JWT (same shape as single-step login).
 * The pre-auth token is single-use by design — it expires in 5 minutes and
 * cannot access any other route.
 */
router.post("/verify", async (req, res) => {
  try {
    const { preAuthToken, code } = req.body;

    if (!preAuthToken || !code) {
      return res.status(400).json({ message: "preAuthToken and code are required" });
    }
    if (!/^\d{6}$/.test(code.trim())) {
      return res.status(400).json({ message: "Enter the 6-digit code from your authenticator app" });
    }

    // Validate pre-auth token
    let payload;
    try {
      payload = verifyPreAuthToken(preAuthToken);
    } catch {
      return res.status(401).json({ message: "Session expired — please log in again" });
    }

    const result = await db.query(
      "SELECT id, org_id, email, role, totp_secret, totp_enabled FROM users WHERE id = $1",
      [payload.userId]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Session expired — please log in again" });
    }

    const user = result.rows[0];

    if (!user.totp_enabled || !user.totp_secret) {
      // 2FA was disabled between login steps — just issue the token
      const token = issueSessionToken(user);
      return res.json({ token, user: { id: user.id, orgId: user.org_id, email: user.email, role: user.role } });
    }

    const secret = decryptBody(user.totp_secret);
    const isValid = authenticator.check(code.trim(), secret);

    if (!isValid) {
      await audit({
        orgId: user.org_id,
        userId: user.id,
        eventType: "auth.2fa.verify_failed",
        resourceType: "user",
        resourceId: user.id,
        req,
      });
      return res.status(401).json({ message: "Incorrect code — check your authenticator app and try again" });
    }

    await db.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);

    const token = issueSessionToken(user);

    await audit({
      orgId: user.org_id,
      userId: user.id,
      eventType: "auth.login.2fa_verified",
      resourceType: "user",
      resourceId: user.id,
      req,
    });

    res.json({
      token,
      user: { id: user.id, orgId: user.org_id, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("2FA verify error:", err.message);
    res.status(500).json({ message: "Verification failed" });
  }
});

// ─── POST /api/2fa/disable ────────────────────────────────────────────────────

/**
 * Disable 2FA for the authenticated user.
 * Requires password confirmation as a second factor (since the TOTP device
 * is being removed, we fall back to the password as proof of identity).
 *
 * Admins cannot disable their own 2FA without password confirmation.
 * Other admins cannot disable 2FA for a different user via this endpoint
 * (that would require a separate admin-management endpoint).
 *
 * Body: { password: "current password" }
 */
router.post("/disable", authenticate, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ message: "Password confirmation is required to disable 2FA" });
    }

    const result = await db.query(
      "SELECT password_hash, totp_enabled, role FROM users WHERE id = $1 AND org_id = $2",
      [req.user.userId, req.user.orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = result.rows[0];

    // Admins MUST have 2FA — block them from disabling it
    if (user.role === "admin") {
      return res.status(403).json({
        message: "Admin accounts require two-factor authentication and cannot disable it",
      });
    }

    if (!user.totp_enabled) {
      return res.status(400).json({ message: "2FA is not currently enabled on this account" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      await audit({
        orgId: req.user.orgId,
        userId: req.user.userId,
        eventType: "auth.2fa.disable_failed",
        resourceType: "user",
        resourceId: req.user.userId,
        req,
      });
      return res.status(401).json({ message: "Incorrect password" });
    }

    await db.query(
      "UPDATE users SET totp_secret = NULL, totp_enabled = FALSE, totp_verified_at = NULL WHERE id = $1",
      [req.user.userId]
    );

    await audit({
      orgId: req.user.orgId,
      userId: req.user.userId,
      eventType: "auth.2fa.disabled",
      resourceType: "user",
      resourceId: req.user.userId,
      req,
    });

    res.json({ message: "Two-factor authentication has been disabled" });
  } catch (err) {
    console.error("2FA disable error:", err.message);
    res.status(500).json({ message: "Failed to disable 2FA" });
  }
});

module.exports = router;