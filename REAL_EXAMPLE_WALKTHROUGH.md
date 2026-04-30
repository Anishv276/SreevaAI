# Real Interview Example: Complete Walkthrough with Code

## Candidate: Raj Kumar
- **Background**: 6 years as Full Stack Engineer (Node.js, React, AWS)
- **Applying for**: Senior Backend Engineer role
- **JD requires**: Distributed systems, database design, API architecture, team leadership
- **Time limit**: 20 minutes

---

# PHASE 1: SETUP (Before Interview Starts)

## Resume Analysis
```
Raj's Resume:
- Acme Corp (2018-2024, 6 years)
  - Built microservices for payment processing
  - Used Node.js, PostgreSQL, AWS Lambda, Redis
  - "Led a team of 2 junior engineers"
  - "Reduced API response time from 500ms to 50ms"

Experience level: mid (6 years is 1.5-10 range)
```

## JD vs Resume Match
```
JD says: "distributed systems, database design, API architecture"

Resume has:
  ✅ Microservices (shows distributed thinking)
  ✅ PostgreSQL (database)
  ✅ AWS Lambda (distributed compute)
  ❌ No mention of Kubernetes, containers
  ❓ Leadership mentioned but only "2 junior engineers"
  ❓ No incident response, debugging stories

Coverage checklist built:
  1. API Architecture & Design
  2. Database Scaling (PostgreSQL experience)
  3. Microservices / Distributed Systems
  4. Leadership & Mentoring
  5. Performance Optimization (he mentions 500ms → 50ms)
  6. Testing & Code Quality
  7. Handling Incidents / Production Issues
```

## System State Before Interview Starts
```python
# File: agent_runtime.py, lines 561, 987-990

follow_up_depth = 3  # From DB config

# Warmup tracking (BUG 5 FIX - NEW)
warmup_responses_received = 0
warmup_complete = False

# Turn counting
turn_count = 0  # Ishita's turns
```

## System Prompt Injection
```
Chat context receives (in order):

[1] Main system prompt (500 lines)
    - Candidate name: Raj Kumar
    - Band: mid
    - Depth instruction: "Balance breadth and depth..."

[2] [FIRST TWO TURNS — CONVERSATIONAL WARMUP]
    "Turn 1: Warm greeting like you're catching up..."
    
[3] [INTERVIEW PIVOT — AFTER TURN 2]
    "After turn 2, transition smoothly and naturally..."

[4] NOT YET: Candidate brief (waits for warmup_complete=True)
```

---

# TURN 1: WARMUP GREETING

## What Ishita Says
```
"Hey Raj! Thanks so much for taking the time today. 
How are you doing? How's everything going on your end?"
```

## Behind the Scenes
```python
# File: agent_runtime.py, line 1695 (on_conversation_item_added)

# Turn counter: Ishita's turn (role="assistant")
# turn_count increments AFTER Ishita finishes speaking
# Not relevant yet for candidate response
```

---

# TURN 2: FIRST CANDIDATE RESPONSE (warmup_responses_received = 1)

## What Raj Says
```
"Hi! I'm doing well, thanks for having me. 
I'm excited to chat about this opportunity. 
How are you?"
```

## System Processing
```python
# File: agent_runtime.py, lines 1694-1708 (on_conversation_item_added)

if role == "user":  # This is a candidate response
    _answer_received_at = time.perf_counter()
    
    # BUG 5 FIX: Check warmup state
    if not warmup_complete:
        warmup_responses_received += 1  # 0 → 1
        if warmup_responses_received >= 2:
            warmup_complete = True  # Not yet!
    
    # Background task to process answer
    spawn_background_task(
        _process_user_conversation_item(...),
        "process_user_turn_0"
    )

# Append to transcript
append_transcript_line("Candidate", "Hi! I'm doing well...")
```

**State after Turn 2:**
```
warmup_responses_received = 1
warmup_complete = False  ← Still waiting for 2nd response
turn_count = 1
```

---

# TURN 3: ISHITA RESPONDS (warmup turn 2)

## What Ishita Says
```
"Great! I'm doing well too. I'm based in California, 
and I always like to get to know people first. 
Where are you calling in from?"
```

---

# TURN 4: SECOND CANDIDATE RESPONSE (warmup_responses_received = 2)

## What Raj Says
```
"I'm in Boston, Massachusetts. 
Been in tech for about 6 years now. 
It's a great hub for startups and established companies."
```

## System Processing
```python
# File: agent_runtime.py, lines 1694-1708 (on_conversation_item_added)

if role == "user":  # Candidate response again
    _answer_received_at = time.perf_counter()
    
    if not warmup_complete:
        warmup_responses_received += 1  # 1 → 2
        if warmup_responses_received >= 2:
            warmup_complete = True  # ✅ NOW TRUE!
    
    spawn_background_task(...)

append_transcript_line("Candidate", "I'm in Boston...")
```

**State after Turn 4:**
```
warmup_responses_received = 2
warmup_complete = True  ← ✅ WARMUP COMPLETE!
turn_count = 2
```

