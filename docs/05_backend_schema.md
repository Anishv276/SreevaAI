# Document 05 — Backend Schema
## Sreevaai · Data Model & Auth Architecture

---

## 01 · Database

**Provider:** PostgreSQL via Prisma ORM
**Connection:** `DATABASE_URL` (pgbouncer-compatible, pooled) + `DIRECT_URL` (direct for migrations)
**ORM:** Prisma Client JS

---

## 02 · Tables

### Organization
Primary account entity. One org = one customer.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK, cuid |
| `name` | String | Display name |
| `slug` | String | Unique, URL-safe identifier |
| `logoUrl` | String? | Optional |
| `plan` | String | `STARTER` \| `PRO` \| `BUSINESS` \| `ENTERPRISE` — default `STARTER` |
| `status` | String | `ACTIVE` \| `SUSPENDED` \| `QUOTA_EXCEEDED` — default `ACTIVE` |
| `statusControl` | String | `QUOTA` — what controls suspension |
| `interviewQuotaTotal` | Int | Total purchased interviews |
| `interviewQuotaUsed` | Int | Interviews consumed this period |
| `creditsUsed` | Float | Billing credits accumulated |
| `maxActiveDrives` | String | Plan-gated drive limit |
| `voiceId` | String? | Default Cartesia voice UUID |
| `allowedVoices` | String[] | Whitelisted voice UUIDs for this org |
| `deepgramModel` | String? | STT model — default `nova-3-general` |
| `llmModel` | String? | LLM — default `gpt-4.1-mini` |
| `llmTemperature` | Float? | LLM temperature — default `0.7` |
| `proctoringSignals` | Json? | Toggle map for all 18 signal types — default all `true` |
| `usageMetrics` | Json? | Per-feature billing breakdown |
| `onboardingComplete` | Boolean | Onboarding wizard done flag |
| `industry` | String? | — |
| `size` | String? | — |
| `website` | String? | — |
| `location` | String? | — |
| `createdAt` | DateTime | — |
| `updatedAt` | DateTime | Auto-updated |

---

### User
Org members (admins/HR). Also used for candidate auth (role = `CANDIDATE`).

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK, cuid |
| `email` | String | Unique |
| `name` | String? | — |
| `role` | String | `CANDIDATE` \| `ORG_ADMIN` — normalized to `ADMIN` in session |
| `orgId` | String? | FK → Organization.id (cascade delete) |
| `orgRole` | String? | Fine-grained org role |
| `password` | String? | Bcrypt hash — null for SSO/invited users |
| `phone` | String? | — |
| `jobTitle` | String? | — |
| `resetOtp` | String? | 6-digit OTP for password reset/change |
| `resetOtpExpires` | DateTime? | OTP expiry (10 min window) |
| `createdAt` | DateTime | — |
| `updatedAt` | DateTime | — |

---

### SuperAdmin
Separate table — completely isolated from User. Platform-level access only.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK, cuid |
| `email` | String | Unique |
| `name` | String | — |
| `password` | String | Bcrypt hash — always required |
| `resetOtp` | String? | OTP for password change |
| `resetOtpExpires` | DateTime? | OTP expiry |
| `createdAt` | DateTime | — |
| `updatedAt` | DateTime | — |

> SuperAdmin has no `orgId` — it is not a member of any org.

---

### Drive
One hiring drive = one job role. Belongs to an org.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK |
| `orgId` | String? | FK → Organization.id (cascade delete) |
| `creatorId` | String | FK → User.id (cascade delete) |
| `title` | String | Drive display title |
| `role` | String? | Job role extracted from JD |
| `location` | String? | — |
| `deadline` | DateTime? | Application deadline |
| `screeningThreshold` | Int | Resume pass score — default `0` |
| `screeningCriteria` | String? | JSON — AI scoring rubric |
| `extractedDetails` | String? | JSON — parsed JD data |
| `interviewLanguage` | String? | Default `English` |
| `interviewQuestions` | String? | JSON array — question list |
| `jdFileName` | String? | Uploaded JD file name |
| `jdPreviewUrl` | String? | S3/R2 URL to JD file |
| `aiName` | String? | AI interviewer name — default `Ishitha` |
| `voiceId` | String? | Override voice for this drive |
| `createdAt` | DateTime | — |
| `updatedAt` | DateTime | — |

