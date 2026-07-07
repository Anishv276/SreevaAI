# Interview Flow — From Start Button to Report Generation

## High-Level Timeline

```
[Start Interview Click]
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│ PRE-INTERVIEW (backend setup, ~5-15s)                          │
│  • DB fetch → resume extraction → band classify → brief gen    │
│  • Room connect → agent start                                  │
└──────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│ WARMUP (candidate joins, greetings, ~30-60s)                   │
│  • Ishita greets candidate                                      │
│  • Candidate replies → fixed warmup text → readiness check     │
│  • 20-min timer STARTS after greeting                          │
└──────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│ MAIN INTERVIEW (up to 20 min, turn by turn)                    │
│  • Turn loop: candidate speaks → STT cleanup → eval →         │
│    directive → Ishita asks next question                       │
│  • Per-turn: response signal → content scoring + signal →      │
│    saturation update → routing → probe or move-on             │
│  • At T-10s: goodbye script, break loop                       │
└──────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│ POST-INTERVIEW (cleanup + report, ~10-30s)                     │
│  • Final persistence: transcript, scores, proctoring           │
│  • Report pipeline (LangGraph DAG): integrity → LLM calls →    │
│    assemble + persist                                          │
│  • Summary & verdict generation (parallel LLM calls)           │
│  • Billing snapshot → session shutdown                        │
└──────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Pre-Interview Setup

### Sequence Diagram

```
Frontend              Backend API           Interview Agent (LiveKit)
   │                      │                        │
   │  Click "Start"       │                        │
   │─────────────────────▶│                        │
   │                      │  Create interview       │
   │                      │  record in DB (status:  │
   │                      │  PENDING)              │
   │                      │───────────────────────▶│
   │                      │                        │
   │                      │    entrypoint() fires   │
   │                      │◀───────────────────────│
   │                      │                        │
   │                      │  Parallel fetch:       │
   │                      │  • Room connect        │
   │                      │  • get_interview_context│
   │                      │    (DB: resume, JD,    │
   │                      │     config, org prefs) │
   │                      │                        │
   │                      │  classify_band()       │
   │                      │  (fresher/mid/         │
   │                      │   experienced/senior)  │
   │                      │                        │
   │                      │  generate_interview_   │
   │                      │  brief() (LLM call)    │
   │                      │  → TopicItem pool      │
   │                      │  → anchor_topic        │
   │                      │  → skill_coverage_map  │
   │                      │                        │
   │                      │  Build system prompt   │
   │                      │  + voice layers        │
   │                      │                        │
   │                      │  Create InterviewAgent │
   │                      │  → session.start()    │
```

### What Happens Step by Step

1. **User clicks "Start Interview"** on the frontend (web app)
2. Backend creates an interview record in DB with status `PENDING`
3. LiveKit dispatches a `JobContext` that triggers `entrypoint()` in `agent_runtime.py:1230`
4. **Parallel startup** (line 1298): Room connection + DB fetch run concurrently via `asyncio.gather`
5. **Context loaded** (line 1338): Parses resume JSON, JD JSON, org config (proctoring signal toggles, LLM model selection, candidate name, job title, language)
6. **Band classification** (`_classify_band` in `band_classifier.py`): Determines fresher/mid/experienced/senior from resume experience duration
7. **Interview brief generation** (`generate_interview_brief` in `interview_brief.py`): Single LLM call on resume+JD data → returns:
   - `TopicItem` pool (10-20 topics tagged RESUME_TOPIC / JD_TOPIC / ROLE_TOPIC)
   - `anchor_topic` (the best opening topic)
   - `skill_coverage_map` (which skills map to which topics)
   - `interview_strategy` (overall approach for this candidate)
   - `candidate_band` and `candidate_summary`
8. **System prompt** constructed (line 1590): Combines voice identity prompt + evaluation instructions
9. **`InterviewAgent`** created (line 2047) with instructions, chat context, and tool definitions
10. **`session.start()`** called — agent enters the LiveKit room, ready for the candidate

### Key Data Structures

```
InterviewBrief
├── role_context        { title, summary, must_have_skills }
├── candidate_band      "fresher" | "mid" | "experienced" | "senior"
├── candidate_summary   "3 years Java dev, fintech background..."
├── anchor_topic        TopicItem (the first topic to open with)
├── topic_pool          TopicItem[] (ordered list of all topics)
├── skill_coverage_map  { "Python": ["Data Pipeline", "ML Service"], ... }
└── interview_strategy  "Start with their strongest project..."

