# TRD — Technical Requirements Document
## Sreevaai · AI Interview & Recruitment Automation Platform

---

## 01 · Stack Overview

| Layer | Technology | Version |
|---|---|---|
| Frontend Framework | Next.js (App Router) | 16.1.6 |
| UI Library | React | 19.2.3 |
| Language | TypeScript | ^5 |
| Styling | TailwindCSS | ^4 |
| Database ORM | Prisma | ^5.22.0 |
| Primary Database | PostgreSQL (Supabase-hosted) | — |
| Auth | JWT via `jose` + Redis blacklist | jose ^6.2.2 |
| Queue System | BullMQ | ^5.71.1 |
| Cache & Queue Backend | Redis (ioredis) | ^5.10.1 |
| Object Storage | Cloudflare R2 (AWS SDK compatible) | aws-sdk ^3.1016.0 |
| Vector DB | Pinecone | ^7.1.0 |
| Real-Time Video | LiveKit Cloud | livekit-client ^2.18.0 |
| AI Agent Runtime | Python + LiveKit Agents SDK | 1.5.2 (all plugins must match) |
| LLM | OpenAI GPT-4.1-mini (org-configurable) | openai ^6.22.0 |
| TTS (primary) | Cartesia sonic-3 | livekit-plugins-cartesia 1.5.2 |
| TTS (default org) | Sarvam AI bulbul:v3 | livekit-plugins-sarvam 1.5.2 |
| TTS (alt) | ElevenLabs | livekit-plugins-elevenlabs 1.5.2 |
| STT | Deepgram nova-3-general | livekit-plugins-deepgram 1.5.2 |
| VAD | Silero (via LiveKit) | livekit-plugins-silero 1.5.2 |
| Face Detection | MediaPipe Tasks Vision (in-browser) | ^0.10.34 |
| Email | Resend | resend API |
| Password Hashing | bcryptjs | ^3.0.3 |
| Sanitization | isomorphic-dompurify | ^3.8.0 |
| Validation | Zod | ^4.3.6 |
| Animations | Framer Motion | ^12.34.2 |
| Analytics | Microsoft Clarity | ^1.0.2 |

---

## 02 · Frontend

**Framework:** Next.js 16.1.6 with App Router. All pages use React Server Components where possible. Client components marked with `"use client"`.

**Styling:** TailwindCSS v4 with `@tailwindcss/postcss`. Component primitives from Radix UI (checkbox, dialog, dropdown, label, select, slider, switch, tabs, avatar — all ^2.x). Utility classes via `clsx` + `tailwind-merge` + `class-variance-authority`.

**Key Client Libraries:**
- `framer-motion ^12.34.2` — page transitions, UI animations
- `lucide-react ^0.574.0` — icons
- `date-fns ^4.1.0` — date formatting
- `plyr-react ^6.0.0` — interview recording playback
- `lenis ^1.3.23` — smooth scroll
- `html2canvas ^1.4.1` + `jspdf ^4.2.1` — PDF export
- `@ricky0123/vad-web ^0.0.30` — browser-side voice activity detection
- `@mediapipe/tasks-vision ^0.10.34` — in-browser GPU face detection

**LiveKit UI:**
- `@livekit/components-react ^2.9.20`
- `@livekit/components-styles ^1.2.0`
- `livekit-client ^2.18.0`

**Interview page proctoring components** (`components/careers/interview/`):
- `HardwareCheck.tsx` — pre-interview device check (camera, mic, speaker, face snapshot)
- `FaceProctoring.tsx` — MediaPipe face detection (absence, multiple faces, identity mismatch)
- `HardwareHeartbeat.tsx` — ongoing camera/mic monitoring via MediaStream events + polling
- `ConnectionProctoring.tsx` — LiveKit RoomEvent-based network monitoring
- `CandidateRatingForm.tsx` — post-interview feedback form

**Next.js Config (`next.config.ts`):**
- `poweredByHeader: false`
- `turbopack` enabled in dev
- `serverActions.bodySizeLimit: '20mb'`
- `proxyClientMaxBodySize: '20mb'`
- `serverActions.allowedOrigins` — from `ALLOWED_ORIGINS` env var

---

## 03 · Backend

**Runtime:** Node.js 20. All API routes run in Node.js runtime (not Edge). Set explicitly on routes with: `export const runtime = "nodejs"`.

