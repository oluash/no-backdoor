# No-Backdoor System — Complete Deployment Guide

## What You Will Build
A security verification platform running on YOUR server with:
- React frontend (dashboard, evidence upload, portfolio, queue)
- Node.js backend API (authentication, file uploads, task queue)
- PostgreSQL database (stores all your data)
- Redis (for background jobs)

## What You Need
- A computer (Windows/Mac/Linux)
- $6-12/month for a server (or free trial)
- About 2 hours of time
- NO prior experience needed

---

## Step 0: Understand the Pieces (5 minutes)

Think of this like building a restaurant:

| Piece | Restaurant Analogy | What It Does |
|-------|-------------------|--------------|
| **Frontend** | The dining room | What users see and click |
| **Backend** | The kitchen | Processes orders, makes food |
| **Database** | The pantry | Stores all ingredients/recipes |
| **Redis** | The order board | Tracks what's being cooked |
| **Nginx** | The doorman | Directs traffic, checks IDs |
| **Docker** | A shipping container | Packages everything neatly |

All of these run on your **server** (a computer in the cloud).

---

## Step 1: Get a Server (15 minutes)

A "server" is just someone else's computer that runs 24/7.

### Option A: DigitalOcean (Recommended for Beginners)

1. Go to https://www.digitalocean.com/
2. Click "Sign Up" (email + password)
3. You'll get $200 free credit for 60 days
4. Click "Create" → "Droplets" (their name for servers)

**Configure your droplet:**
- **Region**: Pick closest to you (New York, London, Singapore)
- **OS Image**: Ubuntu 24.04 (LTS)
- **Plan**: Basic → Regular Intel → $6/month (1GB RAM, 1 CPU) OR $12/month (2GB RAM, 1 CPU) ← **recommended**
- **Authentication**: Password (simpler) or SSH Key (more secure)
- **Hostname**: `no-backdoor` (or anything)
- Click **Create Droplet**

5. Wait 1 minute for it to spin up
6. Note the **IP address** (e.g., `143.198.123.45`) — you'll need this

### Option B: Alternative Providers
- **Linode**: https://linode.com ($5/month)
- **Hetzner**: https://hetzner.com (~€4/month, great value)
- **AWS Lightsail**: https://lightsail.aws.amazon.com ($5/month)

**All work the same way.** Pick one, create an Ubuntu 24.04 server, note the IP.

---

## Step 2: Connect to Your Server (10 minutes)

### On Mac or Linux:

1. Open the **Terminal** app (search "Terminal")
2. Type this (replace with your actual IP):
```bash
ssh root@143.198.123.45
```
3. Type `yes` when it asks about authenticity
4. Enter the password DigitalOcean emailed you (or your SSH key password)

### On Windows:

1. Download **PuTTY**: https://www.chiark.greenend.org.uk/~sgtatham/putty/latest.html
2. Open PuTTY
3. In "Host Name", type: `root@143.198.123.45` (your IP)
4. Click **Open**
5. Enter password when prompted

**You should now see something like:**
```
root@no-backdoor:~#
```

This means you're logged into your server!

---

## Step 3: Install Docker (10 minutes)

Docker is like a shipping container for software. It packages everything so it runs the same everywhere.

**Copy and paste these commands ONE AT A TIME** into your server:

```bash
# Update the server's package list
apt update
```

```bash
# Install required packages
apt install -y apt-transport-https ca-certificates curl gnupg lsb-release
```

```bash
# Add Docker's official key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
```

```bash
# Add Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
```

```bash
# Install Docker
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

```bash
# Verify Docker works
docker --version
```

You should see: `Docker version 24.x.x`

```bash
# Start Docker on boot
systemctl enable docker
systemctl start docker
```

---

## Step 4: Download the Project (5 minutes)

Now download all the code to your server:

```bash
# Install git
apt install -y git
```

```bash
# Create a directory for the project
mkdir -p /opt/no-backdoor
cd /opt/no-backdoor
```

**Option A: Download from GitHub** (if you've uploaded it there)
```bash
git clone https://github.com/YOUR_USERNAME/no-backdoor.git .
```

**Option B: Download the ZIP** (we'll provide this)
```bash
# Download the project files
curl -L -o no-backdoor.zip "YOUR_DOWNLOAD_LINK_HERE"
unzip no-backdoor.zip
rm no-backdoor.zip
```

**Option C: Copy files from your computer** (using SCP)

On your local computer (NOT the server), run:
```bash
# On Mac/Linux:
scp -r /path/to/no-backdoor-files root@143.198.123.45:/opt/no-backdoor/

# On Windows, use WinSCP: https://winscp.net/
```

---

## Step 5: Configure Environment Variables (10 minutes)

Your server needs secrets (passwords, keys) to run securely.

```bash
cd /opt/no-backdoor/backend/infra
```

```bash
# Copy the example file
cp .env.example .env
```

```bash
# Edit the file (use nano - a simple text editor)
nano .env
```

**You'll see something like this. Change these lines:**

```env
# Database password - make it strong!
DB_PASSWORD=YourStrongPassword123!

