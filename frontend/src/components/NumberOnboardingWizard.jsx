import { useState, useEffect } from "react";
import {
  getAvailableNumbers,
  provisionPhoneNumber,
  getTwilioOwnedNumbers,
  claimPhoneNumber,
  checkPortability,
  createPortRequest,
} from "../utils/api";
import "./NumberOnboardingWizard.css";

// ── Path cards shown on the first screen ────────────────────────────────────

function PathCard({ icon, title, description, tag, onClick, disabled }) {
  return (
    <button
      type="button"
      className={`now-path-card${disabled ? " now-path-card-disabled" : ""}`}
      onClick={disabled ? undefined : onClick}
    >
      <div className="now-path-icon">{icon}</div>
      <div className="now-path-text">
        <div className="now-path-title">
          {title}
          {tag && <span className="now-path-tag">{tag}</span>}
        </div>
        <div className="now-path-desc">{description}</div>
      </div>
      <div className="now-path-arrow">
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </button>
  );
}

// ── Step indicator ──────────────────────────────────────────────────────────

function StepBar({ steps, current }) {
  return (
    <div className="now-step-bar">
      {steps.map((s, i) => (
        <span key={i} className={`now-step-item${i <= current ? " now-step-active" : ""}`}>
          {i < current ? (
            <span className="now-step-check">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          ) : (
            <span className="now-step-num">{i + 1}</span>
          )}
          <span className="now-step-label">{s}</span>
          {i < steps.length - 1 && <span className="now-step-sep" />}
        </span>
      ))}
    </div>
  );
}

// ── Buy New Number sub-flow ─────────────────────────────────────────────────

