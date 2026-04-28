const express = require("express");
const db = require("../db");
const { authenticate } = require("../middleware/auth");
const { sendSms } = require("../twilio");
const { audit } = require("../lib/auditLogger");
const { encryptBody, decryptBody } = require("../lib/phiCrypto");

const router = express.Router();

function getTwilioStatusCallbackUrl() {
  const baseUrl = process.env.BASE_URL?.replace(/\/+$/, "");
  if (!baseUrl) return null;
  return `${baseUrl}/api/webhooks/twilio/message-status`;
}

// Alias kept for backwards-compatible read paths
function decodeBody(enc) {
  return decryptBody(enc);
}

let collaborationSchemaReady = null;

async function ensureCollaborationSchema() {
  if (!collaborationSchemaReady) {
    collaborationSchemaReady = (async () => {
      await db.query(`
        ALTER TABLE conversations
          ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS conversation_internal_notes (
          id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
          body_encrypted      TEXT NOT NULL,
          mentioned_user_ids  UUID[] NOT NULL DEFAULT '{}',
          created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_internal_notes_conversation_created
          ON conversation_internal_notes (conversation_id, created_at DESC)
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_internal_notes_mentions
          ON conversation_internal_notes USING GIN (mentioned_user_ids)
      `);
    })();
  }
  return collaborationSchemaReady;
}

async function getConversationForOrg(conversationId, orgId) {
  await ensureCollaborationSchema();
  const result = await db.query(
    "SELECT id, org_id, assigned_to_user_id FROM conversations WHERE id = $1 AND org_id = $2",
    [conversationId, orgId]
  );
  return result.rows[0] || null;
}

function extractMentionHandles(body) {
  const handles = new Set();
  const re = /@([a-zA-Z0-9_]{3,30})/g;
  let match;
  while ((match = re.exec(body))) {
    handles.add(match[1].toLowerCase());
  }
  return [...handles];
}

async function resolveMentionedUserIds(handles, orgId) {
  if (handles.length === 0) return [];
  const { rows } = await db.query(
    `SELECT up.user_id
     FROM user_profiles up
     JOIN users u ON u.id = up.user_id
     WHERE u.org_id = $1 AND lower(up.handle) = ANY($2::text[])`,
    [orgId, handles]
  );
  return rows.map((r) => r.user_id);
}

router.get("/", authenticate, async (req, res) => {
  try {
    await ensureCollaborationSchema();
    const { q } = req.query;
    let whereExtra = "";
    const params = [req.user.orgId];

    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      // Message-body search is disabled because body_encrypted is now
      // AES-256-GCM ciphertext.  Search by patient name / phone only.
      whereExtra = ` AND (
        p.full_name ILIKE $2
        OR p.primary_phone ILIKE $2
      )`;
    }

    const matchSnippetSelect = "";

    const result = await db.query(
      `
      SELECT
        c.id, c.patient_id, c.phone_number_id, c.status, c.assigned_to_user_id, c.assigned_at, c.last_message_at, c.created_at,
        p.full_name AS patient_name, p.primary_phone AS patient_phone,
        pn.e164_number AS inbox_number,
        au.email AS assigned_to_email,
        aup.handle AS assigned_to_handle,
        aup.display_name AS assigned_to_display_name,
        (SELECT m.body_encrypted FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_body,
        (SELECT m.direction FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_direction
        ${matchSnippetSelect}
      FROM conversations c
      JOIN patients p ON p.id = c.patient_id
      JOIN phone_numbers pn ON pn.id = c.phone_number_id
      LEFT JOIN users au ON au.id = c.assigned_to_user_id
      LEFT JOIN user_profiles aup ON aup.user_id = au.id
      WHERE c.org_id = $1${whereExtra}
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
      LIMIT 50
      `,
      params
    );

    const conversations = result.rows.map((row) => ({
      id: row.id,
      patientId: row.patient_id,
      phoneNumberId: row.phone_number_id,
      status: row.status || "open",
      assignedToUserId: row.assigned_to_user_id,
      assignedAt: row.assigned_at,
      assignedTo: row.assigned_to_user_id
        ? {
            id: row.assigned_to_user_id,
            email: row.assigned_to_email,
            handle: row.assigned_to_handle,
            displayName: row.assigned_to_display_name,
          }
        : null,
      patientName: row.patient_name,
      patientPhone: row.patient_phone,
      inboxNumber: row.inbox_number,
      lastMessageAt: row.last_message_at,
      lastMessage: decodeBody(row.last_message_body) || "",
      lastMessageDirection: row.last_message_direction,
      matchedMessage: row.matched_message ? decodeBody(row.matched_message) : null,
      createdAt: row.created_at,
    }));

    res.json(conversations);
  } catch (err) {
    console.error("Error fetching conversations", err.message);
    res.status(500).json({ message: "Error fetching conversations" });
  }
});

