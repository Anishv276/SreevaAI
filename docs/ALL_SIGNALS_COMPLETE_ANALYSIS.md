# Complete Signal System Analysis: All 20+ Signals Across All Layers

## Overview

Signals exist in **5 layers**:
1. **Proctoring Signals** (9) — LLM answer analysis
2. **Browser Signals** (4) — Hardware/environment detection
3. **Trust Engine Signals** (7) — Quality & recovery tracking
4. **Behavioral Toggles** (3) — Recovery indicators
5. **System Signals** (2) — Interview control

**Total: 25+ signals**

---

## Layer 1: Proctoring Signals (LLM Answer Analysis)

These fire in `turn_decision.py` during `detect_signal_events()`. They analyze candidate ANSWERS.

### 1. OWNERSHIP_AMBIGUITY
- **Type**: Behavioral confidence
- **Fires on**: Answer uses "we/our/team" ≥2 times AND "I/me/my" ≤1 time
- **Recruiter visible**: ✅ TRUE
- **Trust impact**: -0.15 to behavioral_confidence bucket
- **Interview behavior**: Routes to PROBE → asks "what specifically did YOU do?"
- **Recovery signal**: ownership_clarified (+0.05)

**Example:**
```
Q: "Tell me about your biggest technical achievement"
A: "We built a new system. Our team did great work. We deployed it. We handled everything."
→ FIRES: confidence 0.95 (5 we-tokens, 0 I-tokens)
```

---

### 2. EXAMPLE_EVASION
- **Type**: Behavioral confidence
- **Fires on**: Question asks for example ("tell me about a time", "walk me through") BUT answer is theoretical ("typically", "you should", "ideally") OR lacks specifics (no dates/numbers)
- **Recruiter visible**: ❌ FALSE (hidden, but surfaced if count >= 2)
- **Trust impact**: -0.15 to behavioral_confidence bucket
- **Interview behavior**: Routes to PROBE → asks for concrete example
- **Recovery signal**: example_given (+0.04)

**Example:**
```
Q: "Tell me about a time you optimized a database"
A: "Generally, the approach is to identify the bottleneck. You should profile. 
   Usually you check indexes. Then you optimize."
→ FIRES: confidence 0.78 (theoretical phrases detected, no specifics)
```

---

### 3. RESUME_CLAIM_MISMATCH
- **Type**: Behavioral confidence
- **Fires on**: Question asks for example/walkthrough AND answer has resume-like phrases ("I have worked with", "I used", "I'm familiar") AND weak grounding (no specifics OR depth < 5.5)
- **Recruiter visible**: ✅ TRUE
- **Trust impact**: -0.12 to behavioral_confidence bucket
- **Interview behavior**: Routes to PROBE → asks for evidence

**Example:**
```
Q: "Walk me through a project where you used React"
A: "I have worked with React. I've used it in multiple projects. I am familiar with hooks."
→ FIRES: confidence 0.72 (resume-like phrases + weak depth 3.5)
```

---

### 4. FOLLOW_UP_COLLAPSE
- **Type**: Hard integrity (strongest)
- **Fires on**: Follow-up answer drops sharply from first answer
  - First answer depth ≥ 6.0
  - Current depth ≤ 3.0 (complete) OR ≤ 5.0 with drop ≥ 2.0 (partial)
  - topic_follow_up_count ≥ 1 (must be follow-up, not first answer)
- **Recruiter visible**: ✅ TRUE
- **Trust impact**: -0.20 (first collapse) or -0.38 (repeat collapse, non-recoverable)
- **Interview behavior**: Routes to PROBE → staged memory probes (L1 → L2 → L3)
- **Recovery signal**: strong_under_pressure (+0.05)
- **collapse_stage tracking**: L1 (first) → L2 (escalated) → L3 (final)

**Example:**
```
Turn 3: Q: "Tell me about your biggest achievement"
A: "I led redesign of payment system. Migrated from monolith to microservices. 
   I owned schema design, data migration, indexing. 6 months, 60% latency cut."
   → Depth: 8.5

Turn 4: Q: "Walk me through the database migration approach"
A: "Uh, we... we did the migration. Used Postgres. It was complex."
   → Depth: 2.0 (drop 6.5)

→ FIRES: confidence 0.95, type="complete", collapse_stage=0
→ Routing: PROBE with follow_up_collapse_staged

L1 Directive: "Can you walk me through that part more specifically?"
If still vague → collapse_stage=1
L2 Directive: "What was YOUR personal role in the migration?"
If still vague → collapse_stage=2
L3 Directive: "Forget the overview — tell me one specific day this happened"
```

---

