import { createContext, useContext, useEffect, useState } from "react";
import { login as apiLogin, signup as apiSignup, getMe } from "../utils/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("authToken");
    if (!storedToken) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const me = await getMe(storedToken);
        setUser(me);
        setToken(storedToken);
      } catch {
        window.localStorage.removeItem("authToken");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleLogin = async (email, password) => {
    const result = await apiLogin(email, password);
    setUser(result.user);
    setToken(result.token);
    window.localStorage.setItem("authToken", result.token);
  };

  const handleSignup = async ({ orgName, email, password }) => {
    const result = await apiSignup({ orgName, email, password });
    setUser(result.user);
    setToken(result.token);
    window.localStorage.setItem("authToken", result.token);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    window.localStorage.removeItem("authToken");
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!user && !!token,
    login: handleLogin,
    signup: handleSignup,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

