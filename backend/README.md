# No-Backdoor System Architecture — Backend

## Overview

The **No-Backdoor System Architecture** backend is a security verification platform API that provides endpoints for managing software systems under security review, uploading evidence files, tracking verification tasks via a job queue, and aggregating dashboard metrics.

The platform supports role-based access control (admin, analyst, viewer), JWT authentication with refresh token rotation, file upload with type validation, PostgreSQL full-text search, and WebSocket real-time updates.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ |
| Framework | Express.js 4.18 |
| Language | TypeScript 5.3 |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Auth | JWT (access + refresh tokens) |
| Realtime | WebSocket (ws library) |
| Validation | Zod |
| Testing | Jest 29 + Supertest |
| Dev Server | tsx (watch mode) |

## Quick Start

### Prerequisites

- **Docker** 24+ and **Docker Compose** 2+
- **Node.js** 20+ (for local dev without Docker)
- **Make** (optional, for convenience commands)

### 1. Clone & Setup

```bash
cd /mnt/agents/output/backend
cp .env.example .env
# Edit .env with your secrets (especially JWT_SECRET and DB_PASSWORD)
```

### 2. Start Infrastructure with Docker Compose

```bash
cd infra/
make setup
# Or manually:
docker compose up -d
```

This starts PostgreSQL 16, Redis 7, and Nginx (reverse proxy).

### 3. Database Setup

The database is auto-initialized via `docker-entrypoint-initdb.d/init.sql`. To run migrations manually:

```bash
# Apply schema
psql -U postgres -d no_backdoor < db/schema.sql

# Apply seed data
psql -U postgres -d no_backdoor < db/migrations/002_seed.sql
```

### 4. Start the Backend

```bash
# Development (with hot reload)
npm run dev

# Production build
npm run build
npm start
```

The API will be available at `http://localhost:3000/api`.

### 5. API Documentation

OpenAPI 3.0 spec is available at `/mnt/agents/output/backend/api/openapi.yaml`. View it with:
- Swagger UI: `docker run -p 8080:8080 -e SWAGGER_JSON=/api/openapi.yaml -v $(pwd)/api:/api swaggerapi/swagger-ui`
- Redoc: Use any OpenAPI renderer

## API Endpoints

### Auth & Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | Public | Register a new user account |
| POST | `/api/auth/login` | Public | Authenticate and receive JWT tokens |
| POST | `/api/auth/refresh` | Public | Rotate refresh token for new access token |
| GET | `/api/auth/me` | Bearer | Get current user profile |
| PUT | `/api/auth/me` | Bearer | Update user profile |

### Dashboard & Metrics

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/metrics/summary` | Bearer | Dashboard summary counts (systems, evidence, tasks, users) |
| GET | `/api/metrics/trends` | Bearer | 30-day verification trends (area chart data) |
| GET | `/api/metrics/status` | Bearer | System status distribution (donut chart data) |
| GET | `/api/activity/recent` | Bearer | Recent activity feed (paginated) |

### Evidence Upload

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/evidence/upload` | Bearer | Upload evidence files (multipart, max 10 files, 50MB each) |
| GET | `/api/evidence` | Bearer | List evidence uploads (paginated, filterable, searchable) |
| GET | `/api/evidence/:id` | Bearer | Get single evidence upload detail |
| DELETE | `/api/evidence/:id` | Bearer | Delete evidence upload + physical file |

### Portfolio (Systems)

| Method | Path | Auth | RBAC | Description |
|--------|------|------|------|-------------|
| GET | `/api/systems` | Bearer | Viewer+ | List systems (paginated, searchable, filterable) |
| POST | `/api/systems` | Bearer | Analyst+ | Create new system |
| GET | `/api/systems/:id` | Bearer | Viewer+ | Get system detail with history & evidence |
| PUT | `/api/systems/:id` | Bearer | Analyst+ | Update system |
| DELETE | `/api/systems/:id` | Bearer | Admin | Delete system (cascades to evidence, history, tasks) |
| GET | `/api/systems/:id/history` | Bearer | Viewer+ | Verification history timeline |
| GET | `/api/systems/:id/evidence` | Bearer | Viewer+ | Linked evidence files |

