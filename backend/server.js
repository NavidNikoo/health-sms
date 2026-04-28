const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

async function start() {
  // On production (EC2), load secrets from SSM Parameter Store before anything
  // else reads process.env. Set AWS_SSM_PREFIX=/health-sms/prod/ in the
  // instance environment (e.g. via ecosystem.config.js or the OS) instead of
  // shipping a .env file to the server.
  if (process.env.AWS_SSM_PREFIX) {
    const { loadSecrets } = require("./lib/loadSecrets");
    await loadSecrets();
  }

  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(helmet({
    contentSecurityPolicy: false, // handled by nginx in production
    hsts: { maxAge: 63072000, includeSubDomains: true },
  }));

  // CORS: allow FRONTEND_ORIGIN (comma-separated in prod) plus common Vite dev ports.
  // If Vite picks 5174 because 5173 is busy, requests from http://localhost:5174
  // must be allowed or the browser shows "Failed to fetch" / "Cannot reach server".
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
        if (!origin) return callback(null, true); // curl, same-origin tools
        if (allowedOrigins.has(origin)) return callback(null, true);
        // Non-production: allow any localhost / 127.0.0.1 port (Vite may use 5175+)
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
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Health SMS API running" });
  });

  const authRouter = require("./routes/auth");
  const patientsRouter = require("./routes/patients");
  const conversationsRouter = require("./routes/conversations");
  const phoneNumbersRouter = require("./routes/phoneNumbers");
  const authorizedForwardNumbersRouter = require("./routes/authorizedForwardNumbers");
  const templatesRouter = require("./routes/templates");
  const webhooksRouter = require("./routes/webhooks");
  const voiceRouter = require("./routes/voice");
  const portingRouter = require("./routes/porting");
  const complianceRouter = require("./routes/compliance");
  const userMessagesRouter = require("./routes/userMessages");
  const usersRouter = require("./routes/users");

  app.use("/api/auth", authRouter);
  app.use("/api/patients", patientsRouter);
  app.use("/api/conversations", conversationsRouter);
  app.use("/api/phone-numbers", phoneNumbersRouter);
  app.use("/api/authorized-forward-numbers", authorizedForwardNumbersRouter);
  app.use("/api/templates", templatesRouter);
  app.use("/api/webhooks", webhooksRouter);
  app.use("/api/voice", voiceRouter);
  app.use("/api/porting", portingRouter);
  app.use("/api/compliance", complianceRouter);
  app.use("/api/user-messages", userMessagesRouter);
  app.use("/api/users", usersRouter);

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
