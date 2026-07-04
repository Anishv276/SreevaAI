# SreevaAI AWS Infrastructure & Deployment Guide

This document serves as the master record of the complete AWS deployment, CI/CD, and DevOps configuration for SreevaAI. It covers everything from GitHub Actions automation to AWS cost-optimization strategies.

---

## 1. Automated CI/CD (GitHub Actions)
We configured a seamless continuous deployment pipeline so that every push to the `main` branch automatically updates the production server.

**How it works:**
- GitHub Actions triggers on push.
- It securely connects to the AWS EC2 instance using the `appleboy/ssh-action` package.
- It pulls the latest code, rebuilds the Docker containers (`docker compose build`), and restarts the app.

**Required GitHub Secrets:**
- `SSH_HOST`: The AWS Elastic IP (e.g., `3.7.42.105`)
- `SSH_USERNAME`: `ubuntu`
- `SSH_KEY`: The contents of the `.pem` private key file
- `APP_DIR`: `/home/ubuntu/SreevaAI`

---

## 2. Next.js Redis Build-Time Fix
During the Next.js compilation phase (`npm run build`), Next.js attempts to evaluate all files, including database connections. Because Redis is not accessible to the build container at that exact moment, it threw `ENOTFOUND redis` errors.

**The Fix:**
Updated `lib/redis.ts` to include an `isBuildPhase` check:
```typescript
const isBuildPhase = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";

if (isBuildPhase) {
  // Returns a lazy stub that does not trigger DNS lookups
  redisConnection = new IORedis(getRedisUrl(), { lazyConnect: true, retryStrategy: () => null });
}
```

---

## 3. Database Schema Sync (Prisma)
Because the database is hosted on Supabase (Postgres), Docker containers do not automatically migrate the remote schema.

**Manual Sync Command:**
If schema changes are pushed, run this command on the AWS server to force-update the Supabase database:
```bash
docker exec Frontend npx prisma db push --accept-data-loss
```

---

## 4. Production Environment Variables (`.env`)
The `.env` file on the AWS server requires specific configurations to work properly with Traefik (our auto-SSL generator) and LiveKit Cloud.

**Critical Production Variables:**
```env
NEXT_PUBLIC_APP_URL="https://www.sreevaai.com"
APP_URL="https://www.sreevaai.com"
ALLOWED_ORIGINS="https://www.sreevaai.com,https://sreevaai.com"
ACME_EMAIL="support@sreevaai.com" # Required by Traefik to generate free SSL certificates
REDIS_URL="redis://redis:6379"    # Internal docker-network URL
BULLMQ_PREFIX="prod"              # Separates production jobs from local testing jobs
WORKER_SYNC_TOKEN="<secure-token>" # Shared secret between Worker and Frontend
```

---

## 5. Automated Disk Space Management
Docker builds consume large amounts of disk space by leaving "dangling" cache layers. To prevent the EC2 instance from running out of storage, we set up a weekly cron job.

**Cron Job Setup:**
Run `crontab -e` on the EC2 instance and add:
```bash
0 3 * * 0 docker system prune -af --volumes >> ~/docker-prune.log 2>&1
```
*Result:* The server automatically clears old cache every Sunday at 3:00 AM.

---

## 6. AWS Architecture Best Practices
To ensure the EC2 server is secure, reliable, and reachable:

1. **Elastic IP:** Assigned a static, permanent IP address so GitHub Actions and DNS (sreevaai.com) never break when the instance reboots.
2. **EBS Volume:** Ensured a minimum of `30 GB gp3` storage to handle Docker image sizes.
3. **Security Groups (Firewall):**
   - **Port 80 / 443:** Open to the world (`0.0.0.0/0`) for web traffic.
   - **Port 22 (SSH):** Locked down to a specific IP address to prevent brute-force attacks.
   - **Port 6379 / 3000:** Completely closed to the public (managed internally by Docker and Traefik).

---

## 7. Cost Optimization: EventBridge Sleep Schedule
To save AWS compute costs during early MVP stages, we created a fully automated schedule to turn the server off for 10 hours a day.

**AWS EventBridge Configuration:**
- **Target:** `All APIs` -> `Amazon EC2` -> `StopInstances` / `StartInstances`
- **IAM Role:** Created `SchedulerEC2Role` with `AmazonEC2FullAccess`.
- **Nightly Stop:** Cron `0 0 * * ? *` (Midnight IST)
- **Morning Wake:** Cron `0 8 * * ? *` (8:00 AM IST)

*Note: If launching the MVP to global users, this schedule must be Disabled so the site is online 24/7.*

---

## 8. Downgrading to Free Tier (`t3.small` + Swap File)
Since the `t3.small` instance is eligible for the AWS Free Tier (first 12 months), we downgraded the hardware to achieve a **$0.00/month** AWS bill.

Because Next.js builds require more than the `t3.small`'s physical 2GB of RAM, we created a **2GB Swap File** (Virtual RAM) to prevent Docker from crashing with `OOMKilled` errors during deployments.

**Swap File Setup Commands:**
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```
After creating the swap file, the instance type was safely changed to `t3.small` in the AWS console.

---
*Documented on June 25, 2026*