### Verification Queue

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/queue/counts` | Bearer | Task counts grouped by status |
| GET | `/api/queue/tasks` | Bearer | List queue tasks (filtered, paginated, sortable) |
| POST | `/api/queue/tasks` | Bearer | Create verification task |
| GET | `/api/queue/tasks/:id` | Bearer | Get task detail with logs |
| PUT | `/api/queue/tasks/:id` | Bearer | Update task (priority, status, assignee) |
| POST | `/api/queue/tasks/:id/restart` | Bearer | Restart a failed/completed task |
| POST | `/api/queue/tasks/:id/cancel` | Bearer | Cancel a pending task |
| DELETE | `/api/queue/tasks/:id` | Bearer | Delete task and its log history |
| GET | `/api/queue/tasks/:id/logs` | Bearer | Get paginated task logs |
| POST | `/api/queue/batch` | Bearer | Batch cancel/restart/delete operations |

### Health & System

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | Public | Full health check (DB + Redis) |
| GET | `/health/live` | Public | Liveness probe (always 200) |
| GET | `/health/ready` | Public | Readiness probe (DB + Redis status) |

**Total: 30 endpoints**

## Authentication

The API uses **Bearer JWT tokens** in the `Authorization` header.

```
Authorization: Bearer <accessToken>
```

### Token Flow

1. **Register**: `POST /api/auth/register` → returns access + refresh tokens
2. **Login**: `POST /api/auth/login` → returns access + refresh tokens
3. **Use**: Include `accessToken` in `Authorization: Bearer <token>` header
4. **Refresh**: `POST /api/auth/refresh` with `refreshToken` → returns new token pair
5. **Old refresh tokens are invalidated** after rotation (prevents replay attacks)

### Token Expiry

- **Access token**: 15 minutes
- **Refresh token**: 7 days

## Running Tests

### Prerequisites

Ensure PostgreSQL and Redis are running (use Docker Compose from `infra/`):

```bash
cd infra/
docker compose up -d postgres redis
```

Create the test database:

```bash
psql -U postgres -c "CREATE DATABASE no_backdoor_test;"
```

### Run All Tests

```bash
npm test
```

### Run with Coverage

```bash
npm run test:coverage
```

### Run Specific Test File

```bash
npm test -- auth.test.ts
npm test -- evidence.test.ts
npm test -- portfolio.test.ts
npm test -- queue.test.ts
npm test -- dashboard.test.ts
```

### Run in Watch Mode

```bash
npm run test:watch
```

### Test Structure

| File | Tests | Coverage |
|------|-------|----------|
| `tests/setup.ts` | Global setup, DB/Redis init, helpers | — |
| `tests/auth.test.ts` | Registration, login, refresh, profile | Auth endpoints |
| `tests/evidence.test.ts` | Upload, list, get, delete evidence | Evidence endpoints |
| `tests/portfolio.test.ts` | CRUD, filters, history, evidence linkage | Systems endpoints |
| `tests/queue.test.ts` | Tasks, logs, batch ops, restart/cancel | Queue endpoints |
| `tests/dashboard.test.ts` | Metrics, trends, status, activity | Dashboard endpoints |

## Project Structure

```
backend/
├── src/                          # Source code
│   ├── index.ts                  # Application entry point
│   ├── server.ts                 # Express app factory (createApp)
│   ├── config/                   # Environment configuration
│   │   └── index.ts
│   ├── routes/                   # API route definitions
│   │   ├── index.ts              # Route registration
│   │   ├── auth.ts               # Auth routes
│   │   ├── evidence.ts           # Evidence routes
│   │   ├── systems.ts            # Portfolio/systems routes
│   │   ├── queue.ts              # Queue routes (factory)
│   │   ├── dashboard.ts          # Dashboard route aggregator
│   │   ├── metrics.ts            # Metrics routes
│   │   └── activity.ts           # Activity routes
│   ├── controllers/              # HTTP route handlers
│   │   ├── authController.ts
│   │   ├── evidenceController.ts
│   │   ├── portfolioController.ts
│   │   ├── queueController.ts
│   │   └── dashboardController.ts
│   ├── services/                 # Business logic
│   │   ├── authService.ts
│   │   ├── evidenceService.ts
│   │   ├── portfolioService.ts
│   │   ├── queueService.ts
│   │   ├── dashboardService.ts
│   │   └── taskProcessor.ts
│   ├── middleware/               # Express middleware
│   │   ├── auth.ts               # JWT verification & RBAC
│   │   ├── errorHandler.ts       # Global error handler
│   │   ├── logger.ts             # Request logging
│   │   ├── rateLimiter.ts        # Rate limiting
│   │   └── validate.ts           # Zod validation
│   ├── db/                       # Database layer
│   │   ├── pool.ts               # PostgreSQL pool + query helpers
│   │   └── redis.ts              # Redis client
│   ├── utils/                    # Utilities
│   │   ├── jwt.ts                # JWT generate/verify
│   │   ├── password.ts           # Bcrypt hashing
│   │   ├── errors.ts             # Custom API error classes
│   │   ├── response.ts           # Response envelope helpers
│   │   ├── upload.ts             # Multer file upload config
│   │   ├── fileStorage.ts        # File storage abstraction
│   │   ├── logger.ts             # Winston logger + audit log
│   │   ├── pagination.ts         # Pagination helpers
│   │   └── taskId.ts             # Task ID generation
│   ├── websocket/                # WebSocket server
│   │   └── server.ts
│   └── types/                    # TypeScript type definitions
│       ├── index.ts
│       ├── api/types.ts
│       └── express.d.ts
├── tests/                        # Integration tests
│   ├── setup.ts                  # Jest setup + helpers
│   ├── auth.test.ts              # Auth endpoint tests
│   ├── evidence.test.ts          # Evidence endpoint tests
│   ├── portfolio.test.ts         # Systems endpoint tests
│   ├── queue.test.ts             # Queue endpoint tests
│   └── dashboard.test.ts         # Dashboard endpoint tests
├── api/                          # API contract
│   ├── openapi.yaml              # OpenAPI 3.0 specification
│   ├── types.ts                  # Shared API types
│   └── validation.ts             # Zod validation schemas
├── db/                           # Database
│   ├── schema.sql                # Full database schema
│   ├── queries.sql               # Named query collection
│   ├── migrations/               # Migration scripts
│   │   ├── 001_initial.sql
│   │   └── 002_seed.sql
│   └── docker-entrypoint-initdb.d/
│       └── init.sql              # Docker auto-init script
├── infra/                        # Infrastructure
│   ├── docker-compose.yml        # Docker services
│   ├── Makefile                  # Convenience commands
│   ├── backend/
│   │   ├── Dockerfile
│   │   └── healthcheck.js
│   ├── nginx/
│   │   ├── Dockerfile
│   │   └── nginx.conf
│   └── scripts/
│       ├── setup.sh
│       └── backup.sh
├── package.json
├── tsconfig.json
├── jest.config.js                # Jest configuration
├── .env.example                  # Environment variable template
├── .env.test                     # Test environment variables
└── README.md                     # This file
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Runtime environment: `development`, `test`, `production` |
| `PORT` | No | `3000` | HTTP server port |
| `DB_HOST` | No | `localhost` | PostgreSQL host |
| `DB_PORT` | No | `5432` | PostgreSQL port |
| `DB_NAME` | No | `nobackdoor` | PostgreSQL database name |
| `DB_USER` | No | `postgres` | PostgreSQL username |
| `DB_PASSWORD` | **Yes** | — | PostgreSQL password |
| `DB_POOL_SIZE` | No | `20` | Connection pool size |
| `REDIS_HOST` | No | `localhost` | Redis host |
| `REDIS_PORT` | No | `6379` | Redis port |
| `REDIS_PASSWORD` | No | — | Redis password (if required) |
| `REDIS_DB` | No | `0` | Redis database number |
| `JWT_SECRET` | **Yes*** | — | JWT signing secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | No | `JWT_SECRET` | Refresh token secret |
| `JWT_ACCESS_EXPIRY` | No | `3600` | Access token expiry (seconds) |
| `JWT_REFRESH_EXPIRY` | No | `604800` | Refresh token expiry (seconds) |
| `UPLOAD_DIR` | No | `/tmp/nobackdoor-uploads` | File upload directory |
| `UPLOAD_MAX_SIZE` | No | `104857600` | Max file size (bytes, default 100MB) |
| `UPLOAD_MAX_FILES` | No | `10` | Max files per upload |
| `CORS_ORIGINS` | No | `*` (dev) | Comma-separated allowed origins |
| `CORS_CREDENTIALS` | No | `true` | Enable CORS credentials |
| `RATE_LIMIT_ENABLED` | No | `true` | Enable rate limiting |
| `RATE_LIMIT_GENERAL_MAX` | No | `100` | General API rate limit (requests) |
| `RATE_LIMIT_AUTH_MAX` | No | `20` | Auth endpoint rate limit (requests) |
| `LOG_LEVEL` | No | `debug` (dev), `info` (prod) | Winston log level |
| `LOG_DIR` | No | `logs` | Log file directory |

