# Interview Flow: Complete Architecture & Process

## Overview
This document outlines the complete journey of an interview from candidate initiation through AI interaction, including the injection mechanisms, state management, and real-time orchestration.

---

## PHASE 1: HARDWARE CHECK (Pre-Interview)

### What Happens When User Clicks "Begin Interview"

**Component:** [HardwareCheck.tsx](components/careers/interview/HardwareCheck.tsx:396-402)

1. **Snapshot Capture & Upload**
   - Candidate's face is captured as a JPEG snapshot from the video stream
   - Snapshot is uploaded to `/api/upload/interview-snapshot`
   - Stored in sessionStorage as `proctor_ref_snapshot` for identity verification during the live interview
   - Used by FaceProctoring component for real-time face matching

2. **Phase Transition**
   - UI transitions from "check" phase to "launching" phase
   - `onComplete()` handler is triggered with selected camera/mic device IDs

**Device Selection:**
- Camera device ID saved from browser's MediaDeviceInfo
- Microphone device ID saved from browser's MediaDeviceInfo
- These are passed to LiveKit room later for media stream selection

---

## PHASE 2: LAUNCHING (Connection Preparation)

**Component:** [app/interview/[id]/page.tsx](app/interview/[id]/page.tsx:590-642)

### Step 1: Warm Connection Setup
```
ensureWarmConnection() → /api/interview/{id}/token
```

The frontend requests a LiveKit token from the backend:
- **Input:** `interviewToken` (from URL params) + `applicationId` (interview ID)
- **Output from API:**
  - `token` - LiveKit room access token
  - `url` - LiveKit server URL
  - `roleLabel` - Job title/role display
  - `candidateName` - Candidate's name
  - `proctoringSignals` - Configuration for which proctoring checks are enabled
  - Fixed interview duration (FIXED_INTERVIEW_DURATION_MINUTES)

### Step 2: Fullscreen Mode Request
```
requestFullscreenMode()
```
- Locks candidate into fullscreen during interview
- Prevents tab switching during active interview (proctoring)

### Step 3: Audio Context Unlock
```
lkRoomRef.current.startAudio()
```
- Prepares browser's AudioContext for WebRTC audio streams
- Necessary for LiveKit to function

### Step 4: Timer Setup
```
interviewEndsAt = Date.now() + durationSeconds * 1000
```
- Interview timer is set to fixed duration (default: 20 minutes)
- `remainingSeconds` state is initialized

---

## PHASE 3: INTERVIEW INITIALIZATION (Live Connection)

**Component:** LiveKitRoom component from @livekit/components-react

### Step 1: LiveKit Room Connection
```javascript
<LiveKitRoom
  serverUrl={serverUrl}
  token={token}
  connect={shouldConnect}
  onConnected={handleRoomConnected}
/>
```

**What happens:**
1. WebRTC connection established to LiveKit server
2. LiveKit dispatches agent connection signal to backend
3. Backend triggers agent startup via LiveKit Workers API

### Step 2: Agent Dispatch Metadata
The LiveKit job context includes metadata:
```python
dispatch_metadata = {
    "applicationId": app_id,
    "candidateName": candidateName,
    "roleLabel": interviewRoleLabel,
    "timeLimitMins": FIXED_INTERVIEW_DURATION_MINUTES,
    "roomName": ctx.room.name
}
```

**Backend:** This metadata is extracted in [agent_runtime.py:486](agent_runtime.py:486)

---

## PHASE 4: AI AGENT STARTUP

**File:** [agent_runtime.py](agent_runtime.py)

### Agent Initialization (entrypoint function)

**1. Database Context Fetch** [Line 572]
```python
context_result = await get_interview_context(app_id)
```

This retrieves:
- Candidate resume + parsed context
- Job description summary
- Question bank (pre-generated questions for this role/level)
- Proctoring configuration
- Role category & candidate band (fresher/mid/experienced/senior)
- AI name ("Ishita" by default)
- Any previous interview state (if resuming)

### 2. Resume & Profile Analysis [Lines 35-63]
Multiple helpers process the resume:
```python
from agent_profile_context import (
    parse_resume_context,           # Extract skills, experience
    infer_candidate_band,            # Determine seniority level
    detect_role_category,            # Categorize the role (eng/pm/data/etc)
    build_interview_turns,           # Count Q&A exchanges completed
    build_jd_summary,                # Extract JD must-haves
    extract_smart_opening_question,  # Generate opening Q specific to resume
)
```

### 3. Interview Context Building
Multiple context blocks are built and injected into the LLM system prompt:

```python
# Build the role context
build_role_layer()              # Role-specific interview strategy
build_live_prompt_context()     # Real-time interview state
_build_context_vars_block()     # Candidate variables (name, band, etc)
build_question_bank_injection() # All questions for this interview
```

---

