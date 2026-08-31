# QueueForge 🚀

> **Background Job Processing Platform** — Reliably handle asynchronous tasks outside the main request-response cycle.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green?logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey?logo=express)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-green?logo=mongodb)](https://www.mongodb.com/atlas)
[![Redis](https://img.shields.io/badge/Redis-7.x-red?logo=redis)](https://redis.io/)
[![BullMQ](https://img.shields.io/badge/BullMQ-5.x-orange)](https://docs.bullmq.io/)

---

## 📖 Overview

QueueForge is a production-grade backend system for managing and processing background jobs at scale. Applications submit jobs via a REST API; dedicated worker processes consume them asynchronously, providing:

- **Job lifecycle management** (SCHEDULED → PENDING → PROCESSING → COMPLETED/FAILED)
- **Priority-based processing** (HIGH / MEDIUM / LOW)
- **Retries with exponential backoff**
- **Delayed & scheduled jobs**
- **Dead-letter queue** for permanently failed jobs
- **API rate limiting** (per user tier)
- **JWT authentication**
- **OpenAPI/Swagger documentation**

---

## 🏗️ Architecture

```
Client
  │
  ▼
Express API ──── MongoDB (job persistence)
  │
  ▼
BullMQ Queue ──── Redis (queue infrastructure)
  │
  ▼
Worker Processes (concurrent job consumers)
```

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.x |
| Runtime | Node.js 20+ |
| API | Express.js |
| Database | MongoDB Atlas + Mongoose |
| Queue | Redis + BullMQ |
| Auth | JWT + bcrypt |
| Validation | Zod |
| API Docs | Swagger / OpenAPI |
| Testing | Vitest + Supertest |
| Containers | Docker + Docker Compose |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- MongoDB Atlas account (or local MongoDB)
- Redis 7+ (or Docker)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/jobforge.git
cd jobforge

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your MongoDB URI, Redis config, and JWT secret
```

### Running with Docker (easiest)

```bash
# Start Redis + MongoDB
docker compose up redis mongo

# In a separate terminal, run the API server
npm run dev
```

### Running Locally

```bash
# Start the API server (dev mode with hot reload)
npm run dev

# Start a worker process
npm run worker:dev

# Run tests
npm test

# Type check
npm run typecheck

# Build for production
npm run build
npm start
```

---

## 📁 Project Structure

```
src/
├── api/
│   ├── controllers/    # Route handler logic
│   ├── middlewares/    # Auth, error, validation
│   └── routes/         # Express route definitions
├── config/
│   ├── db.ts           # MongoDB connection
│   ├── redis.ts        # Redis connections
│   └── env.ts          # Zod-validated env vars
├── models/
│   ├── User.ts         # User Mongoose model
│   └── Job.ts          # Job Mongoose model
├── queue/
│   ├── queue.ts        # BullMQ queue instance
│   └── processors/     # Per-job-type handlers
├── workers/
│   └── worker.ts       # Worker process entry
├── types/
│   └── index.ts        # Shared enums & interfaces
├── utils/
│   └── logger.ts       # Pino structured logger
├── app.ts              # Express app setup
└── server.ts           # HTTP server entry point
tests/
├── unit/
├── integration/
└── setup.ts
```

---

## 🔑 Environment Variables

See [`.env.example`](.env.example) for all required variables.

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB Atlas connection string | ✅ |
| `REDIS_HOST` | Redis host | ✅ |
| `REDIS_PORT` | Redis port (default: 6379) | ✅ |
| `JWT_SECRET` | JWT signing secret (≥32 chars) | ✅ |
| `PORT` | API server port (default: 3000) | ❌ |
| `WORKER_CONCURRENCY` | Concurrent jobs per worker (default: 5) | ❌ |

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/auth/register` | Register a new user |
| `POST` | `/api/v1/auth/login` | Login and get JWT |
| `POST` | `/api/v1/jobs` | Submit a new job |
| `GET` | `/api/v1/jobs` | List your jobs |
| `GET` | `/api/v1/jobs/:id` | Get job status |
| `POST` | `/api/v1/jobs/:id/cancel` | Cancel a job |
| `POST` | `/api/v1/jobs/:id/retry` | Retry a failed job |
| `GET` | `/api/v1/admin/dead-letter-jobs` | List DLQ jobs (admin) |
| `POST` | `/api/v1/admin/dead-letter-jobs/:id/retry` | Retry DLQ job (admin) |
| `GET` | `/health` | Health check |
| `GET` | `/api-docs` | Swagger UI |

---

## 🧪 Testing

```bash
npm test                 # Run all tests once
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
```

---

## 🐳 Docker

```bash
# Full stack (API + Worker + MongoDB + Redis)
docker compose up

# Infrastructure only
docker compose up redis mongo
```

---

## 📝 Build Stages

| Stage | Status | Description |
|-------|--------|-------------|
| 1 | ✅ Done | Project scaffold + TypeScript setup |
| 2 | ✅ Done | MongoDB + Mongoose models |
| 3 | 🔜 Next | Auth API (register/login/JWT) |
| 4 | 🔜 | Job CRUD API |
| 5 | 🔜 | BullMQ queue integration |
| 6 | 🔜 | Worker system |
| 7 | 🔜 | Retry + exponential backoff |
| 8 | 🔜 | Priority + delayed jobs |
| 9 | 🔜 | Dead-letter queue |
| 10 | 🔜 | Rate limiting |
| 11 | 🔜 | Swagger/OpenAPI docs |
| 12 | 🔜 | Test suite (Vitest + Supertest) |
| 13 | 🔜 | Docker + Docker Compose |

---

## 📄 License

MIT
