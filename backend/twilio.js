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
 */
async function sendSms(from, to, body) {
  const client = getClient();
  if (!client) {
    throw new Error("Twilio not configured. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to .env");
  }
  const message = await client.messages.create({
    from,
    to,
    body: body.trim(),
  });
  return { sid: message.sid };
}

module.exports = { getClient, sendSms };
