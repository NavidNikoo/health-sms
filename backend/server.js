const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Simple health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Health SMS API running" });
});

// Routes
const authRouter = require("./routes/auth");
const patientsRouter = require("./routes/patients");
const conversationsRouter = require("./routes/conversations");
const phoneNumbersRouter = require("./routes/phoneNumbers");

app.use("/api/auth", authRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/phone-numbers", phoneNumbersRouter);

const webhooksRouter = require("./routes/webhooks");
app.use("/api/webhooks", webhooksRouter);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

