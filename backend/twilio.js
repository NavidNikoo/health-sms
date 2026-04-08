/**
 * Twilio client helper. Returns null if not configured.
 * Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env for real SMS.
 */
const twilio = require("twilio");

function getClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;
  return twilio(accountSid, authToken);
}

/**
 * Send SMS via Twilio. Returns { sid } on success, throws on error.
 * @param {string} from - Twilio phone number SID or E.164 (e.g. +15551234567)
 * @param {string} to - Recipient E.164 (e.g. +15559876543)
 * @param {string} body - Message body
 * @param {object} options
 * @param {string|null} options.statusCallback - Public Twilio status callback URL
 */
async function sendSms(from, to, body, options = {}) {
  const client = getClient();
  if (!client) {
    throw new Error("Twilio not configured. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to .env");
  }

  const { statusCallback } = options;
  const message = await client.messages.create({
    from,
    to,
    body: body.trim(),
    ...(statusCallback ? { statusCallback } : {}),
  });
  return { sid: message.sid, status: message.status };
}

module.exports = { getClient, sendSms };