## What Happens Now
```
The attach_brief_when_ready() coroutine fires:
  → Checks if warmup_complete (YES)
  → Injects the candidate brief with:
     * Smart opening question
     * Coverage checklist
     * Resume-JD gaps to probe
     * Quick probes for specific resume items
```

---

# TURN 5: WARMUP COMPLETE → PIVOT TO REAL INTERVIEW

## What Ishita Says (Natural Bridge)
```
"That makes sense — Boston's a great market. 
So let me dig into your background. 

I see you spent 6 years at Acme building microservices. 
Tell me about a specific API you designed and built — 
what problem were you solving, and how did you architect it?"
```

**This is the FIRST REAL INTERVIEW QUESTION** (not counted as warmup)

## What Raj Says
```
"Yeah, so we built an internal API for our payment microservice. 
The main requirement was to handle millions of requests per day 
with strict latency requirements — P99 had to be under 100ms.

We designed it using Node.js with Express, and hit a performance wall 
when we went to production. Initial response times were around 400-500ms 
for complex queries.

The issue was we were doing N+1 database queries — every request to fetch 
a payment would trigger 5-10 child queries to fetch related data.

So we added Redis caching layer in front of PostgreSQL. 
We cached the hot payment objects with a 5-minute TTL, 
and for misses we'd go to the database. 
After that, P99 dropped to under 50ms.

We also added a background job queue to defer non-critical work 
like audit logging and webhooks, so the main API response wasn't blocked."
```

---

# REAL-TIME EVALUATION (FIRST REAL QUESTION)

## Step 1: Quality Scoring (Lines 12-130 of agent_scoring.py)

```python
async def score_answer_quality(
    candidate_answer=Raj's full response,
    last_question="Tell me about a specific API you designed...",
    transcript_lines=[...],
    client=OpenAI client,
):
```

**LLM Call to Score:**
```
System prompt:
"Score a candidate's interview answer on 4 dimensions (0-10 each).
Output ONLY valid JSON with these exact fields:
{
  "clarity": 0-10,
  "depth": 0-10,
  "specificity": 0-10,
  "grounding": 0-10,
  "signals": [...],
  "concerns": [...]
}"

SCORING GUIDE:
clarity (0-10): How easy to understand?
  0-2: Rambling, incoherent, hard to follow
  3-5: Somewhat clear but has issues
  6-8: Clear and well-structured
  9-10: Crystal clear, perfectly articulated

depth (0-10): How much reasoning/thinking shown?
  0-2: Surface-level, pure facts
  3-5: Some reasoning but shallow
  6-8: Good reasoning, explores tradeoffs
  9-10: Deep thinking, systems thinking

specificity (0-10): Real names, numbers, dates, examples?
  0-2: All generic
  3-5: Some specifics
  6-8: Named real projects, companies
  9-10: Heavily grounded

grounding (0-10): Tied to real experience vs theory?
  0-2: Theoretical
  3-5: Mix of theory and real experience
  6-8: Clearly from real work
  9-10: Rich textured description
```

**LLM Returns:**
```json
{
  "clarity": 8,
  "depth": 7,
  "specificity": 9,
  "grounding": 8,
  "signals": ["has_numbers", "has_names", "has_reasoning", "has_ownership"],
  "concerns": []
}
```

**Calculation:**
```
overall = (8 + 7 + 9 + 8) / 4 = 8.0
```

## Step 2: Signal Detection (Lines 693-750 of turn_decision.py)

```python
signal_events = detect_signal_events(
    candidate_answer=Raj's response,
    last_question="Tell me about a specific API...",
    current_depth=8.0,
    prior_depth_scores=[],  # Empty (first answer on API topic)
    topic_follow_up_count=0,  # First answer, not follow-up
    contradiction_detected=False,
    collapse_stage=0,
    session_score_history=[8.0],
    turns_since_last_decay=999,
    response_latency_sec=5.2,
)

# Check each detector:
```

**Detector 1: ownership_ambiguity** (Lines 168-210)
```python
# Looks for heavy "we" language with no personal "I"
# Raj said: "we built", "we cached", "we also added"
# But also: "We designed", and mentions personal understanding

# Result: ❌ No signal (balanced ownership language)
```

**Detector 2: example_evasion** (Lines 212-265)
```python
# Check if question asked for example + answer stayed theoretical
# Question: "Tell me about a specific API you designed"
# Answer: Very specific (Redis, Node.js, Express, 400-500ms → 50ms)

# Result: ❌ No signal (specific example provided)
```

**Detector 3: follow_up_collapse** (Lines 303-367)
```python
# Lines 324-325:
if topic_follow_up_count < 1 or not prior_depth_scores:
    return None  # Skip if no follow-up yet

# Current: topic_follow_up_count = 0
# Result: ❌ No signal (this is first answer, not follow-up)
```

**Detector 4: depth_decay** (Lines 476-538)
```python
# Checks cross-topic quality degradation
# Needs session_score_history with at least _DECAY_WINDOW=3 scores
# Current: session_score_history = [8.0] (only 1 score)

# Line 501-502:
if len(session_score_history) < _DECAY_WINDOW:
    return None

# Result: ❌ No signal (not enough history yet)
```