### 5. LATENCY_MISMATCH
- **Type**: Behavioral confidence
- **Fires on**: Follow-up answer is unnaturally compressed
  - topic_follow_up_count ≥ 1 (follow-up)
  - Question asks for example/compression
  - Answer word count < 28-42 depending on quality
  - Depth drop ≥ 1.5-0.8
- **Recruiter visible**: ❌ FALSE (hidden, internal trust only)
- **Trust impact**: -0.10 to behavioral_confidence bucket
- **Interview behavior**: Routes to PROBE → asks for step-by-step
- **Why fires**: Candidate is guessing or avoiding specificity

**Example:**
```
Turn 3: "Tell me about optimizing database. 65 words, depth 7.5"

Turn 4: Q: "Walk me through step by step"
A: "I checked the query time. It was slow."
   → 9 words, depth 2.5 (drop 5.0)

→ FIRES: confidence 0.88 (very compressed, high drop)
```

---

### 6. CONTRADICTION
- **Type**: Hard integrity (highest priority)
- **Fires on**: Candidate says something conflicting with resume or earlier claim
  - Requires external claim extraction (LLM call per turn, disabled by default)
  - contradiction_detected = True
- **Recruiter visible**: ✅ TRUE
- **Trust impact**: -0.40 to hard_integrity bucket (highest penalty)
- **Interview behavior**: Routes to VERIFY → asks to reconcile: "Earlier you said X, now you're saying Y"
- **Recovery signal**: contradiction_resolved (+0.06)

**Example:**
```
Resume: "5 years of Python"
Turn 6: "I've mainly used JavaScript. Python is something I learned last year."

→ FIRES: confidence 0.95, score_delta=-0.40
→ Routing: VERIFY with clarification probe
```

---

### 7. DEPTH_DECAY
- **Type**: Intelligence quality (progressive fatigue/loss of focus)
- **Fires on**: Cross-topic quality degradation
  - Rolling window of 3 scores: if second_half_avg < first_half_avg - threshold
  - Mild: drop ≥ 1.2 (confidence 0.55 + drop*0.04)
  - Severe: drop ≥ 2.0 (confidence 0.70 + drop*0.04)
  - Cooldown: min 2 turns between fires
- **Recruiter visible**: ✅ TRUE
- **Trust impact**: -0.06 (mild) or -0.12 (severe) to intelligence_quality bucket
- **Interview behavior**: Routes to PROBE → depth family (asks harder questions)
  - ❌ **WRONG**: Should route to MOVE_ON (candidate is tired)
- **Why fires**: Candidate started strong, now answering weakly across topics

**Example:**
```
Turn 1-3: [7.5, 7.2, 8.0] → avg 7.57
Turn 4-6: [6.0, 4.5, 3.8] → avg 4.77
Drop: 7.57 - 4.77 = 2.8 (SEVERE)

→ FIRES: confidence 0.82, type="severe"
→ ❌ Routes to PROBE depth (wrong - should move on, candidate is tired)
```

---

### 8. COMPLEXITY_LATENCY_MISMATCH
- **Type**: Behavioral confidence (AI-assisted answer detection)
- **Fires on**: Two inverted timing patterns
  - **FAST-COMPLEX**: Complex behavioral Q answered in < 5.5s with ≥ 20 words
    - Suggests pre-generated text read aloud (ChatGPT prep)
  - **SLOW-SIMPLE**: Simple factual Q (tools, company, years) takes > 22s
    - Suggests candidate looking things up
- **Recruiter visible**: ✅ TRUE
- **Trust impact**: -0.14 (fast-complex) or -0.08 (slow-simple) to behavioral_confidence
- **Interview behavior**: Routes to PROBE → evidence family
- **Why fires**: Unnatural timing pattern

**Example 1 (FAST-COMPLEX):**
```
Q: "Tell me about a time you made a difficult architectural decision. 
    Walk me through the tradeoffs."
   (marked "complex" question)

Response time: 2.1 seconds
A: "That's a great question. When we were building the payment system, 
   we had to decide between monolith and microservices. We considered 
   scalability, team size, deployment complexity. Microservices won 
   because of better isolation and independent scaling..."
   (67 words, fluent, polished)

→ FIRES: confidence 0.80 (2.1s < 5.5s threshold)
→ Interpretation: Answer is pre-written, candidate is reading (AI-assisted prep)
```

**Example 2 (SLOW-SIMPLE):**
```
Q: "How many years have you been using Python?"
   (marked "simple" question)

Response time: 28 seconds
A: "Let me think... I started learning Python in 2019, so that's about... 5 years now."

→ FIRES: confidence 0.55 (28s > 22s threshold)
→ Interpretation: Candidate is looking something up or constructing answer
```

---

