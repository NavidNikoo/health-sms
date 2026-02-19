import { Link } from "react-router-dom";
import "./AuthPages.css";

export function SignupPage() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-subtitle">
          For this prototype, use the provided demo credentials on the sign in
          page. A full signup flow can be added later.
        </p>
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <label className="auth-field">
            <span>Organization name</span>
            <input type="text" placeholder="Demo Clinic" disabled />
          </label>
          <label className="auth-field">
            <span>Email</span>
            <input type="email" placeholder="you@example.com" disabled />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input type="password" disabled />
          </label>
          <button type="submit" className="auth-submit" disabled>
            Sign up (disabled in demo)
          </button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

