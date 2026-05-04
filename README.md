# No-Backdoor System — Railway Deployment

## Architecture

```
┌─────────────┐     /api/*     ┌──────────────┐     DATABASE_URL    ┌────────────┐
│  Frontend   │ ──────────────→│   Backend    │ ──────────────────→│ PostgreSQL │
│  (Nginx +   │ ←──────────────│  (Express)   │                    │ (Railway)  │
│   React)    │                │   :3000      │                    └────────────┘
└─────────────┘                └──────────────┘
```

## Quick Deploy (Railway)

### 1. Push to GitHub

```bash
cd /path/to/no-backdoor-project
git init
git add .
git commit -m "Initial commit: No-Backdoor System"
gh repo create no-backdoor --public --push
```

### 2. Deploy on Railway

1. Go to [railway.app](https://railway.app) → **New Project**
2. Select **Deploy from GitHub repo** → choose your repo
3. **Add a PostgreSQL plugin** — Railway auto-sets `DATABASE_URL`
4. **Add a Redis plugin** — Railway auto-sets `REDIS_URL`
5. Set environment variables:

| Variable | Value | Required |
|----------|-------|----------|
| `NODE_ENV` | `production` | ✅ |
| `JWT_SECRET` | (random 64-char string) | ✅ |
| `JWT_ACCESS_SECRET` | (random string) | ✅ |
| `JWT_REFRESH_SECRET` | (random string) | ✅ |
| `CORS_ORIGINS` | `https://your-frontend-url.railway.app` | ✅ |
| `LOG_LEVEL` | `info` | |

6. **Set the root directory** to `backend/` in Railway service settings
7. **Deploy** — Railway will:
   - Build the Docker image
   - Run `prisma migrate deploy` to create all tables
   - Start the Express server

### 3. Deploy Frontend (Separate Service)

1. In the same Railway project, click **New Service** → **Deploy from GitHub**
2. Set root directory to `app/`
3. No env vars needed — Nginx proxies `/api/*` to the backend
4. **Important**: Update `nginx-custom.conf` to point `proxy_pass http://backend:3000` to the actual backend URL

## Local Development

```bash
# Start everything
docker compose up --build

# Or run individually:
cd backend && npm install && npm run dev
cd app && npm install && npm run dev
```

## Database Migrations

Migrations run automatically on container start via `prisma migrate deploy`.

To create a new migration locally:
```bash
cd backend
npx prisma migrate dev --name describe_changes
```

## Environment Variables

See `backend/.env.railway` for the full list with descriptions.