- **Fires on**: Candidate asks meta-checking question about Ishita
  - "Can you hear me?"
  - "Are you there?"
  - "Are you a bot?"
  - "Do you know me?"
- **Recruiter visible**: ❌ FALSE
- **Trust impact**: 0.0 (no penalty, recoverable)
- **Interview behavior**: Routes to PROBE → rapport family
  - Ishita acknowledges: "Yep, I can hear you perfectly!"
  - Then continues naturally

**Example:**
```
Turn 1:
Ishita: "Hey, how are you doing?"
Candidate: "Can you hear me? Are you there?"

→ FIRES: confidence 0.91, score_delta=0.0
→ Routing: PROBE rapport
→ Expected response: "Yep, I can hear you fine! How are you doing today?"
```

---

## Layer 2: Browser Signals (Hardware/Environment Detection)

These fire from browser events, tracked in `agent_runtime.py`. They analyze BEHAVIOR during interview.

### 10. TAB_SWITCH
- **Type**: Hard integrity (cheating indicator)
- **Detection**: Browser detects candidate switched to different tab
- **Trust impact**: -0.03 per switch
- **Interview behavior**: Tracked but doesn't change behavior immediately
- **Weight in risk calculation**: 5
- **Significance**: When combined with weak answers, indicates looking up answers

**Example:**
```
Candidate answering Q: "Tell me about microservices architecture"
Browser events:
- 14:32:10 — tab switch to Google (candidate tabs out)
- 14:32:45 — back to interview
- Answer quality: 2.5/10 (vague, generic)

→ Correlation: tab_switch + weak answer = suspicious
```

---

### 11. FACE_ABSENT
- **Type**: Hard integrity (monitoring indicator)
- **Detection**: Camera detects candidate's face is not in frame
- **Trust impact**: -0.03 per event
- **Interview behavior**: Tracked, streak counter maintained
  - Single absence: minor concern
  - 2+ in streak: stronger concern
- **Weight in risk calculation**: 3
- **Significance**: Candidate looking away from camera (phone, notes, person off-camera?)

**Example:**
```
Turn 5: Candidate looking at notes (face absent 1.2s)
Turn 6: Candidate looking away (face absent 3.5s)
Turn 7: Candidate back on camera

_face_absent_streak = 2 (not applied to trust until streak >= 2)
→ Stronger signal: candidate may be cheating with external help
```

---

- **Significance**: Candidate is human, sometimes looks away naturally

---

### 13. MULTIPLE_FACES
- **Type**: Hard integrity (critical)
- **Detection**: Camera detects 2+ faces in frame
- **Trust impact**: -0.15 per event (highest proctoring penalty)
- **Interview behavior**: Serious flag, interview may be terminated
- **Weight in risk calculation**: 30 (highest weight)
- **Significance**: Someone else in the room, likely helping candidate cheat

**Example:**
```
Turn 8: Camera detects 2 faces in frame
→ FIRES: trust_impact=-0.15 (hard_integrity bucket drops to critical)
→ Ishita says: "I notice there's someone else in the room. 
                Just to clarify — this is a 1-on-1 interview. 
                Can they step out please?"
```

---

## Layer 3: Trust Engine Signals (Quality & Recovery)

These don't fire as "events" but are tracked in trust_engine.py as **recovery states**.

### 14. DEEP_ANSWER
- **Type**: Quality positive signal
- **Fires on**: Answer scores depth ≥ 7.5
- **Trust impact**: +0.04 to intelligence_quality bucket
- **Interview behavior**: No special action, trust increases
- **Significance**: Candidate is thinking deeply, showing reasoning

---

### 15. SPECIFIC_ANSWER
- **Type**: Quality positive signal
- **Fires on**: Overall ≥ 6.0 AND specificity ≥ 7.0
- **Trust impact**: +0.02 to intelligence_quality bucket
- **Significance**: Candidate is grounding claims in concrete details

---

### 16. SURFACE_ANSWER
- **Type**: Quality negative signal
- **Fires on**: Overall < 4.0
- **Trust impact**: -0.02 to intelligence_quality bucket
- **Significance**: Candidate is vague, generic, surface-level

---

### 17. VERY_SURFACE_ANSWER
- **Type**: Quality negative signal
- **Fires on**: Overall < 2.5
- **Trust impact**: -0.04 to intelligence_quality bucket
- **Significance**: Candidate is barely answering, just repeating keywords

---

## Layer 4: Behavioral Toggles (Recovery Indicators)

These are **conditions** tracked, not events that fire. Controlled by toggles: `evaluation_signal_toggles`.

### 18. OWNERSHIP_CLARIFIED
- **Type**: Recovery signal
- **Fires when**: ownership_ambiguity fired last turn AND doesn't fire this turn AND action=MOVE_ON
- **Trust impact**: +0.05 to behavioral_confidence bucket
- **Significance**: Candidate recovered from team-language pattern, showed personal contribution

