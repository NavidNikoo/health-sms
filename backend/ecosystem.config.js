module.exports = {
  apps: [
    {
      name: "health-sms",
      script: "server.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        // Tell the app to pull all other secrets (PGPASSWORD, JWT_SECRET,
        // TWILIO_*, etc.) from SSM Parameter Store at startup.
        // No .env file needed on the server.
        AWS_SSM_PREFIX: "/health-sms/prod/",
        AWS_REGION: "us-east-1",
      },
    },
  ],
};
