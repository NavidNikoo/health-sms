import { useState, useEffect, useCallback } from "react";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../context/AuthContext";
import {
  getPhoneNumbers,
  updatePhoneNumber,
  initiateCall,
  cancelCall,
  getAuthorizedForwardNumbers,
  createAuthorizedForwardNumber,
} from "../utils/api";
import "./DialerPage.css";

const DIAL_PAD = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["*", "0", "#"],
];

function toE164(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === "1") return `+${digits}`;
  return raw;
}

function formatPhone(e164) {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return e164;
}

// ── Mode tile icons ──────────────────────────────────────────────────────────

function VoicemailIcon() {
  return (
    <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function ForwardIcon() {
  return (
    <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <polyline points="15 10 20 15 15 20" />
      <path d="M4 4v7a4 4 0 0 0 4 4h12" />
    </svg>
  );
}

function AiAgentIcon() {
  return (
    <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function DialerPage() {
  const { token } = useAuth();
  const [inboxes, setInboxes] = useState([]);
  const [selectedInboxId, setSelectedInboxId] = useState("");
  const [authorizedForwardNumbers, setAuthorizedForwardNumbers] = useState([]);

  // Settings state
  const [callMode, setCallMode] = useState("voicemail"); // "voicemail" | "forward"
  const [selectedForwardNumberId, setSelectedForwardNumberId] = useState("");
  const [addForwardInput, setAddForwardInput] = useState("");
  const [addingForwardNumber, setAddingForwardNumber] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [addMsg, setAddMsg] = useState(null);       // { type, text } — Add Number feedback
  const [settingsMsg, setSettingsMsg] = useState(null); // { type, text } — Save Settings feedback
  const [loadError, setLoadError] = useState(null);    // Error loading inboxes/numbers
  const [loadingInboxes, setLoadingInboxes] = useState(false);

  // Dialer state
  const [dialNumber, setDialNumber] = useState("");
  const [callStatus, setCallStatus] = useState(null); // null | "calling" | "ringing"
  const [callSid, setCallSid] = useState(null);
  const [callError, setCallError] = useState(null);

  const selectedInbox = inboxes.find((i) => i.id === selectedInboxId);

  const normalizeE164 = (raw) => {
    const digits = (raw || "").replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits[0] === "1") return `+${digits}`;
    if (raw?.startsWith("+") && digits.length >= 10) return `+${digits}`;
    return null;
  };

  const loadInboxes = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    setLoadingInboxes(true);
    try {
      const [nums, authorized] = await Promise.all([
        getPhoneNumbers(token),
        getAuthorizedForwardNumbers(token),
      ]);
      setInboxes(nums);
      setAuthorizedForwardNumbers(authorized);
      if (nums.length > 0) {
        setSelectedInboxId(nums[0].id);
      }
    } catch (err) {
      setLoadError(err?.message || "Could not load phone numbers. Try logging out and back in.");
    } finally {
      setLoadingInboxes(false);
    }
  }, [token]);

  useEffect(() => { loadInboxes(); }, [loadInboxes]);

  // Sync settings when the selected inbox changes
  useEffect(() => {
    if (selectedInbox) {
      const currentlyForwarding = !!selectedInbox.callForwardTo;
      setCallMode(currentlyForwarding ? "forward" : "voicemail");
      if (selectedInbox.callForwardAuthorizedNumberId) {
        setSelectedForwardNumberId(selectedInbox.callForwardAuthorizedNumberId);
      } else if (selectedInbox.callForwardTo) {
        const matched = authorizedForwardNumbers.find((n) => n.number === selectedInbox.callForwardTo);
        setSelectedForwardNumberId(matched?.id || "");
      } else {
        setSelectedForwardNumberId("");
      }
      setSettingsMsg(null);
      setAddMsg(null);
    }
  }, [selectedInbox?.id, authorizedForwardNumbers]); // eslint-disable-line

  const handleAddAuthorizedForward = async () => {
    if (!addForwardInput.trim()) return;
    setAddingForwardNumber(true);
    setAddMsg(null);
    try {
      const created = await createAuthorizedForwardNumber(token, {
        phoneNumber: addForwardInput.trim(),
      });
      setAuthorizedForwardNumbers((prev) => {
        const withoutDuplicate = prev.filter((n) => n.id !== created.id && n.number !== created.number);
        return [created, ...withoutDuplicate];
      });
      setSelectedForwardNumberId(created.id);
      setAddForwardInput("");
      setCallMode("forward");
      setAddMsg({ type: "ok", text: "Number authorized. Click Save Settings to apply." });
    } catch (err) {
      setAddMsg({ type: "err", text: err.message || "Failed to authorize number" });
    } finally {
      setAddingForwardNumber(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedInboxId) return;

    if (callMode === "forward" && !selectedForwardNumberId) {
      setSettingsMsg({ type: "err", text: "Select or add an authorized forwarding number first" });
      return;
    }

    setSavingSettings(true);
    setSettingsMsg(null);
    setAddMsg(null);
    try {
      const updated = await updatePhoneNumber(token, selectedInboxId, {
        label: selectedInbox?.label,
        callMode,
        callForwardAuthorizedNumberId: callMode === "forward" ? selectedForwardNumberId : null,
      });
      setInboxes((prev) =>
        prev.map((i) => (i.id === selectedInboxId
          ? {
              ...i,
              callForwardTo: updated.callForwardTo,
              callForwardAuthorizedNumberId: updated.callForwardAuthorizedNumberId || null,
            }
          : i))
      );
      setSettingsMsg({ type: "ok", text: "Settings saved" });
      setTimeout(() => setSettingsMsg(null), 3000);
    } catch (err) {
      setSettingsMsg({ type: "err", text: err.message || "Save failed" });
    } finally {
      setSavingSettings(false);
    }
  };

  // ── Dialer handlers ────────────────────────────────────────────────────────

  const handlePadPress = (digit) => {
    if (!callStatus) setDialNumber((prev) => prev + digit);
  };

  const handleBackspace = () => {
    if (!callStatus) setDialNumber((prev) => prev.slice(0, -1));
  };

  const handleCall = async () => {
    if (!dialNumber.trim() || !selectedInboxId || callStatus) return;
    if (callMode !== "forward" || !selectedInbox?.callForwardTo) {
      setCallError("Set call mode to Forward and save a phone number in Call Settings below.");
      return;
    }
    setCallError(null);
    setCallStatus("calling");
    try {
      const { callSid: sid } = await initiateCall(token, {
        to: toE164(dialNumber.trim()),
        fromPhoneNumberId: selectedInboxId,
      });
      setCallSid(sid);
      setCallStatus("ringing");
    } catch (err) {
      setCallError(err.message || "Call failed");
      setCallStatus(null);
    }
  };

  const handleCancel = async () => {
    if (callSid) {
      try { await cancelCall(token, callSid); } catch { /* ignore */ }
    }
    setCallStatus(null);
    setCallSid(null);
  };

  const canCall = !!dialNumber.trim() && !!selectedInboxId && !callStatus;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      <div className="dialer-page">
        <header className="dialer-header">
          <h1 className="dialer-title">Dialer</h1>
          <p className="dialer-subtitle">
            Patients always see your clinic number — calls ring your personal phone
          </p>
        </header>

        {/* ── Dialer card ── */}
        <div className="dialer-card">

          {/* Clinic number selector */}
          <div className="dialer-from">
            <label className="dialer-from-label">Clinic number</label>
            <select
              className="dialer-select"
              value={selectedInboxId}
              onChange={(e) => { setSelectedInboxId(e.target.value); setCallError(null); }}
              disabled={!!callStatus || loadingInboxes}
            >
              {loadingInboxes && <option value="">Loading…</option>}
              {!loadingInboxes && inboxes.length === 0 && !loadError && (
                <option value="">No numbers configured</option>
              )}
              {!loadingInboxes && loadError && (
                <option value="">Could not load</option>
              )}
              {inboxes.map((inbox) => (
                <option key={inbox.id} value={inbox.id}>
                  {inbox.label ? `${inbox.label} — ${formatPhone(inbox.number)}` : formatPhone(inbox.number)}
                </option>
              ))}
            </select>
            {loadError && (
              <div className="dialer-load-error">
                <span>{loadError}</span>
                <button type="button" className="dialer-retry-btn" onClick={() => loadInboxes()}>
                  Retry
                </button>
              </div>
            )}
          </div>

          <div className="dialer-divider" />

          {/* Active call status */}
          {callStatus === "calling" && (
            <div className="dialer-active-call">
              <div className="dialer-ringing-icon">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.37 2 2 0 0 1 3.6 1.2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.9a16 16 0 0 0 6.1 6.1l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <div className="dialer-active-text">Calling your phone…</div>
              <button type="button" className="dialer-cancel-call-btn" onClick={handleCancel}>Cancel</button>
            </div>
          )}

          {callStatus === "ringing" && (
            <div className="dialer-active-call dialer-active-call-ringing">
              <div className="dialer-ringing-icon dialer-ringing-anim">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.37 2 2 0 0 1 3.6 1.2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.9a16 16 0 0 0 6.1 6.1l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <div>
                <div className="dialer-active-text">
                  Your phone is ringing at {formatPhone(selectedInbox?.callForwardTo)}
                </div>
                <div className="dialer-active-subtext">
                  When you answer, you'll be connected to {formatPhone(toE164(dialNumber)) || dialNumber}
                </div>
              </div>
              <div className="dialer-active-btns">
                <button type="button" className="dialer-cancel-call-btn" onClick={handleCancel}>Cancel</button>
                <button type="button" className="dialer-done-btn" onClick={() => { setCallStatus(null); setCallSid(null); }}>Dismiss</button>
              </div>
            </div>
          )}

          {/* Number display + pad + call button */}
          {!callStatus && (
            <>
              <div className="dialer-display">
                <div className="dialer-display-number">
                  {dialNumber
                    ? (formatPhone(toE164(dialNumber)) || dialNumber)
                    : <span className="dialer-placeholder">Enter a number</span>}
                </div>
                {dialNumber && (
                  <button type="button" className="dialer-backspace" onClick={handleBackspace} aria-label="Backspace">
                    ⌫
                  </button>
                )}
              </div>

              <div className="dialer-pad">
                {DIAL_PAD.map((row, ri) => (
                  <div key={ri} className="dialer-pad-row">
                    {row.map((digit) => (
                      <button key={digit} type="button" className="dialer-pad-btn" onClick={() => handlePadPress(digit)}>
                        {digit}
                      </button>
                    ))}
                  </div>
                ))}
              </div>

              <div className="dialer-actions">
                <button
                  type="button"
                  className="dialer-call-btn"
                  onClick={handleCall}
                  disabled={!canCall}
                  title={callMode !== "forward"
                    ? "Switch to Forward mode in Call Settings"
                    : !selectedInbox?.callForwardTo
                      ? "Save an authorized forwarding number first"
                      : "Call"}
                >
                  <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                  </svg>
                </button>
              </div>
            </>
          )}

          {callError && !callStatus && (
            <div className="dialer-error">{callError}</div>
          )}
        </div>

        {/* ── Call Settings card ── */}
        <div className="cs-card">
          <div className="cs-card-header">
            <div className="cs-card-title">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Call Settings
            </div>
            <div className="cs-card-subtitle">
              How should calls to{" "}
              <strong>{selectedInbox?.label || formatPhone(selectedInbox?.number) || "your number"}</strong>{" "}
              be handled?
            </div>
          </div>

          {/* Mode tiles */}
          <div className="cs-mode-grid">

            {/* Voicemail */}
            <button
              type="button"
              className={`cs-mode-tile ${callMode === "voicemail" ? "cs-mode-tile-active" : ""}`}
              onClick={() => { setCallMode("voicemail"); setSettingsMsg(null); setAddMsg(null); }}
            >
              {callMode === "voicemail" && (
                <span className="cs-mode-check"><CheckIcon /></span>
              )}
              <div className={`cs-mode-icon ${callMode === "voicemail" ? "cs-mode-icon-active" : ""}`}>
                <VoicemailIcon />
              </div>
              <div className="cs-mode-name">Voicemail</div>
              <div className="cs-mode-desc">Play a message to callers</div>
            </button>

            {/* Forward */}
            <button
              type="button"
              className={`cs-mode-tile ${callMode === "forward" ? "cs-mode-tile-active" : ""}`}
              onClick={() => { setCallMode("forward"); setSettingsMsg(null); setAddMsg(null); }}
            >
              {callMode === "forward" && (
                <span className="cs-mode-check"><CheckIcon /></span>
              )}
              <div className={`cs-mode-icon ${callMode === "forward" ? "cs-mode-icon-active" : ""}`}>
                <ForwardIcon />
              </div>
              <div className="cs-mode-name">Forward</div>
              <div className="cs-mode-desc">Ring your personal phone</div>
            </button>

            {/* AI Agent — coming soon */}
            <div className="cs-mode-tile cs-mode-tile-soon">
              <span className="cs-mode-soon-badge">Soon</span>
              <div className="cs-mode-icon cs-mode-icon-soon">
                <AiAgentIcon />
              </div>
              <div className="cs-mode-name">AI Agent</div>
              <div className="cs-mode-desc">Auto-answer with AI</div>
            </div>

          </div>

          {/* Forward number input (only shown when Forward is selected) */}
          {callMode === "forward" && (
            <div className="cs-forward-section">
              <label className="cs-forward-label">Authorized forwarding number</label>
              <select
                className="cs-forward-input"
                value={selectedForwardNumberId}
                onChange={(e) => { setSelectedForwardNumberId(e.target.value); setSettingsMsg(null); setAddMsg(null); }}
                disabled={savingSettings || addingForwardNumber}
              >
                <option value="">Select a number</option>
                {authorizedForwardNumbers.map((num) => (
                  <option key={num.id} value={num.id}>
                    {num.label ? `${num.label} — ${formatPhone(num.number)}` : formatPhone(num.number)}
                  </option>
                ))}
              </select>
              <div className="cs-forward-add-row">
                <input
                  type="tel"
                  className="cs-forward-input"
                  placeholder="Add and authorize a new number (e.g. 9494392012)"
                  value={addForwardInput}
                  onChange={(e) => { setAddForwardInput(e.target.value); setAddMsg(null); }}
                  disabled={savingSettings || addingForwardNumber}
                />
                <button
                  type="button"
                  className="cs-forward-add-btn"
                  onClick={handleAddAuthorizedForward}
                  disabled={
                    savingSettings ||
                    addingForwardNumber ||
                    !normalizeE164(addForwardInput)
                  }
                >
                  {addingForwardNumber ? "Adding…" : "Add"}
                </button>
              </div>
              {addMsg && (
                <div className={`cs-save-msg cs-save-msg-${addMsg.type}`}>
                  {addMsg.type === "ok" ? "✓ " : "✕ "}
                  {addMsg.text}
                </div>
              )}
              <p className="cs-forward-hint">
                Both inbound calls from patients and calls you make from the dialer will ring this number.
                Patients always see the clinic number as caller ID.
              </p>
            </div>
          )}

          {callMode === "voicemail" && (
            <p className="cs-voicemail-note">
              Callers will hear: <em>"We are unable to take your call right now. Please try again later or send a text message."</em>
            </p>
          )}

          {/* Footer row: save message + button */}
          <div className="cs-footer">
            {settingsMsg && (
              <div className={`cs-save-msg cs-save-msg-${settingsMsg.type}`}>
                {settingsMsg.type === "ok" ? "✓ " : "✕ "}
                {settingsMsg.text}
              </div>
            )}
            <button
              type="button"
              className="cs-save-btn"
              onClick={handleSaveSettings}
              disabled={savingSettings || (callMode === "forward" && !selectedForwardNumberId)}
            >
              {savingSettings ? "Saving…" : "Save Settings"}
            </button>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