**Indexes:** `orgId`

---

### Application
One candidate applying to one drive.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK |
| `driveId` | String | FK → Drive.id (cascade delete, no action on update) |
| `fullName` | String | — |
| `email` | String | — |
| `phone` | String | — |
| `resumeUrl` | String | S3/R2 presigned URL to resume PDF |
| `resumeText` | String? | Extracted plain text |
| `resumeData` | String? | JSON — structured resume parse result |
| `aiScore` | Int? | Resume score 0–100 |
| `aiReport` | String? | JSON — per-criterion scoring |
| `resumeStatus` | String | `pending` → `screened` → `passed` / `failed` |
| `interviewStatus` | String | `pending` → `scheduled` → `completed` / `failed` / `noshow` |
| `hiringStatus` | String | `pending` → `shortlisted` → `rejected` / `offered` |
| `createdAt` | DateTime | — |
| `updatedAt` | DateTime | — |

**Indexes:**
- `(driveId, resumeStatus, hiringStatus, updatedAt)` — dashboard filter queries
- `createdAt DESC`
- `updatedAt DESC`

---

### Interview
One live interview session per application. 1:1 with Application.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK |
| `applicationId` | String | FK → Application.id (cascade delete), **unique** |
| `slotId` | String? | FK → InterviewSlot.id (set null on delete) |
| `accessToken` | String | Unique UUID — used in candidate interview URL |
| `status` | String | `PENDING` → `IN_PROGRESS` → `COMPLETED` / `FAILED` / `NO_SHOW` |
| `scheduledAt` | DateTime? | Booked slot time |
| `inviteSentAt` | DateTime? | When invite email was sent |
| `expiresAt` | DateTime? | Token expiry |
| `startedAt` | DateTime? | Interview begin timestamp |
| `completedAt` | DateTime? | Interview end timestamp |
| `interviewDuration` | Int? | Seconds |
| `interviewTranscript` | String? | Full JSON transcript with timestamps + speaker labels |
| `interviewTurns` | Json? | Per-turn data array |
| `answerScores` | Json? | Per-question score breakdown |
| `interviewReport` | Json? | Full structured report (communication, cognitive, behavioral) |
| `proctoringReport` | Json? | AI behavioral signals + checkpoint_events |
| `proctoringEvents` | Json? | Hardware proctoring event array |
| `strategicVerdict` | Json? | Verdict + recommendation (Strong Yes / Yes / Maybe / No) |
| `aiSummary` | String? | 4-bullet narrative summary |
| `snapshots` | String[] | S3/R2 URLs to periodic face snapshots |
| `interviewRecordingUrl` | String? | LiveKit recording URL |
| `interviewRecordedAt` | DateTime? | — |
| `recordingStatus` | String? | `NOT_STARTED` / `IN_PROGRESS` / `COMPLETED` |
| `recordingMimeType` | String? | — |
| `recordingStartedAt` | DateTime? | — |
| `recordingCompletedAt` | DateTime? | — |
| `recordingDurationSec` | Int? | — |
| `recordingManifest` | Json? | Recording chunk manifest |
| `billingSnapshot` | Json? | Cost breakdown at time of completion |
| `candidateFeedback` | String? | Post-interview text feedback |
| `candidateRating` | Json? | Star rating + categories |
| `createdAt` | DateTime | — |
| `updatedAt` | DateTime | — |

**Indexes:** `updatedAt DESC`, `status`

---

### ResumeCandidate
Candidate record within a bulk screening batch. Separate from Application — exists before invite is sent.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK, cuid |
| `driveId` | String | FK → Drive.id (cascade delete) |
| `bulkBatchId` | String | FK → ResumeBatch.id (cascade delete) |
| `fullName` | String | — |
| `email` | String? | — |
| `phone` | String? | — |
| `fileName` | String | Original uploaded file name |
| `resumeText` | String? | Extracted text |
| `resumeData` | String? | JSON — structured parse |
| `aiScore` | Int? | 0–100 |
| `aiReport` | String? | JSON |
| `resumeStatus` | String | `pending` / `screened` / `passed` / `failed` |
| `createdAt` | DateTime | — |
| `updatedAt` | DateTime | — |

