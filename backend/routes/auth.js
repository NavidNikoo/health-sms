const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

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

    // Return token and user info (without password_hash)
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
    console.error("Login error:", error);
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
    console.error("Signup error:", error);
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
      "SELECT u.id, u.org_id, u.email, u.role FROM users u JOIN organizations o ON o.id = u.org_id WHERE u.id = $1",
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

module.exports = router;