**API Layer:** Next.js App Router API routes under `app/api/`. No separate Express server.

**Background Workers:** `worker.ts` — standalone BullMQ worker process. Run separately from Next.js (`npm run worker`). Spawns Python subprocess for CPU-heavy jobs (resume extraction, behavioral analysis).

**Python Agent:** Separate process. LiveKit Agents framework v1.5.2. Spawned via Docker as its own container (`hr-agent`). Communicates with Next.js only via PostgreSQL (asyncpg pool) and HTTP (internal `/api/admin/candidates/[id]/sync`).

**Authentication:** JWT (HS256, 7-day expiry) stored in httpOnly `session` cookie. Verified per-route via `getSession()` or `getSessionFromRequest()`. Redis blacklist for revocation (password changes, logout).

**Rate Limiting:** Redis-backed. Login: 5 attempts / 60s per email.

**Validation:** Zod schemas at all API input boundaries.

**Sanitization:** `isomorphic-dompurify` via `lib/sanitize.ts` for all candidate-supplied text before storage or LLM injection.

---

## 04 · Database

**Provider:** PostgreSQL hosted on Supabase (ap-south-1 region).

**Two connection strings required:**
- `DATABASE_URL` — pgbouncer (transaction mode, pooled). Used by Prisma at runtime.
- `DIRECT_URL` — direct Postgres. Used only for Prisma migrations.

**ORM:** Prisma ^5.22.0. Schema at `prisma/schema.prisma`.

**Core Tables (10):**

| Table | Key Purpose |
|---|---|
| `Organization` | Customer account — plan, quota, proctoring signal toggles, voice/LLM config |
| `User` | Admins, recruiters, candidates |
| `Drive` | One job role — JD, questions, screening threshold, voice override |
| `Application` | One candidate per drive — resume, scores, statuses |
| `Interview` | Live session — transcript, recording, report, proctoring events |
| `ResumeCandidate` | Bulk screening record (separate from Application) |
| `ResumeBatch` | Batch job tracking for bulk resume uploads |
| `InterviewSlot` | Scheduled time with capacity/booking count |
| `EngineVoice` | TTS voice registry — provider, model, gender, tags |
| `SupportTicket` | Candidate support issues per interview |

**Key JSON columns on `Interview`:**
- `proctoringEvents` — frontend hardware signals (array, max 400 events)
- `proctoringReport` — AI behavioral signal events + contradiction state (written at session end + incremental checkpoints via `checkpoint_ai_signals()`)
- `interviewReport` — full AI-generated report (scores, Q&A, narrative)
- `strategicVerdict` — hiring recommendation + reasoning
- `interviewTurns` — structured Q&A blocks
- `answerScores` — per-question score breakdown
- `candidateRating` — candidate feedback submission

**Key status fields on `Application`:**
- `resumeStatus`: `pending → screened → passed / failed`
- `interviewStatus`: `pending → scheduled → completed / failed / noshow`
- `hiringStatus`: `pending → shortlisted → rejected / offered`

**Interview.status:** `PENDING → IN_PROGRESS → COMPLETED / FAILED / NO_SHOW`

---

## 05 · Auth

**Method:** JWT (HS256) via `jose` library.

**Flow:**
1. `POST /api/auth/login` — verify bcrypt password → issue JWT → set httpOnly cookie
2. All protected routes call `getSession()` → verify JWT → check Redis blacklist
3. Session invalidated on: logout, password change (blacklisted in Redis), or 7-day expiry
4. Session refreshed (new cookie issued) if within 24h of expiry

**Roles:**
- `SUPER_ADMIN` — platform-level admin
- `ADMIN` — org admin / recruiter (maps from ORG_ADMIN, HR, TEAM via `normalizeRole()`)
- `CANDIDATE` — job applicant (default user role)

**Candidate interview access:** Separate token system. Each interview row has `accessToken` (UUID). Passed as `?token=` URL param. Required when `INTERVIEW_TOKEN_REQUIRED=true`.

**OTP Flow:** For password reset — `POST /api/auth/otp/send` → OTP stored on `User.resetOtp` + expiry → `POST /api/auth/verify-otp` → `POST /api/auth/reset-password`.

---

## 06 · Third-Party Services

