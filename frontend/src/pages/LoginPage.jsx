/**
 * LoginPage.jsx  (updated for 2FA)
 *
 * Changes from original:
 *   - After login(), checks result for requires2fa / requires2faSetup flags.
 *   - Navigates to /2fa/verify (with preAuthToken in state) when 2FA is needed.
 *   - Navigates to /2fa/setup (with required: true) when admin hasn't set up 2FA.
 *
 * Everything else (styling, form, error display) should match your existing
 * LoginPage — this is a minimal diff showing only the logic changes.
 * Replace the handleSubmit / result-handling section of your existing file.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await login(email.trim(), password);

    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.requires2fa) {
      // Password OK — send user to the TOTP step
      navigate("/2fa/verify", {
        replace: true,
        state: { preAuthToken: result.preAuthToken },
      });
      return;
    }

    if (result.requires2faSetup) {
      // Admin session is active but 2FA hasn't been configured yet
      navigate("/2fa/setup", {
        replace: true,
        state: { required: true },
      });
      return;
    }

    // result.ok — AuthContext already navigated to /dashboard
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Sign in</h1>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={styles.input}
              placeholder="you@clinic.com"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={styles.input}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ ...styles.btn, opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p style={styles.footer}>
          Don't have an account?{" "}
          <Link to="/signup" style={{ color: "var(--accent)" }}>Create one</Link>
        </p>
      </div>
    </div>
  );
}

// ─── Styles (match your existing LoginPage design) ────────────────────────────

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
    gap: "20px",
  },
  heading: {
    margin: 0,
    fontSize: "22px",
    fontWeight: "700",
    color: "var(--text)",
  },
  errorBox: {
    padding: "12px 14px",
    borderRadius: "8px",
    background: "var(--dangerBg)",
    color: "var(--danger-text)",
    fontSize: "13px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "13px",
    fontWeight: "500",
    color: "var(--muted)",
  },
  input: {
    padding: "11px 14px",
    borderRadius: "8px",
    border: "1.5px solid var(--border)",
    background: "var(--panel2)",
    color: "var(--text)",
    fontSize: "15px",
    outline: "none",
  },
  btn: {
    padding: "13px",
    borderRadius: "10px",
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    fontSize: "15px",
    fontWeight: "600",
    marginTop: "4px",
    transition: "background 0.15s",
  },
  footer: {
    margin: 0,
    fontSize: "13px",
    color: "var(--muted)",
    textAlign: "center",
  },
};