## PHASE 5: AI GREETING & WARMUP

**File:** [interview_phases.py](interview_phases.py)

### Phase 1: Greeting + Warmup (0-35% of interview time)

#### Greeting Text [Lines 26-32]
```python
def build_phase_1_greeting_text(candidate_name, ai_name, job_title):
    return f"Hi {candidate_name}, it's so good to meet you! I'm {ai_name}, and I've been really looking forward to our chat about the {job_title} role.\n\nHow are you feeling today, and how's your day going so far?"
```

**When sent:** [agent_runtime.py:2149-2228]
- Immediately after participant joins the room (after 300s max wait)
- TTS warmup happens before greeting for low-latency delivery
- Greeting is sent via `session.say(welcome_text, allow_interruptions=False)`
  - `allow_interruptions=False` prevents echo bleed from breaking the greeting
  - Candidate STT is blocked until greeting finishes (greeting_delivered_at signal)

#### Warmup Directive [Lines 35-59]
The AI receives explicit instructions:
```
[RUNTIME PHASE 1: WARMUP]
- Exchange 1: AI responds to "how are you doing" with personal reply (1-2 sentences)
- Exchange 2: Wait silently for candidate response

ABSOLUTE RULES:
  x Do NOT ask interview questions
  x Do NOT mention role/resume/skills
  x STOP after personal reply
```

This builds rapport before actual interview begins.

---

## PHASE 6: SMART OPENING & BACKGROUND QUESTIONS

**Runtime Phase 2: 35% - 70% of interview time**

### Step 1: Resume Anchor Selection [interview_phases.py:62-93]
AI picks ONE item from resume to anchor the opening question:
- **Fresher:** College project → Internship → Education
- **Mid:** Latest work experience → Projects
- **Experienced/Senior:** Latest work experience

Example anchor instruction:
```
FIRST QUESTION ANCHOR:
"I noticed you built **ChatBot_Project** while you were in college - that's a cool project. What was the most challenging part of getting that to actually work?"
```

### Step 2: Phase 2 Opening Context [Lines 96-221]
System prompt injection for Phase 2:
```python
build_phase_2_opening_context(
    candidate_band="mid",
    projects=[...],
    work_history=[...],
    jd_summary_block="Must have: 5+ years Python, system design experience",
    smart_opening_question="Based on your Resume...",
    coverage_items=["Own real projects?", "Technical depth?", "Problem-solving?"]
)
```

**Result in system prompt:**
```
[RUNTIME PHASE 2: OPENING - AFTER WARMUP]
Warmup is done. Begin the real conversation naturally.

CANDIDATE LEVEL: MID-LEVEL
Probe for:
  - What they personally owned vs what the team did
  - Specific results or impact
  - Decisions they made and why
  - Push past resume language

FIRST QUESTION ANCHOR:
  "I see you were at **Company ABC** recently..."

COVERAGE FLOOR:
  - Project ownership
  - Technical decision-making
  - Impact metrics
```

### Step 3: Phase Transitions
Transitions happen **at the end of Q&A exchanges** (after candidate finishes answering), using time ratios:
- **PHASE2_START_RATIO = 0.35** → ~7 min in a 20-min interview
- **PHASE4_START_RATIO = 0.70** → ~14 min in a 20-min interview

---

## PHASE 7: BRIDGE & SKILLS DEEP-DIVE

### Runtime Phase 3: Bridge (35% - 70%)
[interview_phases.py:224-254]

Lightweight transition phase:
- Naturally shift conversation toward skill probing
- Cover any uncovered topics from coverage floor
- Band-specific guidance:
  - **Fresher:** How they learn and apply tools
  - **Mid:** Decisions they owned and trade-offs
  - **Experienced:** System-level judgment
  - **Senior:** Architectural decisions and strategic direction

### Runtime Phase 4: Critical Skills (70% - 100%)
[interview_phases.py:257-285]

Shift to SKILL questions from the question bank:
```
Work through QUESTION BANK — PHASE 3 (CRITICAL SKILLS):
  1. SKILL questions (hands-on, role-critical)
  2. STRENGTH question
  3. WEAKNESS question
  4. WATCHOUT question
  5. CUSTOM questions
```

---

## SYSTEM PROMPT INJECTION ARCHITECTURE

### How Prompts Are Built & Injected

**Key Files:**
- [prompt_layers.py](prompt_layers.py) - Builds the system prompt
- [build_system_prompt()](agent_runtime.py) - Main assembly function

**System Prompt Layers (in order):**

1. **Voice Layer** (`build_voice_layer_prompt()`)
   - TTS/voice-specific instructions
   - Pause patterns, filler avoidance

2. **Evaluation Layer** (`build_evaluation_layer_prompt()`)
   - How to evaluate candidate answers
   - What signals indicate strong/weak performance