**Example:**
```
Turn 3: Q: "Tell me about your project"
A: "We built the system. Our team did great work."
→ ownership_ambiguity fires, routing=PROBE

Turn 4: Q: "What specifically did YOU do?"
A: "I personally designed the API schema, handled all database migrations, 
   and wrote the initial Elasticsearch integration. The team helped with testing."
→ ownership_ambiguity does NOT fire
→ Action=MOVE_ON (hard cap hit)
→ RECOVERY SIGNAL: ownership_clarified (+0.05)
```

---

### 19. EXAMPLE_GIVEN
- **Type**: Recovery signal
- **Fires when**: example_evasion fired last turn AND doesn't fire this turn AND overall ≥ 6.0
- **Trust impact**: +0.04 to behavioral_confidence bucket
- **Significance**: Candidate stopped being theoretical, gave real example

**Example:**
```
Turn 4: Q: "Tell me about a time you optimized performance"
A: "Generally, you should profile the code. Usually you check indexes."
→ example_evasion fires

Turn 5: Q: "Give me a specific example"
A: "Yes, at Uber in 2022, we had a search query taking 800ms. 
   I added a composite index on (user_id, created_at) and query dropped to 150ms."
→ example_evasion does NOT fire
→ Overall: 7.5 (good answer)
→ RECOVERY SIGNAL: example_given (+0.04)
```

---

### 20. STRONG_UNDER_PRESSURE
- **Type**: Recovery signal
- **Fires when**: Last action was PROBE (we probed for weakness) AND overall ≥ 6.5 (candidate answered well anyway)
- **Trust impact**: +0.05 to behavioral_confidence bucket
- **Significance**: Candidate handles probing well, shows genuine knowledge

**Example:**
```
Turn 4: Q: "Can you walk me through that database migration?"
A: "We migrated data using..."
→ Weak answer (depth 3.5)
→ Action=PROBE
→ Directive injected: ask for step-by-step detail

Turn 5: Q: "Walk me through it step by step"
A: "Sure. First we created the new schema in parallel. Then we built the CDC 
   (Change Data Capture) system to replicate real-time changes while old system 
   still served traffic. After 2 weeks of validation, we switched the writes. 
   The trickiest part was handling the transition window — we had a dual-write 
   layer for 4 hours to catch any misses. After sync verified, we fully switched."
→ Overall: 7.8 (strong, shows real knowledge)
→ Last action was PROBE ✓
→ RECOVERY SIGNAL: strong_under_pressure (+0.05)
```

---

## Layer 5: System Signals (Interview Control)

### 21. CONTRADICTION_DETECTED
- **Type**: System flag
- **Set by**: External claim extraction (LLM call)
- **Significance**: Candidate made contradictory claim
- **Disabled by default**: contradiction_enabled defaults to False (expensive, 1 LLM call/turn)
- **Can be enabled in**: `evaluation_signal_toggles` dictionary

---

### 22. ANSWER_SURFACE (internal tracking)
- **Type**: System flag
- **Set by**: Answer evaluation layer
- **Significance**: Answer quality dropped, surface-level

---

## Summary: Signal Layers & Their Relationship

```
INTERVIEW FLOW:
┌─────────────────────────────────────────────────────────────┐
│ Candidate answers question                                  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
         ┌───────────────┐
         │ Browser senses│  ← Layer 2: TAB_SWITCH, FACE_ABSENT, etc.
         │ environment   │
         └───────┬───────┘
                 │
                 ▼
    ┌────────────────────────┐
    │ LLM scores answer      │     Quality scores: clarity, depth, specificity, grounding
    │ (agent_scoring.py)     │
    └─────────┬──────────────┘
              │
              ▼
    ┌──────────────────────────────────────────┐
    │ detect_signal_events() (turn_decision.py)│
    │                                          │  ← Layer 1: 9 Proctoring signals
    │ ownership_ambiguity                     │
    │ example_evasion                         │
    │ resume_claim_mismatch                   │
    │ follow_up_collapse                      │
    │ latency_mismatch                        │
    │ contradiction                           │
    │ depth_decay                             │
    │ complexity_latency_mismatch             │
    └─────────────┬────────────────────────────┘
                  │
                  ▼
    ┌──────────────────────────────────┐
    │ route() decision engine          │
    │ (probe_strategy.py)              │
    │ Returns: action (PROBE/MOVE_ON)  │
    │ Returns: mode (ownership/depth/) │
    └─────────────┬────────────────────┘
                  │
                  ▼
    ┌──────────────────────────────────────────┐
    │ Trust engine (trust_engine.py)           │
    │                                          │  ← Layer 3 & 4:
    │ Apply signal score_delta to bucket       │     Deep/specific/surface answers
    │ Check for recovery conditions            │     Recovery signals
    │ (ownership_clarified, example_given)     │
    │ Recompute overall trust_score            │
    └─────────────┬────────────────────────────┘
                  │
                  ▼
    ┌──────────────────────────────────┐
    │ build_directive()                │
    │ Inject next turn instruction     │
    │ (probe family + goal)            │
    └──────────────────────────────────┘
                  │
                  ▼
         Next candidate response
```

