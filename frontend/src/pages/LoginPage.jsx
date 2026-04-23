import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./AuthPages.css";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("provider@clinic.demo");
  const [password, setPassword] = useState("password123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const prev = document.documentElement.style.backgroundColor;
    document.documentElement.style.backgroundColor = "#050505";
    return () => { document.documentElement.style.backgroundColor = prev; };
  }, []);

  if (isAuthenticated) {
    navigate("/inbox");
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/inbox");
    } catch (err) {
      const msg = err.message || "Login failed";
      setError(
        msg === "Failed to fetch"
          ? "Cannot reach the server. Is the backend running at http://localhost:3000?"
          : msg
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-glow" aria-hidden="true" />

      <div className="auth-split">
        {/* Left panel — branding / value prop */}
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
              Secure messaging<br />for modern clinics.
            </h2>
            <p className="auth-panel-sub">
              HIPAA-aligned texting, calling, and patient management — all in one unified platform.
            </p>

            <div className="auth-panel-features">
              <div className="auth-panel-feat">
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
                <span>Encrypted message storage</span>
              </div>
              <div className="auth-panel-feat">
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
                <span>Built-in audit logging</span>
              </div>
              <div className="auth-panel-feat">
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
                <span>Multi-number unified inbox</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel — login form */}
        <div className="auth-panel-right">
          <div className="auth-card">
            <h1 className="auth-title">Welcome back</h1>
            <p className="auth-subtitle">
              Demo: <code>provider@clinic.demo</code> / <code>password123</code>
            </p>

            {error && <div className="auth-error">{error}</div>}

            <form onSubmit={handleSubmit} className="auth-form">
              <label className="auth-field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@clinic.com"
                  required
                />
              </label>
              <label className="auth-field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </label>
              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <p className="auth-footer">
              Don&apos;t have an account? <Link to="/signup">Create one</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