3. **Runtime Phase Directive** (one of Phase 1-4)
   - Dynamic injection at runtime phase transitions
   - Replaces previous phase directive

4. **Question Bank Injection** (`build_question_bank_injection()`)
   - All pre-generated questions organized by phase
   - Confidence thresholds for answer evaluation
   - Follow-up probes

5. **Context Variables** (`_build_context_vars_block()`)
   - Candidate name, role, band, JD summary
   - Resume sections
   - Role category

### Injection Timing

**Phase 1 Warmup Injection:** [Lines 818-820]
```python
runtime_phase = 1  # Start at warmup
warmup_directive = build_phase_1_warmup_directive()
# Injected into system prompt before first turn
```

**Phase 2 Opening Injection:** [Lines 818-820]
```python
# After 2 warmup exchanges complete, switch at turn boundary
phase2_context = build_phase_2_opening_context(...)
# System prompt updated dynamically
```

**Phase 3 Bridge Injection:** [Lines 818-820]
At ~35% of interview time:
```python
phase3_directive = build_phase_3_bridge_directive(candidate_band, coverage_items)
# Replace phase 2 with phase 3 instructions
```

**Phase 4 Skills Injection:** [Lines 818-820]
At ~70% of interview time:
```python
phase4_directive = build_phase_4_skills_directive()
# Work through QUESTION BANK — PHASE 3
```

---

## REAL-TIME STATE MANAGEMENT

### Interview State [session_state.py]

**Tracks:**
- `turn_count` - Number of Q&A exchanges
- `transcript_lines` - Complete interview transcript
- `session_start_time` - When interview started
- `runtime_phase` - Current phase (1-4)
- `time_elapsed` - Elapsed seconds
- Proctoring signals (violations, risks)
- Contradiction state (claim tracking)

### Turn Evaluation [turn_evaluator.py]

After each candidate response:
```python
run_turn_evaluation(
    candidate_answer,
    current_question,
    candidate_band,
    evaluation_signal_toggles
) → decision {
    "signal_name": str,
    "signal_value": float,
    "confidence": float,
    "short_signal": bool
}
```

**Signals:** Depth, Coverage, Contradiction, Passion, Clarity, etc.

### Trust Engine [trust_engine.py]

Synthesizes all signals into trust score:
```python
apply_turn_decision(turn_decision, trust_state) → updated_trust_state
apply_proctoring_event(event, trust_state)     → risk adjustment
finalize_trust_state(trust_state)              → final behavioral narrative
```

---

## PROCTORING INTEGRATION

### Real-Time Proctoring Signals
[app/interview/[id]/page.tsx:145-184]

**Enabled via proctoringSignals:**
- `tab_switch` - Detects tab changes
- `camera_disabled` - Monitors camera availability
- `microphone_disabled` - Monitors mic availability
- `connection_lost` - Network disconnection
- `face_absence` - No face detected in frame
- `multiple_faces` - Multiple people detected
- `identity_mismatch` - Face doesn't match reference

### Violation Handlers

**Face Violations:** [app/interview/[id]/page.tsx:201-244]
- Sends to `/api/interview/proctoring` endpoint
- Published to agent via LiveKit data channel
- Silent (no UI popup) to avoid disruption

**Hardware Violations:** [app/interview/[id]/page.tsx:246-278]
- Camera/mic disconnections
- High severity flag

**Connection Violations:** [app/interview/[id]/page.tsx:280-300]
- Network loss events
- Connection restoration

### Backend Persistence
[agent_runtime.py:502-530]
```python
async def _report_proctoring_realtime(evt_type, reason, score_delta):
    # Append event to proctoringReport.events JSONB array
    UPDATE Interview
    SET proctoringReport = jsonb_set(...)
    WHERE applicationId = $2
```

---

## INTERVIEW CONCLUSION & REPORTING

### Final Phases

**Phase: Finalizing** → **Phase: Completed**
[app/interview/[id]/page.tsx:435-436]

When timer expires or candidate disconnects:
```python
# Generate recruiter summary
build_recruiter_summary(
    candidate_context,
    trust_state,
    proctoring_data,
    transcript
) → narrative report
```

**Report Includes:**
- Behavioral analysis with transcript evidence
- Coverage of each JD requirement
- Strength/weakness assessment
- Proctoring flag summary
- Recommendation (pass/fail)

### Transcript Persistence
[agent_persistence.py](agent_persistence.py)
```python
persist_transcript(
    app_id,
    transcript_lines,
    session_start_time,
    proctoring_data={...},
    final_status="COMPLETED"
)
```

Stored in:
- PostgreSQL `Interview` table
- S3 for recording (if enabled)

---

## KEY INJECTION POINTS

