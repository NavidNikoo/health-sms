// Simple API helpers. These call the real backend when available.

import { API_BASE } from "./apiBase";

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    let message = "Login failed";
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}

export async function signup({ orgName, email, password }) {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgName, email, password }),
  });
  if (!res.ok) {
    let message = "Signup failed";
    try { const data = await res.json(); if (data?.message) message = data.message; } catch { /* ignore */ }
    throw new Error(message);
  }
  return res.json();
}

export async function getMe(token) {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Not authenticated");
  return res.json();
}

export async function getPatients(token, search) {
  const qs = search ? `?q=${encodeURIComponent(search)}` : "";
  const res = await fetch(`${API_BASE}/patients${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch patients");
  return res.json();
}

export async function getPatient(token, id) {
  const res = await fetch(`${API_BASE}/patients/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch patient");
  return res.json();
}

export async function createPatient(token, data) {
  const res = await fetch(`${API_BASE}/patients`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to create patient");
  }
  return res.json();
}

export async function updatePatient(token, id, data) {
  const res = await fetch(`${API_BASE}/patients/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to update patient");
  }
  return res.json();
}

export async function deletePatient(token, id) {
  const res = await fetch(`${API_BASE}/patients/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to delete patient");
  }
  return res.json();
}

export async function getConversations(token, search) {
  const qs = search ? `?q=${encodeURIComponent(search)}` : "";
  const res = await fetch(`${API_BASE}/conversations${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch conversations");
  return res.json();
}

export async function getMessages(token, conversationId) {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch messages");
  return res.json();
}

export async function sendMessage(token, conversationId, body) {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Failed to send message");
  }
  return res.json();
}

export async function getInternalNotes(token, conversationId) {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/internal-notes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to fetch internal notes");
  }
  return res.json();
}

export async function createInternalNote(token, conversationId, body) {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/internal-notes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to create internal note");
  }
  return res.json();
}

export async function createConversation(token, { phoneNumber, phoneNumberId, body, patientName }) {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber, phoneNumberId, body, patientName }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Failed to create conversation");
  }
  return res.json();
}

export async function getTemplates(token) {
  const res = await fetch(`${API_BASE}/templates`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch templates");
  return res.json();
}

export async function createTemplate(token, data) {
  const res = await fetch(`${API_BASE}/templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to create template");
  }
  return res.json();
}

export async function updateTemplate(token, id, data) {
  const res = await fetch(`${API_BASE}/templates/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to update template");
  }
  return res.json();
}

export async function deleteTemplate(token, id) {
  const res = await fetch(`${API_BASE}/templates/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to delete template");
  }
  return res.json();
}

export async function updateConversation(token, id, data) {
  const res = await fetch(`${API_BASE}/conversations/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to update conversation");
  }
  return res.json();
}

export async function getPhoneNumbers(token) {
  const res = await fetch(`${API_BASE}/phone-numbers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    const msg = d?.message || (res.status === 401 ? "Session expired. Please log out and log back in." : "Failed to fetch phone numbers.");
    throw new Error(msg);
  }
  return res.json();
}

export async function getPhoneNumberDebug(token, id) {
  const res = await fetch(`${API_BASE}/phone-numbers/${id}/debug`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to fetch debug info");
  }
  return res.json();
}

export async function getAvailableNumbers(token, areaCode) {
  const res = await fetch(
    `${API_BASE}/phone-numbers/available?areaCode=${encodeURIComponent(areaCode)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to search available numbers");
  }
  return res.json();
}

export async function provisionPhoneNumber(
  token,
  { phoneNumber, label, callForwardTo, callForwardAuthorizedNumberId, callMode }
) {
  const res = await fetch(`${API_BASE}/phone-numbers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber, label, callForwardTo, callForwardAuthorizedNumberId, callMode }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to provision number");
  }
  return res.json();
}

