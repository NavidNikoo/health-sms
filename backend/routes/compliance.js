const express = require("express");
const db = require("../db");
const { authenticate } = require("../middleware/auth");
const { getClient } = require("../twilio");

const router = express.Router();

// GET /status — current org compliance / 10DLC status
router.get("/status", authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT legal_name, ein, business_address, business_city,
              business_state, business_zip, brand_type,
              trust_product_sid, brand_registration_sid, brand_status,
              campaign_sid, campaign_status, messaging_service_sid
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
    });
  } catch (err) {
    console.error("Error fetching compliance status:", err);
    res.status(500).json({ message: "Failed to fetch compliance status" });
  }
});

// POST /brand — register brand for 10DLC
router.post("/brand", authenticate, async (req, res) => {
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
      console.error("Twilio brand registration error:", twilioErr);
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
    console.error("Error registering brand:", err);
    res.status(500).json({ message: err.message || "Brand registration failed" });
  }
});

// POST /campaign — register a messaging campaign under the org's brand
router.post("/campaign", authenticate, async (req, res) => {
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
    console.error("Error registering campaign:", err);
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
    console.error("Error refreshing compliance:", err);
    res.status(500).json({ message: "Failed to refresh status" });
  }
});

module.exports = router;
