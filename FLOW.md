# Interview Agent — End-to-End Flow Architecture

## High-Level Phases

```
[1] STARTUP (0-5s)
    ├─ Parallel: DB fetch (resume, brief, config) + LiveKit room connect
    ├─ Wait for candidate participant to join
    ├─ Build system prompt (voice layer + evaluation layer)
    └─ Ready to deliver greeting

[2] GREETING (5-15s)
    ├─ Deliver scripted greeting via TTS (no interruption allowed)
    ├─ Mark greeting_delivered_at when TTS completes
    ├─ Candidate responds
    ├─ Block STT until greeting_delivered_at is set
    └─ Move to WARMUP phase

[3] WARMUP (15-30s)
    ├─ AI delivers one warm 1-2 sentence response (NOT evaluation)
    ├─ Candidate responds
    ├─ Track warmup_required_responses = 2 (greeting reply + warmup reply)
    ├─ After 2 responses received → warmup_complete = True
    └─ Inject Stage 1 system directive

[4] STAGE 1: RESUME (30s-10min)
    ├─ Time budget: 600 seconds
    ├─ Anchor-based opening: "Tell me what you personally built in: [project/role]"
    ├─ Flow:
    │  ├─ AI asks about resume ownership (projects, work, internships)
    │  ├─ Per turn: evaluate answer → decide PROBE or MOVE_ON
    │  ├─ PROBE: ask follow-up on same topic (max 2 follow-ups by default, +1 for signals)
    │  ├─ MOVE_ON: reset counter, pivot to next uncovered resume topic
    │  ├─ Weave in 1 situational + 1 behavioral question naturally (quota)
    │  └─ Track custom question coverage (word overlap with normalized question)
    ├─ Parallel signals detected:
    │  ├─ ownership_ambiguity → probe "what was specifically yours?"
    │  ├─ example_evasion → probe "walk me through a specific moment"
    │  ├─ depth_decay → MOVE_ON after 2 low-quality follow-ups
    │  ├─ contradiction → freeze follow-up counter, ask clarification
    │  └─ follow_up_collapse → MOVE_ON when quality drops on repeated probes
    ├─ When timeout hits (600s):
    │  ├─ Acquire _session_state_lock
    │  ├─ Transition Stage 1 → Stage 2
    │  ├─ Reset stage quotas (_stage_situational_asked, _stage_behavioral_asked)
    │  ├─ Build Stage 2 directive (skills list)
    │  └─ Inject into chat context (LLM sees it on next generation)
    └─ Exit when Stage 2 injected or remaining time exhausted

[5] STAGE 2: SKILL (10min-17min)
    ├─ Time budget: ~405 seconds (varies by interview length)
    ├─ Skill-based opening: "Tell me about the most important skill for this role: [skill]"
    ├─ Flow:
    │  ├─ AI picks skill from resume/JD must-haves (filtered to avoid generic skills)
    │  ├─ Per turn: evaluate answer → decide PROBE or MOVE_ON
    │  ├─ PROBE: follow-up on same skill (max 2 by default, +1 for signals)
    │  ├─ MOVE_ON: reset counter, pivot to next uncovered skill
    │  ├─ For skills touched in Stage 1: "go deeper, don't re-ask basics"
    │  ├─ Weave in 1 situational + 1 behavioral question (quota)
    │  └─ Track custom question coverage
    ├─ Same signals as Stage 1 apply
    ├─ When timeout hits (~405s):
    │  ├─ Stage 2 is final stage → no transition (interview ends naturally)
    │  └─ Continue until hard timeout or candidate finishes
    └─ Exit when time exhausted

[6] WRAP-UP (17min-end)
    ├─ "Any questions for me?" prompt at 15s before hard timeout
    ├─ If no response after 60s → send inactivity nudge
    ├─ If no response after 60s more → end call
    ├─ Final thank you message
    └─ Persist all data (transcript, scores, contradictions, proctoring events)
```

