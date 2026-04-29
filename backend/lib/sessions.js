/**
 * Refresh-token session management.
 *
 * We pair short-lived access JWTs with long-lived opaque refresh tokens. The
 * refresh token's secret is hashed (SHA-256) before storage so a database
 * compromise does not directly grant active sessions.
 *
 * Token format:
 *   `<sessionId>.<base64urlSecret>`
 *
 * Each rotation produces a new session row inside the same `family_id`. If a
 * previously-rotated or revoked refresh token is ever presented again, we treat
 * that as token reuse (replay) and revoke every session in the family.
 */

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../db");

const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
// Short-lived access JWT TTL. Keep this small — clients refresh transparently.
// Legacy JWT_EXPIRES_IN is intentionally ignored: it described whole-session
// lifetimes and is the wrong unit for an access token in a refresh-token flow.
const ACCESS_TTL = process.env.JWT_ACCESS_EXPIRES_IN || "15m";

function hashSecret(secret) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function generateSecret() {
  return crypto.randomBytes(32).toString("base64url");
}

function buildRefreshToken(sessionId, secret) {
  return `${sessionId}.${secret}`;
}

function parseRefreshToken(refreshToken) {
  if (typeof refreshToken !== "string") return null;
  const dot = refreshToken.indexOf(".");
  if (dot < 1) return null;
  const sessionId = refreshToken.slice(0, dot);
  const secret = refreshToken.slice(dot + 1);
  if (!sessionId || !secret) return null;
  return { sessionId, secret };
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function issueAccessToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET not configured");
  }
  return jwt.sign(
    {
      userId: user.id,
      orgId: user.org_id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

async function createSession({ userId, orgId, req, familyId = null }) {
  const secret = generateSecret();
  const tokenHash = hashSecret(secret);
  const family = familyId || crypto.randomUUID();
  const ip = req?.ip || null;
  const userAgent = req?.headers?.["user-agent"]?.slice(0, 500) || null;
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  const { rows } = await db.query(
    `INSERT INTO user_sessions
       (family_id, user_id, org_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, family_id, expires_at`,
    [family, userId, orgId, tokenHash, expiresAt, ip, userAgent]
  );

  const row = rows[0];
  return {
    refreshToken: buildRefreshToken(row.id, secret),
    sessionId: row.id,
    familyId: row.family_id,
    expiresAt: row.expires_at,
  };
}

async function revokeFamily(familyId, reason = "replay_detected") {
  await db.query(
    `UPDATE user_sessions
       SET revoked_at = COALESCE(revoked_at, now()),
           revoked_reason = COALESCE(revoked_reason, $2)
     WHERE family_id = $1`,
    [familyId, reason]
  );
}

async function revokeSession(sessionId, reason = "logout") {
  await db.query(
    `UPDATE user_sessions
       SET revoked_at = COALESCE(revoked_at, now()),
           revoked_reason = COALESCE(revoked_reason, $2)
     WHERE id = $1`,
    [sessionId, reason]
  );
}

async function revokeAllForUser(userId, reason = "logout_all") {
  await db.query(
    `UPDATE user_sessions
       SET revoked_at = COALESCE(revoked_at, now()),
           revoked_reason = COALESCE(revoked_reason, $2)
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId, reason]
  );
}

/**
 * Verify and rotate a refresh token. Returns `{ accessToken, refreshToken, user }`
 * on success. Throws an Error with `.code` set to a stable identifier on failure.
 */
async function rotateSession({ refreshToken, req }) {
  const parsed = parseRefreshToken(refreshToken);
  if (!parsed) {
    const err = new Error("Invalid refresh token");
    err.code = "invalid_refresh";
    throw err;
  }

  const sessionRes = await db.query(
    `SELECT s.id, s.family_id, s.user_id, s.org_id, s.token_hash,
            s.expires_at, s.revoked_at, s.rotated_at,
            u.id AS u_id, u.org_id AS u_org_id, u.email, u.role
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1`,
    [parsed.sessionId]
  );

  if (sessionRes.rows.length === 0) {
    const err = new Error("Invalid refresh token");
    err.code = "invalid_refresh";
    throw err;
  }

  const session = sessionRes.rows[0];
  const presentedHash = hashSecret(parsed.secret);

  if (!timingSafeEqualHex(presentedHash, session.token_hash)) {
    // The session id is real but the secret is wrong. Treat as suspicious.
    await revokeFamily(session.family_id, "secret_mismatch");
    const err = new Error("Invalid refresh token");
    err.code = "invalid_refresh";
    throw err;
  }

  // If this exact refresh token was already rotated or explicitly revoked,
  // someone is replaying an old token. Revoke the entire family.
  if (session.rotated_at || session.revoked_at) {
    await revokeFamily(session.family_id, "replay_detected");
    const err = new Error("Refresh token reuse detected. Please log in again.");
    err.code = "replay_detected";
    throw err;
  }

  if (new Date(session.expires_at).getTime() < Date.now()) {
    await revokeSession(session.id, "expired");
    const err = new Error("Refresh token expired");
    err.code = "expired_refresh";
    throw err;
  }

  // Issue a new session in the same family and link the old one to it.
  const nextSecret = generateSecret();
  const nextHash = hashSecret(nextSecret);
  const ip = req?.ip || null;
  const userAgent = req?.headers?.["user-agent"]?.slice(0, 500) || null;
  const newExpires = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  const inserted = await db.query(
    `INSERT INTO user_sessions
       (family_id, user_id, org_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [session.family_id, session.user_id, session.org_id, nextHash, newExpires, ip, userAgent]
  );
  const newSessionId = inserted.rows[0].id;

  await db.query(
    `UPDATE user_sessions
       SET rotated_at = now(),
           rotated_to_id = $2,
           last_used_at = now()
     WHERE id = $1`,
    [session.id, newSessionId]
  );

  const user = {
    id: session.u_id,
    org_id: session.u_org_id,
    email: session.email,
    role: session.role,
  };

  return {
    accessToken: issueAccessToken(user),
    refreshToken: buildRefreshToken(newSessionId, nextSecret),
    sessionId: newSessionId,
    user,
  };
}

async function purgeExpiredSessions() {
  await db.query(
    `DELETE FROM user_sessions
      WHERE expires_at < now() - interval '7 days'
         OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '7 days')`
  );
}

module.exports = {
  ACCESS_TTL,
  REFRESH_TTL_DAYS,
  issueAccessToken,
  createSession,
  rotateSession,
  revokeSession,
  revokeFamily,
  revokeAllForUser,
  parseRefreshToken,
  purgeExpiredSessions,
};
