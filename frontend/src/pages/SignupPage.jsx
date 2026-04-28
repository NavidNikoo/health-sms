import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./AuthPages.css";

export function SignupPage() {
  const navigate = useNavigate();
  const { signup, isAuthenticated } = useAuth();
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const prev = document.documentElement.style.backgroundColor;
    document.documentElement.style.backgroundColor = "#050505";
    return () => { document.documentElement.style.backgroundColor = prev; };
  }, []);

  if (isAuthenticated) {
    navigate("/inbox");
  }

  const passwordChecks = [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "Passwords match", ok: password.length > 0 && password === confirm },
  ];

  const isValid =
    orgName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    password === confirm;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) return;
    setError("");
    setLoading(true);

    const result = await signup({ orgName: orgName.trim(), email: email.trim(), password });

    setLoading(false);

    if (result?.error) {
      setError(
        result.error === "Failed to fetch"
          ? "Cannot reach the server. Is the backend running?"
          : result.error
      );
      return;
    }

    // New admins must set up 2FA before accessing the app
    if (result?.requires2faSetup) {
      navigate("/2fa/setup", {
        replace: true,
        state: { required: true },
      });
      return;
    }

    // Fallback (shouldn't normally reach here)
    navigate("/inbox");
  };

  return (
    <div className="auth-page">
      <div className="auth-glow" aria-hidden="true" />

      <div className="auth-split">
        {/* Left panel */}
        <div className="auth-panel-left">
          <Link to="/" className="auth-back-link">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to home
          </Link>

          <div className="auth-panel-content">
            <div className="auth-brand">
              <div className="auth-brand-icon">
                <svg width="22" height="22" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <span className="auth-brand-name">Health SMS</span>
            </div>

            <h2 className="auth-panel-headline">
              Start messaging<br />patients in minutes.
            </h2>
            <p className="auth-panel-sub">
              Create your organization, add a phone number, and you&apos;re live. No complex setup required.
            </p>

            <div className="auth-panel-features">
              <div className="auth-panel-feat">
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
                <span>Free to get started</span>
              </div>
              <div className="auth-panel-feat">
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
                <span>No credit card required</span>
              </div>
              <div className="auth-panel-feat">
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
                <span>Set up in under 5 minutes</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel — signup form */}
        <div className="auth-panel-right">
          <div className="auth-card auth-card-signup">
            <h1 className="auth-title">Create your account</h1>
            <p className="auth-subtitle">
              Set up your organization and start messaging patients.
            </p>

            {error && <div className="auth-error">{error}</div>}

            <form onSubmit={handleSubmit} className="auth-form">
              <label className="auth-field">
                <span>Organization name</span>
                <input
                  type="text"
                  placeholder="e.g. Riverside Health Clinic"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                  autoFocus
                />
              </label>

              <label className="auth-field">
                <span>Email</span>
                <input
                  type="email"
                  placeholder="you@yourorg.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>

              <label className="auth-field">
                <span>Password</span>
                <div className="auth-password-wrap">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    ) : (
                      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </button>
                </div>
              </label>

              <label className="auth-field">
                <span>Confirm password</span>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Re-enter password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </label>

              {password.length > 0 && (
                <div className="auth-checks">
                  {passwordChecks.map((c) => (
                    <div key={c.label} className={"auth-check" + (c.ok ? " auth-check-ok" : "")}>
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        {c.ok ? <path d="M20 6L9 17l-5-5" /> : <circle cx="12" cy="12" r="8" />}
                      </svg>
                      <span>{c.label}</span>
                    </div>
                  ))}
                </div>
              )}

              <button type="submit" className="auth-submit" disabled={loading || !isValid}>
                {loading ? "Creating account..." : "Create account"}
              </button>
            </form>

            <p className="auth-footer">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}