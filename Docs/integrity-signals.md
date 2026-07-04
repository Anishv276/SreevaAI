# Integrity Signals — Complete Reference

## Overview

12 signals across 3 layers: **Browser** (detected live via frontend), **Timing** (computed server-side post-interview), and **Content** (LLM-analyzed post-interview).

---

## Signal Quick Reference

| # | Signal | Layer | Source | Severity | Weight | Detection Time |
|---|--------|-------|--------|----------|--------|----------------|
| 1 | `tab_switch` | Browser | Frontend (`visibilitychange`) | medium | -10 | Immediate, 1500ms grace |
| 2 | `fullscreen_exit` | Browser | Frontend (`fullscreenchange`) | high | -15 | Immediate, no grace |
| 3 | `window_focus_loss` | Browser | Frontend (`window.blur`) | medium | -10 | 1500ms grace |
| 4 | `connection_lost` | Browser | Frontend (LiveKit events) | medium | -12 | Real-time track |
| 5 | `camera_disabled` | Browser | Frontend (`MediaStreamTrack`) | high | -15 | 4000ms grace |
| 6 | `microphone_disabled` | Browser | Frontend (`MediaStreamTrack`) | medium | -8 | 4000ms grace |
| 7 | `face_absence` | Browser | Frontend (MediaPipe) | high | -15 | 3000ms grace, 250ms poll |
| 8 | `multiple_faces` | Browser | Frontend (MediaPipe) | high | -25 | 3 consecutive frames |
| 9 | `identity_mismatch` | Browser | Frontend (MediaPipe) | high | -20 | Every 60s check |
| 10 | `latency_mismatch` | Timing | Backend (computed) | medium | — | Post-interview |
| 11 | `answer_integrity` | Content | Backend (LLM) | high | -20 | Post-interview |
| 12 | `session_fingerprint` | Browser | Frontend + Backend | high | -20 | Every 120s check, post-interview verify |

---

## 1. `tab_switch`

### What it detects
Candidate switched to another browser tab while the interview tab stayed open.

### Wiring
```
Browser (visibilitychange event)
  │ 1500ms grace period (OS notifications, <500ms self-resolve)
  ▼
logFocusViolation("tab_switch", ...) in page.tsx:806
  │ POST /api/interview/proctoring
  ▼
/api/interview/proctoring route → normalizeProctoringEvents() → filter by org toggles
  │ append to Interview.integritySignals JSONB array (capped at 400)
  ▼
DB: integritySignals[].eventType = "tab_switch"
```

### Timing
- **Check interval:** Event-driven (`visibilitychange` fires when tab visibility changes)
- **Grace period:** 1500ms (candidate must stay hidden for >1.5s to trigger)
- **Cooldown:** N/A (each event is independent; `focusEventInFlightRef` ensures one signal per physical action)

### Example payload
```json
{
  "eventType": "tab_switch",
  "severity": "medium",
  "timestamp": 1783162283391,
  "reason": "Tab Hidden (1m 23s into interview)",
  "metadata": { "elapsedSeconds": 83, "elapsedLabel": "1m 23s into interview" }
}
```

### UI display
- **Title:** Tab switch
- **Risk:** Medium — cross-check with answer quality
- **Shown as:** Count + "Happened during: ..." context

---

## 2. `fullscreen_exit`

### What it detects
Candidate exited fullscreen mode deliberately (Esc, F11, browser UI).

### Wiring
```
Browser (fullscreenchange event)
  │ No grace period (deliberate action)
  ▼
logFullscreenExit() in page.tsx:854
  │ POST /api/interview/proctoring (immediate, no timeout)
  ▼
/api/interview/proctoring route → normalize → filter → append to DB
```

### Timing
- **Check interval:** Event-driven (`fullscreenchange` fires on fullscreen toggle)
- **Grace period:** None (immediate fire)
- **Cooldown:** N/A

### Example payload
```json
{
  "eventType": "fullscreen_exit",
  "severity": "high",
  "timestamp": 1783162283782,
  "reason": "Fullscreen Exited (2m 5s into interview)",
  "metadata": { "elapsedSeconds": 125, "elapsedLabel": "2m 5s into interview" }
}
```

### UI display
- **Title:** Fullscreen exited
- **Risk:** High — often precedes looking at a second screen

---

