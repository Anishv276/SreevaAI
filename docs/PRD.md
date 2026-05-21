# PRD — Product Requirements Document
## Sreevaai · AI Interview & Recruitment Automation Platform

---

## 01 · App Name & Tagline

**Name:** Sreevaai

**Tagline:** Conduct live AI interviews with deep proctoring — get a full hiring decision in 20 minutes.

---

## 02 · Problem

**Who feels it:** HR teams and recruiters at mid-to-large companies running high-volume hiring.

**The pain:**
- Screening 100+ candidates manually takes weeks of recruiter time
- Phone screens are inconsistent — different recruiters ask different things
- Cheating in online assessments is rampant and hard to detect
- Resume shortlisting is subjective and slow
- Final reports are shallow ("good communication" — no evidence)

**What breaks today:**
1. No consistent interview format across candidates for the same role
2. No real-time integrity monitoring during remote interviews
3. AI tools that generate scores but not *why* — no recruiter-usable evidence
4. Resume screening done manually or with keyword-matching tools that miss context

---

## 03 · Core Value Proposition

Sreevaai replaces the first-round human interview with a 20-minute live AI conversation that:
- Adapts dynamically based on how the candidate answers (probes deeper, moves on, verifies claims)
- Proctors integrity in real-time across 20 behavioral + hardware signals
- Generates a hiring-ready report with evidence-backed scores, transcript citations, and a verdict

**What makes it different from competitors:**
- Not a quiz or pre-recorded video — it is a live, adaptive spoken conversation
- Proctoring is behavioral (contradiction detection, depth decay, example evasion) not just tab-switch counting
- Every score is cited with a specific moment from the transcript, not a model confidence %
- Resume screening + live interview + report is one integrated flow, not separate tools

---

## 04 · Target Users

### Primary — Recruiter / HR Admin
Works at a company hiring 20–500 people/year. Manages 3–10 open roles simultaneously.
Spends most of their day scheduling calls, doing first-round screens, and writing notes nobody reads.
Wants a reliable first filter that flags red flags *before* a human talks to the candidate.

### Secondary — Hiring Manager
Reviews shortlisted candidates. Needs a report that tells them *who to call* and *what to ask in the second round*.
Does not want to re-read a full transcript — wants a verdict with evidence.

### Tertiary — Candidate
Applying for a job. Accustomed to video interviews. Expects a professional, fair experience.
Wants technical feedback after the interview (nice-to-have, not current scope).

---

## 05 · Core Features — Must Have

### A. Drive Management
- Create a hiring drive with job title, job description (manual or PDF upload), and interview questions
- JD auto-extraction: upload a PDF → system extracts role, requirements, skills, location
- Question auto-generation from JD (or manual override)
- Set resume screening threshold (default 60%)
- One drive = one job role. Multiple drives per org.
- Drive-level voice and language configuration

### B. Resume Screening
- Bulk upload resumes (PDF) — up to N files per batch
- Async processing via worker queue (not blocking UI)
- AI extracts structured data: skills, experience, education, tenure, companies
- Score each resume 0–100 against the JD
- Pass/Fail based on org-configurable threshold
- Status: `pending → screened → passed / failed`
- Admin can rescan with updated criteria
- Download full results as CSV

### C. Interview Invitation & Scheduling
- Generate unique interview link per candidate
- Send invitation email (via Resend)
- Candidate books a time slot from available capacity
- Token-based access control (each interview URL is unique and expires)
- Bulk invite: send to all passed candidates with one click
- Re-send link or manually copy and share

### D. Live AI Interview (20 minutes, fixed)
- Candidate completes hardware check (camera, mic, speaker, face detection) before starting
- Fullscreen mode required to begin
- AI (Ishitha / configurable name) conducts spoken interview via LiveKit audio/video
- STT: Deepgram (nova-3-general), TTS: Cartesia (org-configurable voice)
- LLM: GPT-4.1-mini (hardcoded in code with role-based temperatures)
- 4 interview stages: Resume → Skill → Situational → Behavioral
- Adaptive questioning: agent probes, verifies claims, moves on — based on answer quality
- Full transcript captured with timestamps and speaker labels
- Interview terminates automatically at 20 minutes

### E. Real-Time Proctoring (20 signals)

**Hardware Signals (frontend, browser)**

| Signal | Trigger | Severity |
|---|---|---|
| `tab_switch` | Candidate leaves interview tab | Medium |
| `fullscreen_exit` | Exits fullscreen during interview | High |
| `camera_disabled` | Camera turned off / permission revoked | High |
| `microphone_disabled` | Mic muted at OS level | High |
| `face_absence` | No face detected for 3+ seconds | High |
| `multiple_faces` | 2+ faces detected in frame (3-frame confirmation) | High |
| `identity_mismatch` | Different person vs reference snapshot (periodic check) | High |
| `connection_lost` | Network drop / reconnect / sustained poor quality | Medium |
| `duplicate_ip` | Same IP used for multiple interviews in 24h | High |