*JWT_SECRET is optional in `test` environment (defaults to test value).

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `users` | Platform users with authentication and RBAC |
| `systems` | Software systems under security verification |
| `evidence_uploads` | Evidence files uploaded for system verification |
| `verification_history` | Timeline events tracking verification lifecycle |
| `verification_tasks` | Verification task queue items with progress tracking |
| `task_logs` | Log entries for individual verification tasks |
| `activity_log` | General activity feed for dashboard display |

### Enum Types

- **user_role**: `admin`, `reviewer`, `viewer`
- **system_type**: `api`, `web`, `mobile`, `database`, `infrastructure`, `library`, `other`
- **system_status**: `verified`, `pending`, `threat`, `unknown`
- **evidence_type**: `code_scan`, `audit_report`, `penetration_test`, `config_review`, `dependency_check`, `static_analysis`, `dynamic_analysis`
- **evidence_status**: `pending`, `processing`, `verified`, `failed`
- **task_priority**: `low`, `normal`, `high`, `critical`
- **task_status**: `pending`, `processing`, `completed`, `failed`, `cancelled`

### Views

- `v_dashboard_metrics` — Aggregated counts for dashboard
- `v_system_overview` — Systems with evidence count, user info
- `v_task_overview` — Tasks with system info, log count

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| Dev | `npm run dev` | Start with hot reload (tsx watch) |
| Build | `npm run build` | Compile TypeScript to `dist/` |
| Start | `npm start` | Run compiled application |
| Lint | `npm run lint` | ESLint check |
| Test | `npm test` | Run Jest test suite |
| Test:watch | `npm run test:watch` | Run tests in watch mode |
| Test:coverage | `npm run test:coverage` | Run tests with coverage report |

## License

MIT