function BuyNewFlow({ token, onDone, onBack }) {
  const [step, setStep] = useState(0); // 0=search, 1=configure
  const [areaCode, setAreaCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [available, setAvailable] = useState([]);
  const [searchError, setSearchError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [label, setLabel] = useState("");
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
    setStep(1);
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
      });
      onDone();
    } catch (err) {
      setProvisionError(err.message || "Failed to provision number");
      setProvisioning(false);
    }
  };

  return (
    <>
      <StepBar steps={["Find a number", "Configure"]} current={step} />

      {step === 0 && (
        <div className="now-body">
          <p className="now-intro">
            Search for available US phone numbers by area code.
            Each number costs approximately <strong>$1.15/month</strong>.
          </p>

          <form onSubmit={handleSearch} className="now-search-row">
            <input
              type="text"
              className="now-input now-area-input"
              placeholder="Area code (e.g. 831)"
              maxLength={3}
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
            />
            <button type="submit" className="now-btn-primary" disabled={searching}>
              {searching ? "Searching..." : "Search"}
            </button>
          </form>

          {searchError && <div className="now-error">{searchError}</div>}

          {available.length > 0 && (
            <div className="now-results">
              {available.map((n) => (
                <button
                  key={n.phoneNumber}
                  type="button"
                  className="now-result-item"
                  onClick={() => handleSelect(n)}
                >
                  <span className="now-result-number">{n.friendlyName}</span>
                  <span className="now-result-location">
                    {[n.locality, n.region].filter(Boolean).join(", ")}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="now-actions">
            <button type="button" className="now-btn-ghost" onClick={onBack}>Back</button>
          </div>
        </div>
      )}

      {step === 1 && selected && (
        <form className="now-body" onSubmit={handleProvision}>
          <div className="now-selected-number">
            <div className="now-selected-badge">Selected number</div>
            <div className="now-selected-value">{selected.friendlyName}</div>
            {(selected.locality || selected.region) && (
              <div className="now-selected-location">
                {[selected.locality, selected.region].filter(Boolean).join(", ")}
              </div>
            )}
          </div>

          <label className="now-label">
            Label (optional)
            <input
              type="text"
              className="now-input"
              placeholder="e.g. Main Office, Billing, Cardiology"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
          </label>

          {provisionError && <div className="now-error">{provisionError}</div>}

          <div className="now-actions">
            <button
              type="button"
              className="now-btn-ghost"
              onClick={() => { setStep(0); setSelected(null); }}
              disabled={provisioning}
            >
              Back
            </button>
            <button type="submit" className="now-btn-primary" disabled={provisioning}>
              {provisioning ? "Setting up..." : "Add Number"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

// ── Hook Up Existing (Path C) ───────────────────────────────────────────────

function HookUpFlow({ token, onDone, onBack }) {
  const [loading, setLoading] = useState(true);
  const [twilioNumbers, setTwilioNumbers] = useState([]);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [label, setLabel] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const nums = await getTwilioOwnedNumbers(token);
        setTwilioNumbers(nums);
      } catch (err) {
        setError(err.message || "Could not load your Twilio numbers");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleClaim = async (e) => {
    e.preventDefault();
    setClaiming(true);
    setClaimError(null);
    try {
      await claimPhoneNumber(token, {
        providerSid: selected.sid,
        label: label.trim() || null,
      });
      onDone();
    } catch (err) {
      setClaimError(err.message || "Failed to connect number");
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="now-body now-center">
        <div className="now-spinner" />
        <p className="now-loading-text">Loading your Twilio numbers...</p>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="now-body">
        <p className="now-intro">
          These are the numbers in your Twilio account that aren't connected to Health SMS yet.
          Select one to add it.
        </p>

        {error && <div className="now-error">{error}</div>}

        {twilioNumbers.length === 0 && !error && (
          <div className="now-empty">
            <p>No unclaimed numbers found in your Twilio account.</p>
            <p className="now-empty-hint">
              All your Twilio numbers may already be connected, or you may need to buy one first.
            </p>
          </div>
        )}

        {twilioNumbers.length > 0 && (
          <div className="now-results">
            {twilioNumbers.map((n) => (
              <button
                key={n.sid}
                type="button"
                className="now-result-item"
                onClick={() => setSelected(n)}
              >
                <span className="now-result-number">{n.friendlyName}</span>
                <span className="now-result-location">{n.phoneNumber}</span>
              </button>
            ))}
          </div>
        )}

        <div className="now-actions">
          <button type="button" className="now-btn-ghost" onClick={onBack}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <form className="now-body" onSubmit={handleClaim}>
      <StepBar steps={["Select number", "Configure"]} current={1} />

      <div className="now-selected-number">
        <div className="now-selected-badge">Connecting</div>
        <div className="now-selected-value">{selected.friendlyName}</div>
        <div className="now-selected-location">{selected.phoneNumber}</div>
      </div>

      <label className="now-label">
        Label (optional)
        <input
          type="text"
          className="now-input"
          placeholder="e.g. Main Office, Billing"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
        />
      </label>

      {claimError && <div className="now-error">{claimError}</div>}

      <div className="now-actions">
        <button
          type="button"
          className="now-btn-ghost"
          onClick={() => setSelected(null)}
          disabled={claiming}
        >
          Back
        </button>
        <button type="submit" className="now-btn-primary" disabled={claiming}>
          {claiming ? "Connecting..." : "Connect Number"}
        </button>
      </div>
    </form>
  );
}

// ── Port Number sub-flow ────────────────────────────────────────────────────

function PortNumberFlow({ token, onDone, onBack }) {
  const [step, setStep] = useState(0); // 0=enter number, 1=details, 2=submitted
  const [phoneNumber, setPhoneNumber] = useState("");
  const [checking, setChecking] = useState(false);
  const [portError, setPortError] = useState(null);
  const [portable, setPortable] = useState(null);

  const [losingCarrier, setLosingCarrier] = useState("");
  const [customerType, setCustomerType] = useState("Business");
  const [customerName, setCustomerName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [zip, setZip] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [portResult, setPortResult] = useState(null);

  const handleCheck = async (e) => {
    e.preventDefault();
    if (!phoneNumber.trim()) return;
    setChecking(true);
    setPortError(null);
    setPortable(null);
    try {
      const result = await checkPortability(token, phoneNumber.trim());
      if (result.portable) {
        setPortable(result);
        setStep(1);
      } else {
        setPortError(result.reason || "This number cannot be ported. Check the number and try again.");
      }
    } catch (err) {
      setPortError(err.message || "Could not check portability");
    } finally {
      setChecking(false);
    }
  };

  const handleSubmitPort = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setPortError(null);
    try {
      const result = await createPortRequest(token, {
        phoneNumber: phoneNumber.trim(),
        losingCarrier: losingCarrier.trim(),
        customerType,
        customerName: customerName.trim() || authName.trim(),
        accountNumber: accountNumber.trim(),
        authorizedName: authName.trim(),
        authorizedEmail: authEmail.trim(),
        authorizedPhone: authPhone.trim(),
        street: street.trim(),
        city: city.trim(),
        state: addrState.trim(),
        zip: zip.trim(),
      });
      setPortResult(result);
      setStep(2);
    } catch (err) {
      setPortError(err.message || "Failed to submit port request");
      setSubmitting(false);
    }
  };

  return (
    <>
      <StepBar steps={["Check number", "Details", "Submitted"]} current={step} />

      {step === 0 && (
        <form className="now-body" onSubmit={handleCheck}>
          <p className="now-intro">
            Enter the phone number you want to bring to Health SMS.
            We'll check if it can be transferred from your current carrier.
          </p>

          <label className="now-label">
            Phone number to port
            <input
              type="tel"
              className="now-input"
              placeholder="(555) 123-4567"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              autoFocus
            />
          </label>

          {portError && <div className="now-error">{portError}</div>}

          <div className="now-actions">
            <button type="button" className="now-btn-ghost" onClick={onBack}>Back</button>
            <button type="submit" className="now-btn-primary" disabled={checking || !phoneNumber.trim()}>
              {checking ? "Checking..." : "Check Portability"}
            </button>
          </div>
        </form>
      )}

      {step === 1 && (
        <form className="now-body" onSubmit={handleSubmitPort}>
          <div className="now-success-banner">
            This number can be ported to Health SMS.
            {portable?.pinRequired && (
              <span style={{ display: "block", marginTop: 4, fontSize: 13 }}>
                Your carrier may require a PIN and account number to complete the transfer.
              </span>
            )}
          </div>

          <p className="now-intro">
            Fill in the details below exactly as they appear on your current
            carrier account. You'll receive an email with a transfer
            authorization to sign. Porting typically takes 1-2 weeks.
          </p>

          <div className="now-field-group">
            <h4 className="now-field-group-title">Current carrier info</h4>

            <label className="now-label">
              Current carrier
              <input
                type="text"
                className="now-input"
                placeholder="e.g. AT&T, Verizon, RingCentral, String"
                value={losingCarrier}
                onChange={(e) => setLosingCarrier(e.target.value)}
              />
            </label>

            <label className="now-label">
              Account type
              <select className="now-input" value={customerType} onChange={(e) => setCustomerType(e.target.value)}>
                <option value="Business">Business</option>
                <option value="Individual">Individual</option>
              </select>
            </label>

            <label className="now-label">
              Account name (as registered with carrier)
              <input
                type="text"
                className="now-input"
                placeholder="Business name or individual name on the account"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </label>

            <label className="now-label">
              Account number (if you have it)
              <input
                type="text"
                className="now-input"
                placeholder="Optional — check your carrier bill"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </label>
          </div>

          <div className="now-field-group">
            <h4 className="now-field-group-title">Authorized representative</h4>

            <label className="now-label">
              Full name
              <input
                type="text"
                className="now-input"
                placeholder="Person authorized to manage this account"
                value={authName}
                onChange={(e) => setAuthName(e.target.value)}
              />
            </label>

            <label className="now-label">
              Email
              <input
                type="email"
                className="now-input"
                placeholder="email@clinic.com — you'll sign the transfer here"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
              />
            </label>

            <label className="now-label">
              Phone
              <input
                type="tel"
                className="now-input"
                placeholder="(555) 123-4567"
                value={authPhone}
                onChange={(e) => setAuthPhone(e.target.value)}
              />
            </label>
          </div>

          <div className="now-field-group">
            <h4 className="now-field-group-title">Service address (as on your carrier bill)</h4>

            <label className="now-label">
              Street address
              <input
                type="text"
                className="now-input"
                placeholder="123 Main St"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
              />
            </label>

            <div className="now-field-row">
              <label className="now-label now-label-flex">
                City
                <input type="text" className="now-input" value={city} onChange={(e) => setCity(e.target.value)} />
              </label>
              <label className="now-label now-label-sm">
                State
                <input type="text" className="now-input" maxLength={2} placeholder="CA" value={addrState} onChange={(e) => setAddrState(e.target.value)} />
              </label>
              <label className="now-label now-label-sm">
                ZIP
                <input type="text" className="now-input" maxLength={5} value={zip} onChange={(e) => setZip(e.target.value)} />
              </label>
            </div>
          </div>

          {portError && <div className="now-error">{portError}</div>}

          <div className="now-actions">
            <button type="button" className="now-btn-ghost" onClick={() => setStep(0)} disabled={submitting}>
              Back
            </button>
            <button
              type="submit"
              className="now-btn-primary"
              disabled={submitting || !losingCarrier.trim() || !authName.trim() || !authEmail.trim()}
            >
              {submitting ? "Submitting..." : "Start Port"}
            </button>
          </div>
        </form>
      )}

      {step === 2 && portResult && (
        <div className="now-body now-center">
          <div className="now-success-icon">
            <svg width="48" height="48" fill="none" stroke="#059669" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <polyline points="8 12 11 15 16 9" />
            </svg>
          </div>
          <h3 className="now-success-title">Port request submitted</h3>
          <p className="now-intro">
            Check your email at <strong>{authEmail}</strong> for a transfer authorization to sign.
            We'll update you as the port progresses. This usually takes 1-2 weeks.
          </p>
          <p className="now-status-label">
            Status: <span className="now-status-badge">{portResult.status || "In Review"}</span>
          </p>
          <div className="now-actions">
            <button type="button" className="now-btn-primary" onClick={onDone}>Done</button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main Wizard ─────────────────────────────────────────────────────────────

export function NumberOnboardingWizard({ token, onClose, onCreated }) {
  const [path, setPath] = useState("choose");

  const handleDone = () => {
    onCreated();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="now-container" onClick={(e) => e.stopPropagation()}>
        <header className="now-header">
          <div>
            <h2 className="now-title">Add Number</h2>
            {path !== "choose" && (
              <p className="now-subtitle">
                {path === "buy-new" && "Buy a new phone number"}
                {path === "port" && "Transfer your existing number"}
                {path === "hookup" && "Connect a Twilio number"}
              </p>
            )}
          </div>
          <button type="button" className="now-close" onClick={onClose}>&times;</button>
        </header>

        {path === "choose" && (
          <div className="now-body">
            <p className="now-intro">
              How would you like to set up your number?
            </p>

            <div className="now-path-list">
              <PathCard
                icon={
                  <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                }
                title="I need a new number"
                description="Buy a phone number with a local area code. Ready to use in minutes."
                onClick={() => setPath("buy-new")}
              />

              <PathCard
                icon={
                  <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <polyline points="15 10 20 15 15 20" />
                    <path d="M4 4v7a4 4 0 0 0 4 4h12" />
                  </svg>
                }
                title="Transfer my number"
                description="Port your existing office number from another carrier. Takes 1-2 weeks."
                onClick={() => setPath("port")}
              />

              <PathCard
                icon={
                  <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                }
                title="Connect a Twilio number"
                description="Already have a number in your Twilio account? Link it here."
                onClick={() => setPath("hookup")}
              />
            </div>
          </div>
        )}

        {path === "buy-new" && (
          <BuyNewFlow token={token} onDone={handleDone} onBack={() => setPath("choose")} />
        )}

        {path === "hookup" && (
          <HookUpFlow token={token} onDone={handleDone} onBack={() => setPath("choose")} />
        )}

        {path === "port" && (
          <PortNumberFlow token={token} onDone={handleDone} onBack={() => setPath("choose")} />
        )}
      </div>
    </div>
  );
}