**AI Behavioral Signals (backend, per-turn analysis)**

| Signal | Trigger | Severity |
|---|---|---|
| `contradiction` | Candidate statement contradicts an earlier claim | High |
| `follow_up_collapse` | Strong first answer, collapses on follow-up | High |
| `depth_decay` | Answer quality declines progressively across the session | High |
| `example_evasion` | Asked for example, gives theoretical response | High |
| `resume_claim_mismatch` | Uses resume-like phrase with no grounding evidence | High |
| `complexity_latency_mismatch` | Complex Q answered instantly OR simple Q takes too long | High |
| `latency_mismatch` | Follow-up answer compressed to <42 words + sharp depth drop | Medium |
| `ownership_ambiguity` | Heavy "we/our/team" language, no personal attribution | Medium |
| `ownership_clarified` | Explicitly claims "I built / I decided / I owned" | Low (positive) |
| `example_given` | Concrete example with specifics, dates, or project names | Low (positive) |
| `strong_under_pressure` | Probed and still delivers high-quality (depth ≥ 6.5) answer | Low (positive) |
| `contradiction_resolved` | Convincingly clarifies earlier contradiction | Low (positive) |

- All signals gated by org plan tier (STARTER gets hardware only; BUSINESS/ENTERPRISE gets full AI signals)
- Each event stores: type, severity, reason, elapsed time into interview, metadata
- Max 400 events per interview stored
- Grace periods on all hardware signals (4s camera/mic, 3s face, 2s connection) to prevent false positives

### F. Interview Scoring & Report Generation

**Scores computed (0–100):**
- `combined_score` — overall performance
- `technical_score` — domain knowledge, depth, problem-solving
- `communication_score` — clarity, fluency, grammar, confidence
- `behavioral_score` — consistency, engagement, integrity

**Per-question breakdown (4–10 questions):**
- Score (X/10), Clarity, Depth, Fluency, Confidence
- Tags (skills observed)
- Verdict (1–2 sentences citing specific transcript moment)

**Report sections:**
1. Communication Analysis — pronunciation, grammar, fluency, confidence (each 0–100 with narrative)
2. Cognitive Insights — clarity, depth, problem-solving, logical thinking
3. Behavioral Analysis — engagement, consistency, communication patterns, confidence indicators, integrity flags, strengths, concerns
4. Full Q&A blocks — question + candidate answer + score breakdown
5. Strategic Verdict — 200–300 word narrative + recommendation (Strong Yes / Yes / Maybe / No)
6. AI Summary — 4 narrative bullet points (Background, Communication, Gaps, Hiring Signal)

**Behavioral synthesis additional flags:**
- Engagement signals: turn participation ratio, score trajectory
- Consistency signals: resume vs interview claims
- Communication patterns: STAR structure detection, delivery quality
- Confidence indicators: genuine vs over-rehearsed vs low confidence
- Integrity flags: tab switch timing vs answer quality, contradiction patterns

### G. Admin Dashboard

**At-a-glance metrics:**
- Total candidates, interviews completed, avg scores, completion rate
- Hiring funnel (screening pass rate → interview completion → shortlist → offer)
- Score distribution histogram
- Top candidates ranked by score
- Live activity feed (recent interviews, screenings, status changes)

**Candidate management:**
- Search and filter by drive, status, score, date range
- Bulk actions: change hiring status, send email, export CSV, send interview link
- Candidate profile: resume + interview report + proctoring events + transcript + video

**Drive management:**
- Create, edit, archive drives
- Resume screening dashboard: batch status, per-candidate results, download CSV
- Interview slot management: add/remove slots, set capacity, view bookings

### H. Billing & Quota

- Interview quota: org-level limit (STARTER 30 / PRO 100 / BUSINESS 300 / ENTERPRISE 600+)
- 1 completed interview = 1 quota unit
- Auto-suspend org when quota = 0
- Billing usage tracked per feature: interview, resumeExtraction, jdExtraction, chatbot, reports
- Admin can view current quota, usage history, and upgrade options

### I. Recruiter Assistant (PRO+ plans)

- Chat interface in admin dashboard
- Natural language queries: "How many React developers passed?", "Who scored above 80?"
- Intent routing: count, search, filter, compare, summarize
- Answers with candidate data from the current org

---

## 06 · Nice to Have (V2)

- Candidate-facing feedback report post-interview (score + areas to improve)
- ATS integrations (Greenhouse, Lever, Workday)
- Multi-seat admin with role-based access (admin vs viewer)
- Custom scoring rubrics per drive
- Second-round AI interview (deeper technical drill)
- Proctoring signal dashboard with time-series view
- Interview question bank (save and reuse across drives)
- Webhook events for external systems (interview completed, candidate shortlisted)
- White-label (custom domain, brand name)

---

## 07 · Out of Scope (This Version)

- Offer letter generation or e-signature
- Job posting / sourcing (candidates must be imported or manually added)
- Human interviewer collaboration during AI interview
- Video-only interviews (current: audio-only from candidate side)
- Mobile app (web only)
- GDPR right-to-erasure automation
- Custom LLM fine-tuning per org