**Detector 5: complexity_latency_mismatch** (Lines 586-664)
```python
# Checks: complex question answered too fast (AI-read pattern)
#     OR: simple question answered too slow (lookup pattern)
# Question: "Tell me about a specific API" = complex (behavioral)
# Response time: 5.2 seconds
# Answer length: 189 words
# 
# _CLM_FAST_COMPLEX_SEC = 5.5 seconds
# 5.2 < 5.5? YES, but difference is small
#
# confidence = min(0.92, 0.62 + (5.5-5.2)*0.06)
#            = min(0.92, 0.62 + 0.018)
#            = 0.638
#
# Since confidence < threshold for alarm, doesn't fire

# Result: ❌ No signal (response time reasonable)
```

**Final Signal Events:**
```python
signal_events = []  # ✅ Clean answer, no red flags
```

## Step 3: Route Decision (agent_scoring.py:133-210)

```python
async def evaluate_answer_and_decide(
    candidate_answer=Raj's response,
    last_question="Tell me about a specific API...",
    topic_follow_up_count=0,
    transcript_lines=[...],
    client=OpenAI client,
):
```

**LLM Call:**
```
System prompt:
"You are an interview quality evaluator. Analyze a candidate's answer 
and decide whether the interviewer should probe deeper or move to the next topic.

Output ONLY valid JSON:
{
  "action": "PROBE" or "MOVE_ON",
  "probe_mode": "ownership|evidence|compression|depth|verification|...",
  "reason": "one short sentence",
  "depth_signal": "SURFACE|SPECIFIC|DEEP"
}

MOVE_ON when: answer has real specifics, clear reasoning, 
  OR topic already had 3+ follow-ups
  
PROBE when: answer is vague, generic, no real example, 
  uses only 'we' with no personal ownership, or sounds rehearsed"

User message:
"QUESTION ASKED: Tell me about a specific API you designed and built...
CANDIDATE ANSWER: Yeah, so we built an internal API...
FOLLOW-UPS ALREADY ASKED ON THIS TOPIC: 0
RECENT CONVERSATION: [transcript]"
```

**LLM Returns:**
```json
{
  "action": "PROBE",
  "probe_mode": "depth",
  "reason": "Answer has specifics and ownership, but didn't discuss tradeoff decisions or failure recovery",
  "depth_signal": "SPECIFIC"
}
```

## Step 4: Build Trust Delta

```python
def compute_trust_delta(
    signal_events=[],  # No signals
    quality={"clarity": 8, "depth": 7, "specificity": 9, "grounding": 8},
):
    delta = 0.0
    reasons = []
    
    # No negative signals
    for event in signal_events:
        delta += event["score_delta"]
        # (none)
    
    # Quality bonus
    avg_quality = (8 + 7 + 9 + 8) / 4 = 8.0
    if avg_quality >= 7.5:
        delta += 0.2  # ✅ High-quality bonus
        reasons.append("high-quality detailed answer")
    
    return {
        "delta": 0.2,
        "reason": "high-quality detailed answer"
    }
```

## Step 5: Build Directive (probe_strategy.py:185+)

```python
def build_directive(
    action="PROBE",
    probe_mode="depth",
    signal_events=[],
    depth_signal="SPECIFIC",
):
    # _PROBE_FAMILIES["depth"] gives:
    probe_family = {
        "goal": "Go one level deeper on the real decision, tradeoff, or failure story.",
        "style": "Use when the answer is already substantive but not yet fully tested.",
        "starters": [
            "What was the hardest part of that...",
            "What would have broken if you'd made a different call there?",
            "What did you get wrong before you got it right?",
        ]
    }
    
    # Build the directive text:
    directive = (
        "[NEXT_TURN_DIRECTIVE]\n"
        "PROBE MODE: depth\n\n"
        f"Goal: {probe_family['goal']}\n"
        f"Style: {probe_family['style']}\n\n"
        "Ask: 'You mentioned dropping from 400-500ms to 50ms. "
        "What was the hardest part about diagnosing that N+1 problem? "
        "Like, did you immediately know it was the database, or did you have to chase it?'\n\n"
        "If strong, next topic can be database scaling. "
        "If weak, probe memory of the debugging process."
    )
```

---

# TURN 6: DEPTH PROBE (FOLLOW-UP #1)

## What Ishita Says
```
"That's a solid approach. So you mentioned the N+1 query problem — 
that's a classic. What was the hardest part about diagnosing that? 
Did you immediately know it was the database, or did you have to trace through it?"
```

## What Raj Says
```
"So initially I didn't realize it was N+1. We just saw that requests 
were slow, and I thought maybe it was the Redis connection pool or something. 
We added some logging and started tracing requests.

After about an hour of debugging, we saw that every GET /payment/:id call 
was spawning multiple database queries. Once we identified it, the fix was 
pretty straightforward — we just added Redis caching and batched the lookups."
```

---

# EVALUATION: FOLLOW-UP #1 (THIS IS WHERE BUG FIXES KICK IN!)

## Quality Scoring