| Service | Purpose | Key Env Vars |
|---|---|---|
| **Supabase** | PostgreSQL hosting + auth layer | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Cloudflare R2** | Object storage — resumes, JDs, recordings, snapshots, logos | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_*_BUCKET`, `NEXT_PUBLIC_R2_*_URL` |
| **LiveKit Cloud** | WebRTC video/audio rooms + recording | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL` |
| **OpenAI** | LLM for interviews + report generation + embeddings | `OPENAI_API_KEY` |
| **Deepgram** | Speech-to-text (STT) — nova-3-general model | `DEEPGRAM_API_KEY` |
| **Cartesia** | TTS voices (primary — sonic-3 model) | `CARTESIA_API_KEY` |
| **Sarvam AI** | TTS voices (default org — bulbul:v3 model) | `SARVAM_API_KEY` |
| **ElevenLabs** | TTS voices (alternative) | `ELEVENLABS_API_KEY` |
| **Pinecone** | Vector embeddings — semantic candidate/transcript search | `PINECONE_API_KEY`, `PINECONE_INDEX_NAME` |
| **Resend** | Transactional email — invitations, password reset, status updates | `RESEND_API_KEY`, `RESEND_FROM_*` |
| **Redis** | Cache, session blacklist, BullMQ queue backend | `REDIS_URL` |
| **Microsoft Clarity** | Web analytics | (hardcoded in Clarity init) |

---

## 07 · Queue System

**Engine:** BullMQ ^5.71.1 backed by Redis.

**7 Queues (defined in `lib/queue.ts`):**

| Queue | Trigger | Worker Action |
|---|---|---|
| `resume-processing` | Bulk resume upload | Spawn Python → extract PDF → score vs JD → update `ResumeCandidate` + `Application` |
| `jd-extraction` | JD PDF upload | Spawn Python → extract role, skills, requirements → update `Drive.extractedDetails` |
| `jd-upload` | AI-generated JD PDF | Build PDF → upload to R2 → update drive |
| `interview-finalization` | Interview ends | Generate interview report via OpenAI → update `Interview.interviewReport` |
| `interview-snapshots` | Proctoring snapshot | Upload screenshot to R2 → append URL to `Interview.snapshots` |
| `interview-recording` | Recording chunks arrive | Merge chunks → upload to R2 → update `Interview.interviewRecordingUrl` |
| `invitation-delivery-queue` | Bulk invite trigger | Send interview invitation emails via Resend |

**Worker processes (`npm run worker`):** All queues in one process or split by name. Retry strategy: exponential backoff, 3 attempts. Job retention: 100 completed jobs (resume-processing), unlimited others.

**Python subprocess pattern:**
```
Node (BullMQ worker) → spawn python extract_pdf.py → JSON on stdout → parse → DB write
Timeout: 180s. Stderr → logs. Exit code 0 = success.
```

---

## 08 · Python Agent

**Version:** Python 3.11-slim.

**Critical constraint:** All `livekit-*` package versions must be identical (`1.5.2`). Mixing versions causes silent failures.

**Key packages:**
```
livekit-agents==1.5.2
livekit-plugins-openai==1.5.2
livekit-plugins-deepgram==1.5.2
livekit-plugins-cartesia==1.5.2
livekit-plugins-sarvam==1.5.2
livekit-plugins-silero==1.5.2
livekit-plugins-elevenlabs==1.5.2
livekit-plugins-turn-detector==1.5.2
livekit-plugins-google==1.5.2
openai>=1.59.0
asyncpg>=0.29.0
redis>=5.0.0
python-dotenv>=1.0.0
psycopg2-binary>=2.9.0
pymupdf4llm>=0.0.17
pdfplumber>=0.11.0
```

**Module responsibilities:**

