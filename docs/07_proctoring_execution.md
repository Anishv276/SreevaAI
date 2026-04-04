# Phase 7: Secure Assessment Environment & Proctoring Suite

This module provides a hardened, real-time monitored environment for technical evaluations, ensuring high-fidelity results and candidate integrity.

## 1. How this works
The **Secure Assessment** module transforms the candidate's browser into a locked-down examination portal. Using a combination of browser APIs (Fullscreen, Focus) and client-side AI models (Face Landmarking, Object Detection), the system monitors candidate behavior in real-time, flagging any suspicious activity like tab switching, copy-pasting, or unauthorized device usage.

## 2. Technical Flow
1. **Security Handshake**:
   - Before starting, the candidate must grant Webcam and Microphone permissions.
   - The test launches in **Mandatory Fullscreen Mode**.
2. **Behavioral Monitoring**:
   - **Tab/Window Control**: The UI detects when the browser loses focus (`blur`) or exits fullscreen, immediately showing a security overlay and logging a violation.
   - **Paste Detection**: Captures `paste` events to identify potential external help.
   - **Keystroke Dynamics**: Analyzes the speed of typing to detect automated text injection (bots/scripts).
3. **AI Vision Monitoring**:
   - **FaceLandmarker**: Tracks eye gaze and head movement to ensure the candidate stays focused on the screen.
   - **Object Detection**: Scans for prohibited items like "Cell phone" or "Tablet" in the webcam frame.
4. **Performance Event Batching**:
   - Security flags are NOT sent individually to avoid network overhead. Instead, they are buffered and "flushed" to the API every 5 seconds.
5. **Background Processing**:
   - The `proctoring-events` worker in `worker.ts` receives batches and flushes them to the database atomically.

## 3. Tech Stack
- **AI Models (Client Side)**: MediaPipe / TensorFlow.js.
- **Frontend**: Next.js, Monaco Editor (for coding).
- **Communication**: REST API with Batched Payload.
- **Background Queue**: BullMQ & Redis.

## 4. Tools & Open-Source Models
- **MediaPipe Hands/Face**: For low-latency biometric tracking.
- **COCO-SSD / MobileNet**: For real-time object detection in the browser.
- **WebVAD**: For voice activity detection (monitoring background speech).

## 5. Related Code (File Map)
- **UI / Core Environment**:
  - `app/careers/assess/[id]/page.tsx` [Line 48-100] - Central flag handler and batched event flushing logic.
  - `app/careers/assess/[id]/page.tsx` [Line 139-225] - Window lock, paste detection, and keystroke burst protection.
- **Proctoring Components**:
  - `components/assessment/proctor-monitor.tsx` - Handles webcam initialization, face landmarking, and VAD audio monitoring.
  - `components/assessment/object-detector.tsx` - Headless component for real-time mobile phone/multiple person detection.
- **Backend / Worker**:
  - `worker.ts` [Line 295-334] - `proctoring-events` worker that aggregates flags into the DB.
  - `app/api/assessments/[id]/events/route.ts` - API endpoint for receiving event batches.
- **Data Model**:
  - `prisma/schema.prisma` [Line 93-103] - `ProctoringEvent` model storing the severity, type, and metadata of violations.
