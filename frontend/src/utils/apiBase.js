const rawApiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
const normalizedApiUrl = rawApiUrl.replace(/\/+$/, "");

export const API_BASE = normalizedApiUrl.endsWith("/api")
  ? normalizedApiUrl
  : `${normalizedApiUrl}/api`;