```python
# Same LLM process as before
quality = {
    "clarity": 6,  # Somewhat clear but jumps quickly
    "depth": 5,    # Mentions debugging but light on detail
    "specificity": 4,  # "about an hour", "some logging" are vague
    "grounding": 5,    # References real experience but lacks specifics
}

overall = (6 + 5 + 4 + 5) / 4 = 5.0
```

## Signal Detection (THE BUG FIXES MATTER HERE!)

```python
signal_events = detect_signal_events(
    candidate_answer=Raj's follow-up,
    last_question="What was the hardest part about diagnosing...",
    current_depth=5.0,  # THIS FOLLOW-UP IS 5.0
    prior_depth_scores=[8.0],  # FIRST ANSWER WAS 8.0
    topic_follow_up_count=1,  # THIS IS THE 1ST FOLLOW-UP
    contradiction_detected=False,
    collapse_stage=0,
    response_latency_sec=3.8,
)
```

### BUG 1 FIX: follow_up_collapse Detection (Lines 303-367)

```python
def _detect_follow_up_collapse_event(...):
    # Line 324-325: Check if this is a follow-up
    if topic_follow_up_count < 1 or not prior_depth_scores:
        return None
    
    # topic_follow_up_count = 1 ✅ YES, it's a follow-up
    # prior_depth_scores = [8.0] ✅ YES, we have history
    
    # Line 327-330: Get first answer depth
    first_answer_depth = (
        prior_depth_scores[-topic_follow_up_count]  # -1
        if len(prior_depth_scores) > topic_follow_up_count
        else prior_depth_scores[0]
    )
    # first_answer_depth = prior_depth_scores[0] = 8.0
    
    drop = first_answer_depth - current_depth = 8.0 - 5.0 = 3.0
    
    # Line 334-342: Check collapse tier
    if first_answer_depth < 6.0:
        return None  # 8.0 >= 6.0, so continue
    
    if current_depth <= 3.0:
        collapse_type = "complete"  # 5.0 > 3.0, so no
    elif current_depth <= 5.0 and drop >= 2.0:
        collapse_type = "partial"  # 5.0 <= 5.0? YES and 3.0 >= 2.0? YES
        # ✅ PARTIAL COLLAPSE DETECTED
    else:
        return None
    
    # Lines 345-352: Confidence & score
    if collapse_stage >= 1:
        # Not repeated yet, so skip this
        pass
    else:
        confidence = min(0.95, 0.65 + (drop * 0.05))
                   = min(0.95, 0.65 + (3.0 * 0.05))
                   = min(0.95, 0.80)
                   = 0.80
        score_delta = -0.20  # partial collapse
        is_recoverable = True
    
    # Lines 354-367: Build signal event
    return _build_signal_event(
        signal_name="follow_up_collapse",
        signal_layer="hard_integrity",
        confidence=0.80,
        evidence=(
            f"partial collapse: first=8.0 "
            f"follow-up=5.0 drop=3.0 stage=0"
        ),
        trust_bucket_affected="behavioral_confidence",  # ✅ BUG 1 FIXED!
        # Was: "competency_authenticity" (doesn't exist!)
        # Now: "behavioral_confidence" (correct bucket)
        score_delta=-0.20,
        probe_mode="follow_up_collapse_staged",
        recoverable=True,
        recruiter_visible=True,
    )
```

**Result: SIGNAL FIRED ✅**
```python
signal_events = [
    {
        "signal_name": "follow_up_collapse",
        "trust_bucket_affected": "behavioral_confidence",
        "score_delta": -0.20,  # ← Will be applied to correct bucket!
        "confidence": 0.80,
        "evidence": "partial collapse: first=8.0 follow-up=5.0 drop=3.0 stage=0"
    }
]
```

## Route Decision

```python
evaluate_answer_and_decide(...):
    # LLM says:
    {
        "action": "PROBE",
        "probe_mode": "follow_up_collapse_staged",  # Because of signal!
        "reason": "Depth dropped from 8.0 to 5.0 — recover with memory probe",
        "depth_signal": "SURFACE"
    }
```

## BUG 2 FIX: Signal Routing (probe_strategy.py:91-99)

```python
_SIGNAL_TO_FAMILY = [
    ("contradiction", "clarification"),
    ("follow_up_collapse", "follow_up_collapse_staged"),
    ("resume_claim_mismatch", "evidence"),
    ("example_evasion", "evidence"),
    ("latency_mismatch", "compression"),
    ("ownership_ambiguity", "ownership"),
    ("meta_question", "rapport"),
    ("depth_decay", "depth"),  # ✅ BUG 2 FIXED!
    ("complexity_latency_mismatch", "evidence"),  # ✅ BUG 2 FIXED!
]

# Now when route() checks signals:
signal_detected = "follow_up_collapse"
probe_family = "follow_up_collapse_staged"  # Routed correctly!

# Before fix: "depth_decay" would fire but NOT be in this dict
# → would not trigger PROBE → signal wasted
```

## Trust Delta Calculation

