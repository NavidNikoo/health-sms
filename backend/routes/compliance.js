const express = require("express");
const db = require("../db");
const { authenticate } = require("../middleware/auth");
const { getClient } = require("../twilio");
const { audit } = require("../lib/auditLogger");
const { requireAdmin } = require("../middleware/billing");
const {
  purgeOrg,
  deletePatient,
  DEFAULT_RETENTION_DAYS,
} = require("../lib/retention");

const router = express.Router();

function purchasesAllowed() {
  const v = String(process.env.ALLOW_TWILIO_PURCHASES || "").trim().toLowerCase();
  return v === "true" || v === "1";
}

// GET /status — current org compliance / 10DLC / billing status
router.get("/status", authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT legal_name, ein, business_address, business_city,
              business_state, business_zip, brand_type,
              trust_product_sid, brand_registration_sid, brand_status,
              campaign_sid, campaign_status, messaging_service_sid,
              billing_enabled, billing_plan
       FROM organizations WHERE id = $1`,
      [req.user.orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Organization not found" });
    }

    const org = result.rows[0];
    res.json({
      legalName: org.legal_name,
      ein: org.ein,
      brandType: org.brand_type,
      brandRegistrationSid: org.brand_registration_sid,
      brandStatus: org.brand_status,
      campaignSid: org.campaign_sid,
      campaignStatus: org.campaign_status,
      messagingServiceSid: org.messaging_service_sid,
      hasRegistration: !!(org.brand_registration_sid || org.brand_status),
      billingEnabled: !!org.billing_enabled,
      billingPlan: org.billing_plan,
      twilioPurchasesAllowed: purchasesAllowed(),
    });
  } catch (err) {
    console.error("Error fetching compliance status:", err.message);
    res.status(500).json({ message: "Failed to fetch compliance status" });
  }
});

// PATCH /billing — admin-only billing enable/disable for the current org
router.patch("/billing", authenticate, requireAdmin, async (req, res) => {
  try {
    const { enabled, plan, notes } = req.body || {};
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "`enabled` must be true or false" });
    }

    const result = await db.query(
      `UPDATE organizations
         SET billing_enabled = $1,
             billing_plan = COALESCE($2, billing_plan),
             billing_notes = COALESCE($3, billing_notes)
       WHERE id = $4
       RETURNING billing_enabled, billing_plan`,
      [enabled, plan ?? null, notes ?? null, req.user.orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Organization not found" });
    }

    await audit({
      orgId: req.user.orgId,
      userId: req.user.userId,
      eventType: enabled ? "billing.enabled" : "billing.disabled",
      resourceType: "organization",
      resourceId: req.user.orgId,
      metadata: { plan: plan ?? null },
      req,
    });

    const row = result.rows[0];
    res.json({
      billingEnabled: !!row.billing_enabled,
      billingPlan: row.billing_plan,
    });
  } catch (err) {
    console.error("Error updating billing flag:", err.message);
    res.status(500).json({ message: "Failed to update billing flag" });
  }
});

// POST /brand — register brand for 10DLC (admin only; incurs Twilio fees)
router.post("/brand", authenticate, requireAdmin, async (req, res) => {
  const client = getClient();
  if (!client) {
    return res.status(503).json({ message: "Twilio not configured." });
  }

  const { legalName, ein, address, city, state, zip, brandType } = req.body;
  if (!legalName || !ein) {
    return res.status(400).json({ message: "Business name and EIN are required" });
  }

  try {
    // Save business info to organizations
    await db.query(
      `UPDATE organizations
       SET legal_name = $1, ein = $2, business_address = $3,
           business_city = $4, business_state = $5, business_zip = $6,
           brand_type = $7
       WHERE id = $8`,
      [legalName, ein, address || null, city || null, state || null, zip || null, brandType || "SOLE_PROPRIETOR", req.user.orgId]
    );

    let brandSid = null;
    let brandStatus = "PENDING";

    try {
      // Step 1: Create a TrustHub Customer Profile
      const customerProfile = await client.trusthub.v1.customerProfiles.create({
        friendlyName: `${legalName} - Health SMS`,
        policySid: "RNdfbf3fae0e1107f8abad0571f5833516", // A2P Messaging Policy SID (standard)
        email: req.user.email || "compliance@healthsms.com",
      });

      // Step 2: Create End-User of type "customer_profile_business_information"
      const endUser = await client.trusthub.v1.endUsers.create({
        friendlyName: legalName,
        type: "customer_profile_business_information",
        attributes: {
          business_name: legalName,
          business_identity: brandType === "SOLE_PROPRIETOR" ? "direct_customer" : "direct_customer",
          business_type: brandType === "SOLE_PROPRIETOR" ? "Sole Proprietorship" : "Corporation",
          business_registration_number: ein,
          business_regions_of_operation: "USA_AND_CANADA",
          social_media_profile_urls: "",
          website_url: "",
          business_registration_identifier: "EIN",
        },
      });

      // Step 3: Attach End-User to Customer Profile
      await client.trusthub.v1
        .customerProfiles(customerProfile.sid)
        .customerProfilesEntityAssignments.create({
          objectSid: endUser.sid,
        });

      // Step 4: Submit the Customer Profile for review
      await client.trusthub.v1
        .customerProfiles(customerProfile.sid)
        .update({ status: "pending-review" });

      // Step 5: Register the A2P brand
      const brand = await client.messaging.v1.a2p.brandRegistrations.create({
        customerProfileBundleSid: customerProfile.sid,
        brandType: brandType === "SOLE_PROPRIETOR" ? "SOLE_PROPRIETOR" : "STANDARD",
      });

      brandSid = brand.sid;
      brandStatus = brand.status || "PENDING";

      await db.query(
        `UPDATE organizations
         SET trust_product_sid = $1, brand_registration_sid = $2, brand_status = $3
         WHERE id = $4`,
        [customerProfile.sid, brandSid, brandStatus, req.user.orgId]
      );
    } catch (twilioErr) {
      console.error("Twilio brand registration error:", twilioErr.message);
      // Save as pending even if Twilio API fails — can retry
      await db.query(
        `UPDATE organizations SET brand_status = 'PENDING' WHERE id = $1`,
        [req.user.orgId]
      );
    }

    res.status(201).json({
      brandSid,
      brandStatus,
      message: brandStatus === "APPROVED"
        ? "Brand approved! You can now register a campaign."
        : "Brand registration submitted. Review usually takes 1-2 weeks.",
    });
  } catch (err) {
    console.error("Error registering brand:", err.message);
    res.status(500).json({ message: err.message || "Brand registration failed" });
  }
});

// POST /campaign — register a messaging campaign (admin only; incurs Twilio fees)
router.post("/campaign", authenticate, requireAdmin, async (req, res) => {
  const client = getClient();
  if (!client) {
    return res.status(503).json({ message: "Twilio not configured." });
  }

  const { description, useCase } = req.body;

  try {
    const orgResult = await db.query(
      `SELECT brand_registration_sid, brand_status, messaging_service_sid, name
       FROM organizations WHERE id = $1`,
      [req.user.orgId]
    );
    const org = orgResult.rows[0];

    if (!org?.brand_registration_sid) {
      return res.status(400).json({ message: "Register your brand first" });
    }

    if (org.brand_status !== "APPROVED") {
      return res.status(400).json({
        message: "Your brand registration is still pending. Campaign creation requires an approved brand.",
      });
    }

    // Ensure a Messaging Service exists for this org
    let msid = org.messaging_service_sid;
    if (!msid) {
      const ms = await client.messaging.v1.services.create({
        friendlyName: `${org.name} - Health SMS`,
        inboundRequestUrl: process.env.BASE_URL
          ? `${process.env.BASE_URL}/api/webhooks/twilio/sms`
          : undefined,
      });
      msid = ms.sid;
      await db.query(
        "UPDATE organizations SET messaging_service_sid = $1 WHERE id = $2",
        [msid, req.user.orgId]
      );
    }

    // Create the campaign (use case registration)
    const campaign = await client.messaging.v1.services(msid)
      .usAppToPersonUsecases.create({
        brandRegistrationSid: org.brand_registration_sid,
        description: description || "Patient appointment reminders and healthcare communication",
        messageFlow: "Patients opt-in during registration. They can reply STOP at any time.",
        messageSamples: [
          "Hi [Name], this is a reminder of your appointment on [Date] at [Time]. Reply Y to confirm or call us to reschedule.",
          "Your lab results are ready. Please call our office to discuss. Reply STOP to opt out.",
        ],
        usAppToPersonUsecase: useCase || "MIXED",
        hasEmbeddedLinks: false,
        hasEmbeddedPhone: true,
      });

    const campaignSid = campaign.sid || campaign.messagingCampaignSid;
    const campaignStatus = campaign.campaignStatus || "PENDING";

    await db.query(
      `UPDATE organizations SET campaign_sid = $1, campaign_status = $2 WHERE id = $3`,
      [campaignSid, campaignStatus, req.user.orgId]
    );

    // Associate all org numbers with the messaging service
    const numbers = await db.query(
      "SELECT provider_sid FROM phone_numbers WHERE org_id = $1 AND provider_sid IS NOT NULL",
      [req.user.orgId]
    );
    for (const row of numbers.rows) {
      try {
        await client.messaging.v1
          .services(msid)
          .phoneNumbers.create({ phoneNumberSid: row.provider_sid });

        await db.query(
          "UPDATE phone_numbers SET a2p_status = 'pending' WHERE provider_sid = $1",
          [row.provider_sid]
        );
      } catch (assocErr) {
        console.error(`Failed to associate ${row.provider_sid} with messaging service:`, assocErr.message);
      }
    }

    res.status(201).json({
      campaignSid,
      campaignStatus,
      messagingServiceSid: msid,
      message: campaignStatus === "APPROVED"
        ? "Campaign approved! Your numbers are ready for SMS."
        : "Campaign submitted for review. Usually takes a few days.",
    });
  } catch (err) {
    console.error("Error registering campaign:", err.message);
    res.status(500).json({ message: err.message || "Campaign registration failed" });
  }
});

// POST /refresh — poll Twilio for updated brand/campaign status
router.post("/refresh", authenticate, async (req, res) => {
  const client = getClient();
  if (!client) {
    return res.status(503).json({ message: "Twilio not configured." });
  }

  try {
    const orgResult = await db.query(
      "SELECT brand_registration_sid, campaign_sid, messaging_service_sid FROM organizations WHERE id = $1",
      [req.user.orgId]
    );
    const org = orgResult.rows[0];
    if (!org) return res.status(404).json({ message: "Organization not found" });

    let brandStatus = null;
    let campaignStatus = null;

    if (org.brand_registration_sid) {
      try {
        const brand = await client.messaging.v1.a2p
          .brandRegistrations(org.brand_registration_sid)
          .fetch();
        brandStatus = brand.status;
        await db.query(
          "UPDATE organizations SET brand_status = $1 WHERE id = $2",
          [brandStatus, req.user.orgId]
        );
      } catch (e) {
        console.error("Brand status refresh failed:", e.message);
      }
    }

    if (org.campaign_sid && org.messaging_service_sid) {
      try {
        const campaigns = await client.messaging.v1
          .services(org.messaging_service_sid)
          .usAppToPersonUsecases.list();
        const match = campaigns.find((c) => c.sid === org.campaign_sid);
        if (match) {
          campaignStatus = match.campaignStatus;
          await db.query(
            "UPDATE organizations SET campaign_status = $1 WHERE id = $2",
            [campaignStatus, req.user.orgId]
          );
        }
      } catch (e) {
        console.error("Campaign status refresh failed:", e.message);
      }
    }

    res.json({ brandStatus, campaignStatus });
  } catch (err) {
    console.error("Error refreshing compliance:", err.message);
    res.status(500).json({ message: "Failed to refresh status" });
  }
});

// ─── Retention / right-to-erasure ────────────────────────────────────────────

// GET /retention — current retention policy + dry-run preview
router.get("/retention", authenticate, requireAdmin, async (req, res) => {
  try {
    const days = req.query.days ? Number(req.query.days) : DEFAULT_RETENTION_DAYS;
    const safeDays = Math.max(1, Math.min(3650, Math.floor(days || DEFAULT_RETENTION_DAYS)));

    const counts = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM messages m
            JOIN conversations c ON c.id = m.conversation_id
            WHERE c.org_id = $1 AND m.created_at < now() - ($2 || ' days')::interval) AS messages_to_delete,
         (SELECT COUNT(*) FROM conversation_internal_notes
            WHERE org_id = $1 AND created_at < now() - ($2 || ' days')::interval) AS notes_to_delete,
         (SELECT COUNT(*) FROM messages m
            JOIN conversations c ON c.id = m.conversation_id
            WHERE c.org_id = $1) AS total_messages,
         (SELECT COUNT(*) FROM conversation_internal_notes
            WHERE org_id = $1) AS total_notes,
         (SELECT COUNT(*) FROM patients WHERE org_id = $1) AS total_patients`,
      [req.user.orgId, safeDays]
    );

    res.json({
      retentionDays: safeDays,
      defaultRetentionDays: DEFAULT_RETENTION_DAYS,
      preview: {
        messagesToDelete: Number(counts.rows[0].messages_to_delete),
        notesToDelete: Number(counts.rows[0].notes_to_delete),
        totalMessages: Number(counts.rows[0].total_messages),
        totalNotes: Number(counts.rows[0].total_notes),
        totalPatients: Number(counts.rows[0].total_patients),
      },
    });
  } catch (err) {
    console.error("Retention preview error:", err.message);
    res.status(500).json({ message: "Failed to load retention preview" });
  }
});