---

## 08 · User Stories

**Recruiter / HR Admin**
- As a recruiter, I want to bulk upload 200 resumes and get a pass/fail list within the hour, so I don't spend two days reading CVs.
- As a recruiter, I want to send interview links to all passed candidates in one click, so I don't manually email each one.
- As a recruiter, I want to see a one-page report for each candidate with a verdict and evidence, so I can decide who to call in 2 minutes.
- As a recruiter, I want proctoring alerts to show me what the candidate did wrong with specific timestamps, not just a risk score.
- As a recruiter, I want to filter all candidates by score > 70 and interview status = completed, so I can build my shortlist quickly.
- As a recruiter, I want the AI to probe deeper when a candidate gives a vague answer, so surface-level answers don't pass.

**Hiring Manager**
- As a hiring manager, I want the candidate report to cite specific lines from the interview, so I trust the score rather than guessing how it was computed.
- As a hiring manager, I want to see which candidates showed contradictions or depth decay, so I know who needs a harder second round.
- As a hiring manager, I want a verdict (Strong Yes / Yes / Maybe / No) upfront on each profile, so I can prioritize review time.

**Candidate**
- As a candidate, I want clear instructions before the interview starts (hardware check), so I don't waste time troubleshooting during the session.
- As a candidate, I want the AI to ask follow-up questions that build on what I said, so I can demonstrate depth rather than just rehearsed answers.
- As a candidate, I want the session to feel like a real conversation, not a robot reading questions from a list.

---

## 09 · Success Metrics

**Product**
- Resume screening batch: median processing time < 3 minutes per 50 resumes
- Interview completion rate: ≥ 85% of started interviews reach completion
- Report generation time: < 60 seconds after interview ends
- Proctoring false positive rate: < 5% of hardware signal events flagged incorrectly

**Business**
- Org activation: ≥ 70% of orgs conduct their first interview within 7 days of signup
- Interview quota utilization: ≥ 60% of purchased quota used per billing period
- PRO → BUSINESS upgrade rate: ≥ 20% within 90 days
- Recruiter time saved: ≥ 3 hours per 10 candidates screened (self-reported)

**Candidate Experience**
- Hardware check pass rate: ≥ 90% on first attempt
- Interview abandonment rate: < 10% after interview starts
- Candidate satisfaction: ≥ 4.0 / 5.0 post-interview rating

---

## 10 · Plan Tiers & Feature Gates

| Feature | STARTER ($99) | PRO ($299) | BUSINESS ($699) | ENTERPRISE |
|---|---|---|---|---|
| Interviews / mo | 30 | 100 | 300 | 600+ |
| Active Drives | 1 | 5 | 10 | Unlimited |
| Resume Screening | ✅ | ✅ | ✅ | ✅ |
| Live AI Interview | ✅ | ✅ | ✅ | ✅ |
| Hardware Proctoring | ✅ | ✅ | ✅ | ✅ |
| AI Behavioral Signals | ❌ | ✅ | ✅ | ✅ |
| Face + Identity Proctoring | ❌ | ❌ | ✅ | ✅ |
| Recruiter Assistant | ❌ | ✅ | ✅ | ✅ |
| Multilingual Support | ❌ | ✅ | ✅ | ✅ |
| Custom Voice | ❌ | ✅ | ✅ | ✅ |
| White Label | ❌ | ❌ | ❌ | ✅ |

---

## 11 · Key Technical Dependencies (Context for Eng)

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TailwindCSS 4, Framer Motion |
| Video/Audio | LiveKit Cloud (rooms, tracks, recording) |
| AI Agent | Python (LiveKit Agents SDK), OpenAI GPT-4.1-mini |
| Speech-to-Text | Deepgram (nova-3-general) |
| Text-to-Speech | Cartesia (primary), Sarvam (alt), Deepgram (alt) |
| Face Detection | MediaPipe Vision Tasks (in-browser, GPU) |
| Database | PostgreSQL via Prisma ORM |
| Queue | BullMQ + Redis |
| Storage | S3 / Cloudflare R2 |
| Email | Resend |
| Vector Search | Pinecone |

---

## 12 · Data Entities (Quick Reference)

| Entity | Purpose |
|---|---|
| Organization | Customer account, plan, quota, config |
| Drive | One job role — JD, questions, candidates |
| Application | One candidate for one drive — resume + interview |
| Interview | Live session — transcript, recording, report, proctoring |
| ResumeBatch | Bulk screening job with status tracking |
| InterviewSlot | Scheduled time with capacity |
| EngineVoice | TTS voice config per provider |

**Key status fields:**
- `Application.resumeStatus`: pending → screened → passed / failed
- `Application.interviewStatus`: pending → scheduled → completed / failed / noshow
- `Application.hiringStatus`: pending → shortlisted → rejected / offered
- `Interview.status`: PENDING → IN_PROGRESS → COMPLETED / FAILED / NO_SHOW
