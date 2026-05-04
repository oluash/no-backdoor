# 🚂 Railway Deploy — No-Backdoor System

## Generated Secrets

| Variable | Value |
|---|---|
| `JWT_SECRET` | `4231e95354c1537b556b36a2e4cecffc63a68e9537a8ea387b8d168652bf53e3` |
| `JWT_ACCESS_SECRET` | `7cf464324397e3d091a2bc99fabd415a14f7e2f58a5ff2f393fbd44f157d15dd` |
| `JWT_REFRESH_SECRET` | `996ed3ef710285248cae5d74340201463f5f634392f659478c54ac3cd10e8306` |
| `SESSION_SECRET` | `bJbebH7mI+280ZRqLDqv1A==` |

---

## Step 1 — Push to GitHub

```bash
cd /Users/mac/.picoclaw/workspace/no-backdoor-project

# 1. Create repo at https://github.com/new
#    Name: no-backdoor
#    Visibility: Public or Private

# 2. Push
git remote add origin https://github.com/YOUR_USERNAME/no-backdoor.git
git push -u origin main
```

---

## Step 2 — Deploy Backend on Railway

1. Go to **[railway.app](https://railway.app)** → Login with GitHub
2. **New Project** → **Deploy from GitHub repo**
3. Select `YOUR_USERNAME/no-backdoor`
4. Set **Root Directory** → `backend/`
5. Click **Deploy**

### Add PostgreSQL

6. Click **New** → **Database** → **Add PostgreSQL**
   - Railway auto-sets `DATABASE_URL` in the backend service
   - Migrations run automatically on container start via `CMD` in Dockerfile

### Set Environment Variables

7. Select the backend service → **Variables** tab → Add these **7 variables**:

```
JWT_SECRET=4231e95354c1537b556b36a2e4cecffc63a68e9537a8ea387b8d168652bf53e3
JWT_ACCESS_SECRET=7cf464324397e3d091a2bc99fabd415a14f7e2f58a5ff2f393fbd44f157d15dd
JWT_REFRESH_SECRET=996ed3ef710285248cae5d74340201463f5f634392f659478c54ac3cd10e8306
SESSION_SECRET=bJbebH7mI+280ZRqLDqv1A==
NODE_ENV=production
PORT=3000
CORS_ORIGINS=*
LOG_LEVEL=info
UPLOAD_DIR=/tmp/nobackdoor-uploads
```

> ⚠️ `DATABASE_URL` is set **automatically** by Railway when you link the PostgreSQL plugin. Do NOT add it manually.

### Verify Backend

8. After deploy completes, click the **Settings** tab → find **Public Networking**
9. Enable **Generate Domain** → copy the URL (e.g. `https://no-backdoor-production.up.railway.app`)
10. Test:
    ```bash
    curl https://your-domain.up.railway.app/health
    ```
    → Should return `{"success":true,"data":{"status":"healthy",...}}`

---

## Step 3 — Deploy Frontend

You have **two options**. Pick one:

---

### Option A: Railway (All-in-one, simpler)

1. In the **same project**, click **New** → **GitHub Repo** → select `no-backdoor`
2. Set **Root Directory** → `app/`
3. Click **Deploy**
4. No variables needed (nginx proxies `/api/` to backend internally)
5. Enable **Public Networking** → **Generate Domain**

**For Railway service-to-service networking**, you may need to update the nginx config. After deploying both services, find the backend's Railway internal URL from your backend service settings, then update `app/nginx-custom.conf`:

```nginx
# Change this line:
proxy_pass http://backend:3000;
# To the Railway service URL, e.g.:
proxy_pass https://no-backdoor-backend.up.railway.app;
```

Then re-deploy the frontend.

---

### Option B: Vercel (Production, faster)

1. Go to **[vercel.com](https://vercel.com)** → Login with GitHub
2. **Add New Project** → Import `YOUR_USERNAME/no-backdoor`
3. Set **Root Directory** → `app/`
4. **Framework Preset** → **Vite**
5. **Build Command** → `npm run build`
6. **Output Directory** → `dist`
7. Add **Environment Variable**:
   - `VITE_API_URL` = `https://your-backend.up.railway.app`
8. Click **Deploy**

> The `vercel.json` file in `app/` handles rewrites for SPA routing.

---

## Step 4 — Verify Full System

```bash
# Health check
curl https://your-backend.up.railway.app/health

# Register a user
curl -X POST https://your-backend.up.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"Test123!","firstName":"Admin","lastName":"User"}'

# Login
curl -X POST https://your-backend.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"Test123!"}'

# Use the returned token for authenticated requests:
curl https://your-backend.up.railway.app/api/systems \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Step 5 — Custom Domain (Optional)

### Railway (backend)
1. Backend service → **Settings** → **Domains**
2. Add your custom domain (e.g. `api.yourdomain.com`)
3. Update DNS with the CNAME record Railway provides

### Vercel (frontend)
1. Project → **Domains** → add `yourdomain.com`
2. Vercel auto-provisions SSL

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Migrations fail | Check `DATABASE_URL` is set by Railway PostgreSQL plugin, not manually |
| Container crashes | Railway dashboard → Deployments → View logs |
| Health shows degraded | PostgreSQL or Redis not connecting — check env vars |
| CORS errors | Set `CORS_ORIGINS=*` for testing, restrict to your domain later |
| Port mismatch | Backend uses `PORT=3000`, Railway maps to 443 externally |
| 404 on frontend routes | SPA routing — `vercel.json` rewrites handle this on Vercel |
| API calls fail from frontend | Check `VITE_API_URL` env var is set correctly |
