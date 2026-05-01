# Health SMS – HIPAA-Oriented Cloud Messaging Platform

Cloud Computing & Security Project  
Team: Navid Nikoo, Christian Ramirez, Matin Noorzaye, Miguel Romero-Mojica

---

## Project Overview

Health SMS is a cloud-based messaging platform for healthcare providers. It supports patient SMS conversations, organization-scoped team chat, and demonstrates HIPAA-minded technical safeguards (encryption at rest for message bodies, audit logging, 2FA, Twilio webhook validation, retention helpers).

---

## Tech Stack

| Layer | Stack |
|--------|--------|
| Frontend | React (Vite), React Router |
| Backend | Node.js, Express |
| Database | **PostgreSQL** (via `pg` / `DATABASE_URL` or `PG*` env vars) |
| SMS / Voice | Twilio (optional; configure per `.env`) |

---

## Repository Layout

```
health-sms/
├── frontend/          React (Vite) SPA
├── backend/           Express API (`server.js`)
│   ├── routes/        Auth, patients, conversations, webhooks, users, team chat, …
│   ├── schema.sql     Base PostgreSQL schema
│   └── scripts/       SQL migrations (invites, 2FA, sessions, team chat, …)
└── infra/             Cloud & Docker (as needed)
```

---

## Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ with a database (e.g. `health_sms`)

### 1. Clone

```bash
git clone https://github.com/NavidNikoo/health-sms.git
cd health-sms
```

### 2. Database

Create the database and apply the base schema, then run migrations you need (at minimum: team chat + invites if you use those features):

```bash
createdb health_sms   # or use your host’s equivalent
psql -U postgres -d health_sms -f backend/schema.sql
psql -U postgres -d health_sms -f backend/scripts/migrate_dm.sql
psql -U postgres -d health_sms -f backend/scripts/migrate_invites.sql
# Optional: seed demo data
psql -U postgres -d health_sms -f backend/scripts/seed.sql
```

See `backend/scripts/` for additional migrations (2FA, sessions, porting, internal notes, etc.).

### 3. Backend

```bash
cd backend
cp .env.example .env
# Edit .env: JWT_SECRET, PostgreSQL, optional Twilio, PHI_ENCRYPTION_KEY, etc.
npm install
npm start
```

API base: **http://localhost:3000**  
Health check: **GET** `/api/health`

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

App: **http://localhost:5173**

Set `VITE_API_BASE` (or your project’s API base per `frontend/src/utils/apiBase.js`) if the API is not the default `http://localhost:3000/api`.

---

## Main API Surface (Express)

Mounted under `/api` (see `backend/server.js`):

| Prefix | Purpose |
|--------|---------|
| `/api/auth` | Login, signup, refresh, logout, **invite preview & accept** (`GET /auth/invites/:token`, `POST /auth/accept-invite`) |
| `/api/2fa` | TOTP setup and verification |
| `/api/patients` | Patient CRUD |
| `/api/conversations` | SMS threads, messages, internal notes |
| `/api/phone-numbers` | Clinic numbers, Twilio integration |
| `/api/webhooks` | Twilio SMS / status webhooks |
| `/api/users` | Org directory, **admin org invites** |
| `/api/user-messages` | **Team chat** (profiles, requests, threads, encrypted DMs) |
| `/api/compliance` | 10DLC / retention / billing flags |
| `/api/porting`, `/api/voice`, … | As implemented in `routes/` |

---

## Security & Configuration Notes

- Do **not** commit `.env`. Use `backend/.env.example` as a template.
- `PHI_ENCRYPTION_KEY` (64 hex chars) enables AES-256-GCM for SMS and team message bodies; without it, dev may store plaintext (see `backend/lib/phiCrypto.js`).
- Production: set `FRONTEND_ORIGIN`, `BASE_URL` for Twilio signatures, and consider `AWS_SSM_PREFIX` for secrets (`backend/lib/loadSecrets.js`).
- Org invites: create/list/revoke require **admin**; new users can accept via link + `POST /api/auth/accept-invite` or in-app flows.

---

## Development Workflow

```bash
git pull origin main
git checkout -b feature/your-feature-name
# … changes …
git add …
git commit -m "Clear description of changes"
git push origin feature/your-feature-name
```

Open a Pull Request when ready.

---

## Repository

**https://github.com/NavidNikoo/health-sms**

---

## Team

Clone the repo, run PostgreSQL migrations, configure `backend/.env`, and confirm both servers start. For demo accounts, see `backend/scripts/seed.sql` (demo credentials documented there—change them in any shared environment).