export async function updatePhoneNumber(
  token,
  id,
  { label, callForwardTo, callForwardAuthorizedNumberId, callMode }
) {
  const res = await fetch(`${API_BASE}/phone-numbers/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ label, callForwardTo, callForwardAuthorizedNumberId, callMode }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    const msg = d?.message || `Failed to update phone number (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

export async function deletePhoneNumber(token, id) {
  const res = await fetch(`${API_BASE}/phone-numbers/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to delete phone number");
  }
  return res.json();
}

export async function getAuthorizedForwardNumbers(token) {
  const res = await fetch(`${API_BASE}/authorized-forward-numbers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to fetch authorized numbers");
  }
  return res.json();
}

export async function createAuthorizedForwardNumber(token, { phoneNumber, label }) {
  const res = await fetch(`${API_BASE}/authorized-forward-numbers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber, label }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to authorize number");
  }
  return res.json();
}

// ── Hook up existing (Phase 2) ──

export async function getTwilioOwnedNumbers(token) {
  const res = await fetch(`${API_BASE}/phone-numbers/twilio-owned`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to load Twilio numbers");
  }
  return res.json();
}

export async function claimPhoneNumber(token, { providerSid, label }) {
  const res = await fetch(`${API_BASE}/phone-numbers/claim`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ providerSid, label }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to claim number");
  }
  return res.json();
}

// ── Porting (Phase 3) ──

export async function checkPortability(token, phoneNumber) {
  const res = await fetch(
    `${API_BASE}/porting/check?phoneNumber=${encodeURIComponent(phoneNumber)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Portability check failed");
  }
  return res.json();
}

export async function createPortRequest(token, data) {
  const res = await fetch(`${API_BASE}/porting/request`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to submit port request");
  }
  return res.json();
}

export async function getPortRequests(token) {
  const res = await fetch(`${API_BASE}/porting/requests`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to fetch port requests");
  }
  return res.json();
}

// ── 10DLC Compliance (Phase 4) ──

export async function getOrgCompliance(token) {
  const res = await fetch(`${API_BASE}/compliance/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to fetch compliance status");
  }
  return res.json();
}

export async function submitBrandRegistration(token, data) {
  const res = await fetch(`${API_BASE}/compliance/brand`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Brand registration failed");
  }
  return res.json();
}

export async function submitCampaignRegistration(token, data) {
  const res = await fetch(`${API_BASE}/compliance/campaign`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Campaign registration failed");
  }
  return res.json();
}

export async function getVoiceToken(token) {
  const res = await fetch(`${API_BASE}/voice/token`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Voice calling not configured");
  }
  return res.json();
}

export async function initiateCall(token, { to, fromPhoneNumberId }) {
  const res = await fetch(`${API_BASE}/voice/call`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to, fromPhoneNumberId }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to initiate call");
  }
  return res.json();
}

export async function cancelCall(token, callSid) {
  const res = await fetch(`${API_BASE}/voice/call/${callSid}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to cancel call");
  }
  return res.json();
}

// ── Org Users ──

export async function getOrgUsers(token) {
  const res = await fetch(`${API_BASE}/users/org`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to fetch org users");
  }
  return res.json();
}

export async function removeOrgUser(token, userId) {
  const res = await fetch(`${API_BASE}/users/org/${userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to remove user");
  }
  return res.json();
}

// ── Org Invites (admin-only create/list/revoke, public accept) ──

export async function createOrgInvite(token, { email, role }) {
  const res = await fetch(`${API_BASE}/users/invites`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, role }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to create invite");
  }
  return res.json();
}

export async function getOrgInvites(token) {
  const res = await fetch(`${API_BASE}/users/invites`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to load invites");
  }
  return res.json();
}

export async function revokeOrgInvite(token, id) {
  const res = await fetch(`${API_BASE}/users/invites/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to revoke invite");
  }
  return res.json();
}

export async function getInvitePreview(inviteToken) {
  const res = await fetch(`${API_BASE}/auth/invites/${encodeURIComponent(inviteToken)}`);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Invalid invite");
  }
  return res.json();
}

export async function getMyInvites(token) {
  const res = await fetch(`${API_BASE}/users/my-invites`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to load invites");
  }
  return res.json();
}

export async function acceptMyInvite(token, id) {
  const res = await fetch(`${API_BASE}/users/my-invites/${id}/accept`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to accept invite");
  }
  return res.json();
}

export async function declineMyInvite(token, id) {
  const res = await fetch(`${API_BASE}/users/my-invites/${id}/decline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to decline invite");
  }
  return res.json();
}

export async function acceptInvite({ token, password }) {
  const res = await fetch(`${API_BASE}/auth/accept-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Failed to accept invite");
  }
  return res.json();
}

// ── Team Chat (internal user-to-user messages) ──

async function dmFetch(token, path, opts = {}) {
  const res = await fetch(`${API_BASE}/user-messages${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...opts.headers },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || "Request failed");
  }
  return res.json();
}

export const getDMProfile = (token) => dmFetch(token, "/profile/me");
export const updateDMProfile = (token, data) => dmFetch(token, "/profile/me", { method: "PATCH", body: JSON.stringify(data) });
export const resolveUser = (token, id) => dmFetch(token, `/resolve/${encodeURIComponent(id)}`);

export const sendDMRequest = (token, handleOrId) => dmFetch(token, "/requests", { method: "POST", body: JSON.stringify({ handleOrId }) });
export const getIncomingRequests = (token) => dmFetch(token, "/requests/incoming");
export const getOutgoingRequests = (token) => dmFetch(token, "/requests/outgoing");
export const acceptDMRequest = (token, id) => dmFetch(token, `/requests/${id}/accept`, { method: "POST" });
export const declineDMRequest = (token, id) => dmFetch(token, `/requests/${id}/decline`, { method: "POST" });
export const blockDMRequest = (token, id) => dmFetch(token, `/requests/${id}/block`, { method: "POST" });
export const cancelDMRequest = (token, id) => dmFetch(token, `/requests/${id}/cancel`, { method: "POST" });

export const getDMThreads = (token) => dmFetch(token, "/threads");
export const getDMMessages = (token, threadId) => dmFetch(token, `/threads/${threadId}/messages`);
export const sendDMMessage = (token, threadId, body) => dmFetch(token, `/threads/${threadId}/messages`, { method: "POST", body: JSON.stringify({ body }) });
export const markDMThreadRead = (token, threadId) => dmFetch(token, `/threads/${threadId}/read`, { method: "POST" });

export const getDMBlocks = (token) => dmFetch(token, "/blocks");
export const createDMBlock = (token, userId) => dmFetch(token, "/blocks", { method: "POST", body: JSON.stringify({ userId }) });
export const removeDMBlock = (token, userId) => dmFetch(token, `/blocks/${userId}`, { method: "DELETE" });

