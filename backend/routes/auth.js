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
const {
  loginLimiter,
  signupLimiter,
  passwordSensitiveLimiter,
} = require("../middleware/rateLimit");
const {
  issueAccessToken,
  createSession,
  rotateSession,
  revokeSession,
  parseRefreshToken,
} = require("../lib/sessions");

const router = express.Router();

function hashInviteToken(token) {
  return require("crypto").createHash("sha256").update(token).digest("hex");
}

async function buildLoginResponse(user, req) {
  const accessToken = issueAccessToken(user);
  const session = await createSession({
    userId: user.id,
    orgId: user.org_id,
    req,
  });
  return {
    token: accessToken,
    accessToken,
    refreshToken: session.refreshToken,
    refreshExpiresAt: session.expiresAt,
    user: {
      id: user.id,
      orgId: user.org_id,
      email: user.email,
      role: user.role,
    },
  };
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

router.post("/login", loginLimiter, async (req, res) => {
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

    const response = await buildLoginResponse(user, req);

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

    res.json({ ...response, requires2faSetup });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ message: "Login failed" });
  }
});

// ─── POST /api/auth/signup ────────────────────────────────────────────────────

router.post("/signup", signupLimiter, async (req, res) => {
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

    const response = await buildLoginResponse(user, req);

    await audit({
      orgId: user.org_id,
      userId: user.id,
      eventType: "auth.signup",
      resourceType: "user",
      resourceId: user.id,
      metadata: { email: user.email },
      req,
    });

    // New admins must set up 2FA before doing anything else
    res.status(201).json({ ...response, requires2faSetup: true });
  } catch (error) {
    console.error("Signup error:", error.message);
    res.status(500).json({ message: "Signup failed" });
  }
});

// ─── GET /api/auth/invites/:token ─────────────────────────────────────────────

router.get("/invites/:token", async (req, res) => {
  try {
    const tokenHash = hashInviteToken(req.params.token || "");
    const result = await db.query(
      `SELECT i.invited_email, i.role, i.expires_at, i.used_at, i.revoked_at,
              o.name AS org_name
       FROM organization_invites i
       JOIN organizations o ON o.id = i.org_id
       WHERE i.token_hash = $1`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Invite not found" });
    }

    const invite = result.rows[0];
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
  } catch (error) {
    console.error("Invite preview error:", error.message);
    res.status(500).json({ message: "Failed to load invite" });
  }
});

// ─── POST /api/auth/accept-invite ─────────────────────────────────────────────

router.post("/accept-invite", async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ message: "Token and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const tokenHash = hashInviteToken(token);
    const inviteResult = await db.query(
      `SELECT id, org_id, invited_email, role, expires_at, used_at, revoked_at
       FROM organization_invites
       WHERE token_hash = $1`,
      [tokenHash]
    );

    if (inviteResult.rows.length === 0) {
      return res.status(404).json({ message: "Invite not found" });
    }

    const invite = inviteResult.rows[0];
    if (invite.used_at) return res.status(410).json({ message: "This invite has already been used" });
    if (invite.revoked_at) return res.status(410).json({ message: "This invite has been revoked" });
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ message: "This invite has expired" });
    }

    const existing = await db.query(
      "SELECT id FROM users WHERE lower(email) = lower($1)",
      [invite.invited_email]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        message: "An account already exists for this email. Sign in to accept the invite from the Invites tab.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userResult = await db.query(
      `INSERT INTO users (org_id, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, org_id, email, role`,
      [invite.org_id, invite.invited_email.toLowerCase(), passwordHash, invite.role]
    );
    const user = userResult.rows[0];

    await db.query(
      "UPDATE organization_invites SET used_at = now() WHERE id = $1",
      [invite.id]
    );

    const response = await buildLoginResponse(user, req);

    await audit({
      orgId: user.org_id,
      userId: user.id,
      eventType: "org.invite.accept",
      resourceType: "org_invite",
      resourceId: invite.id,
      metadata: { email: user.email, role: user.role, newAccount: true },
      req,
    });

    res.status(201).json(response);
  } catch (error) {
    console.error("Accept invite error:", error.message);
    res.status(500).json({ message: "Failed to accept invite" });
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
    console.error("Get me error:", error.message);
    res.status(500).json({ message: "Failed to get user info" });
  }
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return res.status(400).json({ message: "refreshToken is required" });
    }

    const result = await rotateSession({ refreshToken, req });

    await audit({
      orgId: result.user.org_id,
      userId: result.user.id,
      eventType: "auth.session.refresh",
      resourceType: "user",
      resourceId: result.user.id,
      req,
    });

    res.json({
      token: result.accessToken,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: {
        id: result.user.id,
        orgId: result.user.org_id,
        email: result.user.email,
        role: result.user.role,
      },
    });
  } catch (err) {
    if (err.code === "replay_detected") {
      return res.status(401).json({
        message: "Session reuse detected. Please log in again.",
        code: "replay_detected",
      });
    }
    if (err.code === "expired_refresh") {
      return res.status(401).json({ message: "Session expired. Please log in again.", code: "expired_refresh" });
    }
    if (err.code === "invalid_refresh") {
      return res.status(401).json({ message: "Invalid session. Please log in again.", code: "invalid_refresh" });
    }
    console.error("Refresh error:", err.message);
    res.status(500).json({ message: "Failed to refresh session" });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

router.post("/logout", authenticate, async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    const parsed = parseRefreshToken(refreshToken);
    if (parsed) {
      // Verify the refresh token actually belongs to this user before revoking.
      const owns = await db.query(
        "SELECT family_id FROM user_sessions WHERE id = $1 AND user_id = $2",
        [parsed.sessionId, req.user.userId]
      );
      if (owns.rows.length > 0) {
        await revokeSession(parsed.sessionId, "logout");
      }
    }

    await audit({
      orgId: req.user.orgId,
      userId: req.user.userId,
      eventType: "auth.logout",
      resourceType: "user",
      resourceId: req.user.userId,
      req,
    });

    res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err.message);
    res.json({ message: "Logged out" });
  }
});

module.exports = router;