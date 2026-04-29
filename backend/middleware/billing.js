/**
 * Middleware for cost-incurring endpoints.
 *
 * `requireAdmin`           — caller must be authenticated as an org admin.
 * `requireBillingEnabled`  — org must have `billing_enabled = true`.
 * `requireTwilioPurchases` — explicit safety switch for Twilio-spending paths.
 *                            Set ALLOW_TWILIO_PURCHASES=true in the environment
 *                            to allow real provisioning/porting; default deny.
 *
 * Compose them after `authenticate` for any route that can charge money or
 * trigger external provider obligations:
 *   router.post(
 *     "/", authenticate, requireAdmin, requireBillingEnabled,
 *     requireTwilioPurchases, costEndpointLimiter, handler
 *   );
 */

const db = require("../db");

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      message: "Admin access is required for this action.",
      code: "admin_required",
    });
  }
  next();
}

async function requireBillingEnabled(req, res, next) {
  try {
    if (!req.user?.orgId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const result = await db.query(
      "SELECT billing_enabled FROM organizations WHERE id = $1",
      [req.user.orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Organization not found" });
    }

    if (!result.rows[0].billing_enabled) {
      return res.status(402).json({
        message:
          "Billing is not enabled for this organization. Contact your administrator to enable billing before provisioning numbers or submitting port requests.",
        code: "billing_disabled",
      });
    }

    next();
  } catch (err) {
    console.error("Billing gate error:", err.message);
    res.status(500).json({ message: "Failed to verify billing status" });
  }
}

function requireTwilioPurchases(req, res, next) {
  const enabled = String(process.env.ALLOW_TWILIO_PURCHASES || "")
    .trim()
    .toLowerCase();
  if (enabled !== "true" && enabled !== "1") {
    return res.status(503).json({
      message:
        "Provider provisioning is currently disabled on this server (ALLOW_TWILIO_PURCHASES is not enabled).",
      code: "purchases_disabled",
    });
  }
  next();
}

module.exports = {
  requireAdmin,
  requireBillingEnabled,
  requireTwilioPurchases,
};