**Indexes:** `(driveId, bulkBatchId)`, `(driveId, resumeStatus)`

---

### ResumeBatch
Tracks one bulk upload job. Multiple ResumeCandidates per batch.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK, cuid |
| `driveId` | String | FK → Drive.id (cascade delete) |
| `orgId` | String | Org identifier (not FK constraint — denormalized for query speed) |
| `status` | String | `PROCESSING` / `COMPLETED` / `FAILED` |
| `totalCount` | Int | Files submitted |
| `processedCount` | Int | Successfully processed |
| `failedCount` | Int | Errored |
| `completedAt` | DateTime? | — |
| `createdAt` | DateTime | — |
| `updatedAt` | DateTime | — |

**Indexes:** `(driveId, status)`

---

### InterviewSlot
Scheduled time blocks with capacity. Candidates book into these.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK, cuid |
| `orgId` | String | FK → Organization.id (cascade delete) |
| `driveId` | String | FK → Drive.id (cascade delete) |
| `startTime` | DateTime | — |
| `endTime` | DateTime | — |
| `maxCapacity` | Int | Concurrent bookings allowed — default `5` |
| `bookedCount` | Int | Current bookings |
| `status` | String | `ACTIVE` / `FULL` / `CANCELLED` |
| `createdAt` | DateTime | — |
| `updatedAt` | DateTime | — |

**Indexes:** `(orgId, startTime)`, `(driveId, startTime)`

---

### EngineVoice
TTS voice catalog. Available voices for org selection.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK — Cartesia/Sarvam voice UUID |
| `name` | String | Display name |
| `provider` | String | `cartesia` / `sarvam` / `deepgram` |
| `model` | String | Provider-specific model ID |
| `description` | String? | — |
| `gender` | String? | — |
| `tags` | String[] | Searchable tags |
| `isActive` | Boolean | Visible in selection UI |
| `isBuiltIn` | Boolean | System voice (not deletable) |
| `createdAt` | DateTime | — |
| `updatedAt` | DateTime | — |

**Indexes:** `isActive`, `provider`

---

### SupportTicket
Support requests tied to an interview or application.

| Column | Type | Notes |
|---|---|---|
| `id` | String | PK, cuid |
| `interviewId` | String? | FK → Interview.id (set null on delete) |
| `applicationId` | String? | Optional reference |
| `name` | String | Requester name |
| `email` | String | Requester email |
| `issueAbout` | String | Issue description |
| `status` | String | `OPEN` / `RESOLVED` |
| `resolvedAt` | DateTime? | — |
| `createdAt` | DateTime | — |
| `updatedAt` | DateTime | — |

**Indexes:** `(status, createdAt)`, `(interviewId, createdAt)`

---

## 03 · Relationships

```
Organization
  ├── User[]                 (orgId → Organization.id)
  ├── Drive[]                (orgId → Organization.id)
  └── InterviewSlot[]        (orgId → Organization.id)

Drive
  ├── Application[]          (driveId → Drive.id)
  ├── ResumeCandidate[]      (driveId → Drive.id)
  ├── ResumeBatch[]          (driveId → Drive.id)
  └── InterviewSlot[]        (driveId → Drive.id)

Application
  └── Interview (1:1)        (applicationId → Application.id, unique)

Interview
  ├── InterviewSlot?         (slotId → InterviewSlot.id)
  └── SupportTicket[]        (interviewId → Interview.id)

ResumeBatch
  └── ResumeCandidate[]      (bulkBatchId → ResumeBatch.id)
```

**All cascade behavior:**
- Org deleted → all Drives, Users, Slots deleted
- Drive deleted → all Applications, ResumeBatches, ResumeCandidates, Slots deleted
- Application deleted → Interview deleted
- Interview deleted → SupportTickets set null on interviewId
- Slot deleted → Interview.slotId set null

---

