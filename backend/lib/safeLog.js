/**
 * safeLog.js — log helpers that scrub PHI before anything reaches stdout/stderr.
 *
 * The rules:
 *   1. Never log full Error objects — they can carry request bodies, query
 *      params, or stack frames pointing at PHI-bearing source.
 *   2. Never log raw phone numbers in plaintext. Use `redactPhone()` to
 *      preserve country code and last 2 digits only.
 *   3. Never log message bodies, internal notes, or patient names.
 *
 * Use these helpers in any route that touches messages, patients, or webhook
 * payloads. The audit logger has its own redaction; this one is for the
 * console transport that ends up in stdout/CloudWatch.
 */

function redactPhone(value) {
  if (!value) return value;
  const s = String(value);
  // Keep leading "+" and country digits; redact the middle.
  const match = s.match(/^(\+?\d{1,3})?(\d+)(\d{2})$/);
  if (!match) return "[redacted-phone]";
  const cc = match[1] || "";
  const middle = match[2] || "";
  const tail = match[3] || "";
  return `${cc}${"*".repeat(Math.max(middle.length, 4))}${tail}`;
}

function safeErr(err) {
  if (!err) return "unknown error";
  if (typeof err === "string") return err;
  if (err.message) return String(err.message);
  return "non-error thrown";
}

function logError(prefix, err) {
  console.error(prefix, safeErr(err));
}

function logWarn(prefix, info) {
  if (info && typeof info === "object" && info.message) {
    console.warn(prefix, info.message);
  } else if (typeof info === "string") {
    console.warn(prefix, info);
  } else {
    console.warn(prefix);
  }
}

module.exports = {
  redactPhone,
  safeErr,
  logError,
  logWarn,
};
