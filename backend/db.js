const { Pool } = require("pg");
require("dotenv").config();

// Use DATABASE_URL if provided (e.g., cloud Postgres), otherwise fall back to local defaults.
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        // Enable SSL for managed databases if needed
        ssl:
          process.env.DB_SSL === "true"
            ? { rejectUnauthorized: false }
            : undefined,
      }
    : {
        host: process.env.PGHOST || "localhost",
        port: Number(process.env.PGPORT) || 5432,
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD || "",
        database: process.env.PGDATABASE || "health_sms",
      }
);

module.exports = {
  /**
   * Helper for parameterized queries.
   * Example: db.query('SELECT * FROM users WHERE id = $1', [id])
   */
  query: (text, params) => pool.query(text, params),
  pool,
};

