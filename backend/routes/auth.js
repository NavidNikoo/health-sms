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
 * GET /api/auth/me
 * Returns current authenticated user info
 */
router.get("/me", authenticate, async (req, res) => {
  try {
    // User info is already attached by authenticate middleware
    res.json({
      id: req.user.userId,
      orgId: req.user.orgId,
      email: req.user.email,
      role: req.user.role,
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