## 3. `window_focus_loss`

### What it detects
Browser window lost OS-level focus (alt-tab, notification, taskbar click).

### Wiring
```
Browser (window.blur event)
  │ 1500ms grace period
  ▼
logFocusViolation("window_focus_loss", ...) in page.tsx:806
  │ POST /api/interview/proctoring
  ▼
DB: integritySignals[].eventType = "window_focus_loss"
```

### Timing
- **Check interval:** Event-driven (`blur` fires on focus loss)
- **Grace period:** 1500ms
- **Cooldown:** N/A

### Example payload
```json
{
  "eventType": "window_focus_loss",
  "severity": "medium",
  "timestamp": 1783162284000,
  "reason": "Window blurred (3m 10s into interview)",
  "metadata": { "elapsedSeconds": 190, "elapsedLabel": "3m 10s into interview" }
}
```

### UI display
- **Title:** Window focus lost
- **Risk:** Medium — brief losses may be incidental (OS notifications)

---

## 4. `connection_lost`

### What it detects
Network dropped during interview — LiveKit room disconnected or reconnecting state detected.

### Wiring
```
LiveKit Room events (Disconnected, Reconnecting, ConnectionQualityChanged)
  │ Real-time tracking via ConnectionProctoring.tsx
  ▼
handleConnectionViolation() in page.tsx:342
  │ POST /api/interview/proctoring
  ▼
DB: integritySignals[].eventType = "connection_lost"
```

### Timing
- **Check interval:** Event-driven (LiveKit connection state changes)
- **Grace period:** Real-time (fires on disconnect/reconnect events)
- **Cooldown:** N/A

### Example payload
```json
{
  "eventType": "connection_lost",
  "severity": "medium",
  "timestamp": 1783162284500,
  "reason": "Connection reconnecting (4m 2s into interview)"
}
```

### UI display
- **Title:** Connection dropped
- **Risk:** Low-Medium — check whether audio/video resumed cleanly

---

## 5. `camera_disabled`

### What it detects
Camera track ended or muted mid-session.

### Wiring
```
MediaStreamTrack (ended / muted events)
  │ 4000ms grace period (brief glitches)
  ▼
HardwareHeartbeat.tsx → handleHardwareViolation()
  │ POST /api/interview/proctoring
  ▼
DB: integritySignals[].eventType = "camera_disabled"
```

### Timing
- **Check interval:** Event-driven (track `ended` / `mute` events)
- **Grace period:** 4000ms
- **Cooldown:** N/A

### Example payload
```json
{
  "eventType": "camera_disabled",
  "severity": "high",
  "timestamp": 1783162285000,
  "reason": "Camera track ended (5m 15s into interview)"
}
```

### UI display
- **Title:** Camera disabled mid-session
- **Risk:** High — prevents visual monitoring

---

## 6. `microphone_disabled`

### What it detects
Microphone track ended or muted mid-session.

### Wiring
```
MediaStreamTrack (ended / muted events)
  │ 4000ms grace period
  ▼
HardwareHeartbeat.tsx → handleHardwareViolation()
  │ POST /api/interview/proctoring
  ▼
DB: integritySignals[].eventType = "microphone_disabled"
```

### Timing
- **Check interval:** Event-driven
- **Grace period:** 4000ms
- **Cooldown:** N/A

### Example payload
```json
{
  "eventType": "microphone_disabled",
  "severity": "medium",
  "timestamp": 1783162285500,
  "reason": "Mic track ended (6m 30s into interview)"
}
```

---

## 7. `face_absence`

### What it detects
No face detected in camera frame for more than 3 seconds.

### Wiring
```
Webcam video → MediaPipe FaceLandmarker (runs every 250ms)
  │ Face count = 0 for > 3000ms (ABSENCE_GRACE_MS)
  ▼
FaceProctoring.tsx detectFrame() at line 168
  │ 10s cooldown between events (COOLDOWNS.face_absence)
  ▼
onViolation("face_absence", ...) → handleFaceViolation() → POST /api/interview/proctoring
  ▼
DB: integritySignals[].eventType = "face_absence"
```

### Timing
- **Check interval:** Every **250ms** (DETECTION_INTERVAL_MS)
- **Grace period:** **3000ms** before firing (candidate may look away briefly)
- **Cooldown:** **10000ms** between events (prevents spam)
- **Detection model:** MediaPipe FaceLandmarker with `minFaceDetectionConfidence: 0.7`