## 04 · JSON Column Schemas

These columns store structured data as `Json` in Postgres (jsonb).

### `Organization.proctoringSignals`
```json
{
  "tab_switch": true,
  "camera_disabled": true,
  "microphone_disabled": true,
  "connection_lost": true,
  "duplicate_ip": true,
  "face_absence": true,
  "multiple_faces": true,
  "identity_mismatch": true,
  "ownership_ambiguity": true,
  "example_evasion": true,
  "latency_mismatch": true,
  "resume_claim_mismatch": true,
  "ownership_clarified": true,
  "example_given": true,
  "strong_under_pressure": true,
  "follow_up_collapse": true,
  "contradiction": true,
  "contradiction_resolved": true
}
```

### `Interview.proctoringEvents`
Array of hardware signal events posted from the browser during the session.
```json
[
  {
    "type": "tab_switch",
    "severity": "medium",
    "timestamp": "2024-01-01T10:05:23Z",
    "elapsedSeconds": 323,
    "metadata": {}
  }
]
```

### `Interview.proctoringReport`
Written by the Python agent at session end. May also contain `checkpoint_events` written mid-session by the AI signal checkpoint system.
```json
{
  "ai_signals": [...],
  "checkpoint_events": [...],
  "trust_engine": {
    "behavioral_confidence": 0.72,
    "hard_integrity": 0.85,
    "intelligence_quality": 0.68
  }
}
```

### `Interview.interviewReport`
Full structured analysis written post-interview.
```json
{
  "communication": { "score": 78, "pronunciation": 80, "grammar": 75, "fluency": 80, "confidence": 77, "narrative": "..." },
  "cognitive": { "clarity": 72, "depth": 68, "problemSolving": 70, "logicalThinking": 71 },
  "behavioral": { "engagement": 74, "consistency": 70, "patterns": "...", "integrityFlags": [], "strengths": [], "concerns": [] }
}
```

### `Interview.strategicVerdict`
```json
{
  "recommendation": "Yes",
  "narrative": "200-300 word hiring narrative...",
  "aiSummaryBullets": ["Background...", "Communication...", "Gaps...", "Hiring Signal..."]
}
```

### `Interview.answerScores`
```json
{
  "q1": { "score": 7.5, "clarity": 8, "depth": 7, "fluency": 8, "confidence": 7, "tags": ["system-design"], "verdict": "Candidate explained..." }
}
```

### `Organization.usageMetrics`
```json
{
  "interview": 12,
  "resumeExtraction": 45,
  "jdExtraction": 3,
  "chatbot": 7,
  "reports": 12
}
```

---

## 05 · Auth System

### Provider
**Custom JWT — no NextAuth, no Supabase Auth.**
- Tokens signed with HS256 using `JWT_SECRET`
- Stored in `httpOnly` cookie named `session`
- 7-day expiry, sliding refresh in last 24h
- Blacklisted on logout via Redis (`blacklist:<token>` key, 7d TTL)

### Session Payload
```typescript
interface SessionUser {
  userId: string
  email: string
  name: string
  role: "SUPER_ADMIN" | "ADMIN" | "CANDIDATE"
  orgId: string | null
  onboardingComplete?: boolean
}
```

### Auth Flow

```
POST /api/auth/login
  → validate email + password (bcrypt)
  → rate limited: 5 attempts / 60s per email
  → check SuperAdmin table first, then User table
  → normalizeRole() → SUPER_ADMIN | ADMIN | CANDIDATE
  → createSession() → signed JWT
  → set httpOnly cookie `session`

GET /api/auth/me
  → reads `session` cookie
  → verifySession():
      1. in-memory cache check (zero cost, 5s TTL)
      2. JWT cryptographic verify
      3. DEV: skip Redis (local speed)
         PROD: Redis mget → blacklist check + password-change invalidation
  → returns SessionUser or null

POST /api/auth/logout
  → blacklist token in Redis (7d)
  → clear cookie
  → localStorage `logout-event` fires cross-tab logout
```

### Session Caching
In-process `Map<token, SessionUser | null>` with 5-second auto-flush.
Prevents duplicate JWT verify + Redis calls within a single request burst.
Dev mode skips Redis entirely to avoid 200–500ms latency.

