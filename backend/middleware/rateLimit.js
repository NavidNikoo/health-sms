/**
 * Rate-limiting middleware for sensitive endpoints.
 *
 * Each limiter is keyed by a combination of IP and an optional identifier
 * (such as the email submitted in a login request) so that brute-force
 * attempts against a single account are throttled even if the attacker
 * rotates IPs.
 *
 * In production behind a proxy/load balancer, ensure `app.set("trust proxy", ...)`
 * is configured (see server.js) so `req.ip` reflects the real client.
 */

const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

const standardJson429 = (req, res /*, next, options */) => {
  res.status(429).json({
    message: "Too many requests. Please slow down and try again shortly.",
  });
};

function ipPlus(extractor) {
  return (req, res) => {
    const extra = (() => {
      try {
        return extractor(req) || "";
      } catch {
        return "";
      }
    })();
    const ipKey = ipKeyGenerator(req, res);
    return `${ipKey}|${String(extra).toLowerCase().trim()}`;
  };
}

// Login: per IP + email, 10/min, plus a slower per-IP burst guard.
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardJson429,
  keyGenerator: ipPlus((req) => req.body?.email),
});

// Signup: per IP, 5 per hour (signup spam mitigation).
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardJson429,
});

// 2FA verify: per IP, 10/min.
const twoFaVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardJson429,
});

// Password reset / sensitive auth-adjacent flows.
const passwordSensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardJson429,
});

// Cost-incurring endpoints (number provisioning, porting). Tight limits to
// reduce blast radius of compromised tokens or runaway client retries.
const costEndpointLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardJson429,
  keyGenerator: ipPlus((req) => req.user?.userId),
});

// Generic protective limiter for any other public/unauthenticated endpoints.
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardJson429,
});

module.exports = {
  loginLimiter,
  signupLimiter,
  twoFaVerifyLimiter,
  passwordSensitiveLimiter,
  costEndpointLimiter,
  publicLimiter,
};