| File | Responsibility |
|---|---|
| `agent.py` | Entrypoint — `WorkerOptions`, CLI startup |
| `agent_runtime.py` | Main session orchestrator (2300+ lines) — full interview lifecycle |
| `agent_providers.py` | TTS/STT/LLM/VAD factory functions |
| `agent_persistence.py` | asyncpg DB pool — read/write interview state |
| `agent_scoring.py` | Per-turn scoring — `score_answer_quality()`, `evaluate_answer_and_decide()`, `extract_claims()`, `check_contradiction()` |
| `turn_decision.py` | Signal detection engine — 11 OOP detectors (`SignalEvaluator`, `BaseDetector` subclasses) |
| `turn_evaluator.py` | Orchestrates scoring + signal detection + routing per turn |
| `contradiction_state.py` | Contradiction lifecycle state machine |
| `trust_engine.py` | Trust bucket system — behavioral_confidence, hard_integrity, intelligence_quality |
| `probe_strategy.py` | Next-action routing (PROBE / MOVE_ON / VERIFY) + directive building |
| `prompt_layers.py` | System prompt construction — voice layer, evaluation layer, stage directives |
| `interview_phases.py` | Stage configs (Resume, Skill, Situational, Behavioral) + time budgets |
| `recruiter_summary.py` | End-of-session recruiter summary builder |
| `resume_context_parser.py` | Resume text → structured context for LLM injection |
| `agent_profile_context.py` | Candidate band inference, merged interview brief |
| `session_state.py` | Trust state initializer |

**Interview stage flow:**
1. Warmup (greeting + icebreaker) — 120s fixed
2. Resume Review — 25% of remaining time (~4.5 min)
3. Skill/Technical — 30% (~5 min)
4. Situational — 25% (~4.5 min)
5. Behavioral — 20% (~3.5 min, reserved: 210s)

**AI signal detection per turn (turn_decision.py detectors):**

| Detector Class | Signal |
|---|---|
| `OwnershipAmbiguityDetector` | `ownership_ambiguity` |
| `ExampleEvasionDetector` | `example_evasion` |
| `ResumeClaimMismatchDetector` | `resume_claim_mismatch` |
| `FollowUpCollapseDetector` | `follow_up_collapse` |
| `LatencyMismatchDetector` | `latency_mismatch` |
| `ContradictionDetector` | `contradiction` |
| `DepthDecayDetector` | `depth_decay` |
| `ComplexityLatencyMismatchDetector` | `complexity_latency_mismatch` |
| `OwnershipClarifiedDetector` | `ownership_clarified` |
| `ExampleGivenDetector` | `example_given` |
| `StrongUnderPressureDetector` | `strong_under_pressure` |

**Contradiction detection (`agent_scoring.py`):**
- Claims extracted per turn via LLM (`extract_claims()`)
- Indexed by type: `team_size`, `years_experience`, `project_ownership`, `tenure_at_company`, `outcome_metric`, `tech_stack`, `company_name`, `timeline`
- Cross-referenced on each new answer via `check_contradiction()`
- State machine in `contradiction_state.py` tracks surfacing → probing → resolution

**AI signal persistence:**
- Accumulated in-memory in `proctoring_events: list` during session
- Written to `Interview.proctoringReport` at session end via `persist_transcript()`
- **Checkpointed every 5 new events** to `proctoringReport.checkpoint_events` via `checkpoint_ai_signals()` — crash safety

---

## 09 · Storage (Cloudflare R2)

**4 Buckets:**

| Bucket Env Var | Content | Public URL Env Var |
|---|---|---|
| `R2_LOGOS_BUCKET` | Org logos | `NEXT_PUBLIC_R2_LOGOS_URL` |
| `R2_RESUMES_BUCKET` | Candidate resume PDFs | `NEXT_PUBLIC_R2_RESUMES_URL` |
| `R2_JDS_BUCKET` | Job description files | `NEXT_PUBLIC_R2_JDS_URL` |
| `R2_INTERVIEW_BUCKET` | Recordings, snapshots | `NEXT_PUBLIC_R2_INTERVIEW_URL` |

**Key operations (lib/s3.ts):**
- `putObject()` — upload with auto public URL by bucket type
- `getPresignedUploadUrl()` — 10-minute validity for client-side direct upload
- `getObjectBuffer()` — stream to buffer (used for PDF parsing)
- `deleteObject()` — normalized key extraction from public URLs

---

## 10 · Environment Variables (Complete List)