---

## 06 · User Roles

| Role | Who | Access |
|---|---|---|
| `SUPER_ADMIN` | Platform operator | All orgs, billing, super-admin routes (`/super-admin/*`) |
| `ADMIN` | Org HR admin | Their org only — drives, candidates, reports, billing |
| `CANDIDATE` | Job applicant | Interview room only (`/careers/*`) — no dashboard |

**Role normalization** (`normalizeRole()`):
- `ORG_ADMIN`, `HR`, `TEAM` → all map to `ADMIN`
- Anything else → `CANDIDATE`

**No Row Level Security (RLS)** in Postgres — access control is enforced entirely in API route handler logic.

---

## 07 · Password & OTP Flow

**Password change (logged-in user):**
```
POST /api/auth/otp/send  →  6-digit OTP emailed (10 min expiry)
PATCH /api/auth/profile  →  verifies OTP + current password → bcrypt hash → invalidates all sessions
```

**Password reset (forgot password):**
```
POST /api/auth/forgot-password  →  6-digit OTP emailed (10 min, rate limited: 1/30s)
POST /api/auth/verify-otp       →  validate OTP (no state change)
POST /api/auth/reset-password   →  validate OTP + update hash + clear OTP + invalidate sessions
```

**Session invalidation on password change:**
Redis key `auth:pwd_change:<userId>` set to `Date.now()`.
`verifySession()` compares `token.iat * 1000` vs this timestamp — any token issued before the password change is rejected.

---

## 08 · File Storage

**Provider:** S3-compatible (Cloudflare R2)

| Path pattern | Contents |
|---|---|
| `/resumes/<driveId>/<applicationId>.pdf` | Candidate resume PDFs |
| `/jd/<driveId>/<filename>` | Job description PDFs uploaded by admin |
| `/snapshots/<interviewId>/<timestamp>.jpg` | Periodic face snapshots during interview |
| `/recordings/<interviewId>/...` | LiveKit recording chunks |

File URLs stored as presigned S3 URLs in:
- `Application.resumeUrl`
- `Drive.jdPreviewUrl`
- `Interview.snapshots[]`
- `Interview.interviewRecordingUrl`

---

## 09 · Sensitive Fields

| Field | Table | How handled |
|---|---|---|
| `password` | User, SuperAdmin | bcrypt hash (cost 10) — never stored plaintext |
| `resetOtp` | User, SuperAdmin | Stored temporarily (10 min), cleared after use |
| `accessToken` | Interview | UUID used in candidate URL — not a session token |
| `JWT_SECRET` | — | Env var — never in DB |
| `DATABASE_URL` | — | Env var — pgbouncer connection string |
| Payment data | — | Not stored in DB — out of scope this version |

---

## 10 · Rate Limiting

All limits enforced via Redis sliding window (`isRateLimited(key, max, windowSeconds)`).

| Endpoint | Limit |
|---|---|
| `POST /api/auth/login` | 5 attempts / 60s per email |
| `POST /api/auth/forgot-password` | 1 request / 30s per email |
| `POST /api/auth/otp/send` | 5 requests / 60s per email |
| `POST /api/auth/reset-password` | 1 attempt / 30s per email |

---

## 11 · Status State Machines

### Application
```
resumeStatus:    pending → screened → passed | failed
interviewStatus: pending → scheduled → completed | failed | noshow
hiringStatus:    pending → shortlisted → rejected | offered
```

### Interview
```
status: PENDING → IN_PROGRESS → COMPLETED | FAILED | NO_SHOW
recordingStatus: NOT_STARTED → IN_PROGRESS → COMPLETED
```

### ResumeBatch
```
status: PROCESSING → COMPLETED | FAILED
```

### InterviewSlot
```
status: ACTIVE → FULL | CANCELLED
```

### Organization
```
status: ACTIVE → SUSPENDED | QUOTA_EXCEEDED
```
> Org with `interviewQuotaUsed >= interviewQuotaTotal` is auto-suspended. Login still allowed — dashboard shows upgrade prompt.
