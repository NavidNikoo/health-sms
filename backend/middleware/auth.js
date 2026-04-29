const jwt = require("jsonwebtoken");

/**
 * Verify a short-lived access JWT and attach user info to req.user.
 *
 * Failure semantics:
 *   - Missing/malformed token  → 401
 *   - Expired token            → 401 with code "token_expired" so the client
 *                                can attempt /api/auth/refresh.
 *   - Invalid signature        → 401
 *   - Server misconfiguration  → 500, but logged without including the token.
 *
 * We intentionally never include the raw token (or any portion of it) in logs.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.substring(7);

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET not configured");
    return res.status(500).json({ message: "Server configuration error" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ message: "Token expired", code: "token_expired" });
    }
    if (error.name === "JsonWebTokenError" || error.name === "NotBeforeError") {
      return res.status(401).json({ message: "Invalid token" });
    }
    // Anything else: log only the error name, never the token.
    console.error("Auth middleware error:", error.name);
    return res.status(401).json({ message: "Authentication failed" });
  }

  // Reject pre-auth tokens — they are only valid for /api/2fa/verify, which
  // does its own verification. They must never grant access to protected routes.
  if (decoded.type === "pre-auth") {
    return res.status(401).json({ message: "Invalid token" });
  }

  req.user = {
    userId: decoded.userId,
    orgId: decoded.orgId,
    email: decoded.email,
    role: decoded.role,
  };

  next();
};

module.exports = { authenticate };