router.post("/", authenticate, async (req, res) => {
  try {
    const { phoneNumber, phoneNumberId, body, patientName } = req.body;
    if (!phoneNumber || !phoneNumberId) {
      return res.status(400).json({ message: "phoneNumber and phoneNumberId are required" });
    }

    const normalized = phoneNumber.replace(/\D/g, "");
    const e164 = normalized.startsWith("1") ? `+${normalized}` : `+1${normalized}`;

    const pnCheck = await db.query(
      "SELECT id, e164_number, provider_sid, a2p_status FROM phone_numbers WHERE id = $1 AND org_id = $2",
      [phoneNumberId, req.user.orgId]
    );
    if (pnCheck.rows.length === 0) {
      return res.status(404).json({ message: "Phone number not found" });
    }

    let patientResult = await db.query(
      "SELECT id, full_name FROM patients WHERE org_id = $1 AND primary_phone = $2",
      [req.user.orgId, e164]
    );

    if (patientResult.rows.length === 0) {
      patientResult = await db.query(
        "INSERT INTO patients (org_id, full_name, primary_phone) VALUES ($1, $2, $3) RETURNING id, full_name",
        [req.user.orgId, patientName?.trim() || e164, e164]
      );
    }

    const patient = patientResult.rows[0];

    let convResult = await db.query(
      "SELECT id FROM conversations WHERE org_id = $1 AND patient_id = $2 AND phone_number_id = $3",
      [req.user.orgId, patient.id, phoneNumberId]
    );

    if (convResult.rows.length === 0) {
      convResult = await db.query(
        `INSERT INTO conversations (org_id, patient_id, phone_number_id, status, last_message_at)
         VALUES ($1, $2, $3, 'open', now()) RETURNING id`,
        [req.user.orgId, patient.id, phoneNumberId]
      );
    }

    const conversationId = convResult.rows[0].id;

    let message = null;
    if (body && body.trim()) {
      const pn = pnCheck.rows[0];

      // 10DLC gate: warn if this number hasn't been approved for A2P
      if (pn.a2p_status === "pending") {
        return res.status(403).json({
          message: "This number's 10DLC registration is still pending. SMS sending will be available once approved.",
        });
      }

      const fromNumber = pn.e164_number;
      const toNumber = e164;
      const bodyTrimmed = body.trim();
      let vendorMessageId = null;
      let status = "queued";

      if (pn.provider_sid && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        try {
          const { sid, status: providerStatus } = await sendSms(fromNumber, toNumber, bodyTrimmed, {
            statusCallback: getTwilioStatusCallbackUrl(),
          });
          vendorMessageId = sid;
          status = providerStatus === "failed" || providerStatus === "undelivered" ? "failed" : "queued";
        } catch (twilioErr) {
          console.error("Twilio send failed:", twilioErr.message);
          status = "failed";
        }
      }

      const encryptedBody = encryptBody(bodyTrimmed);

      const msgResult = await db.query(
        `INSERT INTO messages (conversation_id, direction, from_number, to_number, body_encrypted, status, sent_at, vendor_message_id)
         VALUES ($1, 'outbound', $2, $3, $4, $5, now(), $6)
         RETURNING id, direction, body_encrypted, status, sent_at, created_at`,
        [conversationId, fromNumber, toNumber, encryptedBody, status, vendorMessageId]
      );

      await db.query("UPDATE conversations SET last_message_at = now() WHERE id = $1", [conversationId]);
      message = msgResult.rows[0];
    }

    await audit({
      orgId: req.user.orgId,
      userId: req.user.userId,
      eventType: message ? "message.send" : "conversation.create",
      resourceType: message ? "message" : "conversation",
      resourceId: message?.id || conversationId,
      metadata: { conversationId, patientId: patient.id },
      req,
    });

    res.status(201).json({
      conversationId,
      patientId: patient.id,
      patientName: patient.full_name,
      message,
    });
  } catch (err) {
    console.error("Error creating conversation:", err.message);
    res.status(500).json({ message: "Error creating conversation" });
  }
});

