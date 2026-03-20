/**
 * Express middleware that validates inbound Twilio webhook signatures.
 *
 * Uses Twilio's validateRequest() to verify the X-Twilio-Signature header
 * matches the HMAC of the request URL + body params, proving the request
 * genuinely originated from Twilio.
 *
 * The canonical URL is constructed from BASE_URL so the check works correctly
 * behind reverse proxies (nginx, ALB, CloudFront).
 *
 * If TWILIO_AUTH_TOKEN or BASE_URL is not set, the middleware is a no-op so
 * local dev keeps working without a public URL.
 */

const { validateRequest } = require("twilio");

function validateTwilioSignature(routePath) {
  return (req, res, next) => {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const baseUrl = process.env.BASE_URL;

    if (!authToken || !baseUrl) {
      return next();
    }

    const signature = req.headers["x-twilio-signature"];
    if (!signature) {
      return res.status(403).type("text/xml").send("<Response><Say>Forbidden</Say></Response>");
    }

    const url = baseUrl.replace(/\/+$/, "") + routePath;
    const isValid = validateRequest(authToken, signature, url, req.body || {});

    if (!isValid) {
      console.warn("[twilioSig] Invalid Twilio signature for", routePath);
      return res.status(403).type("text/xml").send("<Response><Say>Forbidden</Say></Response>");
    }

    next();
  };
}

module.exports = { validateTwilioSignature };