---

## Now: Answer Your 3 Research Questions

---

# Question 1: If We Disable Proctoring Signals in Super Admin, Will They Work in Interview?

**Answer: NO. They will not fire.**

**Why:**

Proctoring signals are **code-level detectors** in `turn_decision.py`. They fire ONLY if enabled in `evaluation_signal_toggles` dictionary.

**Flow:**

```python
# In turn_evaluator.py line 117-121
signal_events = detect_signal_events(...)  # Detectors run

signal_events = [
    event
    for event in signal_events
    if _is_signal_enabled(signal_toggles, str(event.get("signal_name", "")))
]
# ← Events are FILTERED OUT if toggle=False
```

**If super admin disables all 9 proctoring signals:**

```python
evaluation_signal_toggles = {
    "ownership_ambiguity": False,
    "example_evasion": False,
    "follow_up_collapse": False,
    "latency_mismatch": False,
    "resume_claim_mismatch": False,
    "contradiction": False,
    "depth_decay": False,
    "complexity_latency_mismatch": False,
}
```

**Consequence:**

```python
# All 9 signals fire normally (detection logic runs)
signal_events = [ownership_ambiguity, example_evasion, follow_up_collapse, ...]

# But then filtering happens
signal_events = [
    event for event in signal_events
    if _is_signal_enabled(signal_toggles, event["signal_name"])
]
# Result: signal_events = []  ← ALL FILTERED OUT
```

**Interview Effect:**

- Signals don't reach routing layer
- `route()` receives empty signal_flags
- Routes to LLM decision only (ignores all signal patterns)
- Trust engine gets no signal events
- Trust updates happen ONLY from quality scores

**Result: Interview continues, but signal-driven behavior is disabled.**

---

# Question 2: If We Disable All Signals, How Does Interview Work?

**Answer: Interview still works, but becomes weaker and less intelligent.**

**Scenario: All signals disabled**

```python
evaluation_signal_toggles = {
    "ownership_ambiguity": False,
    "example_evasion": False,
    "follow_up_collapse": False,
    "latency_mismatch": False,
    "resume_claim_mismatch": False,
    "contradiction": False,
    "depth_decay": False,
    "complexity_latency_mismatch": False,
}
```

**Real Example Interview:**

