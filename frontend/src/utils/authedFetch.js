/**
 * authedFetch.js — fetch wrapper that transparently refreshes the access
 * token when it expires.
 *
 * Token storage:
 *   localStorage["auth_token"]      — short-lived access JWT
 *   localStorage["auth_refresh"]    — opaque refresh token
 *
 * Behavior:
 *   - Attaches `Authorization: Bearer <accessToken>` if available.
 *   - On a 401 response, attempts a single refresh against /api/auth/refresh.
 *   - On successful refresh, retries the original request once.
 *   - On refresh failure, clears tokens and dispatches a window event
 *     `auth:logged-out` so AuthContext can navigate the user to /login.
 */

import { API_BASE } from "./apiBase";

const ACCESS_KEY = "auth_token";
const REFRESH_KEY = "auth_refresh";

let inflightRefresh = null;

export function getAccessToken() {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens({ accessToken, refreshToken } = {}) {
  if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

function notifyLoggedOut(reason) {
  window.dispatchEvent(new CustomEvent("auth:logged-out", { detail: { reason } }));
}

async function refreshOnce() {
  if (inflightRefresh) return inflightRefresh;
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  inflightRefresh = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        clearTokens();
        notifyLoggedOut("refresh_failed");
        return null;
      }
      const data = await res.json();
      if (!data?.accessToken && !data?.token) {
        clearTokens();
        notifyLoggedOut("refresh_failed");
        return null;
      }
      const newAccess = data.accessToken || data.token;
      setTokens({
        accessToken: newAccess,
        refreshToken: data.refreshToken,
      });
      return newAccess;
    } catch {
      clearTokens();
      notifyLoggedOut("refresh_failed");
      return null;
    } finally {
      inflightRefresh = null;
    }
  })();

  return inflightRefresh;
}

function buildHeaders(headers, accessToken, hasJsonBody) {
  const merged = new Headers(headers || {});
  if (accessToken) {
    merged.set("Authorization", `Bearer ${accessToken}`);
  }
  if (hasJsonBody && !merged.has("Content-Type")) {
    merged.set("Content-Type", "application/json");
  }
  return merged;
}

/**
 * authedFetch(path, opts?) — `path` is appended to API_BASE unless it starts
 * with "http". `opts` accepts everything `fetch` does, plus:
 *   - opts.skipRefresh: don't try to auto-refresh on 401 (used internally).
 */
export async function authedFetch(path, opts = {}) {
  const url = /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`;
  const accessToken = getAccessToken();
  const hasJsonBody =
    opts.body && !(opts.body instanceof FormData) && typeof opts.body === "string";

  const headers = buildHeaders(opts.headers, accessToken, hasJsonBody);
  const init = { ...opts, headers };

  let response = await fetch(url, init);

  if (response.status !== 401 || opts.skipRefresh) {
    return response;
  }

  // First 401 — attempt refresh once.
  const newAccess = await refreshOnce();
  if (!newAccess) return response;

  const retryHeaders = buildHeaders(opts.headers, newAccess, hasJsonBody);
  response = await fetch(url, { ...opts, headers: retryHeaders });
  return response;
}

/** Convenience: parse JSON or throw an Error with the server message. */
export async function authedJson(path, opts = {}) {
  const res = await authedFetch(path, opts);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // ignore
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}
