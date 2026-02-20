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
  if (!res.ok) throw new Error("Failed to fetch phone numbers");
  return res.json();
}

