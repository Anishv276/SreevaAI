# Phase 7: Secure Interview Environment & Proctoring Suite

This module provides a hardened, real-time monitored environment for live interviews, ensuring high-fidelity results and candidate integrity.

## 1. How this works
The secure interview flow transforms the candidate browser into a controlled interview portal. Browser APIs and client-side checks monitor tab switching, fullscreen exits, and suspicious behavior while the interview is running.

## 2. Technical Flow
1. **Security Handshake**:
   - Candidate grants webcam and microphone permissions.
   - Interview starts in mandatory fullscreen mode.
2. **Behavioral Monitoring**:
   - Tab/window focus checks detect context switches.
   - Interview can be terminated on repeated violations.
3. **Snapshot Capture**:
   - Security snapshots are uploaded to the interview bucket for audit records.

## 3. Tech Stack
- **Frontend**: Next.js + LiveKit React components.
- **Communication**: LiveKit data channel + REST APIs.
- **Background Queue**: BullMQ & Redis for async persistence.

## 4. Related Code (File Map)
- `app/interview/[id]/page.tsx` - Interview UI, security events, recording lifecycle.
- `components/careers/interview/HardwareCheck.tsx` - Device readiness and pre-interview checks.
- `app/api/upload/interview-snapshot/route.ts` - Snapshot uploads.
