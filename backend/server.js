const express = require("express");
const cors = require("cors");
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

  app.use(
    cors({
      origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
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

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