---

## Per-Turn Decision Engine (Runs After Every Candidate Answer)

### Phase 1: Extraction (Parallel)
```
Input: candidate_answer, last_question, transcript history

├─ Extract Claims (if contradiction detection enabled)
│  ├─ Call LLM to extract factual claims from answer
│  ├─ Check against _claim_index for contradictions
│  └─ Log contradiction_alert if found
│
├─ Score Answer Quality (7 dimensions)
│  ├─ clarity (0-10): is it understandable?
│  ├─ depth (0-10): is there substance?
│  ├─ specificity (0-10): concrete examples or vague?
│  ├─ grounding (0-10): tied to real experience?
│  ├─ fluency (0-10): natural speech?
│  ├─ grammar (0-10): correct syntax?
│  └─ confidence (0-10): sounds assured or tentative?
│
└─ Detect Signals (11 types)
   ├─ ownership_ambiguity: "we did X" instead of "I did X"
   ├─ example_evasion: answer lacks specific moment/story
   ├─ resume_claim_mismatch: says something different from resume
   ├─ latency_mismatch: took too long to answer (thinking?)
   ├─ contradiction: conflicts with earlier claim
   ├─ follow_up_collapse: quality drops on repeated probes (→ MOVE_ON)
   ├─ depth_decay: last 2 answers on topic both low quality
   ├─ complexity_latency_mismatch: simple answer took long time
   ├─ ownership_clarified: "actually I did X" (resolves ambiguity)
   ├─ example_given: now has specific story
   └─ contradiction_resolved: "I misspoke, I meant..."
```

### Phase 2: Decision Logic (Serialized per-turn)
```
Input: quality_score, signals_detected, follow_up_count, current_stage, active_topic

Rules (in priority order):

1. CONTRADICTION DETECTED
   ├─ Mode: clarification (frozen follow-up counter)
   ├─ Action: VERIFY (ask clarifying question)
   └─ Next turn: frozen until contradiction resolved

2. OWNERSHIP/EXAMPLE SIGNAL
   ├─ Likely ownership_ambiguity or example_evasion
   ├─ Action: PROBE
   ├─ Next turn: ask for specific ownership/example

3. DEPTH_DECAY (last 2 answers both score < 4.0)
   ├─ Topic exhausted
   ├─ Action: MOVE_ON
   ├─ Next turn: new topic, reset follow-up counter

4. FOLLOW_UP_CAP (count >= default_cap OR count >= 3)
   ├─ Reached follow-up limit
   ├─ Action: MOVE_ON
   ├─ Next turn: new topic, reset follow-up counter

5. QUALITY-BASED (default case)
   ├─ Score >= 6.5: PROBE (answer good, dig deeper)
   ├─ Score 4.5-6.5: PROBE (answer okay, probe once more)
   ├─ Score < 4.5: MOVE_ON (answer weak, pivot)

Output: TurnDecision
├─ action: PROBE | MOVE_ON
├─ mode: normal | clarification
├─ next_goal: string describing the goal
├─ [TOPIC:NEW] or [TOPIC:FOLLOWUP] tag (emitted by LLM)
└─ Full system directive (injected before LLM generation)
```

### Phase 3: Directive Injection
```
[SYSTEM MESSAGE INJECTED INTO CHAT]

[DO NOT SAY ALOUD — INTERNAL INSTRUCTION]
[NEXT_TURN_DIRECTIVE]

<Persona + speech style>
<Stage directive (resume/skill)>
<Previous turn evaluation + outcome>

IF action == MOVE_ON:
  [STRICT_MOVE_ON_RULE]
  "Your next question must explore a DIFFERENT topic..."
  "You must emit [TOPIC:NEW] to signal the shift."

IF contradiction_detected:
  [CONTRADICTION_CLARIFICATION]
  "Earlier the candidate said: X
   Just now they said: Y
   Ask a clarifying question to resolve."

<Custom questions (if pending)>
<Discussed topics log>
<Current stage quota status>
```