### Example payload
```json
{
  "eventType": "face_absence",
  "severity": "high",
  "timestamp": 1783162286000,
  "reason": "No face detected (2m 45s into interview)"
}
```

### UI display
- **Title:** Face not visible
- **Risk:** High — indicates candidate was not actively present
- **Shown as:** Count + average absence duration + "Happened during" context

---

## 8. `multiple_faces`

### What it detects
More than one face detected in camera frame for 3+ consecutive detection frames (750ms).

### Wiring
```
Webcam video → MediaPipe FaceLandmarker (every 250ms)
  │ Face count > 1 for 3 consecutive frames (MULTI_FACE_CONFIRM_FRAMES)
  ▼
FaceProctoring.tsx detectFrame() at line 178
  │ 8s cooldown between events
  ▼
onViolation("multiple_faces", ...) → POST /api/interview/proctoring
  ▼
DB: integritySignals[].eventType = "multiple_faces"
```

### Timing
- **Check interval:** Every **250ms**
- **Consecutive frames required:** **3** (750ms total)
- **Cooldown:** **8000ms** between events

### Example payload
```json
{
  "eventType": "multiple_faces",
  "severity": "high",
  "timestamp": 1783162286500,
  "reason": "Multiple faces detected (4m 12s into interview)"
}
```

### UI display
- **Title:** Multiple faces detected
- **Risk:** High — potential coaching or collaboration violation

---

## 9. `identity_mismatch`

### What it detects
The face on camera doesn't match the reference snapshot taken at hardware check.

### Wiring
```
HardwareCheck.tsx
  │ Captures 640×480 JPEG snapshot → uploads to R2
  │ Stores in sessionStorage as "proctor_ref_snapshot"
  ▼
FaceProctoring.tsx
  │ Every 60s (IDENTITY_CHECK_INTERVAL): crops live face region (64×64),
  │ converts to normalized grayscale, compares to reference snapshot
  │ using pixel-wise MAE. Threshold: 0.22 (MIN_IDENTITY_PIXEL_DIFF)
  │ 60s cooldown
  ▼
onViolation("identity_mismatch", ...) → POST /api/interview/proctoring
```

### Timing
- **Check interval:** Every **60000ms** (60s)
- **Comparison:** Pixel-wise MAE on 64×64 normalized grayscale crop
- **Threshold:** > 0.22 diff triggers mismatch
- **Cooldown:** **60000ms** between identity checks

### Example payload
```json
{
  "eventType": "identity_mismatch",
  "severity": "high",
  "timestamp": 1783162287000,
  "reason": "Identity mismatch (3m 0s into interview)"
}
```

### UI display
- **Title:** Identity mismatch
- **Risk:** High — possible impersonation attempt

---

## 10. `latency_mismatch`

### What it detects
Abnormal per-turn response times captured during interview, compiled into a single post-interview event.

### Wiring
```
agent_runtime.py
  │ _question_asked_at = time.perf_counter() when TTS finishes
  │ _candidate_started_speaking_at = time.perf_counter() when candidate speaks
  │ response_latency_sec = _candidate_started_speaking_at - _question_asked_at
  ▼
Stored in answer_scores[].response_latency_sec per turn
  ▼
persist_latency_signals() in agent_persistence.py:340
  │ Filters non-warmup turns with positive latency
  │ Builds single event with per-turn map + inter-turn gaps
  │ Appends to integritySignals DB array
  ▼
DB: integritySignals[].eventType = "latency_mismatch"
```

### Timing
- **Collected:** Per-turn during interview (reaction time = question end → speech start)
- **Persisted:** Post-interview (after `persist_transcript()`, before `persist_answer_scores()`)
- **Warmup turns:** Excluded (is_warmup check)
- **Timeout/skip:** Latency = 0 or None → skipped

### Example payload
```json
{
  "eventType": "latency_mismatch",
  "severity": "medium",
  "timestamp": 1783162283391,
  "latency_sec": {
    "turn_1": 2.5,
    "turn_2": 4.2,
    "turn_3": 1.8,
    "turn_4": 6.0,
    "turn_5": 3.1
  },
  "turns": [
    { "turn": 1, "question": "Tell me about yourself", "latency_sec": 2.5, "gap_before_sec": null },
    { "turn": 2, "question": "Why do you want this job?", "latency_sec": 4.2, "gap_before_sec": 12.3 },
    { "turn": 3, "question": "Describe a challenge", "latency_sec": 1.8, "gap_before_sec": 8.7 }
  ]
}
```

