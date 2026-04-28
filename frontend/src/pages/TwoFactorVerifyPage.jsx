/**
 * TwoFactorVerifyPage.jsx
 *
 * Shown after a successful password login for accounts with 2FA enabled.
 * The user enters their 6-digit TOTP code to complete sign-in.
 *
 * Expects navigation state: { preAuthToken: string }
 * On success, calls AuthContext.loginWithToken() and redirects to /dashboard.
 */

import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

export function TwoFactorVerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginWithToken } = useAuth();

  const preAuthToken = location.state?.preAuthToken;

  // 6 individual digit inputs
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (!preAuthToken) {
      navigate("/login", { replace: true });
      return;
    }
    // Auto-focus first input
    inputRefs.current[0]?.focus();
  }, [preAuthToken, navigate]);

  function handleDigitChange(index, value) {
    // Accept only digits; handle paste of full 6-digit code
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length > 1) {
      // User pasted a full code
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
    if (cleaned && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const code = digits.join("");
    if (code.length !== 6) {
      setError("Enter all 6 digits");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API}/api/2fa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preAuthToken, code }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Verification failed");
        setDigits(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
        return;
      }

      loginWithToken(data.token, data.user);
      navigate("/dashboard", { replace: true });
    } catch {
      setError("Network error — check your connection and try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Icon */}
        <div style={styles.iconWrap}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="10" rx="2"/>
            <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
          </svg>
        </div>

        <h1 style={styles.heading}>Two-factor authentication</h1>
        <p style={styles.sub}>
          Open your authenticator app and enter the 6-digit code for HealthSMS.
        </p>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
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
            {loading ? "Verifying…" : "Verify"}
          </button>
        </form>

        <button
          style={styles.backLink}
          onClick={() => navigate("/login", { replace: true })}
        >
          ← Back to login
        </button>
      </div>
    </div>
  );
}

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
    maxWidth: "420px",
    boxShadow: "var(--shadow-lg)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "20px",
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
    transition: "border-color 0.15s, box-shadow 0.15s",
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
    transition: "background 0.15s",
  },
  backLink: {
    background: "none",
    border: "none",
    color: "var(--muted)",
    fontSize: "13px",
    cursor: "pointer",
    padding: 0,
  },
};