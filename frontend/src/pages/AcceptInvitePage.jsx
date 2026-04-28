import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getInvitePreview, acceptInvite } from "../utils/api";
import "./AuthPages.css";

export function AcceptInvitePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setSession } = useAuth();
  const token = params.get("token") || "";

  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const prev = document.documentElement.style.backgroundColor;
    document.documentElement.style.backgroundColor = "#050505";
    return () => { document.documentElement.style.backgroundColor = prev; };
  }, []);

  useEffect(() => {
    if (!token) {
      setError("Missing invite token");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const data = await getInvitePreview(token);
        setPreview(data.invite);
      } catch (err) {
        setError(err.message || "Invalid invite");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const result = await acceptInvite({ token, password });
      setSession({ user: result.user, token: result.token });
      navigate("/inbox");
    } catch (err) {
      setError(err.message || "Failed to accept invite");
    } finally {
      setSubmitting(false);
    }
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
              You&apos;re invited<br />to join the team.
            </h2>
            <p className="auth-panel-sub">
              Accept your invitation to start collaborating on secure patient messaging with your organization.
            </p>
          </div>
        </div>

        {/* Right panel — accept form */}
        <div className="auth-panel-right">
          <div className="auth-card">
            <h1 className="auth-title">Accept Invitation</h1>

            {loading && <p className="auth-subtitle">Checking invite…</p>}

            {!loading && error && !preview && (
              <>
                <div className="auth-error">{error}</div>
                <p className="auth-footer">
                  <Link to="/login">Back to sign in</Link>
                </p>
              </>
            )}

            {!loading && preview && (
              <>
                <p className="auth-subtitle">
                  You&apos;ve been invited to join <strong>{preview.orgName}</strong> as{" "}
                  <strong>{preview.role}</strong>.
                </p>
                <p className="auth-subtitle" style={{ marginTop: 4 }}>
                  Email: <code>{preview.email}</code>
                </p>

                {error && <div className="auth-error">{error}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                  <label className="auth-field">
                    <span>Create a password</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      required
                      minLength={8}
                    />
                  </label>
                  <label className="auth-field">
                    <span>Confirm password</span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      required
                      minLength={8}
                    />
                  </label>
                  <button type="submit" className="auth-submit" disabled={submitting}>
                    {submitting ? "Creating account…" : "Accept & Create Account"}
                  </button>
                </form>

                <p className="auth-footer">
                  Already have an account? <Link to="/login">Sign in</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