### Integration Score Impact
`latency_mismatch` is **not** in `IntegrityEngine._NEG` — it does not affect the 0-100 integrity score. It is informational only.

### UI display
- **Title:** Latency Mismatch
- **Shown as:** Per-question breakdown — "Took Xs to start answering '...'"

---

## 11. `answer_integrity`

### What it detects
Answers contain AI-generated/read phrasing OR contradict claims made in earlier turns — detected by LLM analysis of the full transcript after the interview.

### Wiring
```
eval_pipeline.py / agent_scoring.py
  │ Per-turn LLM analysis identifies:
  │   1. Scripted/aided phrasing (phraseology_mismatch)
  │   2. Cross-turn contradictions (answer_consistency)
  │   3. Style drift (natural → textbook)
  │ Merged into a single post-interview evaluation
  ▼
persist_transcript() → integritySignals stored
  │ (answer_integrity signal appended by report pipeline)
  ▼
DB: integritySignals[].eventType = "answer_integrity"
```

### Timing
- **Detected:** Per-turn during interview (phraseology) + post-interview (consistency)
- **Persisted:** Post-interview via report pipeline
- **LLM call:** One per turn for phraseology, one full-transcript call for consistency

### Example payload
```json
{
  "eventType": "answer_integrity",
  "severity": "high",
  "timestamp": 1783162300000,
  "score": 35,
  "reason": "Answer reads as AI-generated: buzzword-dense, zero filler words, no personal friction. Also contradicted 'led 15 people' (turn 3) with 'was a team of 5' (turn 8).",
  "quotes": [
    "I leveraged synergies to optimize cross-functional paradigms...",
    "Led a team of 15 engineers across 4 product lines..."
  ],
  "turns": [3, 8]
}
```

### UI display
- **Title:** Answer integrity flagged
- **Risk:** High
- **Shown as:** Score: 35/100 + reason + quotes from flagged answers

---

## 12. `session_fingerprint`

### What it detects
Browser/device fingerprint changed mid-session — VPN usage, device swap, VM environment, or IP/timezone jump.

### Dual-stage detection

**Stage 1 — Frontend collection (live, metadata-only):**
```
HardwareCheck.tsx (pre-interview)
  │ collectFingerprint() captures: screen, timezone, platform,
  │ userAgent, hardwareConcurrency, deviceMemory, canvasHash, sessionId
  │ POST ip_registered at hardware check completion
  ▼
page.tsx (every 120s during interview)
  │ Re-collects same fields, same sessionId
  │ POST ip_registered (re-check)
  ▼
DB: integritySignals[].eventType = "ip_registered"
  │ (metadata-only — mapped to __skip__ in admin route, never a violation)
```

**Stage 2 — Backend verification (post-interview):**
```
persist_session_fingerprint() in agent_persistence.py
  │ Reads all ip_registered events from DB
  │ Compares fingerprint fields pairwise (first vs each subsequent)
  │ Detects: platform change, userAgent change, screen change,
  │   canvasHash change, timezone jump, VM screen res (1024x768), VM CPU (≤1 core)
  │ If mismatch found:
  │   Determines severity: "high" if platform/UA/screen changed,
  │                        "medium" if timezone/canvas changed
  │   Appends session_fingerprint event with delta details
  ▼
DB: integritySignals[].eventType = "session_fingerprint"
```

### Timing
- **Initial collection:** At hardware check completion (before interview starts)
- **Re-check interval:** Every **120000ms** (2 minutes) during interview
- **Post-interview verification:** Immediately after interview ends (after `persist_latency_signals()`)
- **Conditions to fire:** Requires ≥ 2 `ip_registered` events. Already has `session_fingerprint` → skip (no double-flag)