router.get("/:id/messages", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const convCheck = await db.query(
      "SELECT id FROM conversations WHERE id = $1 AND org_id = $2",
      [id, req.user.orgId]
    );
    if (convCheck.rows.length === 0) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const result = await db.query(
      `SELECT id, direction, from_number, to_number, body_encrypted, status, sent_at, delivered_at, created_at
       FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [id]
    );

    const messages = result.rows.map((row) => ({
      id: row.id,
      direction: row.direction,
      fromNumber: row.from_number,
      toNumber: row.to_number,
      body: decodeBody(row.body_encrypted),
      status: row.status,
      sentAt: row.sent_at,
      deliveredAt: row.delivered_at,
      createdAt: row.created_at,
    }));

    res.json(messages);
  } catch (err) {
    console.error("Error fetching messages", err.message);
    res.status(500).json({ message: "Error fetching messages" });
  }
});

router.get("/:id/internal-notes", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const conversation = await getConversationForOrg(id, req.user.orgId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const result = await db.query(
      `SELECT n.id, n.conversation_id, n.created_by_user_id, n.body_encrypted,
              n.mentioned_user_ids, n.created_at,
              u.email AS created_by_email,
              up.handle AS created_by_handle,
              up.display_name AS created_by_display_name
       FROM conversation_internal_notes n
       LEFT JOIN users u ON u.id = n.created_by_user_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE n.conversation_id = $1 AND n.org_id = $2
       ORDER BY n.created_at ASC`,
      [id, req.user.orgId]
    );

    const notes = result.rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      createdByUserId: row.created_by_user_id,
      createdBy: {
        email: row.created_by_email,
        handle: row.created_by_handle,
        displayName: row.created_by_display_name,
      },
      body: decryptBody(row.body_encrypted),
      mentionedUserIds: row.mentioned_user_ids || [],
      mentionsMe: (row.mentioned_user_ids || []).includes(req.user.userId),
      createdAt: row.created_at,
    }));

    res.json(notes);
  } catch (err) {
    console.error("Error fetching internal notes", err.message);
    res.status(500).json({ message: "Error fetching internal notes" });
  }
});

router.post("/:id/internal-notes", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { body } = req.body;
    if (!body || typeof body !== "string" || !body.trim()) {
      return res.status(400).json({ message: "Note body is required" });
    }

    const conversation = await getConversationForOrg(id, req.user.orgId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const bodyTrimmed = body.trim();
    const mentionHandles = extractMentionHandles(bodyTrimmed);
    const mentionedUserIds = await resolveMentionedUserIds(mentionHandles, req.user.orgId);
    const encryptedBody = encryptBody(bodyTrimmed);

    const result = await db.query(
      `INSERT INTO conversation_internal_notes
         (org_id, conversation_id, created_by_user_id, body_encrypted, mentioned_user_ids)
       VALUES ($1, $2, $3, $4, $5::uuid[])
       RETURNING id, conversation_id, created_by_user_id, body_encrypted, mentioned_user_ids, created_at`,
      [req.user.orgId, id, req.user.userId, encryptedBody, mentionedUserIds]
    );

    await audit({
      orgId: req.user.orgId,
      userId: req.user.userId,
      eventType: "internal_note.create",
      resourceType: "conversation_internal_note",
      resourceId: result.rows[0].id,
      metadata: { conversationId: id, mentionCount: mentionedUserIds.length },
      req,
    });

    const userResult = await db.query(
      `SELECT u.email, up.handle, up.display_name
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = $1`,
      [req.user.userId]
    );
    const createdBy = userResult.rows[0] || {};
    const row = result.rows[0];

    res.status(201).json({
      id: row.id,
      conversationId: row.conversation_id,
      createdByUserId: row.created_by_user_id,
      createdBy: {
        email: createdBy.email,
        handle: createdBy.handle,
        displayName: createdBy.display_name,
      },
      body: decryptBody(row.body_encrypted),
      mentionedUserIds: row.mentioned_user_ids || [],
      mentionsMe: (row.mentioned_user_ids || []).includes(req.user.userId),
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error("Error creating internal note", err.message);
    res.status(500).json({ message: "Error creating internal note" });
  }
});

router.post("/:id/messages", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { body } = req.body;
    if (!body || typeof body !== "string" || !body.trim()) {
      return res.status(400).json({ message: "Message body is required" });
    }

    const convResult = await db.query(
      `SELECT c.id, c.patient_id, c.phone_number_id, p.primary_phone,
              pn.e164_number, pn.provider_sid, pn.a2p_status
       FROM conversations c
       JOIN patients p ON p.id = c.patient_id
       JOIN phone_numbers pn ON pn.id = c.phone_number_id
       WHERE c.id = $1 AND c.org_id = $2`,
      [id, req.user.orgId]
    );
    if (convResult.rows.length === 0) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const conv = convResult.rows[0];

    if (conv.a2p_status === "pending") {
      return res.status(403).json({
        message: "This number's 10DLC registration is still pending. SMS sending will be available once approved.",
      });
    }

    const fromNumber = conv.e164_number;
    const toNumber = conv.primary_phone;
    const bodyTrimmed = body.trim();
    const providerSid = conv.provider_sid;

      let vendorMessageId = null;
      let status = "queued";

    if (providerSid && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
          const { sid, status: providerStatus } = await sendSms(fromNumber, toNumber, bodyTrimmed, {
            statusCallback: getTwilioStatusCallbackUrl(),
          });
        vendorMessageId = sid;
          status = providerStatus === "failed" || providerStatus === "undelivered" ? "failed" : "queued";
      } catch (twilioErr) {
        console.error("Twilio send failed:", twilioErr.message);
        status = "failed";
      }
    }

    const encryptedBody = encryptBody(bodyTrimmed);

    const msgResult = await db.query(
      `INSERT INTO messages (conversation_id, direction, from_number, to_number, body_encrypted, status, sent_at, vendor_message_id)
       VALUES ($1, 'outbound', $2, $3, $4, $5, now(), $6)
       RETURNING id, direction, from_number, to_number, body_encrypted, status, sent_at, created_at`,
      [id, fromNumber, toNumber, encryptedBody, status, vendorMessageId]
    );

    await db.query("UPDATE conversations SET last_message_at = now() WHERE id = $1", [id]);

    const row = msgResult.rows[0];

    await audit({
      orgId: req.user.orgId,
      userId: req.user.userId,
      eventType: "message.send",
      resourceType: "message",
      resourceId: row.id,
      metadata: { conversationId: id, status },
      req,
    });

    res.status(201).json({
      id: row.id,
      direction: row.direction,
      fromNumber: row.from_number,
      toNumber: row.to_number,
      body: decryptBody(row.body_encrypted),
      status: row.status,
      sentAt: row.sent_at,
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error("Error sending message:", err.message);
    res.status(500).json({ message: "Error sending message" });
  }
});

router.patch("/:id", authenticate, async (req, res) => {
  try {
    await ensureCollaborationSchema();
    const { status, assignedToUserId } = req.body;
    const allowed = ["open", "closed"];
    if (status !== undefined && !allowed.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${allowed.join(", ")}` });
    }
    if (status === undefined && assignedToUserId === undefined) {
      return res.status(400).json({ message: "No conversation updates provided" });
    }

    let assignee = null;
    if (assignedToUserId) {
      const assigneeResult = await db.query(
        `SELECT u.id, u.email, up.handle, up.display_name
         FROM users u
         LEFT JOIN user_profiles up ON up.user_id = u.id
         WHERE u.id = $1 AND u.org_id = $2`,
        [assignedToUserId, req.user.orgId]
      );
      if (assigneeResult.rows.length === 0) {
        return res.status(400).json({ message: "Assignee must be a user in your organization" });
      }
      assignee = assigneeResult.rows[0];
    }

    const result = await db.query(
      `UPDATE conversations
       SET status = COALESCE($1, status),
           assigned_to_user_id = CASE WHEN $2::boolean THEN $3::uuid ELSE assigned_to_user_id END,
           assigned_at = CASE WHEN $2::boolean THEN CASE WHEN $3::uuid IS NULL THEN NULL ELSE now() END ELSE assigned_at END
       WHERE id = $4 AND org_id = $5
       RETURNING id, status, assigned_to_user_id, assigned_at`,
      [status || null, assignedToUserId !== undefined, assignedToUserId || null, req.params.id, req.user.orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (assignedToUserId !== undefined) {
      await audit({
        orgId: req.user.orgId,
        userId: req.user.userId,
        eventType: "conversation.assign",
        resourceType: "conversation",
        resourceId: req.params.id,
        metadata: { assignedToUserId: assignedToUserId || null },
        req,
      });
    }

    if (status !== undefined) {
      await audit({
        orgId: req.user.orgId,
        userId: req.user.userId,
        eventType: "conversation.status.update",
        resourceType: "conversation",
        resourceId: req.params.id,
        metadata: { status },
        req,
      });
    }

    let assignedTo = assignee;
    if (!assignedTo && result.rows[0].assigned_to_user_id) {
      const assignedResult = await db.query(
        `SELECT u.id, u.email, up.handle, up.display_name
         FROM users u
         LEFT JOIN user_profiles up ON up.user_id = u.id
         WHERE u.id = $1`,
        [result.rows[0].assigned_to_user_id]
      );
      assignedTo = assignedResult.rows[0] || null;
    }

    res.json({
      id: result.rows[0].id,
      status: result.rows[0].status,
      assignedToUserId: result.rows[0].assigned_to_user_id,
      assignedAt: result.rows[0].assigned_at,
      assignedTo: assignedTo
        ? {
            id: assignedTo.id,
            email: assignedTo.email,
            handle: assignedTo.handle,
            displayName: assignedTo.display_name,
          }
        : null,
    });
  } catch (err) {
    console.error("Error updating conversation", err.message);
    res.status(500).json({ message: "Error updating conversation" });
  }
});

module.exports = router;
