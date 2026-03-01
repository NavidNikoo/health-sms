// Simple API helpers. These call the real backend when available.

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

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