```python
compute_trust_delta(
    signal_events=[
        {
            "signal_name": "follow_up_collapse",
            "score_delta": -0.20,
            "trust_bucket_affected": "behavioral_confidence"
        }
    ],
    quality={"clarity": 6, "depth": 5, "specificity": 4, "grounding": 5},
):
    delta = 0.0
    reasons = []
    
    # Apply signal deltas
    for event in signal_events:
        delta += event["score_delta"]  # delta = -0.20
        reasons.append(f"follow_up_collapse on behavioral_confidence")
    
    # Check quality
    avg_quality = (6+5+4+5)/4 = 5.0
    # 5.0 is not >= 7.5 and not <= 3.0, so no quality bonus/malus
    
    return {
        "delta": -0.20,
        "reason": "follow_up_collapse on behavioral_confidence"
    }
```

## Build Directive

```python
build_directive(
    action="PROBE",
    probe_mode="follow_up_collapse_staged",
):
    # Stage 0: L1 memory recovery probe
    directive = (
        "[NEXT_TURN_DIRECTIVE]\n"
        "PROBE MODE: follow_up_collapse_staged (L1 — memory recovery)\n\n"
        "Goal: Recover depth lost. Don't probe new concept, probe MEMORY.\n"
        "Style: Ask them to recall the exact moment, not explain concepts.\n\n"
        "Ask: 'Can you walk me through that in more detail? "
        "Like, do you remember a specific moment when you realized it was N+1? "
        "What did you see in the logs that tipped you off?'\n\n"
        "If this follows-up ALSO collapses, escalate to L2: ownership clarification."
    )
```

---

# TURN 7: FOLLOW-UP #2 (L1 STAGED RECOVERY)

## What Ishita Says
```
"Can you walk me through that in a bit more detail? 
Like, do you remember a specific moment when you realized it was N+1? 
What did you see in the logs that tipped you off?"
```

## What Raj Says
```
"Uh, I think we had some debug logging that showed the query count per request. 
After we added that, it was pretty obvious. 
I don't remember exactly what the logs showed, but it was clear there were 
way more queries than expected."
```

---

# EVALUATION: FOLLOW-UP #2 (COLLAPSE AGAIN!)

## Quality Scoring

```python
quality = {
    "clarity": 3,  # Vague, "I think", "I don't remember"
    "depth": 2,    # Surface level, no real memory
    "specificity": 1,  # "some debug logging", no details
    "grounding": 2,    # Sounds like recalling is hard
}

overall = (3+2+1+2)/4 = 2.0  # ← Significant drop!
```

## Signal Detection (CRITICAL: depth_decay potential!)

```python
# Before: depth_decay wasn't in _SIGNAL_TO_FAMILY (BUG 2)
# After: depth_decay IS in _SIGNAL_TO_FAMILY ✅ (BUG 2 FIXED!)

signal_events = detect_signal_events(
    candidate_answer=Raj's follow-up #2,
    current_depth=2.0,
    prior_depth_scores=[8.0, 5.0],
    topic_follow_up_count=2,  # Second follow-up
    collapse_stage=0,
    session_score_history=[8.0, 5.0, 2.0],
    turns_since_last_decay=999,
):
```

### follow_up_collapse Again

```python
# Lines 327-330:
first_answer_depth = prior_depth_scores[-2] = prior_depth_scores[0] = 8.0
drop = 8.0 - 2.0 = 6.0

# Line 337: current_depth = 2.0 <= 3.0? YES!
collapse_type = "complete"  # ← COMPLETE collapse now

confidence = min(0.95, 0.65 + (6.0 * 0.05))
           = min(0.95, 0.95)
           = 0.95

score_delta = -0.20 if collapse_type == "complete" else -0.12
            = -0.20

# SIGNAL #1: FOLLOW_UP_COLLAPSE (COMPLETE)
signal_1 = {
    "signal_name": "follow_up_collapse",
    "trust_bucket_affected": "behavioral_confidence",
    "score_delta": -0.20,
    "confidence": 0.95,
    "evidence": "complete collapse: first=8.0 follow-up=2.0 drop=6.0"
}
```

### depth_decay Detection (BUG 2 NOW WORKS!)

```python
# Lines 476-538:
# session_score_history = [8.0, 5.0, 2.0]
# _DECAY_WINDOW = 3

if len(session_score_history) < _DECAY_WINDOW:  # 3 < 3? NO
    return None  # Now we have enough history!

window = session_score_history[-3:] = [8.0, 5.0, 2.0]
mid = 3 // 2 = 1
first_half_avg = sum([8.0]) / 1 = 8.0
second_half_avg = sum([5.0, 2.0]) / 2 = 3.5
drop = 8.0 - 3.5 = 4.5

# Line 513-522:
if drop >= _DECAY_SEVERE_THRESHOLD (2.0):  # 4.5 >= 2.0? YES!
    severity = "severe"
    confidence = min(0.95, 0.70 + 4.5 * 0.04)
               = min(0.95, 0.88)
               = 0.88
    score_delta = -0.12

# SIGNAL #2: DEPTH_DECAY (SEVERE)
signal_2 = {
    "signal_name": "depth_decay",
    "trust_bucket_affected": "intelligence_quality",
    "score_delta": -0.12,
    "confidence": 0.88,
    "evidence": "severe cross-topic decay: window=3 turns, first_half_avg=8.0, second_half_avg=3.5, drop=4.5"
}
```

