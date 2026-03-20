/**
 * PHI encryption at rest — AES-256-GCM envelope encryption.
 *
 * Key management:
 *   PHI_ENCRYPTION_KEY must be a 64-char hex string (32 bytes) stored in
 *   SSM Parameter Store (production) or .env (development).
 *   Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Storage format:
 *   "enc:v1:<iv-hex>:<authTag-hex>:<ciphertext-hex>"
 *
 * If PHI_ENCRYPTION_KEY is not set, falls back to plaintext storage with a
 * startup warning so existing dev environments keep working.
 */

const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const PREFIX = "enc:v1:";

let _key = null;
let _warned = false;

function getKey() {
  if (_key) return _key;
  const hex = process.env.PHI_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    if (!_warned) {
      console.warn("[phiCrypto] PHI_ENCRYPTION_KEY is missing or invalid — PHI will NOT be encrypted at rest.");
      _warned = true;
    }
    return null;
  }
  _key = Buffer.from(hex, "hex");
  return _key;
}

function encryptBody(plaintext) {
  const key = getKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return PREFIX + iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted.toString("hex");
}

function decryptBody(stored) {
  if (!stored) return "";

  if (!stored.startsWith(PREFIX)) {
    // Legacy plaintext or base64 — return as-is (backward compat)
    try {
      const decoded = Buffer.from(stored, "base64").toString("utf8");
      return /^[\x20-\x7E\n\r\t]+$/.test(decoded) ? decoded : stored;
    } catch {
      return stored;
    }
  }

  const key = getKey();
  if (!key) {
    console.warn("[phiCrypto] Cannot decrypt — PHI_ENCRYPTION_KEY not set.");
    return "[encrypted — key unavailable]";
  }

  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) return "[malformed ciphertext]";

  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const ciphertext = Buffer.from(parts[2], "hex");

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

module.exports = { encryptBody, decryptBody };