### Example: no issue (clean)
```json
{
  "eventType": "ip_registered",
  "severity": "low",
  "timestamp": 1783162280000,
  "metadata": {
    "fingerprint": {
      "screen": "1920x1080x24",
      "platform": "Win32",
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0",
      "timezone": "America/New_York",
      "hardwareConcurrency": 8,
      "deviceMemory": 8,
      "sessionId": "a1b2c3d4-..."
    }
  }
}
```
No `session_fingerprint` event is generated — fingerprint is consistent.

### Example: VPN + device swap (flagged)
```json
{
  "eventType": "session_fingerprint",
  "severity": "high",
  "timestamp": 1783162283391,
  "reason": "Session fingerprint changed: platform=Win32 → MacIntel; screen=1920x1080x24 → 2560x1600x24; userAgent=changed",
  "metadata": {
    "fingerprint_initial": { "platform": "Win32", "screen": "1920x1080x24", ... },
    "fingerprint_later": { "platform": "MacIntel", "screen": "2560x1600x24", ... },
    "deltas": { "platform": "Win32 → MacIntel", "screen": "1920x1080x24 → 2560x1600x24", "userAgent": "changed" }
  }
}
```

### What triggers which severity

| Change detected | Severity | Example reason |
|----------------|----------|----------------|
| Platform changes (Win32 → MacIntel) | **high** | Likely physical device swap |
| Screen resolution changes | **high** | External monitor / different device |
| User agent changes | **high** | Different browser or device |
| Timezone jumps | **medium** | VPN / geolocation change |
| Canvas hash changes | **medium** | Different GPU/renderer |
| VM screen (1024x768) | **medium** | VirtualBox default resolution |
| VM CPU (≤1 core) | **medium** | VirtualBox default CPU count |

### UI display
- **Title:** Session fingerprint mismatch
- **Risk:** High
- **Shown as:** Count + delta details in reason field

---

## Integrity Score Calculation

Scored by `IntegrityEngine.score()` in `report_pipeline.py:167`.

### Weight table

| Signal | Weight per occurrence | Max occurrences capped |
|--------|---------------------|------------------------|
| `tab_switch` | -10 | 3 |
| `fullscreen_exit` | -15 | 3 |
| `window_focus_loss` | -10 | 3 |
| `face_absence` | -15 | 3 |
| `multiple_faces` | -25 | 3 |
| `camera_disabled` | -15 | 3 |
| `microphone_disabled` | -8 | 3 |
| `identity_mismatch` | -20 | 3 |
| `connection_lost` | -12 | 3 |
| `answer_integrity` | -20 | 3 |
| `session_fingerprint` | -20 | 3 |

`latency_mismatch` is NOT in the weight table — it is informational only.

### Formula
```
score = 100
for each signal event:
    score += weight × min(count, 3)
final = clamp(score, 0, 100)
```

### Bands
| Score | Band |
|-------|------|
| ≥ 80 | HIGH (trusted) |
| ≥ 55 | MODERATE (review recommended) |
| < 55 | LOW (potential integrity issue) |

---

## Super Admin Toggles (Plan Defaults)

| Signal | STARTER | PRO/GROWTH | BUSINESS/ENTERPRISE |
|--------|---------|------------|---------------------|
| `tab_switch` | ❌ | ✅ | ✅ |
| `fullscreen_exit` | ❌ | ✅ | ✅ |
| `window_focus_loss` | ❌ | ✅ | ✅ |
| `connection_lost` | ❌ | ✅ | ✅ |
| `camera_disabled` | ❌ | ✅ | ✅ |
| `microphone_disabled` | ❌ | ✅ | ✅ |
| `face_absence` | ❌ | ❌ | ✅ |
| `multiple_faces` | ❌ | ❌ | ✅ |
| `identity_mismatch` | ❌ | ❌ | ✅ |
| `latency_mismatch` | ❌ | ✅ | ✅ |
| `answer_integrity` | ❌ | ✅ | ✅ |
| `session_fingerprint` | ❌ | ❌ | ✅ |

---

## DB Storage Format

All signals live in the `Interview.integritySignals` JSONB column (default: `[]`).

```json
[
  // Browser-side events appended live by frontend
  { "eventType": "tab_switch", "severity": "medium", "timestamp": ..., "reason": "..." },
  { "eventType": "face_absence", "severity": "high", "timestamp": ..., "reason": "..." },

  // Metadata-only — never displayed as violations
  { "eventType": "ip_registered", "severity": "low", "timestamp": ..., "metadata": { "fingerprint": {...} } },

  // Backend-computed events appended post-interview
  { "eventType": "latency_mismatch", "severity": "medium", "timestamp": ..., "latency_sec": {...}, "turns": [...] },
  { "eventType": "session_fingerprint", "severity": "high", "timestamp": ..., "reason": "...", "metadata": {...} }
]
```