**Result: TWO SIGNALS FIRED! ✅**

```python
signal_events = [
    signal_1,  # follow_up_collapse (complete, -0.20)
    signal_2,  # depth_decay (severe, -0.12)
]
```

## Route Decision (WITH BUG 2 FIX!)

```python
# BUG 2: depth_decay now in _SIGNAL_TO_FAMILY
# Before: depth_decay fired but NOT routed (signal wasted)
# After: depth_decay routes to "depth" family ✅

route(
    signal_events=[signal_1, signal_2],
    evaluator_decision="PROBE",  # But signals override
):
    # Check signal families:
    for signal in signal_events:
        family = _SIGNAL_TO_FAMILY.get(signal["signal_name"])
        # signal_1: "follow_up_collapse" → "follow_up_collapse_staged"
        # signal_2: "depth_decay" → "depth"  ← BUG 2 FIXED!
    
    # Multiple signals + low quality = MOVE_ON
    if signal_count >= 2 and quality_avg < 4:
        action = "MOVE_ON"  # ← Override probe decision!
        reason = "Multiple integrity signals; topic exhausted"
```

**Directive:**

```
[NEXT_TURN_DIRECTIVE]
ACTION: MOVE_ON (IMMEDIATE TOPIC SWITCH)

REASON: Complete collapse (8.0→5.0→2.0) + depth decay detected. 
Candidate cannot recall specifics under follow-up pressure.

BRIDGE TO NEXT TOPIC:
"Okay, that gives me what I need on the API side. Let me shift to 
something different. I see you worked on database scaling at Acme — 
tell me about a time you had to scale PostgreSQL. What was the challenge?"

Reset _topic_follow_up_count = 0
Reset prior_depth_scores = []
```

---

# TRUST STATE UPDATE (BUG 1 & 2 FIXES APPLIED!)

```python
# Before fixes:
# - follow_up_collapse signal fired but went to nonexistent bucket
# - depth_decay fired but never triggered PROBE action
# - Trust state not updated correctly
# → Candidate appears more trustworthy than reality

# After fixes:
apply_turn_decision(
    signal_events=[
        {
            "signal_name": "follow_up_collapse",
            "trust_bucket_affected": "behavioral_confidence",  # ✅ BUG 1 FIXED
            "score_delta": -0.20
        },
        {
            "signal_name": "depth_decay",
            "trust_bucket_affected": "intelligence_quality",
            "score_delta": -0.12
        }
    ]
):
    # Update behavioral_confidence
    trust_state.behavioral_confidence -= 0.20
    # 0.65 - 0.20 = 0.45 (RED FLAG)
    
    # Update intelligence_quality
    trust_state.intelligence_quality -= 0.12
    # 0.65 - 0.12 = 0.53 (YELLOW FLAG)
    
    # hard_integrity unchanged
    # 0.65 (neutral)

# Final composite:
composite = (
    0.45 * 0.30 +     # behavioral_confidence (30%)
    0.53 * 0.45 +     # intelligence_quality (45%)
    0.65 * 0.25       # hard_integrity (25%)
)
         = 0.135 + 0.2385 + 0.1625
         = 0.536 (CONCERN: Below 0.65 baseline)
```

**What This Means:**
```
Trust score dropped from 0.65 to 0.536 because:
1. Behavioral confidence tanked (collapse + vagueness)
2. Intelligence quality declined (depth decay across turns)
3. But no hard integrity issues (he didn't lie, just forgot)

In plain English:
"This candidate knows the right concepts (API, caching, N+1) 
but struggles under pressure. When probed for details, answers 
become vague and hand-wavy. Possible anxiety, possible shallow 
knowledge, unclear which."
```

---

# TURN 8: MOVE TO DATABASE TOPIC

## What Ishita Says
```
"Great, that's helpful. So let me shift to something different. 
I see you worked on database scaling at Acme — tell me about 
a time you actually had to scale PostgreSQL. What was the challenge?"
```

## What Raj Says
```
"Yeah, so we had a transactions table that grew to about 50 million rows. 
Queries were getting slow, so we implemented table partitioning by date. 
We split the table into monthly partitions using range partitioning. 
That allowed queries to be more efficient because PostgreSQL only had to 
scan the relevant partitions instead of the whole table. We also added 
appropriate indexes on the partition key and common query filters."
```

---

# EVALUATION: NEW TOPIC (FRESH START)

## Quality Scoring

```python
quality = {
    "clarity": 7,  # Clear explanation of strategy
    "depth": 6,    # Mentions partitioning and indexing, some reasoning
    "specificity": 8,  # "50 million rows", "date partitioning", "monthly"
    "grounding": 7,    # Lived experience, concrete numbers
}

overall = (7+6+8+7)/4 = 7.0  # ← STRONG RECOVERY!
```

## Signal Detection