| When | What | How | Why |
|------|------|-----|-----|
| On phase transition (timebased) | Runtime directive | System prompt update | Switch interview mode |
| After 2 warmup exchanges | Phase 2 opening context | Inject phase2_opening_context() | Start real interview |
| At 35% elapsed time | Phase 3 bridge directive | Inject phase3_bridge_directive() | Transition to coverage floor |
| At 70% elapsed time | Phase 4 skills directive + Q bank | Inject phase4_skills_directive() | Deep-dive critical skills |
| Per turn | Evaluation results + trust state | Append to context block | Guide next question selection |
| Real-time | Proctoring violations | Data channel message | Alert agent to adjust |

---

## DATA FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│ CANDIDATE CLICKS "BEGIN INTERVIEW"                              │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
              ┌────────────────────────────┐
              │ HARDWARE CHECK (Camera+Mic)│
              │ - Snapshot capture+upload  │
              │ - Device selection         │
              └──────────┬─────────────────┘
                         ↓
              ┌────────────────────────────┐
              │ LAUNCHING PHASE            │
              │ - Request LiveKit token    │
              │ - Fullscreen lock          │
              │ - Timer setup              │
              └──────────┬─────────────────┘
                         ↓
    ┌────────────────────────────────────────────────┐
    │ LIVEKIT ROOM CONNECTED                         │
    │ (WebRTC stream established)                    │
    └──────────┬─────────────────────────────────────┘
               ↓
    ┌─────────────────────────────────────────────────────┐
    │ AGENT STARTUP (backend)                             │
    │ 1. Fetch context (resume, JD, Q bank)              │
    │ 2. Build system prompt layers                       │
    │ 3. Inject Phase 1: Warmup directive               │
    │ 4. Initialize proctoring state                      │
    │ 5. Initialize trust engine                          │
    └──────────┬──────────────────────────────────────────┘
               ↓
    ┌─────────────────────────────────────────────────────┐
    │ SEND GREETING                                       │
    │ "Hi {name}, I'm Ishita, excited about {role}"      │
    │ (Candidate STT blocked until greeting finishes)    │
    └──────────┬──────────────────────────────────────────┘
               ↓
    ┌──────────────────────────────────────────────────────┐
    │ WARMUP PHASE (2 exchanges)                           │
    │ Inject: phase_1_warmup_directive()                  │
    │ AI gives personal reply, then waits                 │
    │ Candidate responds naturally (no interview yet)     │
    └──────────┬───────────────────────────────────────────┘
               ↓
    ┌──────────────────────────────────────────────────────┐
    │ PHASE 2: OPENING QUESTIONS (7-14 min)              │
    │ Inject: phase_2_opening_context()                  │
    │ - Pick resume anchor (project/role/skill)          │
    │ - Ask specific opening question                     │
    │ - Probe ownership, decisions, impact               │
    └──────────┬───────────────────────────────────────────┘
               ↓ (at ~35% time)
    ┌──────────────────────────────────────────────────────┐
    │ PHASE 3: BRIDGE (coverage floor topics)            │
    │ Inject: phase_3_bridge_directive()                 │
    │ - Continue from Phase 2 naturally                   │
    │ - Cover uncovered areas                             │
    │ - Prime for skills deep-dive                        │
    └──────────┬───────────────────────────────────────────┘
               ↓ (at ~70% time)
    ┌──────────────────────────────────────────────────────┐
    │ PHASE 4: CRITICAL SKILLS (last ~20%)               │
    │ Inject: phase_4_skills_directive()                 │
    │ Work through Q bank PHASE 3 (critical skills)      │
    │ - SKILL questions                                   │
    │ - STRENGTH question                                 │
    │ - WEAKNESS question                                 │
    │ - WATCHOUT question                                │
    └──────────┬───────────────────────────────────────────┘
               ↓ (timer expires)
    ┌──────────────────────────────────────────────────────┐
    │ FINALIZATION                                        │
    │ - Generate recruiter summary                        │
    │ - Persist transcript & proctoring data             │
    │ - Set phase to "completed"                         │
    └──────────────────────────────────────────────────────┘
```

---

## KEY TAKEAWAYS

1. **Interview flow is time-based and modular** - Each phase has explicit instructions injected into the system prompt at phase transitions.

2. **All state is centralized** - Resume context, question bank, trust state, and proctoring signals are all available in the context block.

3. **Injections happen at turn boundaries** - Phase changes never cut off questions mid-flight; they happen after a complete Q&A exchange.

4. **Real-time proctoring is silent** - Violations are recorded but don't disrupt the conversation. They inform final behavioral narrative.

5. **Candidate band determines strategy** - Fresher vs. Senior candidates get fundamentally different question depth and probe patterns.

6. **Question bank is pre-generated** - All questions for a role+band are built at start, not generated on-the-fly.

7. **Trust engine synthesizes signals** - Answers are evaluated across multiple dimensions (depth, clarity, passion, etc.), not just pass/fail.
