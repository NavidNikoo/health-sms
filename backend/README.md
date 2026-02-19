# Health SMS Backend

## Database Setup

### 1. Create the database (if it doesn't exist)

```bash
createdb health_sms
```

Or via `psql`:

```bash
psql -U postgres -c "CREATE DATABASE health_sms;"
```

### 2. Run the schema

```bash
psql -U postgres -d health_sms -f schema.sql
```

### 3. Seed demo data (optional)

```bash
psql -U postgres -d health_sms -f scripts/seed.sql
```

Demo login: **provider@clinic.demo** / **password123**

### 4. Start the server

```bash
npm install
npm start
```

Ensure your `backend/.env` has the correct Postgres credentials.

## Twilio (Real SMS)

To send real SMS, add to `.env`:
- `TWILIO_ACCOUNT_SID` - from [Twilio Console](https://console.twilio.com)
- `TWILIO_AUTH_TOKEN` - from Twilio Console

Then set `provider_sid` on your phone numbers to the Twilio number SID (e.g. `PN...`). Without Twilio configured, messages are stored in the DB only.
