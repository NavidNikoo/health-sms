/**
 * TwoFactorSetupPage.jsx
 *
 * Walks the user through setting up TOTP 2FA:
 *   Step 1 — Show QR code + manual key, ask user to scan it
 *   Step 2 — Ask for first code to confirm setup succeeded
 *   Step 3 — Success screen
 *
 * Admins land here automatically after signup or when requires2faSetup is
 * returned by login. Other roles can access it from account settings.
 *
 * Uses the session JWT from AuthContext (user is already logged in).
 */

import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

export function TwoFactorSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user, refreshUser } = useAuth();

  const [step, setStep] = useState("loading"); // loading | scan | confirm | done
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef([]);

  const isRequired = location.state?.required === true;

  // Kick off setup on mount
  useEffect(() => {
    initSetup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function initSetup() {
    try {
      const res = await fetch(`${API}/api/2fa/setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setQrDataUrl(data.qrDataUrl);
      setManualCode(data.manualCode);
      setStep("scan");
    } catch (err) {
      // If already enabled, skip to done
      if (err.message?.includes("already enabled")) {
        setStep("done");
      } else {
        setError(err.message || "Failed to initialize 2FA setup");
        setStep("scan");
      }
    }
  }

  function handleDigitChange(index, value) {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length > 1) {
      const pasted = cleaned.slice(0, 6).split("");
      const next = [...digits];
      pasted.forEach((d, i) => { if (i < 6) next[i] = d; });
      setDigits(next);
      inputRefs.current[Math.min(pasted.length, 5)]?.focus();
      return;
    }
    const next = [...digits];
    next[index] = cleaned;
    setDigits(next);
    if (cleaned && index < 5) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index, e) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    const code = digits.join("");
    if (code.length !== 6) { setError("Enter all 6 digits"); return; }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API}/api/2fa/verify-setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Verification failed");
        setDigits(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
        return;
      }
      if (refreshUser) await refreshUser();
      setStep("done");
    } catch {
      setError("Network error — try again");
    } finally {
      setLoading(false);
    }
  }

  function handleDone() {
    navigate(location.state?.returnTo || "/dashboard", { replace: true });
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (step === "loading") {
    return (
      <div style={styles.page}>
        <div style={styles.spinner} />
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>

        {/* ── Step: Scan QR ─────────────────────────────────────────────── */}
        {step === "scan" && (
          <>
            <StepHeader
              step={1}
              total={2}
              icon={<PhoneIcon />}
              title="Set up your authenticator"
              sub="Scan the QR code below with Google Authenticator, Authy, or any TOTP app."
            />

            {error && <ErrorBox message={error} />}

            {qrDataUrl ? (
              <div style={styles.qrWrap}>
                <img src={qrDataUrl} alt="2FA QR Code" style={styles.qrImg} />
              </div>
            ) : (
              <div style={styles.qrPlaceholder}>
                <div style={styles.spinner} />
              </div>
            )}

            <button
              style={styles.linkBtn}
              onClick={() => setShowManual((v) => !v)}
            >
              {showManual ? "Hide" : "Can't scan?"} — enter code manually
            </button>

            {showManual && manualCode && (
              <div style={styles.manualBox}>
                <p style={styles.manualLabel}>Account: {user?.email}</p>
                <p style={styles.manualLabel}>Key (type exactly, no spaces):</p>
                <code style={styles.manualCode}>{manualCode}</code>
              </div>
            )}

            <button style={styles.btn} onClick={() => { setError(""); setStep("confirm"); setTimeout(() => inputRefs.current[0]?.focus(), 50); }}>
              I've scanned it →
            </button>

            {!isRequired && (
              <button style={styles.cancelBtn} onClick={() => navigate(-1)}>
                Skip for now
              </button>
            )}
          </>
        )}

        {/* ── Step: Confirm code ────────────────────────────────────────── */}
        {step === "confirm" && (
          <>
            <StepHeader
              step={2}
              total={2}
              icon={<ShieldIcon />}
              title="Confirm your code"
              sub="Enter the 6-digit code from your authenticator app to confirm setup."
            />

            {error && <ErrorBox message={error} />}

            <form onSubmit={handleVerify} style={styles.form}>
              <div style={styles.digitRow}>
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => (inputRefs.current[i] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={d}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    style={{
                      ...styles.digitInput,
                      borderColor: error ? "var(--danger)" : "var(--border-strong)",
                    }}
                    autoComplete="one-time-code"
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>

              <button
                type="submit"
                disabled={loading || digits.join("").length !== 6}
                style={{
                  ...styles.btn,
                  opacity: loading || digits.join("").length !== 6 ? 0.6 : 1,
                  cursor: loading || digits.join("").length !== 6 ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Verifying…" : "Activate 2FA"}
              </button>
            </form>

            <button style={styles.cancelBtn} onClick={() => { setError(""); setDigits(["","","","","",""]); setStep("scan"); }}>
              ← Back
            </button>
          </>
        )}

        {/* ── Step: Done ────────────────────────────────────────────────── */}
        {step === "done" && (
          <>
            <div style={styles.successIcon}>
              <CheckIcon />
            </div>
            <h1 style={styles.heading}>You're protected</h1>
            <p style={styles.sub}>
              Two-factor authentication is now active. You'll need your authenticator app each time you log in.
            </p>
            <button style={styles.btn} onClick={handleDone}>
              Continue to dashboard
            </button>
          </>
        )}

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepHeader({ step, total, icon, title, sub }) {
  return (
    <>
      <div style={styles.stepBadge}>{step} of {total}</div>
      <div style={styles.iconWrap}>{icon}</div>
      <h1 style={styles.heading}>{title}</h1>
      <p style={styles.sub}>{sub}</p>
    </>
  );
}

function ErrorBox({ message }) {
  return <div style={styles.errorBox}>{message}</div>;
}

function PhoneIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2"/>
      <circle cx="12" cy="18" r="1"/>
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg)",
    padding: "24px 16px",
  },
  card: {
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: "16px",
    padding: "40px 36px",
    width: "100%",
    maxWidth: "440px",
    boxShadow: "var(--shadow-lg)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "18px",
  },
  stepBadge: {
    padding: "4px 12px",
    borderRadius: "999px",
    background: "var(--accent-soft)",
    color: "var(--accent-text)",
    fontSize: "12px",
    fontWeight: "600",
    letterSpacing: "0.04em",
  },
  iconWrap: {
    width: "56px",
    height: "56px",
    borderRadius: "14px",
    background: "var(--accent-soft)",
    color: "var(--accent)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  successIcon: {
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    background: "var(--success-soft)",
    color: "var(--success)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  heading: {
    margin: 0,
    fontSize: "20px",
    fontWeight: "700",
    color: "var(--text)",
    textAlign: "center",
  },
  sub: {
    margin: 0,
    fontSize: "14px",
    color: "var(--muted)",
    textAlign: "center",
    lineHeight: "1.6",
  },
  errorBox: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "8px",
    background: "var(--dangerBg)",
    color: "var(--danger-text)",
    fontSize: "13px",
    textAlign: "center",
  },
  qrWrap: {
    padding: "16px",
    background: "#ffffff",
    borderRadius: "12px",
    border: "1px solid var(--border)",
    lineHeight: 0,
  },
  qrImg: {
    width: "180px",
    height: "180px",
    display: "block",
  },
  qrPlaceholder: {
    width: "212px",
    height: "212px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--panel2)",
    borderRadius: "12px",
  },
  manualBox: {
    width: "100%",
    background: "var(--panel2)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  manualLabel: {
    margin: 0,
    fontSize: "12px",
    color: "var(--muted)",
  },
  manualCode: {
    fontFamily: "monospace",
    fontSize: "15px",
    color: "var(--text)",
    letterSpacing: "0.12em",
    wordBreak: "break-all",
  },
  form: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  digitRow: {
    display: "flex",
    gap: "10px",
    justifyContent: "center",
  },
  digitInput: {
    width: "48px",
    height: "56px",
    borderRadius: "10px",
    border: "1.5px solid",
    background: "var(--panel2)",
    color: "var(--text)",
    fontSize: "22px",
    fontWeight: "600",
    textAlign: "center",
    outline: "none",
    transition: "border-color 0.15s",
  },
  btn: {
    width: "100%",
    padding: "13px",
    borderRadius: "10px",
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background 0.15s",
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: "var(--accent)",
    fontSize: "13px",
    cursor: "pointer",
    padding: 0,
    textDecoration: "underline",
    textDecorationColor: "transparent",
  },
  cancelBtn: {
    background: "none",
    border: "none",
    color: "var(--muted)",
    fontSize: "13px",
    cursor: "pointer",
    padding: 0,
  },
  spinner: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    border: "3px solid var(--border)",
    borderTopColor: "var(--accent)",
    animation: "spin 0.9s linear infinite",
  },
};