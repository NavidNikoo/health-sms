import { useState } from "react";
import { getAvailableNumbers, provisionPhoneNumber } from "../utils/api";
import "./NewInboxModal.css";

export function NewInboxModal({ token, onClose, onCreated }) {
  const [step, setStep] = useState(1);

  // Step 1: search
  const [areaCode, setAreaCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [available, setAvailable] = useState([]);
  const [searchError, setSearchError] = useState(null);
  const [selected, setSelected] = useState(null);

  // Step 2: configure + provision
  const [label, setLabel] = useState("");
  const [callForwardTo, setCallForwardTo] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!/^\d{3}$/.test(areaCode.trim())) {
      setSearchError("Enter a 3-digit area code");
      return;
    }
    setSearching(true);
    setSearchError(null);
    setAvailable([]);
    try {
      const results = await getAvailableNumbers(token, areaCode.trim());
      if (results.length === 0) {
        setSearchError("No numbers found for that area code. Try another.");
      } else {
        setAvailable(results);
      }
    } catch (err) {
      setSearchError(err.message || "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = (num) => {
    setSelected(num);
    setStep(2);
    setProvisionError(null);
  };

  const handleProvision = async (e) => {
    e.preventDefault();
    setProvisioning(true);
    setProvisionError(null);
    try {
      await provisionPhoneNumber(token, {
        phoneNumber: selected.phoneNumber,
        label: label.trim() || null,
        callForwardTo: callForwardTo.trim() || null,
      });
      onCreated();
    } catch (err) {
      setProvisionError(err.message || "Failed to provision number");
      setProvisioning(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="ni-container" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h2 className="modal-title">Add New Inbox</h2>
            <div className="ni-steps">
              <span className={`ni-step ${step >= 1 ? "ni-step-active" : ""}`}>1 Search</span>
              <span className="ni-step-sep">›</span>
              <span className={`ni-step ${step >= 2 ? "ni-step-active" : ""}`}>2 Configure</span>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </header>

        {step === 1 && (
          <div className="modal-body">
            <p className="ni-intro">
              Search for available Twilio phone numbers by US area code. Each number costs ~$1.15/month.
            </p>

            <form onSubmit={handleSearch} className="ni-search-row">
              <input
                type="text"
                className="modal-input ni-area-input"
                placeholder="Area code (e.g. 831)"
                maxLength={3}
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
              />
              <button type="submit" className="modal-submit" disabled={searching}>
                {searching ? "Searching…" : "Search"}
              </button>
            </form>

            {searchError && <div className="modal-error">{searchError}</div>}

            {available.length > 0 && (
              <div className="ni-results">
                {available.map((n) => (
                  <button
                    key={n.phoneNumber}
                    type="button"
                    className="ni-result-item"
                    onClick={() => handleSelect(n)}
                  >
                    <span className="ni-result-number">{n.friendlyName}</span>
                    <span className="ni-result-location">
                      {[n.locality, n.region].filter(Boolean).join(", ")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 2 && selected && (
          <form className="modal-body" onSubmit={handleProvision}>
            <div className="ni-selected-number">
              <div className="ni-selected-label">Selected number</div>
              <div className="ni-selected-value">{selected.friendlyName}</div>
              {(selected.locality || selected.region) && (
                <div className="ni-selected-location">
                  {[selected.locality, selected.region].filter(Boolean).join(", ")}
                </div>
              )}
            </div>

            <label className="modal-label">
              Label (optional)
              <input
                type="text"
                className="modal-input"
                placeholder="e.g. Main Office, Cardiology"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                autoFocus
              />
            </label>

            <label className="modal-label">
              Forward calls to (optional)
              <input
                type="tel"
                className="modal-input"
                placeholder="(555) 123-4567 — staff cell phone"
                value={callForwardTo}
                onChange={(e) => setCallForwardTo(e.target.value)}
              />
              <span className="ni-hint">
                Inbound calls to this number will be forwarded here. Leave blank to play a voicemail message.
              </span>
            </label>

            {provisionError && <div className="modal-error">{provisionError}</div>}

            <div className="modal-actions">
              <button
                type="button"
                className="modal-cancel"
                onClick={() => { setStep(1); setSelected(null); }}
                disabled={provisioning}
              >
                ← Back
              </button>
              <button type="submit" className="modal-submit" disabled={provisioning}>
                {provisioning ? "Provisioning…" : "Add Number"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