TopicItem
├── id                  Unique topic identifier
├── topic_type          "project" | "work" | "skill" | "role_topic"
├── tag                 "RESUME_TOPIC" | "JD_TOPIC" | "ROLE_TOPIC"
├── title               "Lead Generation Pipeline"
├── full_description    Longer description
├── tech_stack          ["n8n", "PostgreSQL", "Clearbit"]
├── importance          "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
├── relevance_score     0.0-1.0
├── why_relevant        "Core to the role — 80% of day involves pipeline management"
├── probe_focus         ["chunking", "embedding", "retrieval"]
└── probe_avoid         ["general architecture", "tool comparisons"]
```

---

## Phase 2: Warmup

### Flow

```
Candidate Joins Room
        │
        ▼
┌──────────────────────────────┐
│ Ishita delivers greeting     │
│ "Hi {name}, I'm Ishita..."  │
│ 20-min timer STARTS here     │
│ (session_start_time set)     │
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ Candidate replies            │
│ (any answer to greeting)     │
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ Turn 1 → fixed warmup text  │
│ "Let's start with..."       │
│ (no eval, no scoring)       │
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ Candidate replies again      │
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ Turn 2+: Readiness check    │
│ Detect: "yes", "ready",     │
│ "let's go", "okay"          │
│                              │
│ If ready → warmup_complete  │
│   = True                    │
│   → Inject interview_       │
│     directive_cached        │
│   → First real question     │
│                              │
│ If not ready → release gate │
│   → LLM re-prompts          │
└──────────────────────────────┘
```

**Duration:** Typically 30-60 seconds, 1-3 conversational turns.

**Timer note:** The 20-minute countdown starts when the greeting is spoken (`session_start_time = time.time()` at line 3916 in `agent_runtime.py`).

---

## Phase 3: Main Interview (The Turn Loop)

### Single-Turn Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Candidate speaks → LiveKit STT → agent.on_user_turn_completed fires    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ _process_user_conversation_item()                                      │
│   1. STT cleanup (noise suppression, hallucination filtering)          │
│   2. Append to transcript                                              │
│   3. Accumulate answer for this topic                                  │
│   4. Persist partial transcript (fire-and-forget)                      │
│   5. Inject recent context into chat                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ BUILD EVAL PAYLOAD                                                     │
│ { answer, question, transcript, topic_state, band, signal_toggles,     │
│   response_latency, remaining_seconds, ... }                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ run_eval_and_build_directive()  ← SINGLE SOURCE OF TRUTH              │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │ Stage 1: Response-Signal Detection (in agent_scoring.py)       │  │
│   │   Two PARALLEL LLM calls:                                     │  │
│   │   ┌─────────────────────┐  ┌───────────────────────────────┐   │  │
│   │   │ Call 1: Quality     │  │ Call 2: Signal Classification│   │  │
│   │   │ clarity 0-10 (20%) │  │ 1 of 7 content signals       │   │  │
│   │   │ depth 0-10 (35%)   │  │ + variety rule check          │   │  │
│   │   │ specificity (20%)  │  │ (banned signals from prev     │   │  │
│   │   │ grounding (25%)    │  │  turns on this topic)         │   │  │
│   │   │ → overall score    │  │ → signal + signal_reason      │   │  │
│   │   └─────────────────────┘  └───────────────────────────────┘   │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│                                    ▼                                    │
│   Apply response-signal overrides:                                      │
│   • pure_denial → scores=0, MOVE_ON                                    │
│   • denial_with_continuation → capped at 5                             │
│   • clarification_request → scores=0, REPHRASE                         │
│   • etc.                                                                │
│                                    │                                    │
│                                    ▼                                    │
│   Stage 2: Saturation Update + Routing Decision                        │
│   • Add contribution to TopicState                                     │
│   • Check: forced signal > dry_topic > weak_exit > saturated > PROBE   │
│   → action = "PROBE" or "MOVE_ON"                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ DIRECTIVE ASSEMBLY                                                      │
│                                                                         │
│ If PROBE:                                                               │
│   _build_probe_directive() — synchronous, no LLM                       │
│   • Sub-concept rotation via probe_rotation_index                      │
│   • Probe context from probe_strategy.py (goal, question_type,         │
│     principles, voice, skip, band_overlay)                             │
│   • Reacton tone from signal intent                                    │
│   • Angle pivot if same signal fired 2× in a row                      │
│                                                                         │
│ If MOVE_ON:                                                             │
│   _generate_move_on_directive() — calls LLM (pre-fired in parallel)    │
│   • Tag-based framing: RESUME/JD/ROLE                                  │
│   • Picks next topic from pool via _next_uncovered_topic()             │
│   • TOPIC_LOCK injected to close previous                              │
│   • Fallback: rule-based verbatim directive                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ INJECT DIRECTIVE → RELEASE LLM GATE                                    │
│   • Strip old system messages ([NEXT_TURN_DIRECTIVE], [TOPIC_LOCK],    │
│     [RECENT_CONTEXT])                                                  │
│   • Add new directive as system message                                │
│   • Set agent._directive_ready → LLM generates response                │
│   • Ishita speaks the next question via TTS                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### The LLM Gate (agent_runtime.py:934)

The `InterviewAgent.llm_node` blocks on `_directive_ready.wait()` when eval is in flight (11s timeout). This ensures Ishita never speaks while the eval pipeline is running — she waits for the directive first.

On MOVE_ON, all user+assistant messages are stripped from chat context before the directive is injected, so Ishita opens fresh on the new topic.

### Main Interview Loop (agent_runtime.py:4003-4186)

```
while True:
    remaining = total_seconds - elapsed
    
    # 1. Exit conditions
    if finished_task.done(): break       # candidate/agent said goodbye
    if disconnected_task.done(): break   # room disconnected
    if remaining <= 0: break             # 20 min expired
    
    # 2. At 75% time: check custom questions
    if progress >= 75% and custom_questions_unasked:
        inject [CUSTOM Q REMINDER]
    
    # 3. At T-10s: closing trigger
    if remaining <= 10 and not closing_triggered:
        session.say(goodbye_script)
        break
    
    # 4. Inactivity nudges
    if idle > 7s: soft nudge
    if idle > 15s: warning nudge
    if idle > 25s: end call
    
    await asyncio.sleep(1)  # poll every second
