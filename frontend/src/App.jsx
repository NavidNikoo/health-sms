/**
 * App.jsx  (updated for 2FA)
 *
 * New routes added:
 *   /2fa/verify  — TwoFactorVerifyPage  (step 2 of login, no auth required)
 *   /2fa/setup   — TwoFactorSetupPage   (protected; admins land here after signup/login)
 *
 * ProtectedRoute now also checks requires2faSetup so admins who haven't
 * configured 2FA are redirected to /2fa/setup before reaching any dashboard.
 */

import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect } from "react";

import { LandingPage }           from "./pages/LandingPage";
import { LoginPage }             from "./pages/LoginPage";
import { SignupPage }            from "./pages/SignupPage";
import { DashboardPage }         from "./pages/DashboardPage";
import { InboxPage }             from "./pages/InboxPage";
import { DialerPage }            from "./pages/DialerPage";
import { ContactsPage }          from "./pages/ContactsPage";
import { NumbersPage }           from "./pages/NumbersPage";
import { DirectMessagesPage }    from "./pages/DirectMessagesPage";
import { AcceptInvitePage }      from "./pages/AcceptInvitePage";
import { TwoFactorVerifyPage }   from "./pages/TwoFactorVerifyPage";
import { TwoFactorSetupPage }    from "./pages/TwoFactorSetupPage";

import { AuthProvider, useAuth } from "./context/AuthContext";
import "./App.css";

// ─── ProtectedRoute ──────────────────────────────────────────────────────────

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && isAuthenticated && user?.role === "admin" && user?.totpEnabled === false) {
      // Admin is authenticated but hasn't set up 2FA — redirect to setup
      navigate("/2fa/setup", { replace: true, state: { required: true } });
    }
  }, [loading, isAuthenticated, user, navigate]);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/"               element={<LandingPage />} />
      <Route path="/login"          element={<LoginPage />} />
      <Route path="/signup"         element={<SignupPage />} />
      <Route path="/accept-invite"  element={<AcceptInvitePage />} />

      {/* 2FA — no JWT required (pre-auth token used instead) */}
      <Route path="/2fa/verify"     element={<TwoFactorVerifyPage />} />

      {/* 2FA setup — JWT required (user is logged in, just hasn't set up 2FA) */}
      <Route path="/2fa/setup" element={
        <ProtectedRoute>
          <TwoFactorSetupPage />
        </ProtectedRoute>
      } />

      {/* Protected app routes */}
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/inbox"     element={<ProtectedRoute><InboxPage /></ProtectedRoute>} />
      <Route path="/dialer"    element={<ProtectedRoute><DialerPage /></ProtectedRoute>} />
      <Route path="/contacts"  element={<ProtectedRoute><ContactsPage /></ProtectedRoute>} />
      <Route path="/numbers"   element={<ProtectedRoute><NumbersPage /></ProtectedRoute>} />
      <Route path="/messages"  element={<ProtectedRoute><DirectMessagesPage /></ProtectedRoute>} />

      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  useEffect(() => {
    const stored = window.localStorage.getItem("theme");
    document.documentElement.dataset.theme = stored || "dark";
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app-root">
          <AppRoutes />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}