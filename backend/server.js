/**
 * server.js (updated — adds /api/2fa route)
 * Only the route registration block changes; everything else is identical.
 */
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

async function start() {
  if (process.env.AWS_SSM_PREFIX) {
    const { loadSecrets } = require("./lib/loadSecrets");
    await loadSecrets();
  }

  const app = express();
  const PORT = process.env.PORT || 3000;

  // When deployed behind a load balancer/proxy, trust the first hop so that
  // `req.ip` and rate-limiting key generation reflect the real client address.
  // Configurable via TRUST_PROXY (number/boolean/csv per Express docs).
  if (process.env.TRUST_PROXY) {
    const tp = process.env.TRUST_PROXY;
    if (tp === "true") app.set("trust proxy", true);
    else if (tp === "false") app.set("trust proxy", false);
    else if (/^\d+$/.test(tp)) app.set("trust proxy", Number(tp));
    else app.set("trust proxy", tp);
  } else if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  app.use(helmet({
    contentSecurityPolicy: false,
    hsts: { maxAge: 63072000, includeSubDomains: true },
  }));

  const fromEnv = (process.env.FRONTEND_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowedOrigins = new Set([
    ...fromEnv,
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
  ]);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin)) return callback(null, true);
        if (
          process.env.NODE_ENV !== "production" &&
          /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
        ) {
          return callback(null, true);
        }
        callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: "64kb" }));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Health SMS API running" });
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  app.use("/api/auth",                     require("./routes/auth"));
  app.use("/api/2fa",                      require("./routes/2fa"));   // NEW
  app.use("/api/patients",                 require("./routes/patients"));
  app.use("/api/conversations",            require("./routes/conversations"));
  app.use("/api/phone-numbers",            require("./routes/phoneNumbers"));
  app.use("/api/authorized-forward-numbers", require("./routes/authorizedForwardNumbers"));
  app.use("/api/templates",                require("./routes/templates"));
  app.use("/api/webhooks",                 require("./routes/webhooks"));
  app.use("/api/voice",                    require("./routes/voice"));
  app.use("/api/porting",                  require("./routes/porting"));
  app.use("/api/compliance",               require("./routes/compliance"));

  // ── Global error handler ─────────────────────────────────────────────────
  // Never log the full Error object (which can capture request fields,
  // headers, or query params containing PHI). We log only `err.message`.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const { logError } = require("./lib/safeLog");
    logError("[unhandled]", err);
    res.status(500).json({ message: "Internal server error" });
  });

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});