# The Beginner's Guide to AWS Deployment

Welcome! This guide explains how we host the **Next.js Website** and our **Background Worker** on AWS.

> **TL;DR:** AWS is just our web host. It runs Next.js (the frontend) and Redis (for task queues). **We do NOT host the Python AI Agent here**—that lives on LiveKit Cloud.

All of our AWS server configuration files (like `docker-compose.prod.yml`) live in the `aws-deployment/` folder.

---

## Scenario A: Day-to-Day Updates (Already Deployed)
If the server is already running and you just want to update the Next.js website (e.g., you changed a button color or added a new page):

### Step 1: Push to GitHub (Automated Magic)
We have a GitHub Action set up to deploy automatically. Simply run:
```bash
git add .
git commit -m "Updated the login button"
git push
```
**What happens?** GitHub automatically SSH's into our AWS server, pulls the new code, rebuilds the Docker containers, and restarts the website. That's it!

### Optional Step: Deploy Manually
If GitHub Actions is broken and you need to update the server yourself:
1. SSH into the server: `ssh ubuntu@<AWS_IP_ADDRESS>`
2. Go to the code folder: `cd SreevaAI`
3. Pull the code: `git pull origin main`
4. Rebuild and restart the website:
   ```bash
   docker compose -f aws-deployment/docker-compose.prod.yml up -d --build
   ```

---

## Scenario B: You Changed the Database (CRITICAL)
If you add a new column to your Prisma database (e.g., you add a `role` field to the `User` table), **pushing to GitHub is NOT enough.** The Next.js website will crash because the remote Supabase database doesn't know about your new columns.

### Step 1: SSH into AWS
```bash
ssh ubuntu@<AWS_IP_ADDRESS>
```

### Step 2: Force-Sync the Database
Run this exact command to force Prisma to update the actual database tables in Supabase:
```bash
cd SreevaAI
docker exec Frontend npx prisma db push --accept-data-loss
```
*Note: If your Next.js app is throwing 500 errors after a deployment, you probably forgot to run this command!*

---

## Scenario C: Troubleshooting & Logs
If the website is down or the background worker isn't sending emails, check the logs.

### Step 1: SSH into AWS
```bash
ssh ubuntu@<AWS_IP_ADDRESS>
cd SreevaAI
```

### Step 2: Check if containers are running
```bash
docker ps
```
You should see 4 containers running: `Frontend`, `Normal-worker`, `redis`, and `traefik`.

### Step 3: Read the Live Logs
To see the live console output of the website and worker:
```bash
docker compose -f aws-deployment/docker-compose.prod.yml logs -f
```

---

## Scenario D: Advanced AWS Tricks (Why we did this)
If you are wondering why our AWS setup looks the way it does, here is the context:

### 1. The 2GB Virtual RAM Swap (Saving Money)
We run on a tiny `t3.small` server to get the AWS Free Tier ($0/month). Next.js needs a lot of memory to compile, which would normally crash this tiny server. 
**The Fix:** We created a 2GB "Swap File" on the hard drive. It acts like fake RAM so the server never crashes during deployment.

### 2. Auto-Cleaning Disk Space
Every Sunday at 3:00 AM, the server automatically runs a Cron Job (`docker system prune -af`) to delete old Docker cache. This prevents our hard drive from filling up over time.

### 3. EventBridge Sleep Schedule
To save compute costs during the MVP phase, AWS automatically turns this server off every night at Midnight and wakes it up at 8:00 AM. *(Note: Turn this off before a global launch!)*
