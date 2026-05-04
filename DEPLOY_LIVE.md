# 🚀 Deploy to www.safergreens.co.uk — Full Guide

## Architecture

```
www.safergreens.co.uk
        │
        ├── Frontend (Vite + React SPA)     → Vercel or Railway
        │   ├── /safergreens                 → Marketing page (public)
        │   ├── /login                       → Auth page
        │   ├── / (dashboard)                → No-Backdoor portal (protected)
        │   ├── /evidence                    → Evidence upload
        │   ├── /portfolio                   → Systems portfolio
        │   └── /queue                       → Verification queue
        │
        └── Backend (Node + Express + Prisma) → Railway
            ├── /api/auth/*
            ├── /api/systems/*
            ├── /api/evidence/*
            ├── /api/queue/*
            ├── /api/metrics/*
            └── /api/activity/*
```

---

## Step 1: Push Code to GitHub

```bash
cd /Users/mac/.picoclaw/workspace/no-backdoor-project

# Stage everything
git add -A
git commit -m "chore: deploy configs for safergreens.co.uk"

# Create repo at https://github.com/new
# Name: no-backdoor
# Keep it Private (or Public — your choice)

git remote add origin https://github.com/YOUR_GITHUB_USERNAME/no-backdoor.git
git push -u origin main
```

> **Don't have a GitHub account?** Let me know and I'll walk you through creating one.

---

## Step 2: Deploy Backend on Railway

### 2a. Create Railway Account
1. Go to **[railway.app](https://railway.app)**
2. Click **Login with GitHub** → Authorize
3. You'll land on the Railway dashboard

### 2b. Deploy the Backend
4. Click **New Project** → **Deploy from GitHub repo**
5. Select `YOUR_GITHUB_USERNAME/no-backdoor`
6. ⚠️ **Important**: Set **Root Directory** to `backend/`
7. Click **Deploy**

### 2c. Add PostgreSQL
8. Click **New** → **Database** → **Add PostgreSQL**
9. Wait for it to provision (green checkmark)
10. Railway **automatically** injects `DATABASE_URL` into the backend service

### 2d. Set Environment Variables
11. Click the backend service → **Variables** tab
12. Add these **9 variables**:

| Variable | Value |
|---|---|
| `JWT_SECRET` | `4231e95354c1537b556b36a2e4cecffc63a68e9537a8ea387b8d168652bf53e3` |
| `JWT_ACCESS_SECRET` | `7cf464324397e3d091a2bc99fabd415a14f7e2f58a5ff2f393fbd44f157d15dd` |
| `JWT_REFRESH_SECRET` | `996ed3ef710285248cae5d74340201463f5f634392f659478c54ac3cd10e8306` |
| `SESSION_SECRET` | `bJbebH7mI+280ZRqLDqv1A==` |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `CORS_ORIGINS` | `*` |
| `LOG_LEVEL` | `info` |
| `UPLOAD_DIR` | `/tmp/nobackdoor-uploads` |

> ⚠️ Do NOT add `DATABASE_URL` — Railway sets it automatically from the PostgreSQL plugin.

### 2e. Get Backend URL
13. Click the backend service → **Settings** tab
14. Find **Public Networking** → Enable **Generate Domain**
15. Copy the URL (looks like `https://no-backdoor-production.up.railway.app`)
16. **Test it:**
    ```bash
    curl https://no-backdoor-production.up.railway.app/health
    ```
    → Should return `{"success":true,"data":{"status":"healthy",...}}`

---

## Step 3: Deploy Frontend on Vercel (Recommended)

### 3a. Create Vercel Account
1. Go to **[vercel.com](https://vercel.com)**
2. Click **Login with GitHub** → Authorize

### 3b. Deploy
3. Click **Add New...** → **Project**
4. Import `YOUR_GITHUB_USERNAME/no-backdoor`
5. ⚠️ **Important settings:**
   - **Root Directory**: `app/`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
6. Add **Environment Variable**:
   - `VITE_API_URL` = `https://no-backdoor-production.up.railway.app` (your Railway backend URL from Step 2e)
7. Click **Deploy**
8. Vercel gives you a URL like `no-backdoor.vercel.app`

---

## Step 4: Point www.safergreens.co.uk to Vercel

### 4a. Add Domain in Vercel
1. Go to your project on Vercel → **Settings** → **Domains**
2. Enter `www.safergreens.co.uk`
3. Click **Add**
4. Vercel will show you a **CNAME target** (e.g. `cname.vercel-dns.com`)

### 4b. Update DNS at Domaindiscount24 (Netcup)
1. Log into your **domaindiscount24.net** / Netcup account
2. Find the **DNS settings** for `safergreens.co.uk`
3. **Option A: Use Vercel's nameservers** (easiest)
   - Change nameservers to:
     - `ns1.vercel-dns.com`
     - `ns2.vercel-dns.com`
   - Vercel auto-provisions SSL for `www.safergreens.co.uk`

4. **Option B: Keep current nameservers, add CNAME record**
   - Add a CNAME record:
     - **Name/Host**: `www`
     - **Target/Value**: `cname.vercel-dns.com` (or whatever Vercel shows you)
     - **TTL**: 300 (5 minutes)

### 4c. Wait for DNS Propagation
- DNS changes can take **5–30 minutes** (sometimes up to 48h)
- Check progress: `dig www.safergreens.co.uk`

---

## Step 5: Verify Everything Works

```bash
# Test the live site
curl https://www.safergreens.co.uk
# → Should return the React SPA HTML

# Test the Safer Greens marketing page
curl https://www.safergreens.co.uk/safergreens
# → Should load the marketing page

# Test API through the domain
curl https://www.safergreens.co.uk/api/auth/me
# → Should proxy to Railway backend

# Register a test user
curl -X POST https://www.safergreens.co.uk/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@safergreens.co.uk","password":"Test123!","firstName":"Admin","lastName":"User"}'
```

---

## Step 6: Set Up Custom Email (Optional)

The contact form on `/safergreens` POSTs to `/api/safergreens/enquiry`. To receive these emails:

1. The backend needs an email service configured
2. Or update the form to POST to a service like Formspree / Web3Forms

---

## Files Changed for This Deploy

| File | Change |
|---|---|
| `app/src/lib/api.ts` | `API_BASE` now uses `VITE_API_URL` env var |
| `app/nginx-custom.conf` | Cleaned up for Railway service-to-service |
| `app/vercel.json` | SPA rewrites for Vercel |
| `RAILWAY_DEPLOY.md` | This guide |

---

## Quick Reference: Login Credentials

After deploying, register your admin account:

```
URL:     https://www.safergreens.co.uk/login
Email:   admin@safergreens.co.uk
Pass:    Test123!
```

**Change the password immediately after first login.**

---

## Need Help?

If you get stuck at any step:
- **"I don't have a GitHub account"** → I'll walk you through creating one
- **"I can't log into domaindiscount24"** → We can find another way
- **"The deploy failed"** → Share the error log and I'll fix it
- **"I want to keep the old WordPress site"** → We can set up a subdomain for it
