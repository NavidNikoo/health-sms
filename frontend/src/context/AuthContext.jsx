/**
 * context/AuthContext.jsx
 *
 * Token model:
 *   - Short-lived access JWT (auth_token) used on every API call.
 *   - Long-lived opaque refresh token (auth_refresh) used to obtain new
 *     access tokens via POST /api/auth/refresh.
 *
 * The transparent refresh flow lives in `utils/authedFetch.js`. When refresh
 * fails (or the refresh token itself is rejected), `authedFetch` clears the
 * stored tokens and dispatches a window event `auth:logged-out`. We listen
 * for that here and reset state + navigate to /login.
 */

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../utils/apiBase";
import {
  authedFetch,
  setTokens,
  clearTokens,
  getAccessToken,
  getRefreshToken,
} from "../utils/authedFetch";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();

  const [token, setTokenState] = useState(() => getAccessToken());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const applyTokens = useCallback(({ accessToken, refreshToken }) => {
    setTokens({ accessToken, refreshToken });
    setTokenState(accessToken || getAccessToken());
  }, []);

  const clearAuthState = useCallback(() => {
    clearTokens();
    setTokenState(null);
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  // ── Fetch current user using authedFetch (auto-refreshes once on 401) ────
  const fetchMe = useCallback(async () => {
    try {
      const res = await authedFetch("/auth/me");
      if (!res.ok) throw new Error("Unauthorized");
      const data = await res.json();
      setUser(data);
      setTokenState(getAccessToken());
      setIsAuthenticated(true);
      return data;
    } catch {
      clearAuthState();
      return null;
    }
  }, [clearAuthState]);

  // On mount, validate any stored token (and refresh if needed).
  useEffect(() => {
    const stored = getAccessToken();
    if (stored) {
      fetchMe().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [fetchMe]);

  // Listen for auth wipe events emitted by authedFetch on refresh failure.
  useEffect(() => {
    function handleLoggedOut() {
      clearAuthState();
      navigate("/login", { replace: true });
    }
    window.addEventListener("auth:logged-out", handleLoggedOut);
    return () => window.removeEventListener("auth:logged-out", handleLoggedOut);
  }, [clearAuthState, navigate]);

  // ── signup() — called by SignupPage ──────────────────────────────────────
  async function signup({ orgName, email, password }) {
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName, email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        return { error: data.message || "Signup failed" };
      }

      applyTokens({
        accessToken: data.accessToken || data.token,
        refreshToken: data.refreshToken,
      });
      await fetchMe();

      // New admins always need to set up 2FA
      return { requires2faSetup: true };
    } catch (err) {
      console.error("Signup network error:", err);
      return {
        error: `Couldn't reach the server at ${API_BASE}. Make sure the backend is running.`,
      };
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
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        return { error: data.message || "Login failed" };
      }

      // Password OK but TOTP step required — no session tokens issued yet.
      if (data.requires2fa) {
        return { requires2fa: true, preAuthToken: data.preAuthToken };
      }

      applyTokens({
        accessToken: data.accessToken || data.token,
        refreshToken: data.refreshToken,
      });
      await fetchMe();

      // Admin has a valid session but hasn't set up 2FA yet
      if (data.requires2faSetup) {
        return { requires2faSetup: true };
      }

      navigate("/dashboard", { replace: true });
      return { ok: true };
    } catch (err) {
      console.error("Login network error:", err);
      return {
        error: `Couldn't reach the server at ${API_BASE}. Make sure the backend is running.`,
      };
    }
  }

  // ── loginWithToken() — called by TwoFactorVerifyPage ─────────────────────
  function loginWithToken(jwt, userData, refreshToken) {
    applyTokens({ accessToken: jwt, refreshToken });
    setUser(userData);
    setIsAuthenticated(true);
  }

  function setSession({ user: userData, token: accessToken, accessToken: explicitAccessToken, refreshToken }) {
    applyTokens({ accessToken: explicitAccessToken || accessToken, refreshToken });
    setUser(userData);
    setIsAuthenticated(true);
  }

  // ── refreshUser() — re-fetch user after 2FA setup completes ──────────────
  async function refreshUser() {
    if (getAccessToken()) await fetchMe();
  }

  // ── logout() ─────────────────────────────────────────────────────────────
  async function logout() {
    const access = getAccessToken();
    const refresh = getRefreshToken();
    if (access) {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(refresh ? { refreshToken: refresh } : {}),
        });
      } catch {
        // ignore — local state is the source of truth
      }
    }
    clearAuthState();
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
      setSession,
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