# JWT Secret - generate a random string (run: openssl rand -base64 32)
JWT_SECRET=replace-with-your-secret

# Redis password (optional, can leave empty for local)
REDIS_PASSWORD=
```

**Generate a JWT secret:**
```bash
openssl rand -base64 32
```
Copy the output and paste it as `JWT_SECRET`.

**Save in nano:**
- Press `Ctrl + X`
- Press `Y` (to confirm save)
- Press `Enter`

---

## Step 6: Start Everything (5 minutes)

This is the magic moment!

```bash
cd /opt/no-backdoor/backend/infra
```

```bash
# Build and start all services (database + backend + frontend + nginx)
docker compose up -d
```

**What this does:**
- `-d` = run in background (detached mode)
- Downloads PostgreSQL, Redis, Node.js images
- Builds your backend and frontend
- Starts everything

**Check if it's working:**
```bash
docker compose ps
```

You should see 4 containers, all showing `Up` or `healthy`.

**Check logs if anything looks wrong:**
```bash
docker compose logs
```

---

## Step 7: Access Your Platform (Instant)

Open your web browser and type:
```
http://143.198.123.45
```

**Replace with your actual server IP!**

You should see the No-Backdoor dashboard!

---

## Step 8: Set Up a Domain Name (Optional, 15 minutes)

Instead of remembering `143.198.123.45`, get a real name.

### Buy a Domain:
1. Go to https://www.namecheap.com/ or https://porkbun.com/
2. Search for a domain (e.g., `mysecurity.example`)
3. Buy it ($5-15/year)

### Point it to Your Server:
1. In your domain provider's control panel, find "DNS" or "Nameservers"
2. Add an **A Record**:
   - Host: `@` (or your subdomain like `app`)
   - Value: `143.198.123.45` (your server IP)
   - TTL: Automatic
3. Save

### Wait 5-60 minutes for DNS to propagate.

### Then access via:
```
http://mysecurity.example
```

---

## Step 9: Enable HTTPS (Free SSL Certificate) (10 minutes)

HTTPS = the lock icon in your browser. Essential for security.

```bash
# Install certbot (free SSL certificate tool)
apt install -y certbot python3-certbot-nginx
```

```bash
# Get certificate (replace with your domain)
certbot --nginx -d mysecurity.example -d www.mysecurity.example
```

Follow the prompts:
- Enter email
- Agree to terms
- Choose whether to redirect HTTP to HTTPS (choose Yes)

**Certbot automatically:**
- Gets a free certificate from Let's Encrypt
- Configures nginx
- Sets up auto-renewal

**Test renewal:**
```bash
certbot renew --dry-run
```

Now access: `https://mysecurity.example` ✅

---

## Step 10: Create Your First Admin User (5 minutes)

```bash
# Enter the backend container
docker compose exec backend bash
```

```bash
# Create an admin user (adjust as needed)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "AdminPass123!",
    "firstName": "Admin",
    "lastName": "User"
  }'
```

**Response will include your JWT token.** Save it!

```bash
# Exit the container
exit
```

---

## Daily Management Commands

| Task | Command |
|------|---------|
| View all logs | `docker compose logs` |
| View backend only | `docker compose logs backend` |
| Restart everything | `docker compose restart` |
| Stop everything | `docker compose down` |
| Start after stop | `docker compose up -d` |
| Update after code changes | `docker compose up -d --build` |
| Backup database | `cd /opt/no-backdoor/backend/infra && ./scripts/backup.sh` |
| Check disk space | `df -h` |
| Free up space | `docker system prune -a` |

---

## Troubleshooting

### Problem: "Cannot connect to server"
- Check if Docker is running: `docker ps`
- Check firewall: `ufw status` — if active, allow port 80: `ufw allow 80/tcp`
- Check DigitalOcean firewall in web panel

### Problem: "Database connection refused"
- Wait 30 seconds after `docker compose up` for PostgreSQL to initialize
- Check logs: `docker compose logs postgres`

### Problem: "Port 3000 already in use"
- Something else is using that port
- Change PORT in `.env` to 3001, restart

### Problem: Out of disk space
```bash
docker system prune -a
docker volume prune
```

### Problem: "Permission denied"
- You're probably not running as root or with sudo
- Use `sudo` before commands, or run as root user

---

## What's Next (Optional Improvements)

1. **Add more users** — Everyone logs in with their own account
2. **Email notifications** — Configure SMTP for alerts
3. **Monitoring** — Add UptimeRobot (free) to alert if site goes down
4. **Backups** — Set up automatic daily database backups to S3
5. **CI/CD** — Auto-deploy when you push code to GitHub

---

## Cost Breakdown

| Item | Monthly Cost |
|------|-------------|
| VPS (2GB RAM) | $6-12 |
| Domain | $0.50-1.25 |
| SSL Certificate | $0 (Let's Encrypt) |
| **Total** | **$6.50-13.25/month** |

---

## Need Help?

- **Docker docs**: https://docs.docker.com/
- **DigitalOcean tutorials**: https://www.digitalocean.com/community/tutorials
- **Let's Encrypt**: https://letsencrypt.org/getting-started/

---

*Last updated: 2026-05-04*
