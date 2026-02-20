import { useState, useEffect } from "react";
import { createConversation } from "../utils/api";
import "./NewConversationModal.css";

function formatPhone(e164) {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return e164;
}

export function NewConversationModal({ token, inboxes = [], onClose, onCreated, initialPhone = "", initialName = "" }) {
  const [phoneNumber, setPhoneNumber] = useState(initialPhone);
  const [patientName, setPatientName] = useState(initialName);
  const [message, setMessage] = useState("");
  const [selectedInboxId, setSelectedInboxId] = useState(inboxes[0]?.id || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!selectedInboxId && inboxes.length > 0) {
      setSelectedInboxId(inboxes[0].id);
    }
  }, [inboxes, selectedInboxId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const digits = phoneNumber.replace(/\D/g, "");
    if (digits.length < 10) {
      setError("Enter a valid phone number");
      return;
    }
    if (!selectedInboxId) {
      setError("Select an inbox");
      return;
    }

    setSending(true);
    setError(null);
    try {
      const result = await createConversation(token, {
        phoneNumber: digits,
        phoneNumberId: selectedInboxId,
        body: message.trim() || undefined,
        patientName: patientName.trim() || undefined,
      });
      onCreated(result.conversationId);
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 className="modal-title">New Conversation</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            &times;
          </button>
        </header>

        <form className="modal-body" onSubmit={handleSubmit}>
          <label className="modal-label">
            Phone Number *
            <input
              type="tel"
              className="modal-input"
              placeholder="(555) 123-4567"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              autoFocus
            />
          </label>

          <label className="modal-label">
            Name (optional)
            <input
              type="text"
              className="modal-input"
              placeholder="Patient name"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
            />
          </label>

          <label className="modal-label">
            Send from
            <select
              className="modal-select"
              value={selectedInboxId}
              onChange={(e) => setSelectedInboxId(e.target.value)}
            >
              {inboxes.map((inbox) => (
                <option key={inbox.id} value={inbox.id}>
                  {inbox.label ? `${inbox.label} — ${formatPhone(inbox.number)}` : formatPhone(inbox.number)}
                </option>
              ))}
            </select>
          </label>

          <label className="modal-label">
            Message (optional)
            <textarea
              className="modal-textarea"
              rows={3}
              placeholder="Type your first message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>

          {error && <div className="modal-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="modal-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="modal-submit" disabled={sending}>
              {sending ? "Creating..." : message.trim() ? "Send" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