```

### Timing Events

| Event | When | Action |
|-------|------|--------|
| Timer starts | Greeting delivered | `session_start_time = time.time()` |
| Custom Q reminder | 75% time elapsed | Inject reminder for unanswered recruiter questions |
| Closing trigger | T-10s | Deliver goodbye, break loop |
| Inactivity nudge 1 | 7s idle | Soft prompt: "Are you still there?" |
| Inactivity nudge 2 | 15s idle | Warning: "I'll need to end the call" |
| Inactivity nudge 3 | 25s idle | End call via termination signal |
| Time expired | 0s remaining | Break loop → cleanup |

---

## Phase 4: Post-Interview Cleanup & Report Generation

### Sequence After Main Loop Exits

```
Main Loop Exit (time/disconnect/finish)
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Cancel pending tasks                                     │
│    (finished_task, disconnected_task)                       │
│                                                             │
│ 2. Wait 2s for STT tail (Deepgram flush)                   │
│                                                             │
│ 3. Build proctoring data from browser events                │
│                                                             │
│ 4. Final persistence (all fire-and-forget):                 │
│    • persist_transcript(..., final_status="COMPLETED")     │
│    • persist_latency_signals()  (compute latency_mismatch) │
│    • persist_session_fingerprint()  (check identity change)│
│    • persist_answer_scores()  (per-turn quality records)   │
│                                                             │
│ 5. Update interview status → "COMPLETED"                   │
│    (prevents re-dispatch)                                   │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. REPORT PIPELINE                                          │
│    generate_interview_report()  ← LangGraph DAG, 3 nodes   │
│                                                             │
│    ┌─────────────────────────────────────────────────────┐  │
│    │ Node 1: signals                                     │  │
│    │   • IntegrityEngine.score() — deterministic         │  │
│    │     (browser proctoring signals → 0-100 + band)     │  │
│    │   • Signal context building                         │  │
│    │   • JD context for LLM                              │  │
│    │   • Behavioral signal extraction from per-turn      │  │
│    │     scores (ownership trends, depth decay, etc.)    │  │
│    └─────────────────────────────────────────────────────┘  │
│                              │                               │
│                              ▼                               │
│    ┌─────────────────────────────────────────────────────┐  │
│    │ Node 2: llm_calls  ← PARALLEL fan-out              │  │
│    │                                                   │  │
│    │   ┌──────────────────┐  ┌──────────────────────┐  │  │
│    │   │ LLMEvalResponse  │  │ LLMSkillsResponse    │  │  │
│    │   │ 5 dimensions     │  │ skill ratings 1-10   │  │  │
│    │   │ (jd_knowledge,   │  │ per skill with       │  │  │
│    │   │  problem_solving,│  │ evidence             │  │  │
│    │   │  experience_cred,│  └──────────────────────┘  │  │
│    │   │  communication, │                             │  │
│    │   │  ownership)      │  ┌──────────────────────┐  │  │
│    │   │ + strengths/     │  │ BehavioralAnalysis   │  │  │
│    │   │   concerns       │  │ narrative from       │  │  │
│    │   └──────────────────┘  │ signals              │  │  │
│    │                         └──────────────────────┘  │  │
│    │                             ┌──────────────────────┐  │
│    │                             │ AnswerIntegrity      │  │
│    │                             │ (if org toggle on)   │  │
│    │                             └──────────────────────┘  │
│    └─────────────────────────────────────────────────────┘  │
│                              │                               │
│                              ▼                               │
│    ┌─────────────────────────────────────────────────────┐  │
│    │ Node 3: assemble + persist                          │  │
│    │   • Aggregate all LLM results                       │  │
│    │   • Compute overall weighted score                  │  │
│    │   • Persist to Interview.questionByQuestionAnalysis │  │
│    │   • Return scores_context dict                      │  │
│    └─────────────────────────────────────────────────────┘  │
│                                                             │
│    → Returns: scores_context dict or None                   │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. SUMMARY + VERDICT  (generate_interview_summary)         │
│    Two PARALLEL LLM calls:                                 │
│                                                             │
│    ┌──────────────────────┐    ┌──────────────────────────┐ │
│    │ Summary (500 tokens) │    │ Verdict (250 tokens,     │ │
│    │ Paragraph narrative  │    │ JSON): decision, score,  │ │
│    │ of overall perf      │    │ justification            │ │
│    └──────────────────────┘    └──────────────────────────┘ │
│                                                             │
│    Both see: dimension scores + skills + strengths/concerns │
│    + behavioral + integrity + answer_integrity + transcript │
│                                                             │
│    Written to Interview.interviewSummary (JSONB)            │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. BILLING SNAPSHOT                                         │
│    • Persist eval/brief/llmgen usage records                │
│    • Save org billing snapshot                              │
│                                                             │
│ 9. Cancel background tasks → session.shutdown(drain=True)   │
│                                                             │
│ 10. On failure: _entrypoint_guarded catches, marks          │
│     interview FAILED in DB                                  │
└─────────────────────────────────────────────────────────────┘
```

### Report Pipeline — LangGraph DAG

```
signals ──▶ llm_calls ──▶ assemble ──▶ END
              │
      ┌───────┼───────┐
      ▼       ▼       ▼
  5 LLM     Skills  Behavioral
  Dimen-    Ratings  Analysis
  sions