```
OPENING (Turns 1-2)
├─ Turn 1: "How are you doing?"
│  └─ Warmup, no evaluation
│
└─ Turn 2: Ishita shares 1-2 lines, warmup complete

CORE INTERVIEW (Turn 3+)

Turn 3: Q: "Tell me about your biggest technical achievement"
A: "I led the redesign of our payment system. Migrated monolith to microservices. 
   I owned schema design, data migration, indexing. 60% latency cut."

Evaluation:
  - clarity: 8.5 ✓
  - depth: 8.5 ✓
  - specificity: 8.0 ✓
  - grounding: 8.5 ✓
  - overall: 8.375 (high quality)

Signal Detection (WITH SIGNALS):
  ✓ Ownership? we_count=0, i_count=5 → NO
  ✓ Example evasion? Not asking for example → NO
  ✓ Follow-up collapse? First answer → NO
  → No signals fire
  
Signal Detection (ALL SIGNALS DISABLED):
  [All detectors run but all filtered out]
  → signal_events = []

Trust Update (WITH SIGNALS):
  quality: +0.04 (deep_answer: depth >= 7.5)
  total_delta: +0.04

Trust Update (ALL DISABLED):
  quality: +0.04 (deep_answer: depth >= 7.5)
  signal_events: [] (no signal penalties)
  total_delta: +0.04
  [Same result, no signal effects]

Routing (WITH SIGNALS):
  - topic_follow_up_count=0 < 2 ✓
  - signals: {} (empty, no signal-driven routing)
  - LLM decision: "PROBE" (good answer, go deeper)
  → Action: PROBE, mode: depth

Routing (ALL DISABLED):
  - topic_follow_up_count=0 < 2 ✓
  - signals: {} (empty - same)
  - LLM decision: "PROBE" (good answer, go deeper)
  → Action: PROBE, mode: depth
  [Same routing, because no signal was fired anyway]

---

Turn 4: Q: "Can you walk me through the database migration?"
A: "We did the migration. Used Postgres. It was complex. That's basically it."

Evaluation:
  - clarity: 2.5 (vague)
  - depth: 2.0 (no details)
  - specificity: 1.5 (generic)
  - grounding: 2.0 (no ownership)
  - overall: 2.0 (weak)

Signal Detection (WITH SIGNALS):
  ✓ Follow-up collapse? first=8.5, current=2.0, drop=6.5, type=complete → YES (confidence 0.95)
  ✓ Latency mismatch? follow-up, compressed to 15 words, drop=6.5 → YES (confidence 0.88)
  → signal_events = [follow_up_collapse, latency_mismatch]
  
Signal Detection (ALL DISABLED):
  ✓ Follow-up collapse fires but filtered out
  ✓ Latency mismatch fires but filtered out
  → signal_events = [] (empty after filter)

Trust Update (WITH SIGNALS):
  quality: -0.02 (surface_answer: < 4.0)
  signal_events: [
    follow_up_collapse: -0.20,
    latency_mismatch: -0.10
  ]
  total_delta: -0.02 + -0.20 + -0.10 = -0.32 (RED FLAG)

Trust Update (ALL DISABLED):
  quality: -0.02 (surface_answer: < 4.0)
  signal_events: [] (no signal deltas)
  total_delta: -0.02 (weak penalty)

Routing (WITH SIGNALS):
  - topic_follow_up_count=1 < 2 ✓
  - signals.follow_up_collapse=True ✓ (hit!)
  - Route to follow_up_collapse_staged
  → Action: PROBE, mode: follow_up_collapse_staged
  → Directive: "FOLLOW-UP COLLAPSE DETECTED. Run L1 memory probe."

Routing (ALL DISABLED):
  - topic_follow_up_count=1 < 2 ✓
  - signals: {} (empty)
  - No signal routing
  - LLM decision: "PROBE" (weak answer, needs follow-up)
  → Action: PROBE, mode: [generic, not collapse-specific]
  → Directive: Generic probe, not escalated

---

Turn 5 Response (WITH SIGNALS):
Ishita: "Can you walk me through that part in more detail?"
(Specific L1 collapse probe)

Turn 5 Response (ALL DISABLED):
Ishita: "Tell me more about that migration."
(Generic follow-up, not escalated)

---

Candidate: "Uh, still vague, no recovery."
→ depth: 2.5 (still collapsed)

Trust Update (WITH SIGNALS):
  signal_events = [follow_up_collapse again, stage=1 now]
  score_delta: -0.38 (repeated collapse, non-recoverable)
  collapse_stage advances to 1
  total_delta: -0.38

Trust Update (ALL DISABLED):
  signal_events = []
  quality_delta: -0.02 (surface)
  total_delta: -0.02
  [Candidate looks equally bad, but no signal-driven penalty]

---

Turn 6 (WITH SIGNALS):
Topic follow-up count = 2 (hit hard cap)
Action = MOVE_ON (forced by hard cap)
Directive: "CANDIDATE FAILED TO RECOVER. Non-recoverable collapse pattern. 
            MOVE_ON to completely different area."

Turn 6 (ALL DISABLED):
Topic follow-up count = 2 (hit hard cap)
Action = MOVE_ON (forced by hard cap)
Directive: "Topic covered. Move to next area."
[Same action, different reasoning]

---

OVERALL INTERVIEW STATISTICS:

WITH SIGNALS:
  Turn 3 answer quality: 8.5 → trust_delta: +0.04
  Turn 4 answer quality: 2.0 + collapse signal → trust_delta: -0.32 (RED)
  Turn 5 answer quality: 2.5 + collapse stage 1 → trust_delta: -0.38 (CRITICAL)
  Turn 6: FORCED MOVE_ON due to hard cap
  
  Final signals fired: 2 collapse, 1 latency_mismatch, 0 recovery
  Final trust score: 0.32 (CRITICAL band)
  Interview stops or continues with extreme caution

WITHOUT SIGNALS:
  Turn 3 answer quality: 8.5 → trust_delta: +0.04
  Turn 4 answer quality: 2.0 (no signal penalty) → trust_delta: -0.02 (MILD)
  Turn 5 answer quality: 2.5 (no signal penalty) → trust_delta: -0.02 (MILD)
  Turn 6: FORCED MOVE_ON due to hard cap
  
  Final signals fired: 0
  Final trust score: 0.42 (MEDIUM band, looks better than it is)
  ⚠️ PROBLEM: Interview looks normal, but candidate is cheating/inflating
```

**Key Difference:**