```bash
# ── App ──────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://www.sreevaai.com
APP_URL=https://www.sreevaai.com
ALLOWED_ORIGINS=yourdomain.ngrok-free.app

# ── Database ──────────────────────────────────────
DATABASE_URL=postgresql://...?pgbouncer=true&connection_limit=10
DIRECT_URL=postgresql://...   # migrations only

# ── Supabase ──────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# ── Auth ──────────────────────────────────────────
JWT_SECRET=<random 64-char string>

# ── Redis ─────────────────────────────────────────
REDIS_URL=redis://default:<password>@<host>:<port>

# ── LiveKit ───────────────────────────────────────
LIVEKIT_URL=wss://your-project.livekit.cloud
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxx
LIVEKIT_API_SECRET=xxxx

# ── OpenAI ────────────────────────────────────────
OPENAI_API_KEY=sk-proj-...

# ── Voice Providers ───────────────────────────────
CARTESIA_API_KEY=sk_car_...
SARVAM_API_KEY=sk_...
DEEPGRAM_API_KEY=...
ELEVENLABS_API_KEY=...         # optional

# ── Cloudflare R2 ─────────────────────────────────
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_LOGOS_BUCKET=logos
R2_RESUMES_BUCKET=resumes
R2_JDS_BUCKET=jds
R2_INTERVIEW_BUCKET=interview
NEXT_PUBLIC_R2_LOGOS_URL=https://pub-xxx.r2.dev
NEXT_PUBLIC_R2_RESUMES_URL=https://pub-xxx.r2.dev
NEXT_PUBLIC_R2_JDS_URL=https://pub-xxx.r2.dev
NEXT_PUBLIC_R2_INTERVIEW_URL=https://pub-xxx.r2.dev

# ── Pinecone ──────────────────────────────────────
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX_NAME=transcripts

# ── Email ─────────────────────────────────────────
RESEND_API_KEY=re_...
RESEND_FROM_INTERVIEW=Sreeva AI <interviews@sreevaai.com>
RESEND_FROM_PASSWORD_RESET=Sreeva AI <no-reply@sreevaai.com>
RESEND_FROM_WELCOME=Sreeva AI <hello@sreevaai.com>

# ── Internal ──────────────────────────────────────
MASTER_ADMIN_EMAIL=support@sreevaai.com
WORKER_SYNC_TOKEN=<shared secret between Next.js and Python agent>

# ── Feature Flags ─────────────────────────────────
INTERVIEW_TOKEN_REQUIRED=true     # enforce token-based interview access
INTERVIEW_REOPEN_ALLOWED=false    # allow re-entry after completion
LIVEKIT_IDLE_PROCESSES=1          # Python agent pre-warm count
```

---

## 11 · Folder Structure