// POST /retention/purge — run the org-scoped retention purge
router.post("/retention/purge", authenticate, requireAdmin, async (req, res) => {
  try {
    const days = req.body?.days ?? req.query.days ?? DEFAULT_RETENTION_DAYS;
    const result = await purgeOrg({ orgId: req.user.orgId, days });

    await audit({
      orgId: req.user.orgId,
      userId: req.user.userId,
      eventType: "retention.purge",
      resourceType: "organization",
      resourceId: req.user.orgId,
      metadata: {
        retentionDays: result.retentionDays,
        deletedMessages: result.deletedMessages,
        deletedInternalNotes: result.deletedInternalNotes,
        deletedPatients: result.deletedPatients,
      },
      req,
    });

    res.json(result);
  } catch (err) {
    console.error("Retention purge error:", err.message);
    res.status(500).json({ message: "Retention purge failed" });
  }
});

// DELETE /patient/:id — right-to-erasure for a single patient
router.delete("/patient/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await deletePatient({
      orgId: req.user.orgId,
      patientId: req.params.id,
    });

    await audit({
      orgId: req.user.orgId,
      userId: req.user.userId,
      eventType: `patient.${result.outcome}`,
      resourceType: "patient",
      resourceId: result.patientId,
      req,
    });

    res.json(result);
  } catch (err) {
    if (err.code === "patient_not_found") {
      return res.status(404).json({ message: "Patient not found" });
    }
    console.error("Patient erasure error:", err.message);
    res.status(500).json({ message: "Failed to remove patient" });
  }
});

module.exports = router;