```python
# Reset for new topic!
prior_depth_scores = []  # Start fresh
topic_follow_up_count = 0  # First answer on database scaling
session_score_history = [8.0, 5.0, 2.0, 7.0]  # Running history

signal_events = detect_signal_events(
    current_depth=7.0,
    prior_depth_scores=[],  # Fresh topic
    topic_follow_up_count=0,  # Not a follow-up
):
    # No follow_up_collapse (no prior answers)
    # No depth_decay (new topic)
    
    return []  # ✅ Clean
```

## Route Decision

```python
evaluate_answer_and_decide():
    # LLM: "Answer is strong, specific, good reasoning. 
    # Topic is covered. Move on."
    
    {
        "action": "MOVE_ON",
        "reason": "Answer has specifics, clear reasoning, good depth",
        "depth_signal": "DEEP"
    }
```

## Trust Update

```python
signal_events = []
quality_avg = 7.0

# No signals, high quality
delta = +0.15  # Quality bonus
reason = "high-quality detailed answer"

# Update:
trust_state.intelligence_quality += 0.15
# 0.53 + 0.15 = 0.68 (recovering)

trust_state.behavioral_confidence += 0.10
# 0.45 + 0.10 = 0.55 (slightly better)
```

---

# FINAL REPORT (After Interview)

## Interview Metrics
```
Duration: 20 minutes
Total turns: 10 (5 candidate responses, 5 Ishita)
Topics covered: 3
  1. API Architecture (weak due to collapse)
  2. Database Scaling (strong)
  3. (Would have been leadership if more time)

Technical Score: 68%
Calculation:
  - API answer: 7.0 (first answer good, but collapse on follow-up)
  - Database: 7.0 (strong and consistent)
  - Soft skills/leadership: Not covered
  Average: 68%

Communication Score: 65%
Calculation:
  - Turn 1 (API Q1): clarity 8
  - Turn 2 (API follow-up): clarity 6
  - Turn 3 (API follow-up): clarity 3
  - Turn 4 (Database): clarity 7
  Average: (8+6+3+7)/4 = 6.0 → 60-65% range
```

## Behavioral Analysis (From behavioral_analysis.py)

```python
behavioral_report = synthesize_behavioral_report(
    transcript_lines=[...],
    answer_scores=[
        {"overall": 8.0, "clarity": 8, ...},
        {"overall": 5.0, "clarity": 6, ...},
        {"overall": 2.0, "clarity": 3, ...},
        {"overall": 7.0, "clarity": 7, ...},
    ],
    total_duration_sec=1200,
    proctoring_events=[],
    contradictions_found=[],
):
```

**extract_engagement_signals():**
```python
candidate_turns = 4  # Raj spoke 4 times
total_turns = 8
ratio = 4/8 = 0.5

if ratio > 0.3:
    "Candidate spoke frequently and engaged throughout"
```

**extract_communication_patterns():**
```python
clarity_scores = [8, 6, 3, 7]
avg_clarity = 6.0
min_clarity = 3
max_clarity = 8
drop = 8 - 3 = 5

if max_clarity - min_clarity > 4:
    "Communication quality varies significantly (range: 3-8) — "
    "strong on first answers, unclear on follow-ups. Pattern suggests "
    "anxiety or knowledge gaps."
```

**extract_confidence_indicators():**
```python
high_quality = [1 for s in answer_scores if s["overall"] >= 7]
                 # 8.0, 7.0 = 2 answers
has_ownership = 2

if 2 >= 4*0.6:  # 2 >= 2.4? NO
    "Appeared confident in some answers"
else:
    "Some areas of uncertainty"
```

## Proctoring Events (Signal Log)

```json
[
  {
    "turn": 5,
    "event": "follow_up_collapse",
    "signal_name": "follow_up_collapse",
    "confidence": 0.80,
    "score_delta": -0.20,
    "evidence": "partial collapse: first=8.0 follow-up=5.0 drop=3.0",
    "trust_bucket_affected": "behavioral_confidence"
  },
  {
    "turn": 6,
    "event": "follow_up_collapse",
    "signal_name": "follow_up_collapse",
    "confidence": 0.95,
    "score_delta": -0.20,
    "evidence": "complete collapse: first=8.0 follow-up=2.0 drop=6.0",
    "trust_bucket_affected": "behavioral_confidence"
  },
  {
    "turn": 6,
    "event": "depth_decay",
    "signal_name": "depth_decay",
    "confidence": 0.88,
    "score_delta": -0.12,
    "evidence": "severe cross-topic decay: window=3 turns, first_half_avg=8.0, second_half_avg=3.5, drop=4.5",
    "trust_bucket_affected": "intelligence_quality"
  }
]
```

## Final Verdict

```
STRENGTHS:
✅ Can explain high-level architecture well (Redis caching, N+1 problem, DB partitioning)
✅ Has real hands-on experience (6 years, specific companies/technologies)
✅ Knows database scaling concepts (partitioning, indexing)

CONCERNS:
⚠️ Struggles under pressure: First answer strong (8.0), follow-ups collapse to 5.0, then 2.0
⚠️ Vague on details: "I don't remember exactly", "I think"
⚠️ Possible anxiety or shallow knowledge: Can't recall specifics when pressed
⚠️ Limited leadership depth: Role mentions "led 2 junior engineers" but no concrete stories

RECOMMENDATION:
🟡 CONDITIONAL ADVANCE TO NEXT ROUND
- Strengths enough to continue interviewing
- But depth/follow-up collapse is a concern
- In system design round, watch for:
  * Ability to go deep vs staying surface-level
  * Problem-solving under pressure (debugging, tradeoff analysis)
  * Whether vagueness is anxiety or knowledge gap
```

