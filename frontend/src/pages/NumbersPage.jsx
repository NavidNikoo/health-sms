import { useState, useEffect, useCallback } from "react";
import { AppShell } from "../components/AppShell";
import { NumberOnboardingWizard } from "../components/NumberOnboardingWizard";
import { useAuth } from "../context/AuthContext";
import {
  getPhoneNumbers,
  deletePhoneNumber,
  getOrgCompliance,
  submitBrandRegistration,
  submitCampaignRegistration,
} from "../utils/api";
import "./NumbersPage.css";

function formatPhone(e164) {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1")
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10)
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return e164;
}

function StatusBadge({ status }) {
  const map = {
    APPROVED: "np-badge-green",
    PENDING: "np-badge-yellow",
    IN_REVIEW: "np-badge-yellow",
    FAILED: "np-badge-red",
    approved: "np-badge-green",
    pending: "np-badge-yellow",
  };
  return (
    <span className={`np-badge ${map[status] || "np-badge-gray"}`}>
      {status || "Not started"}
    </span>
  );
}

// ── Number list ─────────────────────────────────────────────────────────────

function NumberList({ numbers, loading, onDelete }) {
  const [deleting, setDeleting] = useState(null);

  const handleDelete = async (id, label) => {
    if (!window.confirm(`Remove ${label}? This will release the number from your Twilio account.`)) return;
    setDeleting(id);
    try {
      await onDelete(id);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="np-empty">
        <div className="np-spinner" />
        <p>Loading numbers...</p>
      </div>
    );
  }

  if (numbers.length === 0) {
    return (
      <div className="np-empty">
        <div className="np-empty-icon">
          <svg width="40" height="40" fill="none" stroke="#9ca3af" strokeWidth="1.5" viewBox="0 0 24 24">
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <path d="M12 18h.01" />
          </svg>
        </div>
        <p className="np-empty-title">No numbers yet</p>
        <p className="np-empty-desc">Add your first number to start messaging and calling patients.</p>
      </div>
    );
  }

  return (
    <div className="np-number-list">
      {numbers.map((n) => (
        <div key={n.id} className="np-number-row">
          <div className="np-number-info">
            <div className="np-number-value">{formatPhone(n.number)}</div>
            {n.label && <div className="np-number-label">{n.label}</div>}
          </div>
          <div className="np-number-meta">
            {n.callForwardTo && (
              <span className="np-number-fwd">
                Fwd: {formatPhone(n.callForwardTo)}
              </span>
            )}
            {n.a2pStatus && <StatusBadge status={n.a2pStatus} />}
          </div>
          <button
            type="button"
            className="np-number-delete"
            onClick={() => handleDelete(n.id, n.label || formatPhone(n.number))}
            disabled={deleting === n.id}
            title="Remove number"
          >
            {deleting === n.id ? "..." : (
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}

// ── SMS Compliance (10DLC) inline section ────────────────────────────────────

function SmsComplianceSection({ token }) {
  const [loading, setLoading] = useState(true);
  const [compliance, setCompliance] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const [legalName, setLegalName] = useState("");
  const [ein, setEin] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [brandType, setBrandType] = useState("SOLE_PROPRIETOR");
  const [campaignDescription, setCampaignDescription] = useState(
    "Appointment reminders and patient communication for a healthcare practice."
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const c = await getOrgCompliance(token);
      setCompliance(c);
      if (c.legalName) setLegalName(c.legalName);
      if (c.ein) setEin(c.ein);
    } catch {
      // no existing registration
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await submitBrandRegistration(token, {
        legalName: legalName.trim(),
        ein: ein.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
        brandType,
      });
      await load();
      setExpanded(false);
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  const hasRegistration = compliance?.hasRegistration;
  const brandStatus = compliance?.brandStatus;
  const campaignStatus = compliance?.campaignStatus;
  const isApproved = brandStatus === "APPROVED";

  if (loading) return null;

  return (
    <div className="np-compliance">
      <div className="np-compliance-header" onClick={() => !hasRegistration && setExpanded(!expanded)}>
        <div className="np-compliance-left">
          <div className={`np-compliance-icon ${isApproved ? "np-compliance-icon-ok" : ""}`}>
            {isApproved ? (
              <svg width="20" height="20" fill="none" stroke="#059669" strokeWidth="2.5" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="20" height="20" fill="none" stroke="#d97706" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M9 12l2 2 4-4" />
                <circle cx="12" cy="12" r="10" />
              </svg>
            )}
          </div>
          <div>
            <div className="np-compliance-title">SMS Compliance (10DLC)</div>
            <div className="np-compliance-desc">
              {isApproved
                ? "Your business is verified. Numbers are approved for SMS."
                : hasRegistration
                  ? "Registration in progress — usually takes 1-2 weeks."
                  : "Required to send text messages in the US."
              }
            </div>
          </div>
        </div>
        <div className="np-compliance-right">
          {hasRegistration ? (
            <div className="np-compliance-statuses">
              <span className="np-compliance-status-item">Brand: <StatusBadge status={brandStatus} /></span>
              {campaignStatus && (
                <span className="np-compliance-status-item">Campaign: <StatusBadge status={campaignStatus} /></span>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="np-btn-outline"
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            >
              {expanded ? "Cancel" : "Get started"}
            </button>
          )}
        </div>
      </div>

      {expanded && !hasRegistration && (
        <form className="np-compliance-form" onSubmit={handleSubmit}>
          <p className="np-compliance-form-intro">
            US carriers require your business to be verified before you can send SMS.
            This is a one-time registration (~$4 brand + ~$10 campaign). Approval takes about 1-2 weeks.
          </p>

          <div className="np-form-grid">
            <label className="np-form-label np-form-full">
              Legal business name
              <input type="text" className="np-form-input" placeholder="as registered with the IRS" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
            </label>

            <label className="np-form-label">
              EIN (Tax ID)
              <input type="text" className="np-form-input" placeholder="XX-XXXXXXX" value={ein} onChange={(e) => setEin(e.target.value)} />
            </label>

            <label className="np-form-label">
              Brand type
              <select className="np-form-input" value={brandType} onChange={(e) => setBrandType(e.target.value)}>
                <option value="SOLE_PROPRIETOR">Sole Proprietor</option>
                <option value="STANDARD">Standard (multi-location)</option>
              </select>
            </label>

            <label className="np-form-label np-form-full">
              Business address
              <input type="text" className="np-form-input" placeholder="123 Main St" value={address} onChange={(e) => setAddress(e.target.value)} />
            </label>

            <label className="np-form-label">
              City
              <input type="text" className="np-form-input" value={city} onChange={(e) => setCity(e.target.value)} />
            </label>

            <label className="np-form-label np-form-sm">
              State
              <input type="text" className="np-form-input" maxLength={2} placeholder="CA" value={state} onChange={(e) => setState(e.target.value)} />
            </label>

            <label className="np-form-label np-form-sm">
              ZIP
              <input type="text" className="np-form-input" maxLength={5} value={zip} onChange={(e) => setZip(e.target.value)} />
            </label>

            <label className="np-form-label np-form-full">
              How will you use SMS?
              <textarea className="np-form-input np-form-textarea" rows={2} value={campaignDescription} onChange={(e) => setCampaignDescription(e.target.value)} />
            </label>
          </div>

          {error && <div className="np-form-error">{error}</div>}

          <div className="np-form-actions">
            <button type="button" className="np-btn-ghost" onClick={() => setExpanded(false)}>Cancel</button>
            <button type="submit" className="np-btn-primary" disabled={submitting || !legalName.trim() || !ein.trim()}>
              {submitting ? "Submitting..." : "Submit Registration"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export function NumbersPage() {
  const { token } = useAuth();
  const [numbers, setNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

  const loadNumbers = useCallback(async () => {
    if (!token) return;
    try {
      const nums = await getPhoneNumbers(token);
      setNumbers(nums);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadNumbers(); }, [loadNumbers]);

  const handleDelete = async (id) => {
    await deletePhoneNumber(token, id);
    await loadNumbers();
  };

  return (
    <AppShell>
      <div className="np-page">
        <header className="np-header">
          <div>
            <h1 className="np-title">Manage Numbers</h1>
            <p className="np-subtitle">Your phone numbers, porting, and SMS compliance</p>
          </div>
          <button
            type="button"
            className="np-btn-primary"
            onClick={() => setShowWizard(true)}
          >
            + Add Number
          </button>
        </header>

        <section className="np-section">
          <div className="np-section-header">
            <h2 className="np-section-title">Your Numbers</h2>
            <span className="np-section-count">{numbers.length}</span>
          </div>
          <NumberList numbers={numbers} loading={loading} onDelete={handleDelete} />
        </section>

        <section className="np-section">
          <div className="np-section-header">
            <h2 className="np-section-title">SMS Compliance</h2>
          </div>
          <SmsComplianceSection token={token} />
        </section>
      </div>

      {showWizard && (
        <NumberOnboardingWizard
          token={token}
          onClose={() => setShowWizard(false)}
          onCreated={() => { setShowWizard(false); loadNumbers(); }}
        />
      )}
    </AppShell>
  );
}
