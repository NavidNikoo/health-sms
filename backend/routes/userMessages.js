const express = require("express");
const router = express.Router();
const db = require("../db");
const { authenticate } = require("../middleware/auth");
const { encryptBody, decryptBody } = require("../lib/phiCrypto");
const { audit } = require("../lib/auditLogger");
const { logError } = require("../lib/safeLog");

router.use(authenticate);

// ── Rate-limit tracking (in-memory, per-process) ────────────────────────
const requestRateMap = new Map();
const REQUEST_LIMIT = 20;
const REQUEST_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRequestRate(userId) {
  const now = Date.now();
  let entry = requestRateMap.get(userId);
  if (!entry || now - entry.windowStart > REQUEST_WINDOW_MS) {
    entry = { windowStart: now, count: 0 };
    requestRateMap.set(userId, entry);
  }
  entry.count += 1;
  return entry.count <= REQUEST_LIMIT;
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function isBlocked(userA, userB) {
  const { rows } = await db.query(
    `SELECT 1 FROM user_dm_blocks
     WHERE (blocker_user_id = $1 AND blocked_user_id = $2)
        OR (blocker_user_id = $2 AND blocked_user_id = $1)
     LIMIT 1`,
    [userA, userB]
  );
  return rows.length > 0;
}

function canonicalPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

async function findOrgTeammate(identifier, orgId) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUuid = uuidRegex.test(identifier);
  const { rows } = await db.query(
    `SELECT u.id AS user_id, u.email, u.role,
            up.handle, up.display_name, up.allow_dms
     FROM users u
     LEFT JOIN user_profiles up ON up.user_id = u.id
     WHERE u.org_id = $1
       AND ${isUuid ? "u.id = $2" : "lower(up.handle) = lower($2)"}
     LIMIT 1`,
    [orgId, identifier]
  );
  return rows[0] || null;
}

// ══════════════════════════════════════════════════════════════════════════
// PROFILE
// ══════════════════════════════════════════════════════════════════════════