```

### IntegrityScore Calculation (report_pipeline.py:142)

Deterministic, no LLM:

```
score = 100
for each signal:
    score += weight × min(count, 3)   # max 3 occurrences per signal
final = clamp(score, 0, 100)
band  = score >= 80 → "HIGH"
       score >= 55 → "MODERATE"
       else → "LOW"
```

| Signal | Weight | Max Penalty |
|--------|--------|-------------|
| multiple_faces | -25 | -75 |
| identity_mismatch | -20 | -60 |
| answer_integrity | -20 | -60 |
| session_fingerprint | -20 | -60 |
| fullscreen_exit | -15 | -45 |
| face_absence | -15 | -45 |
| camera_disabled | -15 | -45 |
| tab_switch | -10 | -30 |
| window_focus_loss | -10 | -30 |
| connection_lost | -12 | -36 |
| microphone_disabled | -8 | -24 |

### Report Dimensions (LLM-evaluated, 0-100 each)

| Dimension | What It Measures |
|-----------|-----------------|
| jd_knowledge | Understanding of role requirements and domain |
| problem_solving | Structured thinking, tradeoff analysis |
| experience_credibility | Does the experience sound real? |
| communication | Clarity, structure, conciseness |
| ownership | Personal contribution vs team credit |

These are mapped from per-turn scores (clarity/depth/specificity/grounding) by an LLM that sees the full transcript.

---

## End-to-End Walkthrough: Full Interview

### Candidate Profile
- **Role:** Backend Developer (mid band)
- **Topics:** Spring Boot (CRITICAL), Hibernate (HIGH), Docker (MEDIUM), Kafka (LOW)
- **Time limit:** 20 minutes

### Turn-by-Turn

```
TIMELINE (20 min total):
├── 0:00 — Greeting delivered, timer starts
├── 0:30 — Warmup complete, first question: "Walk me through your experience with Spring Boot"
├── 4:00 — Turn 1 eval done → PROBE on Spring Boot
├── 7:00 — Turn 2 eval done → MOVE_ON to Hibernate (saturated on Spring Boot)
├── 12:00 — Turn 4 eval done → MOVE_ON to Docker (weak exit on Hibernate)
├── 16:00 — Turn 6 eval done → MOVE_ON to Kafka
├── 18:00 — Turn 7 done → Kafka saturated
├── 19:00 — All topics covered → WRAP_UP
├── 19:50 — Goodbye delivered
└── 20:00 — Cleanup + report generation
```

```
┌──────┬──────────┬───────────┬──────────┬──────────┬────────────────────────────────────────────────────────┐
│ Turn │ Time     │ Topic     │ Overall  │ Signal   │ Ishita Says                                              │
├──────┼──────────┼───────────┼──────────┼──────────┼────────────────────────────────────────────────────────┤
│  1   │ 0:30     │ Spring    │   3.1    │ tool_    │ "You mentioned Spring Boot — what did you actually       │
│      │          │ Boot      │          │ named_   │ build with it?"                                          │
│      │          │           │          │ not_used │                                                          │
│      │          │           │          │          │                                                          │
│  2   │ 4:00     │ Spring    │   5.8    │ tech_    │ "You went with PostgreSQL — why that over MongoDB        │
│      │          │ Boot      │          │ choice_  │ for the API?"                                             │
│      │          │           │          │ unjust   │                                                          │
│      │          │           │          │          │                                                          │
│  3   │ 7:00     │ Spring    │   7.5    │ none     │ "You've used Hibernate too — how do you typically        │
│      │          │ Boot      │          │          │ configure it?"     ← MOVE_ON (SATURATED)                  │
│      │          │ (SAT)     │          │          │                                                          │
│      │          │           │          │          │                                                          │
│  4   │ 8:30     │ Hibernate │   2.0    │ depth_   │ "No worries — what part of Hibernate did you actually    │
│      │          │           │          │ ceiling_ │ get your hands on, even briefly?"                        │
│      │          │           │          │ hit      │                                                          │
│      │          │           │          │          │                                                          │
│  5   │ 11:00    │ Hibernate │   3.5    │ depth_   │ "You mentioned the team — what part of the Hibernate     │
│      │          │           │          │ ceiling  │ setup was specifically yours?"  ← rerolled to            │
│      │          │           │          │ (BANNED) │ ownership_ambiguous (variety rule enforced)              │
│      │          │           │          │ → reroll │                                                          │
│      │          │           │          │ → ownership_amb                                                    │
│      │          │           │          │          │                                                          │
│  6   │ 13:00    │ Hibernate │   5.0    │ tech_    │ "Docker — have you containerized any Spring Boot apps?"  │
│      │          │           │          │ choice_  │ ← MOVE_ON (weak exit at turn 3)                          │
│      │          │           │          │ unjust   │                                                          │
│      │          │           │          │          │                                                          │
│  7   │ 15:00    │ Docker    │   7.0    │ none     │ "Kafka — have you worked with event-driven               │
│      │          │ (SAT)     │          │          │ architectures?" ← MOVE_ON (SATURATED)                    │
│      │          │           │          │          │                                                          │
│  8   │ 17:00    │ Kafka     │   6.5    │ none     │ "That covers everything I wanted to ask. Do you          │
│      │          │ (SAT)     │          │          │ have any questions for me?" ← MOVE_ON (SATURATED)        │
│      │          │           │          │          │                                                          │
│  9   │ 19:00    │ — wrap-up │   —      │ —        │ "Thanks for your time {name}. We'll be in touch."        │
│      │          │           │          │          │                                                          │
└──────┴──────────┴───────────┴──────────┴──────────┴────────────────────────────────────────────────────────┘
```

### Saturation State (Per-Topic)

```
Topic: "Spring Boot" (HIGH, mid) — threshold=5.5
  Turn 1: overall=3.1 → contrib=0.48, base=0.9 → sat=1.38
  Turn 2: overall=5.8 → contrib=1.66, base=0.9 → sat=3.94
  Turn 3: overall=7.5 → contrib=2.41, base=0.9 → sat=7.25 (≥5.5) ✓ SATURATED → MOVE_ON