**Array limit:** 400 events (oldest are dropped when exceeded).

---

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    FRONTEND (Browser)                         │
│                                                               │
│  HardwareCheck.tsx       FaceProctoring.tsx                   │
│  ┌────────────────┐     ┌──────────────────┐                  │
│  │ uploadSnapshot  │     │ FaceLandmarker    │                │
│  │ collectFinger.. │     │ every 250ms       │                │
│  │ sendFingerprint │     │ 3s grace / 60s ID │                │
│  └────────┬───────┘     └────────┬─────────┘                  │
│           │                      │                            │
│  page.tsx │                      │                            │
│  ┌────────┴──────────────────────┴─────────────────┐          │
│  │  tab_switch (1500ms grace)                      │          │
│  │  fullscreen_exit (immediate)                    │          │
│  │  window_focus_loss (1500ms grace)               │          │
│  │  camera_disabled / mic_disabled (4000ms grace)  │          │
│  │  fingerprint re-check (every 120s)              │          │
│  └──────────────────────┬──────────────────────────┘          │
│                         │                                     │
└─────────────────────────┼─────────────────────────────────────┘
                          │ POST /api/interview/proctoring
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                    BACKEND (Next.js API)                      │
│                                                               │
│  /api/interview/proctoring/route.ts                           │
│  ┌──────────────────────────────────────────┐                 │
│  │ 1. Zod validation                        │                 │
│  │ 2. Auth check (accessToken)              │                 │
│  │ 3. normalizeProctoringEvents()           │                 │
│  │ 4. Filter by org proctoringSignals toggle│                 │
│  │ 5. Append to integritySignals[] (cap 400)│                 │
│  │ 6. Upsert Interview record               │                 │
│  └──────────────────┬───────────────────────┘                 │
└─────────────────────┼─────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────────┐
│                    POSTGRES (Prisma)                          │
│                                                               │
│  Interview.integritySignals (JSONB)                           │
│  Interview.questionByQuestionAnalysis (JSONB)                 │
│  Organization.proctoringSignals (JSONB, toggle config)        │
│                                                               │
│  integritySignals = [                                          │
│    { eventType: "tab_switch", severity: "medium", ... },      │
│    { eventType: "face_absence", severity: "high", ... },      │
│    { eventType: "ip_registered", severity: "low", ... },      │
│    ...                                                         │
│  ]                                                             │
└─────────────────────┬─────────────────────────────────────────┘
                      │
                      ▼ (post-interview, after transcript save)
┌──────────────────────────────────────────────────────────────┐
│                    BACKEND (Python agent_runtime)              │
│                                                               │
│  1. persist_transcript() — reads existing integritySignals,   │
│     writes back preserving browser events                     │
│                                                               │
│  2. persist_latency_signals() — computes per-turn latencies,  │
│     appends latency_mismatch event                            │
│                                                               │
│  3. persist_session_fingerprint() — compares ip_registered    │
│     fingerprints, appends session_fingerprint if mismatch     │
│                                                               │
│  4. persist_answer_scores() — saves per-turn scores           │
│                                                               │
│  5. report_pipeline.py — IntegrityEngine.score() computes     │
│     0-100 score + band from proctoring events only            │
└─────────────────────┬─────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────────┐
│                    ADMIN UI (Next.js)                          │
│                                                               │
│  /api/admin/integrity — dashboard aggregator                  │
│    - Skips ip_registered (__skip__)                           │
│    - Counts violations per type, computes score               │
│                                                               │
│  /admin/candidates/[id] — per-candidate view                  │
│    - Groups events by eventType                               │
│    - Filters ip_registered out                                │
│    - Shows PROCTORING_DISPLAY title/why/risk per signal       │
│    - latency_mismatch: per-turn breakdown                     │
│    - answer_integrity: score + reason + quotes                │
│    - session_fingerprint: count + reason + deltas             │
│    - Other signals: count + "Happened during" context         │
└──────────────────────────────────────────────────────────────┘
```