router.get("/profile/me", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT user_id, handle, display_name, allow_dms, created_at, updated_at
       FROM user_profiles WHERE user_id = $1`,
      [req.user.userId]
    );
    if (rows.length === 0) {
      return res.json({ profile: null });
    }
    return res.json({ profile: rows[0] });
  } catch (err) {
    logError("GET /profile/me error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.patch("/profile/me", async (req, res) => {
  try {
    const { handle, displayName, allowDMs } = req.body;

    if (allowDMs && !["nobody", "requests", "anyone"].includes(allowDMs)) {
      return res.status(400).json({ message: "Invalid allowDMs value" });
    }

    if (handle !== undefined) {
      if (handle !== null) {
        if (!/^[a-zA-Z0-9_]{3,30}$/.test(handle)) {
          return res.status(400).json({ message: "Handle must be 3-30 alphanumeric/underscore characters" });
        }
        const existing = await db.query(
          "SELECT user_id FROM user_profiles WHERE lower(handle) = lower($1) AND user_id <> $2",
          [handle, req.user.userId]
        );
        if (existing.rows.length > 0) {
          return res.status(409).json({ message: "Handle already taken" });
        }
      }
    }

    const { rows } = await db.query(
      `INSERT INTO user_profiles (user_id, handle, display_name, allow_dms, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id) DO UPDATE SET
         handle       = COALESCE($2, user_profiles.handle),
         display_name = COALESCE($3, user_profiles.display_name),
         allow_dms    = COALESCE($4, user_profiles.allow_dms),
         updated_at   = now()
       RETURNING *`,
      [
        req.user.userId,
        handle !== undefined ? handle : null,
        displayName !== undefined ? displayName : null,
        allowDMs || null,
      ]
    );

    await audit({
      orgId: req.user.orgId,
      userId: req.user.userId,
      eventType: "dm.profile.update",
      resourceType: "user_profile",
      resourceId: req.user.userId,
      metadata: { handle: rows[0].handle, allowDMs: rows[0].allow_dms },
      req,
    });

    return res.json({ profile: rows[0] });
  } catch (err) {
    logError("PATCH /profile/me error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Exact identity lookup within the caller's organization — no global directory.
router.get("/resolve/:handleOrId", async (req, res) => {
  try {
    const identifier = req.params.handleOrId.trim();
    if (!identifier) return res.status(400).json({ message: "Identifier required" });

    const teammate = await findOrgTeammate(identifier, req.user.orgId);
    if (!teammate) {
      return res.status(404).json({ message: "Teammate not found" });
    }

    return res.json({ user: teammate });
  } catch (err) {
    logError("GET /resolve error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// REQUESTS
// ══════════════════════════════════════════════════════════════════════════

router.post("/requests", async (req, res) => {
  try {
    const senderId = req.user.userId;
    const { handleOrId } = req.body;
    if (!handleOrId) return res.status(400).json({ message: "handleOrId required" });

    if (!checkRequestRate(senderId)) {
      return res.status(429).json({ message: "Too many requests. Try again later." });
    }

    // Team chat is intentionally organization-scoped; there is no global user directory.
    const target = await findOrgTeammate(handleOrId.trim(), req.user.orgId);
    if (!target) {
      return res.status(404).json({ message: "Teammate not found" });
    }

    const recipientId = target.user_id;

    if (recipientId === senderId) {
      return res.status(400).json({ message: "Cannot start a team chat with yourself" });
    }

    if (target.allow_dms === "nobody") {
      return res.status(403).json({ message: "This teammate is not accepting team chats" });
    }

    if (await isBlocked(senderId, recipientId)) {
      return res.status(403).json({ message: "Cannot start this team chat" });
    }

    // Check for existing active request or thread
    const { rows: existingReq } = await db.query(
      `SELECT id, status FROM user_dm_requests
       WHERE ((requester_user_id = $1 AND recipient_user_id = $2)
           OR (requester_user_id = $2 AND recipient_user_id = $1))
         AND status IN ('pending', 'accepted')
       LIMIT 1`,
      [senderId, recipientId]
    );
    if (existingReq.length > 0) {
      if (existingReq[0].status === "accepted") {
        const [ua, ub] = canonicalPair(senderId, recipientId);
        const { rows: threadRows } = await db.query(
          `INSERT INTO user_dm_threads (user_a_id, user_b_id)
           VALUES ($1, $2)
           ON CONFLICT (user_a_id, user_b_id) DO UPDATE SET last_message_at = user_dm_threads.last_message_at
           RETURNING id`,
          [ua, ub]
        );
        return res.json({ requestId: existingReq[0].id, threadId: threadRows[0].id, autoAccepted: true });
      }
      return res.status(409).json({ message: "Request already pending", requestId: existingReq[0].id });
    }

    // Teammates are already inside the same organization, so start the thread immediately.
    const { rows: reqRows } = await db.query(
      `INSERT INTO user_dm_requests (requester_user_id, recipient_user_id, status, acted_at)
       VALUES ($1, $2, 'accepted', now()) RETURNING *`,
      [senderId, recipientId]
    );

    const [ua, ub] = canonicalPair(senderId, recipientId);
    const { rows: threadRows } = await db.query(
      `INSERT INTO user_dm_threads (user_a_id, user_b_id)
       VALUES ($1, $2)
       ON CONFLICT (user_a_id, user_b_id) DO UPDATE SET last_message_at = user_dm_threads.last_message_at
       RETURNING id`,
      [ua, ub]
    );

    await audit({
      orgId: req.user.orgId, userId: senderId,
      eventType: "team_chat.thread.create", resourceType: "team_chat_thread",
      resourceId: threadRows[0].id, metadata: { recipientId }, req,
    });

    return res.status(201).json({ request: reqRows[0], threadId: threadRows[0].id, autoAccepted: true });
  } catch (err) {
    logError("POST /requests error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/requests/incoming", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT r.*, up.handle AS requester_handle, up.display_name AS requester_display_name
       FROM user_dm_requests r
       LEFT JOIN user_profiles up ON up.user_id = r.requester_user_id
       WHERE r.recipient_user_id = $1 AND r.status = 'pending'
       ORDER BY r.created_at DESC`,
      [req.user.userId]
    );
    return res.json({ requests: rows });
  } catch (err) {
    logError("GET /requests/incoming error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/requests/outgoing", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT r.*, up.handle AS recipient_handle, up.display_name AS recipient_display_name
       FROM user_dm_requests r
       LEFT JOIN user_profiles up ON up.user_id = r.recipient_user_id
       WHERE r.requester_user_id = $1 AND r.status = 'pending'
       ORDER BY r.created_at DESC`,
      [req.user.userId]
    );
    return res.json({ requests: rows });
  } catch (err) {
    logError("GET /requests/outgoing error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/requests/:id/accept", async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE user_dm_requests SET status = 'accepted', acted_at = now()
       WHERE id = $1 AND recipient_user_id = $2 AND status = 'pending'
       RETURNING *`,
      [req.params.id, req.user.userId]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Request not found or already handled" });

    const r = rows[0];
    const [ua, ub] = canonicalPair(r.requester_user_id, r.recipient_user_id);
    await db.query(
      `INSERT INTO user_dm_threads (user_a_id, user_b_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [ua, ub]
    );

    await audit({
      orgId: req.user.orgId, userId: req.user.userId,
      eventType: "dm.request.accept", resourceType: "dm_request",
      resourceId: r.id, metadata: { requesterId: r.requester_user_id }, req,
    });

    return res.json({ request: r });
  } catch (err) {
    logError("POST /requests/:id/accept error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/requests/:id/decline", async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE user_dm_requests SET status = 'declined', acted_at = now()
       WHERE id = $1 AND recipient_user_id = $2 AND status = 'pending'
       RETURNING *`,
      [req.params.id, req.user.userId]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Request not found or already handled" });

    await audit({
      orgId: req.user.orgId, userId: req.user.userId,
      eventType: "dm.request.decline", resourceType: "dm_request",
      resourceId: rows[0].id, metadata: { requesterId: rows[0].requester_user_id }, req,
    });

    return res.json({ request: rows[0] });
  } catch (err) {
    logError("POST /requests/:id/decline error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/requests/:id/block", async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE user_dm_requests SET status = 'blocked', acted_at = now()
       WHERE id = $1 AND recipient_user_id = $2 AND status = 'pending'
       RETURNING *`,
      [req.params.id, req.user.userId]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Request not found or already handled" });

    const r = rows[0];
    await db.query(
      `INSERT INTO user_dm_blocks (blocker_user_id, blocked_user_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.user.userId, r.requester_user_id]
    );

    await audit({
      orgId: req.user.orgId, userId: req.user.userId,
      eventType: "dm.request.block", resourceType: "dm_request",
      resourceId: r.id, metadata: { blockedUserId: r.requester_user_id }, req,
    });

    return res.json({ request: r });
  } catch (err) {
    logError("POST /requests/:id/block error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/requests/:id/cancel", async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE user_dm_requests SET status = 'cancelled', acted_at = now()
       WHERE id = $1 AND requester_user_id = $2 AND status = 'pending'
       RETURNING *`,
      [req.params.id, req.user.userId]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Request not found or already handled" });
    return res.json({ request: rows[0] });
  } catch (err) {
    logError("POST /requests/:id/cancel error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// THREADS & MESSAGES
// ══════════════════════════════════════════════════════════════════════════

router.get("/threads", async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await db.query(
      `SELECT t.*,
              CASE WHEN t.user_a_id = $1 THEN t.user_b_id ELSE t.user_a_id END AS other_user_id,
              up.handle AS other_handle,
              up.display_name AS other_display_name,
              ou.email AS other_email,
              ou.role AS other_role,
              (SELECT COUNT(*)::int FROM user_dm_messages m
               WHERE m.thread_id = t.id AND m.sender_user_id <> $1 AND m.read_at IS NULL) AS unread_count,
              lm.body_encrypted AS last_msg_encrypted,
              lm.sender_user_id AS last_msg_sender_id,
              lm.created_at AS last_msg_at
       FROM user_dm_threads t
       JOIN users ou ON ou.id = CASE WHEN t.user_a_id = $1 THEN t.user_b_id ELSE t.user_a_id END
                    AND ou.org_id = $2
       LEFT JOIN user_profiles up ON up.user_id = ou.id
       LEFT JOIN LATERAL (
         SELECT body_encrypted, sender_user_id, created_at
         FROM user_dm_messages
         WHERE thread_id = t.id
         ORDER BY created_at DESC LIMIT 1
       ) lm ON true
       WHERE t.user_a_id = $1 OR t.user_b_id = $1
       ORDER BY t.last_message_at DESC NULLS LAST, t.created_at DESC`,
      [userId, req.user.orgId]
    );

    const threads = rows.map((r) => {
      let last_msg_preview = null;
      if (r.last_msg_encrypted) {
        try {
          const full = decryptBody(r.last_msg_encrypted);
          last_msg_preview = full.length > 100 ? full.slice(0, 100) + "…" : full;
        } catch { /* ignore decrypt failures */ }
      }
      return {
        ...r,
        last_msg_preview,
        last_msg_is_mine: r.last_msg_sender_id === userId,
        last_msg_encrypted: undefined,
      };
    });

    return res.json({ threads });
  } catch (err) {
    logError("GET /threads error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/threads/:id/messages", async (req, res) => {
  try {
    const userId = req.user.userId;
    const threadId = req.params.id;

    // Verify membership
    const { rows: threads } = await db.query(
      `SELECT t.*
       FROM user_dm_threads t
       JOIN users ou ON ou.id = CASE WHEN t.user_a_id = $2 THEN t.user_b_id ELSE t.user_a_id END
                    AND ou.org_id = $3
       WHERE t.id = $1 AND (t.user_a_id = $2 OR t.user_b_id = $2)`,
      [threadId, userId, req.user.orgId]
    );
    if (threads.length === 0) return res.status(404).json({ message: "Thread not found" });

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const before = req.query.before;

    let msgQuery, msgParams;
    if (before) {
      msgQuery = `SELECT * FROM user_dm_messages WHERE thread_id = $1 AND created_at < $2
                   ORDER BY created_at DESC LIMIT $3`;
      msgParams = [threadId, before, limit];
    } else {
      msgQuery = `SELECT * FROM user_dm_messages WHERE thread_id = $1
                   ORDER BY created_at DESC LIMIT $2`;
      msgParams = [threadId, limit];
    }

    const { rows } = await db.query(msgQuery, msgParams);
    const messages = rows.reverse().map((m) => ({
      ...m,
      body: decryptBody(m.body_encrypted),
      body_encrypted: undefined,
    }));

    return res.json({ messages });
  } catch (err) {
    logError("GET /threads/:id/messages error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/threads/:id/messages", async (req, res) => {
  try {
    const userId = req.user.userId;
    const threadId = req.params.id;
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ message: "Message body required" });

    const { rows: threads } = await db.query(
      `SELECT t.*
       FROM user_dm_threads t
       JOIN users ou ON ou.id = CASE WHEN t.user_a_id = $2 THEN t.user_b_id ELSE t.user_a_id END
                    AND ou.org_id = $3
       WHERE t.id = $1 AND (t.user_a_id = $2 OR t.user_b_id = $2)`,
      [threadId, userId, req.user.orgId]
    );
    if (threads.length === 0) return res.status(404).json({ message: "Thread not found" });

    const thread = threads[0];
    const otherId = thread.user_a_id === userId ? thread.user_b_id : thread.user_a_id;

    if (await isBlocked(userId, otherId)) {
      return res.status(403).json({ message: "Cannot send message" });
    }

    const encrypted = encryptBody(body.trim());

    const { rows } = await db.query(
      `INSERT INTO user_dm_messages (thread_id, sender_user_id, body_encrypted)
       VALUES ($1, $2, $3) RETURNING *`,
      [threadId, userId, encrypted]
    );

    await db.query(
      "UPDATE user_dm_threads SET last_message_at = now() WHERE id = $1",
      [threadId]
    );

    await audit({
      orgId: req.user.orgId, userId,
      eventType: "team_chat.message.send", resourceType: "team_chat_message",
      resourceId: rows[0].id, metadata: { threadId, recipientId: otherId }, req,
    });

    return res.status(201).json({
      message: { ...rows[0], body: body.trim(), body_encrypted: undefined },
    });
  } catch (err) {
    logError("POST /threads/:id/messages error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/threads/:id/read", async (req, res) => {
  try {
    const userId = req.user.userId;
    const threadId = req.params.id;

    const { rows: threads } = await db.query(
      "SELECT 1 FROM user_dm_threads WHERE id = $1 AND (user_a_id = $2 OR user_b_id = $2)",
      [threadId, userId]
    );
    if (threads.length === 0) return res.status(404).json({ message: "Thread not found" });

    await db.query(
      `UPDATE user_dm_messages SET read_at = now()
       WHERE thread_id = $1 AND sender_user_id <> $2 AND read_at IS NULL`,
      [threadId, userId]
    );

    return res.json({ success: true });
  } catch (err) {
    logError("POST /threads/:id/read error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// BLOCKS
// ══════════════════════════════════════════════════════════════════════════

router.get("/blocks", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT b.*, up.handle AS blocked_handle, up.display_name AS blocked_display_name
       FROM user_dm_blocks b
       LEFT JOIN user_profiles up ON up.user_id = b.blocked_user_id
       WHERE b.blocker_user_id = $1
       ORDER BY b.created_at DESC`,
      [req.user.userId]
    );
    return res.json({ blocks: rows });
  } catch (err) {
    logError("GET /blocks error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/blocks", async (req, res) => {
  try {
    const { userId: blockedId } = req.body;
    if (!blockedId) return res.status(400).json({ message: "userId required" });
    if (blockedId === req.user.userId) return res.status(400).json({ message: "Cannot block yourself" });

    await db.query(
      `INSERT INTO user_dm_blocks (blocker_user_id, blocked_user_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.user.userId, blockedId]
    );

    // Cancel any pending requests between the pair
    await db.query(
      `UPDATE user_dm_requests SET status = 'blocked', acted_at = now()
       WHERE status = 'pending'
         AND ((requester_user_id = $1 AND recipient_user_id = $2)
           OR (requester_user_id = $2 AND recipient_user_id = $1))`,
      [req.user.userId, blockedId]
    );

    await audit({
      orgId: req.user.orgId, userId: req.user.userId,
      eventType: "dm.block.create", resourceType: "dm_block",
      resourceId: null, metadata: { blockedUserId: blockedId }, req,
    });

    return res.status(201).json({ success: true });
  } catch (err) {
    logError("POST /blocks error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.delete("/blocks/:userId", async (req, res) => {
  try {
    const blockedId = req.params.userId;
    await db.query(
      "DELETE FROM user_dm_blocks WHERE blocker_user_id = $1 AND blocked_user_id = $2",
      [req.user.userId, blockedId]
    );

    await audit({
      orgId: req.user.orgId, userId: req.user.userId,
      eventType: "dm.block.remove", resourceType: "dm_block",
      resourceId: null, metadata: { unblockedUserId: blockedId }, req,
    });

    return res.json({ success: true });
  } catch (err) {
    logError("DELETE /blocks/:userId error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