```
/
├── app/
│   ├── admin/                  # Recruiter dashboard (billing, candidates, drives, settings)
│   ├── api/                    # All API routes (68 endpoints)
│   │   ├── admin/              # Dashboard, org, billing, assistant
│   │   ├── auth/               # Login, logout, OTP, reset
│   │   ├── candidates/         # CRUD, bulk actions, export
│   │   ├── drives/             # Drive + resume screening
│   │   ├── extract/            # JD extraction jobs
│   │   ├── interview/          # Token, slots, proctoring, recording, finalize
│   │   ├── stream/             # SSE streaming
│   │   ├── super-admin/        # Platform admin
│   │   ├── upload/             # Presigned URLs, logo, snapshots
│   │   ├── voices/             # Voice registry
│   │   └── webhooks/livekit/   # LiveKit event ingestion
│   ├── interview/[id]/         # Candidate-facing interview page
│   ├── super-admin/            # Super admin dashboard
│   └── ...                     # login, invite, privacy, terms, home
│
├── components/
│   ├── admin/                  # Dashboard, candidate-profile, drives, billing
│   ├── careers/interview/      # HardwareCheck, FaceProctoring, HardwareHeartbeat, ConnectionProctoring
│   ├── create-drive/           # Drive creation wizard
│   ├── agents-ui/              # AuraVisualizer, interview UI
│   ├── super-admin/            # Platform admin components
│   └── ui/                     # Radix-based primitives (button, dialog, input, etc.)
│
├── lib/                        # 40 shared modules (auth, db, s3, openai, queue, etc.)
│
├── interview/                  # Python agent (20 .py files)
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── worker.ts                   # BullMQ worker entry point
├── agent.py                    # Python agent entry point
├── requirements.txt            # Python dependencies
├── Dockerfile                  # Python agent image
├── Dockerfile.frontend         # Node.js multi-stage image
├── docker-compose.yml          # Full stack (frontend, worker, agent, livekit, redis)
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## 12 · API Routes (All 68)

### Auth
| Method | Path |
|---|---|
| POST | `/api/auth/login` |
| POST | `/api/auth/logout` |
| GET | `/api/auth/me` |
| POST | `/api/auth/otp/send` |
| POST | `/api/auth/verify-otp` |
| POST | `/api/auth/forgot-password` |
| POST | `/api/auth/reset-password` |

### Admin
| Method | Path |
|---|---|
| GET/POST | `/api/admin/organization` |
| GET/POST | `/api/admin/profile` |
| GET/POST | `/api/admin/setup` |
| GET | `/api/admin/stats` |
| GET | `/api/admin/activity` |
| GET | `/api/admin/top-candidates` |
| GET | `/api/admin/score-distribution` |
| GET | `/api/admin/drives-summary` |
| GET | `/api/admin/integrity` |
| GET | `/api/admin/integrity/logs` |
| GET | `/api/admin/credits` |
| GET | `/api/admin/billing/history` |
| POST | `/api/admin/create-drive/upload-jd-pdf` |
| POST | `/api/admin/candidates/[id]/rescan` |
| POST | `/api/admin/candidates/[id]/sync` |
| POST | `/api/admin/assistant` |
| POST | `/api/admin/chat` |
| POST | `/api/admin/voice/preview` |
| POST | `/api/admin/voice/preview/sarvam` |

### Candidates
| Method | Path |
|---|---|
| GET | `/api/candidates` |
| GET | `/api/candidates/[id]` |
| POST | `/api/candidates/[id]/scan` |
| POST | `/api/candidates/[id]/send-email` |
| POST | `/api/candidates/[id]/send-interview-link` |
| GET | `/api/candidates/export` |
| GET | `/api/candidates/status` |
| POST | `/api/candidates/bulk-action` |
| POST | `/api/candidates/bulk-email` |

### Drives
| Method | Path |
|---|---|
| GET/POST | `/api/drives` |
| GET/PATCH | `/api/drives/[id]` |
| GET/POST | `/api/drives/[id]/resume-screening` |
| GET | `/api/drives/[id]/resume-screening/download` |
| GET | `/api/drives/[id]/resume-screening/candidates/[candidateId]` |

### Interview
| Method | Path |
|---|---|
| GET/POST | `/api/interview/[id]/token` |
| POST | `/api/interview/[id]/book` |
| GET | `/api/interview/[id]/slots` |
| POST | `/api/interview/[id]/feedback` |
| POST | `/api/interview/[id]/support` |
| POST | `/api/interview/finalize` |
| POST | `/api/interview/recording` |
| POST | `/api/interview/start-recording` |
| POST | `/api/interview/shutdown` |
| POST | `/api/interview/proctoring` |

### Upload / Extract / Stream
| Method | Path |
|---|---|
| POST | `/api/upload/presigned` |
| POST | `/api/upload/logo` |
| POST | `/api/upload/interview-snapshot` |
| POST | `/api/extract` |
| GET | `/api/extract/status/[jobId]` |
| GET/POST | `/api/stream` |
| GET | `/api/health` |
| GET | `/api/voices` |

### Super Admin
| Method | Path |
|---|---|
| GET/POST | `/api/super-admin/orgs` |
| GET/PATCH | `/api/super-admin/orgs/[id]` |
| POST | `/api/super-admin/orgs/[id]/reset-password` |
| GET | `/api/super-admin/orgs/interview-history` |
| GET | `/api/super-admin/billing/orgs` |
| GET | `/api/super-admin/exchange-rate` |
| GET | `/api/super-admin/voices` |
| GET | `/api/super-admin/support-tickets` |
| POST | `/api/webhooks/livekit` |

---

## 13 · Deployment

**Docker Compose Services (docker-compose.yml):**

| Service | Image | Port | Purpose |
|---|---|---|---|
| `hr-frontend` | `Dockerfile.frontend` | 3000 | Next.js app + API routes |
| `hr-worker` | `Dockerfile.frontend` | — | BullMQ workers (`npm run worker`) |
| `hr-agent` | `Dockerfile` (Python) | — | LiveKit AI interview agent |
| `livekit` | `livekit/livekit-server` | 7880, 7881 (UDP 5000–5100) | Self-hosted LiveKit (optional — can use LiveKit Cloud) |
| `redis` | `redis:7-alpine` | 6379 | Queue + cache |

**Traefik (reverse proxy):**
- `www.sreevaai.com` → `hr-frontend:3000`
- `lk.sreevaai.com` → `livekit:7880`
- TLS via Let's Encrypt

**Node.js Dockerfile (multi-stage):**
```
Stage 1: node:20-alpine — install deps
Stage 2: node:20-alpine — build Next.js
Stage 3: node:20-slim — production runtime
```

**Python Dockerfile:**
```
FROM python:3.11-slim
RUN apt-get install build-essential libpq-dev ffmpeg
COPY requirements.txt . && pip install -r requirements.txt
RUN python agent.py download-files   # pre-cache AI models
CMD ["python", "agent.py", "start"]
```

**DNS:** 8.8.8.8 (Google) set in docker-compose for external connectivity.

---

## 14 · Technical Constraints & Hard Rules

**Must not break:**
- All `livekit-*` pip packages must stay at identical version (`1.5.2`). Mixed versions cause silent failures.
- `DATABASE_URL` must use pgbouncer (transaction mode). `DIRECT_URL` for migrations only — never swap these.
- Python agent communicates with Next.js only via PostgreSQL and one internal HTTP call (`/api/admin/candidates/[id]/sync`). No shared memory, no direct socket.
- `export const runtime = "nodejs"` required on any route that uses `fs`, streams, `child_process`, or long-running connections. Edge runtime will silently break these.
- `serverActions.bodySizeLimit` is `20mb` — do not send larger payloads via server actions.

**Security rules (non-negotiable):**
- All candidate-supplied text sanitized via `lib/sanitize.ts` before DB write or LLM injection
- JWT secret must be ≥64 random characters. Never reuse across environments.
- `accessToken` on Interview is a UUID generated at creation — never expose it in URLs that other candidates can predict
- R2 bucket policies: `resumes` and `jds` are private (presigned URLs only). `logos` and `interview` are public CDN buckets.
- Rate limit all auth endpoints (login: 5/60s)

**Performance rules:**
- Prisma queries: always use indexed fields for filters. Key indexes: `Application(driveId, resumeStatus, hiringStatus, updatedAt)`, `Interview(updatedAt DESC, status)`, `InterviewSlot(driveId, startTime)`
- BullMQ resume jobs: 180s timeout. Never block the Node.js event loop with PDF parsing — always via Python subprocess.
- MediaPipe face detection: runs at 250ms intervals (4fps). Keep `numFaces: 2`, `minFaceDetectionConfidence: 0.7`. GPU delegate preferred — fall back to WASM if unavailable.
- AI signal checkpoint: flush to DB every 5 new events. Do not wait until session end.

**Feature gating (plan-based):**
- STARTER: hardware proctoring signals only (no AI behavioral signals, no face detection)
- PRO: all AI behavioral signals + recruiter assistant + multilingual
- BUSINESS/ENTERPRISE: + face_absence, multiple_faces, identity_mismatch, contradiction, contradiction_resolved
- Check via `isProctoringSignalEnabled(orgToggles, eventType)` in route — never trust client

**Voice config:**
- Organization default voice ID: `9626c31c-bec5-4cca-baa8-f8ba9e84c8bc` (Jacqueline / Cartesia)
- Drive-level voice overrides org default
- Agent reads voice from DB at session start — not from env

**LLM defaults (org-configurable):**
- Model: `gpt-4.1-mini`
- Temperature: `0.7`
- Deepgram ASR model: `nova-3-general`

---

## 15 · Naming Conventions

**Files:** kebab-case (`interview-analysis.ts`, `agent-persistence.py`)

**React components:** PascalCase (`HardwareCheck.tsx`, `FaceProctoring.tsx`)

**API routes:** Next.js App Router conventions (`app/api/[resource]/route.ts`)

**Database fields:** camelCase (Prisma default — e.g. `resumeStatus`, `interviewReport`)

**Python modules:** snake_case (`agent_runtime.py`, `turn_decision.py`)

**Environment variables:** SCREAMING_SNAKE_CASE. `NEXT_PUBLIC_` prefix for client-accessible vars only.

**IDs:** Generated via `lib/ids.ts`. Interviews: `int_` prefix. Others: cuid.
