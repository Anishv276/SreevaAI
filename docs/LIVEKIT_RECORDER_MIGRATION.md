# LiveKit Egress Implementation Guide

This document explains the transition from browser-based recording (MediaPipe/MediaRecorder) to **LiveKit Server-side Egress Recording** for AI Interviews.

## 1. Overview
Previously, the candidate's browser recorded the interview locally and uploaded a large `.webm` file at the end. This was unreliable (if the tab closed, the recording was lost) and caused high CPU usage.

We now use **LiveKit Egress**, which:
- Runs on your server (zero CPU load on the candidate).
- Records directly to Cloudflare R2 in real-time.
- Is 100% resilient to browser crashes or tab closures.

---

## 2. Architecture

### A. Initiation (`/api/interview/token`)
When a candidate requests a token:
1. The server dispatches the AI Agent.
2. The server starts a `RoomCompositeEgress` via the `EgressClient`.
3. The recording is saved to R2 with a path: `candidates/{name}/recordings/interview_{appId}_{timestamp}.mp4`.

### B. Persistence (`/api/webhooks/livekit`)
When the interview ends and the room closes:
1. LiveKit finishes the MP4 file and uploads it to R2.
2. LiveKit sends an `egress_ended` webhook to our server.
3. Our webhook handler verifies the signature, parses the `applicationId` from the file path, and updates the `Interview` record in the database with the download URL.

---

## 3. Infrastructure Setup (Self-Hosted)

### Step 1: Running the Egress Service
The Egress service must be running as its own process/container. 

**Docker Example:**
```bash
docker run --rm \
  --cap-add SYS_ADMIN \
  -e EGRESS_CONFIG_FILE=/out/config.yaml \
  -v /path/to/egress-config.yaml:/out/config.yaml \
  livekit/egress
```

**`egress-config.yaml` contents:**
```yaml
api_key: "YOUR_LIVEKIT_API_KEY"
api_secret: "YOUR_LIVEKIT_API_SECRET"
ws_url: "wss://your-livekit-domain.com"
redis:
  address: "redis:6379"
s3:
  access_key: "YOUR_R2_ACCESS_KEY_ID"
  secret: "YOUR_R2_SECRET_ACCESS_KEY"
  region: "auto"
  endpoint: "https://<account_id>.r2.cloudflarestorage.com"
  bucket: "interviews"
  force_path_style: true
```

### Step 2: LiveKit Webhook Registration
In your LiveKit Server config (`livekit.yaml`), add the webhook URL:
```yaml
webhook:
  api_key: 'YOUR_LIVEKIT_API_KEY'
  urls:
    - 'https://your-app-domain.com/api/webhooks/livekit'
```

---

## 4. Environment Variables (Next.js)
Ensure these are set in your `.env` file:
- `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_URL`
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ENDPOINT`
- `R2_INTERVIEW_BUCKET` (default: `interviews`)

---

## 5. Troubleshooting
- **No recording appearing**: Check the `npm run dev` logs. If the Egress service is down, you will see `[Egress] Could not start recording (non-fatal)`.
- **Webhook not firing**: Ensure your server is accessible from the internet (LiveKit server needs to reach your webhook URL).
- **Database not updating**: Check the `/api/webhooks/livekit` endpoint logs to see if signature verification failed.