---

## Topic Tracking & Drift Guard

### Topic Tags (Emitted by LLM)
```
Every LLM turn begins with exactly one:

[TOPIC:NEW]      = introducing a different subject (project/skill/stage)
[TOPIC:FOLLOWUP] = digging deeper on same subject (default)

System reads this tag → counts follow-up depth → enforces MOVE_ON cap
```

### Follow-Up Counter Logic
```
Counter: _topic_follow_up_count (reset when [TOPIC:NEW] detected)

On [TOPIC:FOLLOWUP]:
  ├─ Increment counter
  ├─ Check against cap (default 2, +1 for signals)
  └─ If at cap → next turn must be [TOPIC:NEW]

On [TOPIC:NEW]:
  ├─ Reset counter to 0
  ├─ Update _active_resume_topic or _active_skill_topic
  ├─ Clear _topic_depth_history
  └─ Set _last_action_was_move_on = True (lasts one turn)

Drift Guard (_enforce_move_on_until_new):
  ├─ Set when AI ignores MOVE_ON directive
  ├─ Forces next evaluation to return MOVE_ON action
  ├─ Locks AI to [TOPIC:NEW] on next turn
  └─ Cleared when [TOPIC:NEW] finally emitted
```

---

## Greeting Delivery & STT Blocking

```
Timeline:
─────────────────────────────────────────

T0: Greeting delivery starts
    └─ greeting_delivered_at = None (blocks STT)

T0-T2: TTS plays greeting (session.say with allow_interruptions=False)
       STT blocked by if greeting_delivered_at is None check

T2: Greeting TTS completes
    └─ greeting_delivered_at = time.time()
    └─ Unblocks STT

T2+ε: Candidate speaks (STT now accepts)
      └─ _on_conversation_item_added processes their response

Fail-safe:
  └─ If TTS fails, greeting_delivered_at set in finally block
     (prevents deadlock)
```

---

## Stage Advancement (Async with Lock)

```
Call Site 1: on_conversation_item_added (sync event handler)
  └─ Detects warmup_complete
  └─ Calls spawn_background_task(_advance_stage_if_due_async(_now_mono))

Call Site 2: main session loop (async)
  └─ Every 10s periodic check
  └─ Calls await _advance_stage_if_due_async(_now)

_advance_stage_if_due_async(now_mono):
  ├─ async with _session_state_lock:
  │  ├─ Check if time_in_stage >= stage_budget
  │  ├─ If yes:
  │  │  ├─ _current_stage_index += 1
  │  │  ├─ _stage_start_time = now_mono
  │  │  ├─ Reset stage quotas
  │  │  ├─ If Stage 2: _active_skill_topic = _next_uncovered_skill_topic()
  │  │  ├─ Build Stage 2 directive
  │  │  └─ Inject into chat_ctx
  │  └─ Else: return (not yet time)
  └─ Lock released (other tasks can proceed)
```

---

## Data Persistence

```
Async Auto-Save (every 5 turns):
  └─ spawn_background_task(persist_transcript(...))

Final Persist (on interview end):
  ├─ Transcript + turn-by-turn data
  ├─ Answer quality scores (all 7 dimensions)
  ├─ Contradictions found
  ├─ Signal events (11 types)
  ├─ Proctoring data (risk scores, events)
  ├─ Stage transition history
  └─ Billing record (duration, tokens, cost)
```

---

## Error Handling & Robustness

```
Greeting Delivery:
  ├─ Retry TTS up to 3 times on transport errors
  ├─ Fail-safe: set greeting_delivered_at in finally block
  └─ Never deadlock waiting on greeting

Stage Advancement:
  ├─ Lock-protected to prevent concurrent transitions
  ├─ Check _stage_bridge_pending to prevent double-advance
  └─ Safe to call from async and sync contexts

Warmup Completion:
  ├─ Requires exactly 2 responses (greeting reply + warmup reply)
  ├─ Guarded by warmup_required_responses counter
  └─ Stage 1 injection blocked until warmup_complete = True

User-Turn Serialization:
  ├─ _user_turn_chain serializes per-turn evaluation
  ├─ Next turn waits for previous to complete
  ├─ Prevents race conditions in state updates
  └─ Avoids double-evaluation of same answer
```