---

# COMPARISON: Before vs After Bug Fixes

## Before Bug Fixes

```
TURN 6 (Follow-up #1):
  - follow_up_collapse signal fires: score_delta = -0.20
  - ❌ Tries to write to "competency_authenticity" bucket (doesn't exist)
  - ❌ Score delta silently dropped (not applied to any bucket)
  - ❌ Trust state unchanged (looks cleaner than reality)
  - route() says PROBE (correct)

TURN 7 (Follow-up #2):
  - follow_up_collapse fires AGAIN: score_delta = -0.20
  - ❌ depth_decay fires BUT not in _SIGNAL_TO_FAMILY
  - ❌ depth_decay signal doesn't trigger PROBE (wasted signal)
  - ❌ route() says PROBE, but for wrong reason
  - ❌ Decision happens to be right, but signal routing is broken
  - ❌ Trust state barely updated
  
FINAL TRUST: ~0.62 (appears reasonably good)
  → Recruiter sees: "Okay, but not great"
  
FINAL REPORT: Missing signal evidence
  → Behavioral analysis doesn't reflect collapse pattern
  → Recruiter doesn't understand WHY score is lower
```

## After Bug Fixes

```
TURN 6 (Follow-up #1):
  - follow_up_collapse signal fires: score_delta = -0.20
  - ✅ Writes to "behavioral_confidence" (correct bucket)
  - ✅ behavioral_confidence = 0.65 - 0.20 = 0.45
  - ✅ Trust state reflects reality
  - ✅ route() says PROBE (with correct reasoning)

TURN 7 (Follow-up #2):
  - follow_up_collapse fires AGAIN: score_delta = -0.20
  - ✅ depth_decay FIRES AND is in _SIGNAL_TO_FAMILY
  - ✅ depth_decay triggers depth probe family routing
  - ✅ route() now says MOVE_ON (correct decision!)
  - ✅ Trust state updated correctly
    - behavioral_confidence = 0.45 - 0.20 = 0.25 (RED FLAG)
    - intelligence_quality = 0.65 - 0.12 = 0.53
  
FINAL TRUST: 0.536 (clearly problematic)
  → Recruiter sees: "Struggled under pressure, vague details"
  
FINAL REPORT: ✅ Proctoring events show exact signals
  → "follow_up_collapse (confidence=0.95, evidence: first=8.0, follow-up=2.0)"
  → "depth_decay (confidence=0.88, evidence: severe cross-topic decay)"
  → Recruiter understands the pattern and why
```

---

# Summary: What the Bug Fixes Did

| Bug | Impact | Example | Before | After |
|-----|--------|---------|--------|-------|
| **Bug 1: follow_up_collapse bucket** | Score delta lost | Raj's first follow-up → -0.20 not applied | behavioral_confidence stays 0.65 | behavioral_confidence → 0.45 |
| **Bug 2: depth_decay not routed** | Signal fired but unused | Session quality 8.0→5.0→2.0 decay | "Warn but don't stop" | "MOVE_ON to next topic" |
| **Bug 5: follow_up_depth hardcoded** | Max follow-ups not configurable | DB says max=2, but code uses 3 | Ishita asks 3+ follow-ups on one topic | Ishita respects max=2, moves on |
| **Opening Flow** | Warmup not enforced | Turn 1-2 should be conversational | LLM ignores warmup, jumps to interview | warmup_complete flag enforces 2-turn pause |

---

# The Human Experience

**What Raj Felt:**
```
Turn 1-2: "Okay, this is a real person, not a bot. We're just chatting."
Turn 3: "Now we're getting into technical stuff, great."
Turn 4: "Strong question, I can handle this."
Turn 5: "Hmm, follow-up on memory. Let me think... vague answer."
Turn 6: "Wait, another follow-up? I'm blanking on details. Nervous now."
Turn 7: "Good, we're moving to something new. Relief."
Turn 8: "Okay, confident again on databases."
```

**What Recruiter Saw (After Fixes):**
```
✅ Warm opening, not robotic
✅ Covers multiple topics (API, Database, could have had Leadership)
⚠️ Pattern: Strong first answers, collapses on follow-up pressure
⚠️ Memory/specificity issues on probing
✅ Can bounce back when topic changes
→ Recommendation: Interested, but verify depth in team references
```

**What Would Have Happened Without Fixes:**
```
❌ First warmup probably skipped (both directives active simultaneously)
❌ Might ask 5+ follow-ups on API (max_follow_ups ignored)
❌ Collapse signals wouldn't update trust correctly
❌ depth_decay would fire but not stop the probing
❌ Report would show signals with no explanation
→ Recruiter: "What do all these signal codes mean?"
```