- **WITH SIGNALS**: Trust drops 0.32 → 0.38 on weak follow-ups. Red flag visible.
- **WITHOUT SIGNALS**: Trust drops 0.02 → 0.02 on weak follow-ups. Green flag.
- **Same interview, opposite trust outcome.**

**Interview still works:**
- ✅ Hard cap enforces topic coverage (max 2 follow-ups)
- ✅ Quality scores still evaluated
- ✅ Report still generated
- ❌ But red flags (collapse, evasion, contradiction) are invisible
- ❌ Trust score is inflated
- ❌ Hiring decision becomes risky

---

# Question 3: If We Disable 4-5 Signals, How Does It Work?

**Answer: Interview becomes partially blind to specific pattern types.**

**Scenario: Disable these 5 signals**

```python
evaluation_signal_toggles = {
    "ownership_ambiguity": False,      # ← DISABLED
    "example_evasion": False,          # ← DISABLED
    "follow_up_collapse": False,       # ← DISABLED (CRITICAL!)
    "latency_mismatch": False,         # ← DISABLED
    "resume_claim_mismatch": True,     # Enabled
    "contradiction": True,             # Enabled
    "depth_decay": True,               # Enabled
    "complexity_latency_mismatch": True, # Enabled
}
```

**What Happens:**

```
PATTERN 1: CANDIDATE WITH OWNERSHIP AMBIGUITY
─────────────────────────────────────────────

WITH ownership_ambiguity enabled:
Q: "Tell me about your biggest project"
A: "We built the system. We did great work. Our team handled everything."
→ Signal fires: ownership_ambiguity (-0.15 trust penalty)
→ Directive: "What specifically did YOU do?"
→ Ishita asks direct question about personal contribution

WITH ownership_ambiguity DISABLED:
Same answer, same question
→ Signal fires but FILTERED OUT
→ No routing to ownership probe
→ Ishita uses LLM judgment: might ask follow-up, might move on
→ Candidate can hide lack of personal ownership
→ Trust: no penalty, looks normal
❌ PROBLEM: Can't distinguish team contributors from individual drivers


PATTERN 2: CANDIDATE WITH FOLLOW-UP COLLAPSE
──────────────────────────────────────────────

WITH follow_up_collapse enabled:
Turn 3: "I led the project. 6 months, 60% improvement, specific details"
        → depth: 8.5
Turn 4: "Walk me through it"
A: "Uh, we... we did it. It was complex."
        → depth: 2.0

→ Signal fires: follow_up_collapse (confidence 0.95, -0.20 penalty)
→ Directive: L1 staged probe: "Can you walk me through it more specifically?"
→ If still weak: L2 probe: "What was YOUR role vs team?"
→ If still weak: L3 probe: "Tell me one specific day this happened"
→ Trust penalized heavily
→ DIAGNOSIS: Candidate inflated initial answer or is guessing

WITH follow_up_collapse DISABLED:
Same scenario
→ Signal fires but FILTERED OUT
→ No collapse-specific routing
→ Ishita uses generic follow-up: "Tell me more"
→ Candidate still can't recover, but no escalation
→ Trust: only -0.02 from surface answer (not -0.20 from collapse signal)
→ Candidate looks better than reality
❌ PROBLEM: Can't detect inflated resumes or guessing under pressure
             Interview treats single weak answer same as collapsed answers


PATTERN 3: CANDIDATE WITH EXAMPLE EVASION
──────────────────────────────────────────

WITH example_evasion enabled:
Q: "Tell me about a time you debugged a complex production issue"
A: "Generally, the approach is to use systematic debugging. You should profile...
   Usually you check logs. The best practice is to isolate..."
→ Signal fires: example_evasion (-0.15 penalty, confidence 0.78)
→ Routing: PROBE to evidence family
→ Directive: "Give me a specific example of when this actually happened"
→ Ishita: "So walk me through a specific incident. What was the issue?"

WITH example_evasion DISABLED:
Same answer
→ Signal fires but FILTERED OUT
→ No evidence-routing probe
→ Ishita uses LLM judgment
→ Might say: "What debugging approaches do you use?"
→ Candidate can keep being theoretical
→ Trust: only quality hit, no signal penalty
❌ PROBLEM: Can't force candidates to back claims with real examples
             Theoretical knowledge indistinguishable from hands-on experience


COMBINED EFFECT OF DISABLING 5 SIGNALS:
────────────────────────────────────────

Interview becomes blind to:
  1. Ownership vs team-credit confusion (cannot calibrate on personal contribution)
  2. Resume inflation / guessing (collapse signal is THE strongest red flag)
  3. Theoretical answers without evidence (evasion pattern undetected)
  4. Answer compression / rushing (latency_mismatch silent)
  5. Team language patterns (ownership_ambiguity silent)

But still catches:
  ✓ Resume claim mismatches (if claims made)
  ✓ Direct contradictions (if candidate contradicts themselves)
  ✓ Cross-topic fatigue (depth_decay still fires)
  ✓ AI-assisted answers (complexity_latency_mismatch still fires)
  ✓ Meta questions (if candidate asks "are you there?")

TRUST IMPACT:

WITH 9 SIGNALS: Full trust model
  Candidate inflates resume, trust drops 0.38 immediately
  
WITHOUT 5 KEY SIGNALS: Weak trust model
  Same candidate, trust drops 0.02 (barely noticed)
  Hiring decision: "Looks okay, 65% trust"
  
ACTUAL INTERVIEW QUALITY: The same bad candidate
TRUST SCORE: Inflated by 0.36 points
❌ RESULT: Bad hire with false confidence
```