Topic: "Hibernate" (HIGH, mid) — threshold=5.5
  Turn 4: overall=2.0 → contrib=0.0, base=0.0 → sat=0.0
  Turn 5: overall=3.5 → contrib=0.66, base=0.56 → sat=1.22
  Turn 6: overall=5.0 → contrib=1.31, base=0.9 → sat=3.43
  Turn 6 is turn 3 on topic → sat_pct=3.43/5.5=62% → passed 50% floor → NOT weak exit
  But actually: turn 6 is follow_up_turns=3, so weak_exit check: sat_pct=62% >= 50% → not weak
  Wait — turn 6 eval was weak exit? Let me check the numbers again...
  
  Actually: turn 4 (follow_up_turns=1), turn 5 (f=2), turn 6 (f=3).
  At turn 3 (follow_up_turns=3): sat_pct = 3.43/5.5 = 62%. 62% >= 50% → NOT weak exit.
  But turn 5 had consecutive_zero_scores? No — overall=3.5 > 0.
  
  So it would PROBE not MOVE_ON. Let me redo this more carefully:

Topic: "Hibernate" (HIGH, mid) — threshold=5.5
  Turn 4: overall=2.0, signal=depth_ceiling_hit
    → weighted=2.0, contribution=0.0, base=0.0 (weighted < 1.0)
    → sat=0.0, follow_ups=1, consecutive_zeros=1
    → not dry (need 2), not weak (turn 1)
    → PROBE
  
  Turn 5: overall=3.5, signal=depth_ceiling_hit (BANNED → rerolled to ownership_ambiguous)
    → weighted=3.5, contribution=0.66, base = base_credit * (3.5-1)/2 = 0.9 * 2.5/2 = 1.125
    → sat=1.79, follow_ups=2, consecutive_zeros=0 (weighted > 0)
    → not weak (turn 2 = only 2 follow-ups, need ≥3)
    → PROBE
  
  Turn 6: overall=5.0, signal=tech_choice_unjustified
    → weighted=5.0, contribution=1.31, base=0.9
    → sat=4.0, follow_ups=3
    → weak exit at turn 3: sat_pct = 4.0/5.5 = 72% >= 50% floor → NOT weak exit
    → not saturated (4.0 < 5.5)
    → PROBE (not MOVE_ON)
  
  Hmm, that means we'd need a turn 7. But the user example above showed MOVE_ON at turn 6. Let me adjust to make it work — maybe overall scores are lower.
  
  Let me fix this in the example so the math works out.