---

## Key State Variables

```
Phase State:
  warmup_complete: bool
  warmup_required_responses: int
  _current_stage_index: int (0=RESUME, 1=SKILL)
  _stage_start_time: float
  _stage_bridge_pending: bool

Topic State:
  _active_resume_topic: str | None
  _active_skill_topic: str | None
  _topic_follow_up_count: int
  _last_action_was_move_on: bool
  _enforce_move_on_until_new: bool
  _discussed_log: list[str]

Answer Evaluation:
  _topic_depth_history: list[float]
  _contradictions_found: list[dict]
  _claim_index: dict
  _trust_state: TrustState

Timing:
  session_start_time: float
  greeting_delivered_at: float | None
  _question_asked_at: float
  _answer_received_at: float

Safety:
  _session_state_lock: asyncio.Lock (protects stage advancement)
  _user_turn_chain: asyncio.Task | None (serializes per-turn processing)
```

---

## Logging Prefixes for Terminal Visibility

```
[FLOW]        - High-level phase transitions (greeting, warmup, stage)
[STAGE]       - Stage advancement and directive injection
[TOPIC]       - Topic selection, [TOPIC:NEW] vs [TOPIC:FOLLOWUP]
[FOLLOWUP]    - Follow-up counter state and cap enforcement
[EVAL]        - Answer quality scores and signal detection
[ROUTER]      - Decision routing (PROBE vs MOVE_ON)
[SIGNAL]      - Specific signal events (ownership, depth, contradiction)
[TIMER]       - Time budget tracking and remaining time
[TRUST]       - Trust engine state updates
[PERSIST]     - Database saves and transcript persistence
[TRANSCRIPT]  - Raw transcript lines (every turn)
[NUDGE]       - Inactivity warnings and timeouts
[GREETING]    - Greeting delivery and TTS retries
[STAGE1]      - Stage 1 specific (resume topic question count)
[CUSTOM_Q]    - Custom question coverage tracking
[CONSISTENCY] - Contradiction detection and resolution
```

---

## Interview Durations & Budgets

```
Total Time: ~17-20 minutes (configurable via time_limit_mins)

├─ Greeting: 10s (fixed)
├─ Warmup: 15s (fixed, typically 2-3 exchanges)
├─ Stage 1 (RESUME): 10 min (600s)
├─ Stage 2 (SKILL): ~5-7 min (remainder minus close-out)
└─ Wrap-up: 1-2 min (final thank-you, inactivity handling)

Stage Budgets Auto-Calculated:
  stage_budget[0] = 600s
  stage_budget[1] = total_time - greeting(10) - warmup(15) - stage1(600) - close_out(30)
```

---

## Critical Invariants

1. **Warmup-gated**: Stage 1 injection only fires after 2 warmup responses
2. **Stage-exclusive**: Resume questions in Stage 1, skill questions in Stage 2 only
3. **Topic-rooted**: Every question must be tied to [TOPIC:NEW] or [TOPIC:FOLLOWUP]
4. **Locked state transitions**: Stage advancement protected by _session_state_lock
5. **Serialized evaluation**: Per-turn decisions run inside _user_turn_chain
6. **Greeting blocks STT**: No candidate input processed until greeting_delivered_at is set
7. **One directive per turn**: Exactly one [NEXT_TURN_DIRECTIVE] injected per candidate answer
8. **Quota enforcement**: Situational and behavioral questions required per stage
9. **Custom question coverage**: Tracked by word overlap, not re-asked once covered
10. **No double-evaluation**: _user_turn_chain prevents concurrent processing of same answer
