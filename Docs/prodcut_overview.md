# Sreeva AI — Product Research & Overview


> **Last updated:** July 2026  
> **Stack:** Next.js 16 (App Router) + Python (LiveKit Agents) + PostgreSQL + Redis  
> **Domain:** [sreevaai.com](https://sreevaai.com)


---


## 1. What Sreeva AI Does


Sreeva AI is an **AI-powered asynchronous interview & resume screening platform** for recruiters and HR teams. Recruiters create a "Drive" (job posting), upload a JD, share a link, and candidates apply with their resume. The platform:


1. **Parses & scores resumes** against the JD using LLMs (GPT models via Python subprocess)
2. **Auto-shortlists/rejects** based on configurable thresholds
3. **Sends interview invitations** (or rejection emails) automatically
4. **Hosts live AI interviews** via a voice-enabled AI agent (voice, video, proctoring)
5. **Generates comprehensive AI reports** — skill ratings, integrity scores, summaries
6. **Handles billing** per-usage (LLM tokens, TTS/STT costs)


---


## 2. Architecture Overview


```
┌──────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js 16)                     │
│  app/  (admin/, super-admin/, interview/, schedule/, login/,     │
│         api/, billing/, test/)                                    │
│  components/  (admin/, agents-ui/, application/, careers/,       │
│               create-drive/, layout/, super-admin/, ui/)          │
│  hooks/  context/  lib/  billing/                                 │
├──────────────────────────────────────────────────────────────────┤
│                    Background Workers (Node.js)                   │
│  worker.ts — BullMQ workers for: resume-processing,              │
│  invitation-delivery-queue, interview-start, interview-           │
│  finalization, interview-snapshots, interview-recording,          │
│  recording-retention-cleanup, jd-upload, jd-extraction            │
├──────────────────────────────────────────────────────────────────┤
│                   Python AI Agent (LiveKit Agents)                │
│  agent.py → interview/ (agent_runtime.py, agent_scoring.py,      │
│  eval_pipeline.py, report_pipeline.py, brief_extraction.py,      │
│  interview_phases.py, signal_detector.py, probe_strategy.py,     │
│  tts_phonetic_processor.py, band_classifier.py, etc.)            │
├──────────────────────────────────────────────────────────────────┤
│                    Billing Engine (Python)                        │
│  billing/billing.py — rate tables, cost strategies, usage        │
│  summarizer, bucket merger, DB writes                             │
├──────────────────────────────────────────────────────────────────┤
│  PostgreSQL (Supabase)  │  Redis (BullMQ)  │  Cloudflare R2      │
│  │  LiveKit Cloud       │  Resend (Email)  │  Deepgram (STT)     │
│  │  OpenAI (LLM)        │  Sarvam (TTS)    │  ElevenLabs (TTS)    │
└──────────────────────────────────────────────────────────────────┘
```


### Infrastructure (Docker Compose)


| Service | Container | Role |
|---|---|---|
| Frontend | `Frontend` | Next.js server — SSR, API routes, static assets |
| Worker | `Normal-worker` | BullMQ background job consumer |
| Python Backend | `Backend-python-agent` | LiveKit voice agent — interviews, eval, reports |
| Redis | `redis` | BullMQ job queue + pub/sub for LiveKit |


- **Traefik** reverse proxy (external network `traefik-proxy`) with Let's Encrypt TLS
- All services read from a shared `.env` file


---


## 3. Data Model (Prisma — PostgreSQL)


### Core Entities


| Model | Key Fields | Purpose |
|---|---|---|
| **Organization** | `id`, `name`, `slug`, `plan`, `maxActiveDrives`, `maxConcurrentSlots`, `proctoringSignals`, `sttModel`, `ttsProvider`, `ttsModel`, `voiceId`, `llmResumeExtraction`, `llmJdExtraction`, `llmResumeReport`, `llmInterviewLive`, `llmInterviewEval`, `llmInterviewBrief`, `llmInterviewReport`, `interviewQuotaTotal/Used`, `creditsUsed`, `statusControl`, `recordingEnabled`, `recordingRetentionDays` | Tenant — every drive/user belongs to one org |
| **SuperAdmin** | `id`, `email`, `password`, `name`, `resetOtp` | Platform super-admins |
| **User** | `id`, `email`, `name`, `password`, `role` (default ADMIN), `orgId` | Org admins — can create drives, view reports |
| **Drive** | `id`, `title`, `role`, `screeningThreshold`, `screeningCriteria`, `extractedDetails`, `interviewLanguage`, `interviewQuestions`, `jdFileName`, `jdPreviewUrl`, `orgId`, `deadline`, `aiName`, `voiceId`, `interviewMode` | A job posting / hiring drive |
| **Application** | `id`, `fullName`, `email`, `phone`, `resumeUrl`, `aiScore`, `aiReport`, `resumeText`, `resumeData`, `driveId`, `resumeStatus`, `interviewStatus`, `fullScanReport`, `fileName` | Candidate application to a drive |
| **Interview** | `id`, `applicationId` (unique), `accessToken`, `inviteSentAt`, `expiresAt`, `status`, `startedAt`, `completedAt`, `interviewTranscript`, `interviewDuration`, `snapshots[]`, `candidateFeedback`, `candidateRating`, `billingSnapshot`, `integritySignals`, `signalAnalysis`, `linkStatus`, `questionByQuestionAnalysis`, `scoreBreakdown`, `interviewSummary`, `recording`, `skillRatings`, `scheduledAt`, `timezone`, `isTest`, `testBillingMetrics` | The AI interview session |
| **SupportTicket** | `id`, `interviewId`, `applicationId`, `name`, `email`, `issueAbout`, `status` | Candidate support issues |
| **EngineVoice** | `id`, `name`, `provider`, `model`, `description`, `gender`, `tags`, `isActive`, `isBuiltIn` | Voice registry for AI interviewer |


### Key Design Decisions


- `Organization` has **per-org LLM model selection** — configurable via Super Admin → Models page
- `Interview.recording` is a **JSON blob** (not a separate table) — stores recording manifest, retention state, egress metadata
- `integritySignals` — proctoring events stored as JSON array directly on Interview
- Soft deletes everywhere (`isDeleted`)


---


## 4. Resume Screening Pipeline


### Flow


```
Candidate uploads resume → /api/upload → enqueues "screen-resume" job
  → worker.ts downloads from R2 → writes temp file
  → spawns Python: scripts/extract_pdf.py (RESUME_AND_SCORE or RESUME)
  → Python uses OpenAI to extract structured data + score against JD
  → Returns {score, data, text, usage}
  → worker writes results to DB, handles billing
  → Application.resumeStatus = "shortlisted" | "rejected" | "pending" (no JD)
```


### Resume Statuses


| Status | Meaning |
|---|---|
| `pending` | Not yet processed / no JD to score against |
| `waiting` | Enqueued |
| `extracting` | Currently extracting text |
| `scoring` | LLM scoring in progress |
| `shortlisted` | Score >= threshold |
| `rejected` | Score < threshold |
| `failed` | Processing error |


### Key Files


- `worker.ts:499-694` — `processResumeScreeningJob()` — full pipeline
- `worker.ts:703-758` — `processResumeFileExtractJob()` — extract only (UI polling)
- `scripts/extract_pdf.py` — Python PDF extraction + LLM scoring
- `lib/queue.ts` — Queue definitions
- `lib/s3.ts` — R2 object storage interactions


### Stale Row Reconciler


`reconcileResumeQueue()` runs every 2 minutes — cross-checks DB rows against live BullMQ jobs and marks orphaned rows as `failed`.


---


## 5. Invitation & Email Delivery


### Flow


When `aiScore >= screeningThreshold`, the worker enqueues an `invitation-delivery-queue` job with `action: "shortlist"` or `"reject"`.


**Shortlist flow:**
1. Upserts an `Interview` record with `status: "PENDING"`, generates `accessToken`
2. Sends a schedule invite email with link: `{APP_URL}/schedule/{accessToken}`
3. Sets `interviewStatus = "pending"` on the Application


**Reject flow:**
1. Sends a rejection email
2. No Interview record created


### Email Types (via Resend)


| Function | Template |
|---|---|
| `sendScheduleInviteEmail` | Interview invitation with schedule link |
| `sendRejectionEmail` | Post-screening rejection |
| `sendInterviewCompletedEmail` | Admin notification after interview done |
| `sendPasswordResetEmail` | Password reset OTP |
| `sendWelcomeEmail` | New account welcome |


All emails are HTML with violet-themed branding. Template helpers: `wrapper()`, `header()`, `infoCard()`, `buttonPrimary()`.


---


## 6. Interview System (Core Product)


### 6.1 Schedule & Candidate Facing


- **`/schedule/[token]`** — Candidate self-schedules their interview time
- **`/interview/[id]`** — The LiveKit-powered voice/video interview room
- **`/interview/[id]/rating-preview/`** — Post-interview rating page


### 6.2 Interview Agent Architecture (Python)


**Entry:** `agent.py` → `interview/agent_runtime.py:_entrypoint_guarded()`


The agent runs inside a LiveKit room. Key modules:


| Module | Role |
|---|---|
| `agent_runtime.py` | Main loop — room connect, phase orchestration, turn handling |
| `agent_runtime_helpers.py` | `get_interview_context()`, transcript helpers, data message handlers |
| `agent_runtime_support.py` | DB connection, LLM clients, TTS/STT provider init, shared constants |
| `agent_runtime_utils.py` | Utilities — `_clean_stt_text()`, `_candidate_meta_intent()`, `_build_eval_payload()` |
| `agent_scoring.py` | Answer scoring logic, probe strategy, saturation system |
| `eval_pipeline.py` | LangGraph pipeline for per-turn evaluation |
| `report_pipeline.py` | Report generation (3-node LangGraph + summary) |
| `brief_extraction.py` | Interview brief generation (LangGraph parallel resume/JD parse) |
| `interview_phases.py` | Phase state machine |
| `probe_strategy.py` / `probe_strategy2.py` | Probe family generation |
| `agent_scoring.py` | Answer scoring + response/content signal classification |
| `band_classifier.py` | Candidate band classification (fresher/mid/experienced/senior) |
| `tts_phonetic_processor.py` | Phonetic pronunciation fixes, acronym transforms |
| `agent_providers.py` | Provider initialization (STT/LLM/TTS) |
| `prompt_layers.py` | System prompt layer assembly |
| `agent_persistence.py` | Post-interview persistence functions |
| `slack_error_logger.py` | Slack error reporting |
| `debug_report.py` | Debug PDF generation for test interviews |


### 6.3 Interview Phases


| Phase | What Happens |
|---|---|
| **0 — Pre-join** | Brief generation (parallel resume/JD parse → `InterviewBrief`), system prompt assembly (3 layers), provider init, greeting TTS pre-warm |
| **1 — Launch** | `launch_prereqs_ready` signal → candidate clicks Start → timer starts |
| **2 — Greeting** | Scripted welcome (bypasses LLM), STT unblocked after |
| **3 — Warmup** | Candidate readiness detection via keyword markers |
| **4+ — Interview** | Turn loop: question → answer → eval → probe/MOVE_ON |
| **Final** | 45s wrap-up window → 20s time guard → goodbye script |


### 6.4 Turn Evaluation & Scoring


**4 dimensions scored per turn (0-10 scale):**


| Dimension | Weight | What It Measures |
|---|---|---|
| Depth | 35% | Level of reasoning, decision-making, tradeoffs |
| Grounding | 25% | Real-experience details (hardest to fake) |
| Clarity | 20% | Communication fluency, structure |
| Specificity | 20% | Operational detail, concreteness |


**Formula:** `overall = clarity×0.20 + depth×0.35 + specificity×0.20 + grounding×0.25`


**Scoring LLM:** `gpt-4.1-nano` (temp=0), per-org configurable via `Organization.llmInterviewEval`


**Output per turn:**
```json
{"clarity": 5.5, "depth": 3.8, "specificity": 3.2, "grounding": 4.0,
 "overall": 4.1, "action": "PROBE", "signal": "ownership_ambiguity", "signal_reason": "..."}
```


### 6.5 Probe System


| Probe Signal | What Fires It | Goal |
|---|---|---|
| `ownership_ambiguous` | Candidate used "we/team" without personal action | Pin specific deliverable |
| `example_evaded` | Asked for real story, got theory | Get one specific real moment |
| `depth_insufficient` | Said WHAT, never HOW/WHY | Get mechanics |
| `surface_answer` | Correct but hollow — no texture | Concrete detail |
| `tech_claim_unverified` | Named tool but described vaguely | Verify hands-on knowledge |
| `new_tech_thread` | Mentioned tool not on resume | Pull the thread |
| `claim_not_demonstrated` | Strong personal claim with no example | Real example proving it |


### 6.6 Topic Saturation System


Each topic has:
- **Saturation threshold** (7.0 for CRITICAL, 5.5 for HIGH, etc. — varies by band)
- **Base turn credit** per contribution
- **Signal modifiers** (penalties for ownership_ambiguous, example_evasion)


**Exit reasons:**
1. `saturated` — score >= threshold
2. `weak_exit` — 3+ turns stuck below progress threshold
3. `dry_topic` — consecutive near-zero contributions
4. `eval_MOVE_ON` — LLM judges redundant
5. `skip_request` — candidate asked to skip
6. `explicit_denial` — candidate said "I don't know"


**Coverage Memory:** CoveredTopics tracks all explored topics with `CoverageRecord` — prevents re-asking.


### 6.7 MOVE_ON Directive


When a topic is saturated/exhausted, the agent generates a MOVE_ON directive:
- `[TOPIC_LOCK]` — previous topic closed, new active topic
- Opens with a micro-reaction + natural transition
- Cross-reference rules per topic source (RESUME_TOPIC / resume_skill / jd_skill / STANDALONE)


### 6.8 Post-Interview Persistence


After the main loop exits (candidate ends or timeout):


1. `persist_transcript()` — writes `interviewTranscript`, sets `status="COMPLETED"`, records `integritySignals`
2. `persist_answer_scores()` — all scored turns
3. `update_interview_status()` — marks COMPLETED (prevents re-dispatch)
4. `persist_org_usage_metrics()` — LLM + TTS + STT costs
5. **Background:** `generate_interview_report()` — 3-node LangGraph pipeline
6. **Background:** `generate_interview_summary()` — summary bullets + verdict
7. `persist_interview_billing_snapshot()` — final billing record
8. `flush_pending_manual_billing()` — deferred billing entries


### 6.9 Report Generation Pipeline


3-node LangGraph:
- **Node 1:** Deterministic signals — integrity score from `integritySignals` DB column, JD context assembly
- **Node 2:** Two parallel LLM calls (gpt-4.1-mini):
  - Call A: 5-dimension scores (Communication, Technical Knowledge, Resume Credibility, Problem Solving, Clarity of Thought) + strengths/concerns
  - Call B: Skill ratings by domain category from `topic_records`
- **Node 3:** Summary generation — 2 more LLM calls for summary bullets + final verdict


**5 Report Dimensions:**
| Dimension | What It Assesses |
|---|---|
| Communication | Clarity, directness, narrative structure |
| Technical Knowledge | Hands-on depth, tool mastery |
| Resume Credibility | Match between claimed experience and live answers |
| Problem Solving | Structured reasoning, tradeoff articulation |
| Clarity of Thought | Focus, precision, landing the point |


### 6.10 Edge Cases Handled


| Edge Case | How Handled |
|---|---|
| **Disconnect** | 5s grace window for reconnection; then finishes |
| **"I don't know"** | `explicit_denial` signal → MOVE_ON; caps skill score at 2 |
| **Skip request** | Bypasses eval, covers topic, moves to next |
| **"Can you repeat?"** | Meta-intent → rephrases last question, no scoring |
| **Company question** | Meta-intent → answers gracefully, bridges back |
| **Inactivity** | Escalating nudges at 10s/20s/30s/50s/60s → auto-end |
| **Custom questions** | Reminder at 75% elapsed; urgent at <60s |
| **Re-dispatch guard** | Exit if `status in (COMPLETED, NO_SHOW, ABANDONED)` |
| **STT hallucination** | Spam filter (≥10 words, ≤3 unique) + low-diversity filter |
| **MOVE_ON race** | `_move_on_opener_pending` flag skips eval for opener turn |
| **Duplicate questions** | `_asked_questions_log` (last 6) prevents repeats |
| **Interruptions** | 0.3s interrupt gap for mid-speech goodbye |


---


## 7. Workers System (BullMQ + Redis)


### Queue Overview


| Queue | Jobs | Concurrency | Purpose |
|---|---|---|---|
| `resume-processing` | `screen-resume`, `resume-file-extract` | 50 | Resume PDF → extract → score |
| `invitation-delivery-queue` | `shortlist`/`reject` | 10 (rate-limited: 5/s) | Email delivery |
| `interview-start` | `mark-interview-started` | 100 | Persist start time, dispatch agent |
| `interview-finalization` | `finalize-interview` | 100 | Persist recording/transcript + notify admins |
| `interview-recording` | `finalize-egress-recording` | 100 | LiveKit egress → R2 verification → finalize |
| `interview-snapshots` | — | 100 | Proctoring snapshot uploads to R2 |
| `recording-retention-cleanup` | `recording-retention-sweep` | 100 | Daily 9AM IST sweep of expired recordings |
| `jd-upload` | — | 10 | Background JD PDF uploads to R2 |
| `jd-extraction` | — | 3 | JD file/text extraction via Python |


### Key Worker Details


- **Temp file janitor:** Sweeps `os.tmpdir()` every 6 hours for stale PDFs/JSONs with known prefixes
- **Duplicate worker guard:** On startup, checks for existing consumers on the same queue
- **Stale row reconciler:** Every 2 minutes for resume-processing queue
- **Redis memory guard:** Skips cron registration if Redis is at ≥90% capacity
- **All queues use `BULLMQ_PREFIX`** to isolate dev/prod on shared Redis
- **All jobs auto-clean:** `removeOnComplete: { age: 60 }`, `removeOnFail: { age: 60 }`
- **Slack error logging** on job failures with org/drive/candidate context


---


## 8. Billing System


### Architecture (Python — `billing/billing.py`)


9 sections, all in one file:
1. **Rate Tables** — dict literals for OpenAI, ElevenLabs/Sarvam TTS, Deepgram STT rates (USD)
2. **Pydantic Models** — `ModelBilling`, `FeatureBilling`, `OrgBilling`
3. **CostStrategy** — Protocol + 4 frozen dataclass strategies via registry
4. **CostCalculator** — Wraps strategies, normalizes model names (regex cache)
5. **UsageSummarizer** — Converts `AgentSessionUsage` → feature-agnostic dict
6. **BucketMerger** — Merges session into correct OrgBilling bucket
7. **PendingBuffer** — In-memory accumulator for manual LLM usage, flushed at session end
8. **BillingRepository** — All DB writes in one class
9. **Public API** — 5 async functions (one per feature) + flush helper


### Features Tracked


| Feature | What's Billed |
|---|---|
| `interview` | Full session: LLM (agent turns) + TTS + STT |
| `interviewReport` | Post-session LangGraph report LLM calls |
| `resumeExtraction` | Resume parse LLM call |
| `jdExtraction` | JD parse LLM call |
| `resumeReport` | Resume scoring/report LLM calls |


### Rate Examples (OpenAI)


| Model | Input/1M tokens | Cached Input/1M | Output/1M |
|---|---|---|---|
| gpt-4.1-nano | $0.10 | $0.025 | $0.40 |
| gpt-4.1-mini | $0.40 | $0.10 | $1.60 |
| gpt-5.4-mini | $0.75 | $0.075 | $4.50 |


Rates converted to INR (`BILLING_INR_PER_USD`, default 83.0).


---


## 9. AI Model Configuration


### Per-Organization Model Selection


| Pipeline | Default Model | Config Field |
|---|---|---|
| Resume Extraction | `gpt-5.4-mini` | `llmResumeExtraction` |
| JD Extraction | `gpt-5.4-mini` | `llmJdExtraction` |
| Resume Report | `gpt-5.4-mini` | `llmResumeReport` |
| Live Interview | `gpt-4.1-mini` | `llmInterviewLive` |
| Per-turn Eval | `gpt-4.1-nano` | `llmInterviewEval` |
| Interview Brief | `gpt-4.1` | `llmInterviewBrief` |
| Interview Report | `gpt-5.4-mini` | `llmInterviewReport` |


### TTS/STT Providers


| Service | Providers | Models |
|---|---|---|
| STT | Deepgram | `flux-general-en` (default) |
| TTS | ElevenLabs, Sarvam | `eleven_turbo_v2_5`, `bulbul:v3`, etc. |
| LLM | OpenAI | Various GPT models |


### Voice Registry


`EngineVoice` model stores available voices from all providers. Built-in voices pre-seeded, configurable per org via `Organization.voiceId` and `allowedVoices`.


---


## 10. Frontend Routes & Pages


### Public / Candidate


| Route | Purpose |
|---|---|
| `/login` | Admin login (email + password) |
| `/login/forgot-password` | Password reset |
| `/schedule/[token]` | Candidate schedules interview time |
| `/interview/[id]` | AI interview room (LiveKit) |
| `/interview/[id]/rating-preview` | Post-interview rating display |
| `/privacy` | Privacy policy |
| `/terms` | Terms of service |


### Admin


| Route | Purpose |
|---|---|
| `/admin` | Dashboard, drive list |
| `/admin/login` | Admin login page |
| `/admin/welcome` | Onboarding flow |
| `/admin/setup` | Initial org setup |
| `/admin/settings` | Org settings, plan, billing, AI models, voice, proctoring |
| `/admin/drives` | Manage job drives |
| `/admin/create-drive` | Create new drive (wizard flow) |
| `/admin/candidates` | View all candidates across drives |
| `/admin/billing` | Billing overview |
| `/admin/schedule` | Interview schedule calendar |


### Super Admin


| Route | Purpose |
|---|---|
| `/super-admin` | Dashboard |
| `/super-admin/orgs` | Manage all organizations |
| `/super-admin/models` | Configure global AI model defaults |
| `/super-admin/voices` | Manage voice registry |
| `/super-admin/billing` | Global billing overview |
| `/super-admin/settings` | Platform settings |
| `/super-admin/support` | Support ticket management |
| `/super-admin/feedback` | Candidate feedback overview |


### API Routes


| Route | Purpose |
|---|---|
| `/api/auth/*` | Auth (login, register, reset password) |
| `/api/admin/*` | Admin operations |
| `/api/drives/*` | Drive CRUD, JD management |
| `/api/candidates/*` | Candidate operations |
| `/api/upload/*` | Resume upload |
| `/api/extract/*` | Resume/JD text extraction |
| `/api/interview/*` | Interview lifecycle, transcript, report |
| `/api/schedule/*` | Interview scheduling |
| `/api/stream/*` | LiveKit token generation |
| `/api/billing/*` | Billing endpoints |
| `/api/super-admin/*` | Super admin operations |
| `/api/test-interview/*` | Test interview management |
| `/api/voices/*` | Voice query endpoints |
| `/api/webhooks/*` | Webhooks |
| `/api/verify-speech/*` | Speech verification |
| `/api/health` | Health check |


---


## 11. Frontend Components & Design


### Design System (`Docs/DESIGN_SYSTEM.md`)


- **Fonts:** Geist Sans (app, via npm), DM Sans / Instrument Serif / JetBrains Mono (landing)
- **Primary palette:** Violet (`#7C3AED` → `#8B5CF6` → `#6D28D9`) + Blue accent (`#3B82F6`)
- **Background:** Gradient from white → `#FAFAFC` → `#F5F3FF` (fixed attachment)
- **Cards:** White (`#FFFFFF`) with `#E9E7FF` borders
- **Text:** `#111827` (primary), `#6B7280` (secondary), `#9CA3AF` (muted)
- **Spacing:** 8px base scale (xs=4, sm=8, md=12, lg=16, xl=24, 2xl=32, 3xl=40)
- **Radix UI primitives:** Avatar, Checkbox, Dialog, DropdownMenu, Label, Select, Slider, Switch, Tabs
- **Animations:** Framer Motion
- **Icons:** Lucide React
- **Styling:** Tailwind CSS v4 + `class-variance-authority` + `tailwind-merge` + `clsx`


### Key Components


| Directory | Contents |
|---|---|
| `components/admin/` | Admin dashboard components |
| `components/agents-ui/` | AI agent visualizer |
| `components/application/` | Application/candidate components |
| `components/careers/` | Public careers page components |
| `components/create-drive/` | Drive creation wizard steps |
| `components/layout/` | Navbar, sidebar, shell, theme |
| `components/super-admin/` | Super admin panel components |
| `components/ui/` | Shared UI (buttons, cards, inputs, badges, etc.) |


### Context Providers


| Context | Purpose |
|---|---|
| `auth-context` | Auth state, user session |
| `admin-org-context` | Current org admin context |
| `candidates-context` | Candidate list state management |
| `jobs-context` | Jobs/drives state management |


---


## 12. Proctoring & Integrity System


### Configurable Signals (per org)


Default: all disabled. Toggleable via `Organization.proctoringSignals`:
- `tab_switch` — Candidate switched browser tabs
- `face_absence` — Face left camera frame
- `multiple_faces` — Multiple people detected
- `camera_disabled` — Camera turned off
- `connection_lost` — Network disconnection
- `latency_mismatch` / `complexity_latency_mismatch` — Suspicious timing
- `identity_mismatch` — Face doesn't match expected
- `microphone_disabled` — Mic turned off


### Implementation


- **Frontend:** MediaPipe tasks-vision for face detection, VAD (Silero ONNX) for voice activity
- **Backend:** Snapshot worker uploads images to R2, stores URLs in `Interview.snapshots[]`
- **Processing:** integrity signals analyzed in `signalAnalysis.integrity_analysis` (see report pipeline)
- **Storage:** `integritySignals` JSON array on Interview model
- **Reporting:** Integrity score computed in report Node 1 from weighted signal table


---


## 13. Recording & Retention System


### Recording Flow


1. **Egress request** initiated via LiveKit when interview ends
2. **`interview-recording` worker** (`finalize-egress-recording` job):
   - Probes R2 for recording availability (`headObjectStrict`)
   - Persists recording metadata to `Interview.recording` JSON
   - If recording disabled for org: deletes the asset immediately
   - Schedules `recording-retention` deletion if enabled
   - Enqueues `interview-finalization` job


### Recording JSON Structure


```json
{
  "name": "candidate name - job title",
  "mode": "livekit_egress",
  "status": "COMPLETED",
  "mimeType": "video/mp4",
  "url": "https://...",
  "key": "interview/.../recording.mp4",
  "egressId": "EG_xxx",
  "completedAt": "ISO8601",
  "durationSec": 900,
  "manifest": { ... },
  "retention": {
    "days": 30,
    "dueAt": "ISO8601",
    "cleanupStatus": "PENDING",
    "cleanupAttempts": 0,
    "deletedAt": null
  }
}
```


### Retention Cleanup


- **Daily sweep** at 9:00 AM IST via `recording-retention-cleanup` queue cron
- Query finds interviews where `recording.retention.dueAt` has passed
- Attempts to delete from R2 (with retry: 2 attempts, 1s base delay)
- Updates `cleanupStatus` → `COMPLETED` or `FAILED`


---


## 14. Authentication & Security


- **JWT-based** auth (`jose` library)
- **bcryptjs** for password hashing
- **Supabase Auth** integration (anon key + service role)
- **Master admin email** configured via env (`MASTER_ADMIN_EMAIL`)
- **Rate limiting** (`lib/rate-limit.ts`)
- **JWT secret** — random 64-char hex string
- **Password reset** — OTP-based with expiry
- **Interview access tokens** — UUID v4 per interview
- **Role model:** ADMIN (org-level) + Super Admin (platform-level)


---


## 15. Test & Debug Infrastructure


- **Test interviews:** `isTest` flag on Interview model; test billing metrics tracked separately
- **Debug PDFs:** Uploaded to Slack after test interviews via `debug_report.py`
- **Slack alerting:** Error logging for workers, resume processing, drive ops, LiveKit failures
- **Test scripts:** `tests/` — pytest for Python agent modules; JS test files for various features
- **A/B testing:** `test_probe_ab.py`, `test_probe_live_sim.py` — probe strategy experiments
- **E2E recording test:** `scripts/test-recording-e2e.mjs`


---


## 16. Infrastructure & Deployment


### Docker Services


| Service | Base Image | Command |
|---|---|---|
| Frontend | `Dockerfile.frontend` (Node) | `next start` |
| Worker | `Dockerfile.frontend` | `tsx worker.ts` |
| Python Backend | `Dockerfile` (Python) | `agent.py start` |
| Redis | `redis:alpine` | Default |


### Cloud Providers


| Provider | Service | Usage |
|---|---|---|
| **Supabase** | PostgreSQL + Auth | Primary database + auth |
| **Cloudflare R2** | Object storage | Resumes, JD PDFs, interview recordings, logos, snapshots |
| **LiveKit Cloud** | Real-time media | Voice/video interview rooms, egress recording |
| **OpenAI** | LLM API | All AI pipelines (extraction, scoring, eval, report) |
| **Deepgram** | STT | Real-time speech-to-text |
| **ElevenLabs / Sarvam** | TTS | Voice synthesis for AI interviewer |
| **Resend** | Email | Transactional emails |
| **Redis Cloud** | Redis | BullMQ job queues + LiveKit pub/sub |
| **Slack** | Webhooks | Error alerting, debug PDFs |


### Environment


- Dev/prod isolated via `BULLMQ_PREFIX` (dev / prod)
- `WORKER_QUEUES` env variable enables specific workers
- Traefik for SSL termination + reverse proxy


---


## 17. Key Libraries & Dependencies


### Node.js (Next.js)


| Library | Purpose |
|---|---|
| `next` 16.1.6 | Framework |
| `react` 19.2.3 | UI |
| `livekit-client` + `livekit-server-sdk` | Real-time media |
| `@livekit/components-react` | LiveKit React components |
| `bullmq` | Job queues |
| `ioredis` | Redis client |
| `openai` | OpenAI API wrapper |
| `@aws-sdk/client-s3` | Cloudflare R2 (S3-compatible) |
| `@deepgram/sdk` | Speech-to-text |
| `prisma` + `@prisma/client` | ORM (PostgreSQL) |
| `jose` | JWT |
| `bcryptjs` | Password hashing |
| `zod` | Validation |
| `framer-motion` | Animations |
| `lucide-react` | Icons |
| `geist` | Font |
| `date-fns` | Date utilities |
| `plyr` + `plyr-react` | Video player for recordings |


### Python (LiveKit Agent)


| Library | Purpose |
|---|---|
| `livekit.agents` | Agent framework |
| `openai` | LLM calls |
| `langgraph` | Report/eval pipelines |
| `pydantic` | Data models (billing) |
| `elevenlabs` | TTS |
| `deepgram` | STT |
| `sarvam` | TTS |
| `silero` / `onnxruntime` | VAD (voice activity) |
| `mediapipe` | Face detection (proctoring) |
| `pypdf` / `pdfminer` / `pdfplumber` | PDF extraction |


---


## 18. Monitoring & Alerting


### Slack Integration


| Channel/Webhook | Purpose |
|---|---|
| `SLACK_BOT_TOKEN` | Post debug PDFs after test interviews (files:write, chat:write) |
| `SLACK_DEBUG_CHANNEL` | Channel where debug PDFs are posted |
| `SLACK_ERROR_WEBHOOK_URL` | Error alerts |
| `SLACK_ERROR_CHANNEL` | Channel for error alerts (default: #debug-alerts) |


### Error Loggers (`lib/slack-error-logger.ts`)


| Function | When Called |
|---|---|
| `logRedisError()` | Redis connection failures |
| `logResumeUploadError()` | Resume processing worker failures |
| `logDriveError()` | JD upload/extraction failures |
| `logWorkerError()` | Generic worker job failures |
| `logLiveKitError()` | LiveKit recording/egress failures |


---


## 19. Database & Migration Strategy


- **Prisma ORM** with PostgreSQL
- **Schema:** `prisma/schema.prisma` — all 8 models
- **Expression indexes** used (e.g., `Interview.recording->>'url'` queries)
- **Migrations:** Standard Prisma migrations
- **Replicas:** `@prisma/extension-read-replicas` configured for read scaling
- **Connection pooling:** PgBouncer (`?pgbouncer=true` on DATABASE_URL)
- **Direct connection:** Via `DIRECT_URL` for migrations


---


## 20. Known Gotchas & Design Decisions


| Decision | Rationale |
|---|---|
| `Interview.recording` as JSON blob | Avoids migration overhead for recording metadata schema changes |
| Python subprocess for LLM calls in workers | Isolates Python AI code from Node.js; enables use of Python ML libraries |
| BullMQ prefix isolation | Dev/prod share one Redis instance without job collisions |
| Per-org LLM model selection | Different customers have different latency/cost/quality requirements |
| Per-turn eval with gpt-4.1-nano | Cost optimization — cheap model for per-turn scoring, expensive model only for reports |
| 6-hour temp file janitor | Prevents disk exhaustion from orphaned temp files after SIGKILL/OOM |
| 2-minute reconciler | Prevents UI from spinning forever on orphaned resume rows |
| MOVE_ON race guard | Prevents double-scoring on topic transition |
| No `&&` in PowerShell | Windows deployment constraint (documented in AGENTS.md patterns) |
=
understand about this in depth this is my whole product and let me know are we going to get sucess or not? is there anything you would suggest or help or make me to improve