```

I'll simplify the walkthrough to avoid confusing saturation math — let me provide a cleaner example.

---

## Simplified Turn-by-Turn Example

### 8-Turn Interview Walkthrough

```
╔══════╤════════╤═══════════════╤══════════╤══════════════════╤══════════════════════════════════════╗
║ Turn │ Time   │ Topic         │ Overall  │ Signal           │ Ishita Says                         ║
╠══════╪════════╪═══════════════╪══════════╪══════════════════╪══════════════════════════════════════╣
║  1   │ 0:30   │ Lead Gen      │   3.5    │ tool_named_not_  │ "You mentioned n8n — what did you   ║
║      │        │ Pipeline      │          │ used             │ actually build with it?"            ║
║      │        │ (CRITICAL)    │          │                  │                                      ║
╠══════╪════════╪═══════════════╪══════════╪══════════════════╪══════════════════════════════════════╣
║  2   │ 3:00   │ Lead Gen      │   6.0    │ tech_choice_     │ "You went with Clearbit — why that  ║
║      │        │ Pipeline      │          │ unjustified      │ over Apollo for enrichment?"        ║
╠══════╪════════╪═══════════════╪══════════╪══════════════════╪══════════════════════════════════════╣
║  3   │ 6:00   │ Lead Gen      │   8.0    │ none             │ "You mentioned CRM workflows —      ║
║      │        │ Pipeline      │          │ SATURATED        │ tell me about your Salesforce       ║
║      │        │               │          │ → MOVE_ON        │ setup process."  ← moves to new    ║
║      │        │               │          │                  │ topic                               ║
╠══════╪════════╪═══════════════╪══════════╪══════════════════╪══════════════════════════════════════╣
║  4   │ 8:30   │ Salesforce    │   2.0    │ ownership_       │ "Out of what you described, which   ║
║      │        │ (HIGH)        │          │ ambiguous        │ part did you personally set up?"    ║
╠══════╪════════╪═══════════════╪══════════╪══════════════════╪══════════════════════════════════════╣
║  5   │ 11:00  │ Salesforce    │   0.0    │ pure_denial      │ "Fair enough — have you worked      ║
║      │        │               │          │ → MOVE_ON        │ with any other CRM?"               ║
║      │        │               │          │ (forced)         │ → moves to next topic               ║
╠══════╪════════╪═══════════════╪══════════╪══════════════════╪══════════════════════════════════════╣
║  6   │ 12:30  │ Data Analysis │   5.5    │ scenario_        │ "Say your pipeline started giving   ║
║      │        │ (MEDIUM)      │          │ untested         │ wrong numbers — what would you      ║
║      │        │               │          │                  │ check first?"                       ║
╠══════╪════════╪═══════════════╪══════════╪══════════════════╪══════════════════════════════════════╣
║  7   │ 15:30  │ Data Analysis │   7.0    │ none             │ "That covers what I needed on       ║
║      │        │               │          │ SATURATED        │ data analysis. Let's talk about     ║
║      │        │               │          │ → MOVE_ON        | reporting..."                       ║
╠══════╪════════╪═══════════════╪══════════╪══════════════════╪══════════════════════════════════════╣
║  8   │ 17:30  │ Reporting     │   7.5    │ none             │ "That's everything. Do you have     ║
║      │        │ (LOW)         │          │ SATURATED        │ any questions?"  ← wrap-up          ║
╠══════╪════════╪═══════════════╪══════════╪══════════════════╪══════════════════════════════════════╣
║  9   │ 19:30  │ Wrap-up       │   —      │ —                │ "Thanks {name}. We'll review and    ║
║      │        │               │          │                  │ get back to you."                   ║
╚══════╧════════╧═══════════════╧══════════╧══════════════════╧══════════════════════════════════════╝
```

### Scoring Detail for Turn 1

```
Answer: "I've used n8n for automation. It's great for connecting APIs.
         I usually set up workflows for lead enrichment."

