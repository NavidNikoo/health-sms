/**
 * context/AuthContext.jsx  (updated for 2FA)
 *
 * Changes from original:
 *   - login() now handles the requires2fa / requires2faSetup flags returned by
 *     the server and navigates accordingly instead of always storing a token.
 *   - loginWithToken() added — called by TwoFactorVerifyPage after the TOTP
 *     step succeeds to store the real session token.
 *   - refreshUser() added — called by TwoFactorSetupPage after setup completes
 *     to pull the updated totpEnabled flag into context.
 *   - token is exposed on the context so pages can attach it to API calls.
 */

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";
const TOKEN_KEY = "auth_token";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();

  const [token, setToken]               = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser]                 = useState(null);
  const [loading, setLoading]           = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // ── Fetch current user from /api/auth/me ─────────────────────────────────
  const fetchMe = useCallback(async (jwt) => {
    try {
      const res = await fetch(`${API}/api/auth/me`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) throw new Error("Unauthorized");
      const data = await res.json();
      setUser(data);
      setIsAuthenticated(true);
      return data;
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
      return null;
    }
  }, []);

  // On mount, validate any stored token
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      fetchMe(stored).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [fetchMe]);

  // ── signup() — called by SignupPage ──────────────────────────────────────
  async function signup({ orgName, email, password }) {
    try {
      const res = await fetch(`${API}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName, email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        return { error: data.message || "Signup failed" };
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      await fetchMe(data.token);

      // New admins always need to set up 2FA
      return { requires2faSetup: true };
    } catch {
      return { error: "Network error — check your connection" };
    }
  }

  // ── login() — called by LoginPage with email + password ──────────────────
  /**
   * Returns one of:
   *   { ok: true }                          — fully logged in, navigate handled
   *   { requires2fa: true, preAuthToken }   — caller should navigate to /2fa/verify
   *   { requires2faSetup: true }            — caller should navigate to /2fa/setup
   *   { error: string }                     — show to user
   */
  async function login(email, password) {
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        return { error: data.message || "Login failed" };
      }

      // Password OK but TOTP step required
      if (data.requires2fa) {
        return { requires2fa: true, preAuthToken: data.preAuthToken };
      }

      // Store the full session token
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      await fetchMe(data.token);

      // Admin has a valid session but hasn't set up 2FA yet
      if (data.requires2faSetup) {
        return { requires2faSetup: true };
      }

      navigate("/dashboard", { replace: true });
      return { ok: true };
    } catch {
      return { error: "Network error — check your connection" };
    }
  }

  // ── loginWithToken() — called by TwoFactorVerifyPage ─────────────────────
  function loginWithToken(jwt, userData) {
    localStorage.setItem(TOKEN_KEY, jwt);
    setToken(jwt);
    setUser(userData);
    setIsAuthenticated(true);
  }

  // ── refreshUser() — re-fetch user after 2FA setup completes ──────────────
  async function refreshUser() {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) await fetchMe(stored);
  }

  // ── logout() ─────────────────────────────────────────────────────────────
  async function logout() {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      try {
        await fetch(`${API}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${stored}` },
        });
      } catch {
        // ignore
      }
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    navigate("/login", { replace: true });
  }

  return (
    <AuthContext.Provider value={{
      token,
      user,
      loading,
      isAuthenticated,
      login,
      signup,
      loginWithToken,
      refreshUser,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}