---

# Health SMS – HIPAA-Oriented Cloud Messaging Platform

Cloud Computing & Security Project
Team: Navid Nikoo, Christian Ramirez, Matin Noorzaye, Miguel Romero-Mojica

---

## Project Overview

Health SMS is a cloud-based messaging platform designed for healthcare providers. The system focuses on secure communication and demonstrates HIPAA-aligned technical safeguards.

The goal of this project is to build a functional prototype that shows how healthcare messaging can be implemented securely in a cloud environment.

Key security objectives:

* Encrypted data storage (PHI protection)
* Secure transmission (HTTPS)
* Authentication and role-based access control
* Audit logging for accountability
* Deployment on a cloud virtual machine

---

## Current Status (Week 1)

Project foundation completed:

```
health-sms/
│
├── frontend/     React (Vite)
├── backend/      Node.js + Express API
└── infra/        Cloud & Docker configuration (coming soon)
```

Working locally:

* Frontend: [http://localhost:5173](http://localhost:5173)
* Backend: [http://localhost:3000](http://localhost:3000)

Completed:

* Repository created
* Project structure initialized
* Express server running
* React app running
* Basic development environment ready

---

## Tech Stack

Frontend

* React (Vite)

Backend

* Node.js
* Express

Database (Next)

* PostgreSQL

Cloud

* AWS Virtual Machine (Lightsail or EC2)

Deployment (Next)

* Docker + Docker Compose

Security Features (Planned)

* User authentication (JWT)
* Role-Based Access Control (Admin / Provider)
* AES encryption for message storage
* HTTPS (TLS)
* Audit logging

External Service (Planned)

* Twilio SMS (or simulated gateway)

---

## Local Setup Instructions

### 1. Clone the repository

```
git clone https://github.com/NavidNikoo/health-sms.git
cd health-sms
```

---

### 2. Backend Setup

```
cd backend
npm install
node server.js
```

Backend runs at:

```
http://localhost:3000
```

Test:
Open browser and go to `/`

---

### 3. Frontend Setup

Open a new terminal:

```
cd frontend
npm install
npm run dev
```

Frontend runs at:

```
http://localhost:5173
```

---

## Development Workflow

Before starting work:

```
git pull origin main
```

Create a feature branch:

```
git checkout -b feature/your-feature-name
```

After changes:

```
git add .
git commit -m "Description of changes"
git push origin feature/your-feature-name
```

Then open a Pull Request.

---

## Project Roadmap

### Phase 1 – Foundation (Week 1–2)

* Project setup (completed)
* Cloud VM setup
* Docker environment

### Phase 2 – Core Security (Week 3–5)

* User authentication
* Role-based access control
* PostgreSQL integration

### Phase 3 – Messaging Security (Week 6–7)

* Message storage
* AES encryption at rest
* Audit logging

### Phase 4 – Cloud Deployment (Week 8–9)

* Docker deployment to AWS
* HTTPS configuration

### Phase 5 – Final Features (Week 10–12)

* SMS integration
* Testing and hardening
* Documentation and demo preparation

---

## Team Expectations

For now:

1. Clone the repo
2. Verify both frontend and backend run locally
3. Confirm setup is working

Next tasks will be assigned after cloud environment setup.

---

## Architecture (High Level)

Browser
→ React Frontend
→ Express Backend (API)
→ PostgreSQL (encrypted data)
→ Cloud Virtual Machine (AWS)

All communication will use HTTPS.

---

## Notes

* Do NOT commit `.env` files
* Do NOT commit `node_modules`
* Environment variables will be provided when needed

---

## Repository

[https://github.com/NavidNikoo/health-sms](https://github.com/NavidNikoo/health-sms)

---

## Immediate Next Step for Team

Please clone the repo and confirm your local setup works.
Reply in the group once your environment is running.

---

If you want to run this project like a real lead, the next thing I’d recommend is a short message to your team that positions you as the architect. I can give you that too.