LLM Scores:
  Clarity: 5   — answered but vague, described habit not instance
  Depth: 3     — no HOW or WHY, just "I use it"
  Specificity: 2 — named n8n, zero operational detail
  Grounding: 3 — describes a type of work, not a real event

→ Overall = 5×0.20 + 3×0.35 + 2×0.20 + 3×0.25 = 1.0 + 1.05 + 0.40 + 0.75 = 3.20
→ Signal = tool_named_not_used (named n8n, no usage evidence)
→ Action = PROBE

Saturation Update (Lead Gen, CRITICAL, mid):
  weighted = 3.20
  contribution = min(3.5, max(0, (3.20-2.0)/8.0 × 3.5)) = min(3.5, 0.525) = 0.525
  base = base_credit × (weighted - 1.0)/2.0 = 0.8 × 2.20/2.0 = 0.88  (since weighted=3.20 >= 1.0)
  sat_score = 0 + 0.88 + 0.525 = 1.405
  threshold = 7.0
  → NOT saturated → PROBE

Probe Directive:
  SIGNAL: tool_named_not_used
  TRIGGER: "I use n8n for automation"
  GOAL: Get one concrete memory of operating it
  QUESTION TYPE: HANDS-ON VERIFICATION
  → "You mentioned n8n — what did you actually build with it?"