---

## Summary Table: 25 Signals & Their Effects

| # | Signal | Layer | Enabled? | Fires When? | Trust Impact | If Disabled |
|---|--------|-------|----------|------------|-------------|-----------|
| 1 | ownership_ambiguity | Proctoring | Toggle | "we" ≥2, "i" ≤1 | -0.15 BC | Can't detect team-vs-personal |
| 2 | example_evasion | Proctoring | Toggle | Example asked but theory given | -0.15 BC | Theoretical answers pass as knowledge |
| 3 | resume_claim_mismatch | Proctoring | Toggle | Generic claim + weak grounding | -0.12 BC | Can't catch resume inflation |
| 4 | follow_up_collapse | Proctoring | Toggle | First ≥6, follow-up ≤3, drop ≥6.5 | -0.20/-0.38 BC | **CRITICAL: Can't catch guessing** |
| 5 | latency_mismatch | Proctoring | Toggle | Follow-up too compressed | -0.10 BC | Can't detect rushed answers |
| 6 | contradiction | Proctoring | Toggle (disabled) | Conflict with resume/prior claim | -0.40 HI | Can't catch inconsistencies |
| 7 | depth_decay | Proctoring | Toggle | Cross-topic quality drop ≥1.2 | -0.06/-0.12 IQ | Can't detect fatigue |
| 8 | complexity_latency_mismatch | Proctoring | Toggle | Fast complex or slow simple timing | -0.14/-0.08 BC | Can't detect AI-assisted answers |
| 10 | tab_switch | Browser | Fixed | Tab switches detected | -0.03 HI | Can't track cheating behavior |
| 11 | face_absent | Browser | Fixed | Face not in frame ≥1.2s | -0.03 HI | Can't track attention |
| 13 | multiple_faces | Browser | Fixed | 2+ faces detected | -0.15 HI | **Can't catch collab cheating** |
| 14 | deep_answer | Quality | Automatic | depth ≥ 7.5 | +0.04 IQ | Can't reward deep answers |
| 15 | specific_answer | Quality | Automatic | overall ≥6, specificity ≥7 | +0.02 IQ | Can't reward details |
| 16 | surface_answer | Quality | Automatic | overall < 4.0 | -0.02 IQ | Works (automatic) |
| 17 | very_surface_answer | Quality | Automatic | overall < 2.5 | -0.04 IQ | Works (automatic) |
| 18 | ownership_clarified | Recovery | Toggle | ownership fired last, doesn't now | +0.05 BC | Can't reward recovering |
| 19 | example_given | Recovery | Toggle | evasion fired last, doesn't now | +0.04 BC | Can't reward providing examples |
| 20 | strong_under_pressure | Recovery | Toggle | Probed last turn, good answer now | +0.05 BC | Can't reward handling pressure |
| 21 | contradiction_detected | System | Toggle (disabled) | External claim extraction | Varies | Works if enabled |
| 22 | answer_surface | System | Automatic | Tracking flag | Internal | Works |
| 23 | Hard cap enforcement | System | Fixed | topic_follow_up_count ≥ 2 | Action=MOVE_ON | Works always |
| 24 | Trend tracking | System | Automatic | Score history analysis | Varies | Works always |
| 25 | Trust score computation | System | Automatic | Bucket weighting | Varies | Works always |

**Legend:**
- BC = behavioral_confidence bucket
- IQ = intelligence_quality bucket
- HI = hard_integrity bucket
- Toggle = Can be disabled in super admin
- Fixed = Always active (browser/system)
- Automatic = No toggle needed

---

## Conclusion

**Question 1:** Disable proctoring signals → They won't fire at all.
**Question 2:** Disable all signals → Interview still works but trust scores are inflated & red flags invisible.
**Question 3:** Disable 5 signals → Interview becomes blind to ownership, collapse, evasion, compression patterns. Risky hiring decisions.