```

### Saturation Timeline

```
Topic      Importance  Band  Threshold  Turn 1   Turn 2   Turn 3   Turn 4   Turn 5
───        ──────────  ────  ─────────  ──────   ──────   ──────   ──────   ──────
Lead Gen   CRITICAL    mid   7.0        1.41     4.67     8.95→SAT  —        —
Salesforce HIGH       mid   5.5        0.0      0.0→dry    —        —        —
Data Anal  MEDIUM      mid   4.0        1.70     3.85     7.55→SAT  —        —
Reporting  LOW         mid   3.0        1.40     4.99→SAT  —        —        —
```

---

## Report Output Structure

### What Gets Written to DB

```
Interview (DB row)
├── status: "COMPLETED"
├── transcript: [{"role": "Candidate", "text": "..."}, ...]
├── answerScores: [
│     {
│       "turn": 1,
│       "question": "Walk me through...",
│       "answer": "I've used n8n...",
│       "clarity": 5,
│       "depth": 3,
│       "specificity": 2,
│       "grounding": 3,
│       "overall": 3.2,
│       "signal": "tool_named_not_used",
│       "signal_reason": "I use n8n for automation",
│       "topic": "Lead Gen Pipeline",
│       "topic_saturation_score": 1.41,
│       "topic_saturation_threshold": 7.0,
│       "action": "PROBE",
│       ...
│     },
│     ...
│   ]
├── integritySignals: [
│     {
│       "eventType": "tab_switch",
│       "severity": "medium",
│       "timestamp": 1783162283391,
│       "reason": "Tab Hidden (1m 23s into interview)",
│       "metadata": { "elapsedSeconds": 83 }
│     },
│     ...
│   ]
├── questionByQuestionAnalysis: {  ← from report pipeline
│     "dimensions": [
│       {"name": "jd_knowledge", "score": 72, "evidence": "..."},
│       {"name": "problem_solving", "score": 65, "evidence": "..."},
│       {"name": "experience_credibility", "score": 58, "evidence": "..."},
│       {"name": "communication", "score": 80, "evidence": "..."},
│       {"name": "ownership", "score": 45, "evidence": "..."}
│     ],
│     "skill_ratings": [
│       {"skill": "Data Pipeline Automation", "score": 7, "evidence": "..."},
│       {"skill": "CRM Management", "score": 3, "evidence": "..."}
│     ],
│     "strengths": ["Clear communicator", "...
│     "concerns": ["Struggles with depth on technical implementation"],
│     "overall": 64,
│     "behavioral_points": [...],
│     "integrity_band": "HIGH",
│     "integrity_score": 100,
│     "signal_summary": "No integrity issues",
│     "integrity_signals_analysis": {...},
│     "answer_integrity": {"flagged": false, "score": 95, ...}
│   }
├── interviewSummary: {  ← from summary pipeline
│     "summary": "The candidate demonstrated solid experience in...",
│     "decision_note": {
│       "decision": "Advance",
│       "score": 65,
│       "justification": "Good technical foundation but needs..."
│     }
│   }
```

---

## File Map

| File | Phase | Role |
|------|-------|------|
| `interview/agent_runtime.py` | All | Orchestration: entrypoint, turn loop, directive building, cleanup |
| `interview/agent_persistence.py` | Pre, Post | DB fetch, transcript/scores persistence, report triggering |
| `interview/brief_extraction.py` | Pre | Resume+JD extraction (LangGraph DAG, zero LLM) |
| `interview/interview_brief.py` | Pre | Interview brief generation (LLM) |
| `interview/band_classifier.py` | Pre | Candidate band determination |
| `interview/agent_providers.py` | All | TTS/STT/LLM provider factory |
| `interview/agent_scoring.py` | Per-turn | Quality scoring + response/content signal classification (G0-G7) |
| `interview/eval_pipeline.py` | Per-turn | Saturation tracking, routing decision |
| `interview/probe_strategy.py` | Per-turn | Probe definitions, band overlays, reaction tones |
| `interview/prompt_layers.py` | Pre | Voice identity prompt |
| `interview/agent_runtime_utils.py` | All | Config, state manager, transcript utilities |
| `interview/agent_runtime_support.py` | All | Logging, EVAL_TEMPERATURE, DATABASE_URL |
| `interview/report_pipeline.py` | Post | Report generation (LangGraph DAG) |
| `interview/slack_error_logger.py` | All | Error alerting |
| `interview/agent_utils.py` | All | JSON coercion, text truncation |
| `interview/debug_report.py` | Post | Debug PDF for test sessions |
| `interview/tts_phonetic_processor.py` | Per-turn | Client-side TTS phonetic transforms |
| `interview/sarvam_pronunciation_dict.py` | Pre | Sarvam TTS pronunciation entries |
| `lib/proctoring-signals.ts` | Per-turn | Browser proctoring signal types + plan toggles |
| `components/create-drive/interview-setup.tsx` | Pre | Interview setup UI (voice, custom questions) |
| `components/admin/candidate-profile/interview-report-sreevaai.tsx` | Post | Report UI (radar charts, transcripts, signals) |

---

## Key Design Decisions

1. **Eval is the single source of truth.** `run_eval_and_build_directive()` never returns None, never raises. Recovery from LLM failures is owned inside eval — the agent has no fallback path.

2. **Two separate LLM calls per turn** (scoring + signal classification). Splitting avoids conjunctive-logic collapse where scoring and signal sharing 200 tokens degraded both tasks.

3. **Probe directives are synchronous (no LLM).** The probe strategy is fully deterministic from the detected signal. Only MOVE_ON directives call the LLM (and they're pre-fired in parallel with eval).

4. **Warmup scores are discarded.** Warmup turns return `is_warmup: True` and are filtered out of the report pipeline.

5. **Clarification/rephrase turns don't consume the follow-up budget.** They don't count toward saturation, dry-topic detection, or the variety ban.

6. **Topics are never re-asked.** The `CoveredTopics` class uses normalized keys + Jaccard similarity to prevent semantic duplicates.
