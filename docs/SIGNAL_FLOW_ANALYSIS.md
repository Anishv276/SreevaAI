# Complete Signal Flow Analysis: From Detection to Behavior

## Part 1: Where Signals Fire (Detection Layer)

All signals fire in `detect_signal_events()` (turn_decision.py:669), called EVERY TURN after candidate answers.

---

## Signal 1: OWNERSHIP_AMBIGUITY

**What it detects:**
Answer uses "we/team/our" heavily (2+ times) but "I/me/my" rarely (0-1 times). Indicates candidate claims team work without clear personal contribution.

**Detection Code:** `_detect_ownership_ambiguity_event()` (line 182)

**Firing Rules:**
```python
we_count >= 2 AND i_count <= 1
→ Fires with confidence based on ratio
```

**Real Example:**

```
Turn 3
Q: "Tell me about a project you worked on"
A: "We built a new payment system. We integrated it with the API. 
    We deployed to production. Our team was great. We handled everything."

Analysis:
- we_count = 5 ("We" × 4, "Our" × 1)
- i_count = 0
- Fires: YES, confidence = 0.45 + 0.15 * max(0, 5-1) = 0.45 + 0.60 = 0.95 (capped at 1.0)

Result Event:
{
  "signal_name": "ownership_ambiguity",
  "confidence": 0.95,
  "evidence": "team-language count=5, first-person count=0",
  "trust_bucket_affected": "behavioral_confidence",
  "score_delta": -0.15,
  "recruiter_visible": True
}
```

**What Happens After Fire:**

1. Event added to `signal_events` list
2. `build_signal_flags()` sets `signals["ownership_ambiguity"] = True`
3. In `route()` (probe_strategy.py:211-214), checks:
   ```python
   for flag, family in _SIGNAL_TO_FAMILY:
       if signals.get(flag):  # ← ownership_ambiguity is True
           return ("PROBE", "ownership", goal)  # ← Routes to PROBE with ownership probe family
   ```
4. `build_directive()` creates system message:
   ```
   NEXT_TURN_DIRECTIVE:
   When candidate next speaks, Ishita must ask:
   "What specifically did YOU do versus the rest of the team?"
   OR
   "If I called your manager, what would they say YOUR individual contribution was?"
   (Probe family: OWNERSHIP)
   ```

**What Should Happen:**
Ishita reads directive, asks about personal contribution. Candidate clarifies what THEY specifically built.

**What Actually Happens:**
Ishita has the directive in system context, but it's a suggestion. LLM might:
- ✅ Follow it: "So when you say 'we', what specifically did YOU build?"
- ❌ Ignore it: "That sounds like a great team effort. Tell me more about that project."

**Status:** ❌ **PARTIALLY WORKING** — Signal fires correctly, directive created, but Ishita can ignore it.

---

## Signal 2: EXAMPLE_EVASION

**What it detects:**
Question asks "Give me an example / tell me about a time / walk me through", but answer stays theoretical without specifics.

**Detection Code:** `_detect_example_evasion_event()` (line 211)

**Firing Rules:**
```python
question asked for example (phrase match) AND 
answer is theoretical (generic phrases) OR 
answer lacks specifics (no dates/numbers/names)
→ Fires with confidence 0.78 (theoretical) or 0.68 (no specifics)
```

**Real Example:**

```
Turn 5
Q: "Can you tell me about a time when you had to debug a performance issue?"
A: "Generally, the approach is to first identify the bottleneck. 
    You should profile the code. Usually we check database queries. 
    Then you optimize the indexes. That's basically the approach."

Analysis:
- Question matches: "tell me about a time" ✓
- Answer matches theory phrases: "Generally", "You should", "Usually" ✓
- Has specifics (numbers/dates)? NO ✓
- Fires: YES, confidence = 0.78 (theoretical)

Result Event:
{
  "signal_name": "example_evasion",
  "confidence": 0.78,
  "evidence": "example requested but answer stayed theoretical or lacked specifics",
  "trust_bucket_affected": "behavioral_confidence",
  "score_delta": -0.15,
  "recruiter_visible": False  ← HIDDEN (but visible in Phase 5 report if cumulative count >= 2)
}
```

**What Happens After Fire:**

1. Event fired, added to events list
2. `build_signal_flags()` sets `signals["example_evasion"] = True`
3. In `route()`, checks _SIGNAL_TO_FAMILY:
   ```python
   ("example_evasion", "evidence")  # ← Routes to evidence probe family
   ```
4. Returns `("PROBE", "evidence", goal)`
5. `build_directive()` creates:
   ```
   NEXT_TURN_DIRECTIVE:
   Probe family: EVIDENCE
   Goal: "Ask for a concrete example, named project, or real moment from work"
   Suggested starters:
   - "Give me a specific example of when that actually happened."
   - "That sounds practiced — give me a real moment where this played out."
   ```

**What Should Happen:**
Ishita reads directive, asks: "So you mentioned profiling — tell me about a specific time you actually did this. What was the project?"

**What Actually Happens:**
Ishita has directive but can override. Might ask:
- ✅ "Tell me about a specific project where you did this"
- ❌ "Okay, so profiling is important. What other performance techniques do you know?"

**Status:** ❌ **PARTIALLY WORKING** — Signal detects theoretical answers correctly, but Ishita might not ask for the example.

---

## Signal 3: RESUME_CLAIM_MISMATCH

**What it detects:**
Answer sounds like it's copied from resume ("I have worked with", "I used", "I'm familiar with") AND lacks concrete specifics/grounding, OR answer is weak (depth < 5.5).

**Detection Code:** `_detect_resume_claim_mismatch_event()` (line 244)

**Firing Rules:**
```python
(Question asks for example OR step-by-step walkthrough) AND
(Answer contains resume-like phrases) AND
(Either: no specifics, OR: depth score < 5.5)
→ Fires with confidence 0.72 (no specifics) or 0.62 (weak depth)
```

**Real Example:**

```
Turn 4
Q: "Can you walk me through a project where you used React in production?"
A: "I have worked with React. I've used it in multiple projects. 
   I am familiar with React hooks. I used Redux for state management."

Analysis:
- Question asks for walkthrough ✓
- Answer has resume phrases: "I have worked with", "I've used", "I am familiar with" ✓
- Has specifics (project name, numbers)? NO ✓
- Depth score: 3.5 (generic, no specifics) < 5.5 ✓
- Fires: YES, confidence = 0.72

Result Event:
{
  "signal_name": "resume_claim_mismatch",
  "confidence": 0.72,
  "evidence": "resume-like claim with weak grounding or missing concrete evidence",
  "trust_bucket_affected": "behavioral_confidence",
  "score_delta": -0.12,
  "recruiter_visible": True
}
```

**What Happens After Fire:**

Routes to `("PROBE", "evidence")` → Directive asks for concrete examples.

**Status:** ❌ **PARTIALLY WORKING** — Fires when answer lacks specifics AND sounds like resume, but doesn't distinguish between "candidate doesn't know" vs "candidate knows but didn't explain well".

---

## Signal 4: FOLLOW_UP_COLLAPSE

**What it detects:**
Candidate gave strong first answer (depth ≥ 6.0), but follow-up answer dropped sharply (depth ≤ 3.0 for "complete" or 3.1-5.0 with drop ≥ 2.0 for "partial"). Indicates either panic, inflated initial answer, or guessing.

**Detection Code:** `_detect_follow_up_collapse_event()` (line 279)

**Firing Rules:**
```python
topic_follow_up_count >= 1 AND  # Must be a follow-up (not first answer)
first_answer_depth >= 6.0 AND   # First answer was strong
current_depth <= 3.0            # Complete collapse
  OR (current_depth <= 5.0 AND drop >= 2.0)  # Partial collapse
→ Two severity tiers with staged behavior
```

**Real Example:**

```
Turn 3 (First answer on topic)
Q: "Tell me about your biggest technical achievement"
A: "I led the redesign of our entire payment system. We migrated from 
    legacy code to microservices. I owned the database schema redesign, 
    handled all API integrations, and trained the team. It took 6 months, 
    cut latency by 60%, and saved us $200k in infrastructure costs."

Evaluation: depth = 8.5 (specific, numbers, clear ownership)

---

Turn 4 (Follow-up on same topic)
Q: "Walk me through the database schema migration. What was the approach?"
A: "Uh, we... we did the migration. We used Postgres. It was complex. 
    That's basically it."

Evaluation: depth = 2.0 (vague, no specifics, generic phrases)

Analysis:
- topic_follow_up_count = 1 (this is a follow-up) ✓
- first_answer_depth = 8.5 >= 6.0 ✓
- current_depth = 2.0 <= 3.0 ✓ (COMPLETE collapse)
- drop = 8.5 - 2.0 = 6.5
- collapse_stage = 0 (first detection)
- Fires: YES, type = "complete"

Result Event (collapse_stage=0):
{
  "signal_name": "follow_up_collapse",
  "signal_layer": "hard_integrity",
  "confidence": min(0.95, 0.65 + 6.5 * 0.05) = min(0.95, 0.975) = 0.95,
  "evidence": "complete collapse: first=8.5 follow-up=2.0 drop=6.5 stage=0",
  "trust_bucket_affected": "behavioral_confidence",
  "score_delta": -0.20,
  "probe_mode": "follow_up_collapse_staged",
  "recoverable": True,
  "recruiter_visible": True
}
```

**What Happens After Fire:**

1. Signal flagged: `signals["follow_up_collapse"] = True`
2. Routes to `("PROBE", "follow_up_collapse_staged")`
3. `build_directive()` creates:
   ```
   NEXT_TURN_DIRECTIVE:
   FOLLOW-UP COLLAPSE DETECTED.
   
   Stage 0 (first detection):
   PROBE LEVEL: L1 — natural, low pressure.
   PROBE: "Can you walk me through that part a bit more specifically?"
   
   A real candidate recovers with imperfection and texture.
   A coached one cannot reconstruct the moment.
   ```

**What Should Happen:**
- Turn 5: Ishita asks for more detail on schema migration
  - If candidate recovers with details: "Oh right, we had to handle backward compatibility by..." → collapse_stage resets
  - If candidate still vague: "Honestly I don't remember all the details" → collapse_stage advances to 1
- Turn 6 (if collapse_stage=1):
  - Directive escalates to L2: "What was your specific role vs the team?"
  - If still vague: "Let me ask about a different project"

**What Actually Happens:**
- ❌ Directive created but Ishita might not follow staged escalation
- ❌ Agent doesn't track whether candidate is "recovering" or "still collapsed"
- ❌ No mechanical rule forcing L2→L3 escalation or pivot

**Status:** ❌ **NOT WORKING WELL** — Signal fires correctly with high confidence, but interview doesn't escalate or pivot based on recovery.

---

## Signal 5: LATENCY_MISMATCH

**What it detects:**
Follow-up answer is unnaturally compressed (< 28-42 words depending on answer quality). Indicates candidate is guessing or avoiding specificity rather than recalling.

**Detection Code:** `_detect_latency_mismatch_event()` (line 346)

**Firing Rules:**
```python
topic_follow_up_count >= 1 AND  # Must be follow-up
question asks for example OR compression AND
answer is short (< 42 words, stricter if it's low-quality) AND
drop from first answer >= 1.5-0.8 depending on word count
→ Fires with confidence based on word count and depth drop
```

**Real Example:**

```
Turn 3 (First answer)
Q: "Tell me about a project where you optimized database performance"
A: "We had a table with 100M rows. Query was taking 30 seconds. 
    I analyzed the execution plan, found missing indexes, added 
    composite indexes on user_id and created_at, and query dropped 
    to 200ms. Also partitioned the table by date."

Depth = 7.5, Words = 65

---

Turn 4 (Follow-up asking for detail)
Q: "Walk me through step by step — what was the first thing you did?"
A: "I checked the query time. It was slow."

Depth = 2.5, Words = 9

Analysis:
- topic_follow_up_count = 1 ✓
- Question asks for compression ✓
- Answer words = 9 < 28 ✓ (very short)
- drop = 7.5 - 2.5 = 5.0 >= 1.5 ✓
- Fires: YES, confidence = min(1.0, 0.52 + 5.0/8.0) = 0.52 + 0.625 = 1.0 (capped)

Result Event:
{
  "signal_name": "latency_mismatch",
  "confidence": 0.85,
  "evidence": "follow-up answer compressed to 9 words after a detail-seeking question",
  "trust_bucket_affected": "behavioral_confidence",
  "score_delta": -0.10,
  "recruiter_visible": False  ← HIDDEN
}
```

**Status:** ❌ **PARTIALLY WORKING** — Fires correctly when follow-up is too compressed, but:
- Hidden from recruiter (recruiter_visible=False)
- No interview behavior change (just updates trust internally)

---

## Signal 6: CONTRADICTION

**What it detects:**
Candidate says something that conflicts with earlier claim or resume info. Requires claim extraction via LLM (expensive, opt-in).

**Detection Code:** `_detect_contradiction_event()` (line 391)

**Firing Rules:**
```python
contradiction_detected = True  # Set by external claim extraction logic
→ Fires with confidence 0.95, high penalty
```

**Real Example:**

```
Resume says: "5 years of Python"
Turn 6 says: "I've mainly used JavaScript, Python is something I learned last year"

LLM claim extraction identifies contradiction.
Contradiction event fired with score_delta = -0.40 (highest penalty)
```

**Status:** ⚠️ **WORKING BUT EXPENSIVE** — Requires LLM call every turn. Currently disabled by default in `evaluation_signal_toggles`. When enabled, correctly routes to VERIFY action.

---

## Signal 7: META_QUESTION

**What it detects:**
Candidate asks "Can you hear me?", "Are you there?", "Are you a bot?", checking if Ishita is real or testing the system.

**Detection Code:** `_detect_meta_question_event()` (line 643)

**Firing Rules:**
```python
answer matches patterns:
- "can you hear me"
- "are you there"
- "are you a bot"
- "do you know me"
- "have any idea"
→ Fires with confidence 0.91
```

**Real Example:**

```
Turn 1
Ishita says: "Hey, how are you doing?"
Candidate says: "Can you hear me? Are you there?"

Meta-question detected.
Routes to ("PROBE", "rapport")

Directive: "Acknowledge briefly, reassure candidate, continue naturally"
Expected response: "Yep, I can hear you perfectly! How are you doing today?"
```

**Status:** ✅ **WORKING** — Fires correctly, routes to rapport probe, Ishita handles well.

---

## Signal 8: DEPTH_DECAY

**What it detects:**
Cross-topic quality degradation. Rolling window of 3 scores: if second half avg is 1.2+ (mild) or 2.0+ (severe) lower than first half, candidate is tiring or losing focus.

**Detection Code:** `_detect_depth_decay_event()` (line 452)

**Firing Rules:**
```python
len(session_score_history) >= 3 (rolling window) AND
turns_since_last_decay >= 2 (cooldown to avoid re-firing) AND
(first_half_avg - second_half_avg) >= 1.2 (mild) or 2.0 (severe)
→ Fires with confidence based on severity and drop magnitude
```

**Real Example:**

```
Session score history (overall quality on each turn):
Turn 1: 7.5 (strong)
Turn 2: 7.2 (strong)
Turn 3: 8.0 (strong)  ← Window of last 3: [7.2, 8.0, 6.0]
Turn 4: 6.0 (dropped)
Turn 5: 4.5 (weaker)  ← Window of last 3: [8.0, 6.0, 4.5]
Turn 6: 3.8 (weaker)  ← Window of last 3: [6.0, 4.5, 3.8]

At Turn 6:
- window = [6.0, 4.5, 3.8]
- first_half = [6.0], avg = 6.0
- second_half = [4.5, 3.8], avg = 4.15
- drop = 6.0 - 4.15 = 1.85 >= 1.2 (MILD)
- turns_since_last_decay = 999 (first time) ✓
- Fires: YES, severity = "mild"

Result Event:
{
  "signal_name": "depth_decay",
  "signal_layer": "intelligence_quality",
  "confidence": min(0.88, 0.55 + 1.85 * 0.04) = 0.55 + 0.074 = 0.624,
  "evidence": "mild cross-topic decay: window=3 turns, first_half_avg=6.0, second_half_avg=4.15, drop=1.85",
  "trust_bucket_affected": "intelligence_quality",
  "score_delta": -0.06,
  "recruiter_visible": True
}
```

**What Happens After Fire:**

1. Routes to `("PROBE", "depth")` — asks deeper follow-ups
2. But this is backwards — decay signals candidate is TIRED, should MOVE_ON, not probe deeper!

**Status:** ❌ **WRONG ROUTING** — Signal correctly detects fatigue, but routes to "depth" probe (asking harder questions) instead of "move to next topic" (which would be lighter). Interview goes backward.

---

## Signal 9: COMPLEXITY_LATENCY_MISMATCH

**What it detects:**
Two inverted timing patterns:
- **FAST-COMPLEX**: Complex behavioral question answered in < 5.5s with >= 20 words. Real humans need recall time. Instant polished answer suggests AI-generated text read aloud.
- **SLOW-SIMPLE**: Simple factual question (tools, company, years) takes > 22s. Suggests lookup or external reference.

**Detection Code:** `_detect_complexity_latency_mismatch_event()` (line 562)

**Firing Rules:**
```python
response_latency_sec is available AND
answer has >= 20 words AND
(
  (question is "complex" AND latency < 5.5s)
  OR
  (question is "simple" AND latency > 22s)
)
→ Fires with confidence based on time delta
```

**Real Example 1 (FAST-COMPLEX — AI-assisted):**

```
Turn 5
Q: "Tell me about a time when you made a difficult architectural decision. 
    Walk me through the tradeoffs you considered."
   
(Question is marked "complex" — asks for recall + reasoning)

Response time: 2.1 seconds
A: "That's a great question. When we were building the payment system, 
    we had to decide between a monolith and microservices. We considered 
    scalability, team size, deployment complexity. Microservices won because 
    of better isolation and independent scaling. The tradeoff was added 
    complexity in service communication. We used message queues to handle that."

Word count: 67 words
Depth score: 8.5

Analysis:
- Question: complex (has "tell me about a time", asks for tradeoffs) ✓
- Latency: 2.1s < 5.5s ✓ (SUSPICIOUS)
- Words: 67 >= 20 ✓
- time_under = 5.5 - 2.1 = 3.4s
- confidence = min(0.92, 0.62 + 3.4 * 0.06) = min(0.92, 0.804) = 0.804
- Fires: YES

Result Event:
{
  "signal_name": "complexity_latency_mismatch",
  "confidence": 0.80,
  "evidence": "complex question answered in 2.1s (expected >=5.5s for genuine recall), words=67, complexity=complex",
  "trust_bucket_affected": "behavioral_confidence",
  "score_delta": -0.14,
  "recruiter_visible": True
}
```

**Interpretation:**
Candidate may have used ChatGPT to prepare this answer and is reading it aloud word-by-word rather than thinking in real-time.

**Real Example 2 (SLOW-SIMPLE — Lookup):**

```
Turn 7
Q: "How many years have you been using Python?"
(Question is marked "simple" — factual recall)

Response time: 28 seconds
A: "Let me think... I started learning Python in 2019, so that's about... 
   5 years now."

Word count: 22 words
Analysis:
- Question: simple ✓
- Latency: 28s > 22s ✓ (SUSPICIOUS)
- Words: 22 >= 20 ✓
- time_over = 28 - 22 = 6s
- confidence = min(0.82, 0.48 + 6 * 0.012) = min(0.82, 0.552) = 0.552
- Fires: YES

Result Event:
{
  "signal_name": "complexity_latency_mismatch",
  "confidence": 0.55,
  "evidence": "simple question took 28s (expected <=22s), words=22, complexity=simple",
  "trust_bucket_affected": "behavioral_confidence",
  "score_delta": -0.08,
  "recruiter_visible": True
}
```

**Status:** ✅ **WORKING** — Detects both AI-assisted answers and lookup behavior. Visible in recruiter report. BUT doesn't change interview behavior (no follow-up probe triggered).

---

## Part 2: Signal Routing (After Detection)

All signals flow through `route()` in probe_strategy.py (line 186):

```python
def route(
    signals: SignalFlags,
    depth_signal: str,
    topic_follow_up_count: int,
    max_follow_ups: int = 2,
    ...
) -> tuple[str, str, str]:
    # Priority order:
    
    # 1. HARD CAP (mechanical, overrides everything)
    if topic_follow_up_count >= max_follow_ups:
        return ("MOVE_ON", "normal", ...)
    
    # 2. CONTRADICTION (highest priority signal)
    if contradiction_detected:
        return ("VERIFY", "clarification", ...)
    
    # 3. ANY SIGNAL FIRES (checks in order)
    for flag, family in _SIGNAL_TO_FAMILY:
        if signals.get(flag):
            return ("PROBE", family, ...)
    
    # 4. LLM PASSTHROUGH (LLM can suggest probe)
    if llm_action in ("PROBE", "VERIFY"):
        return (action, family, ...)
    
    # 5. DEFAULT
    return ("MOVE_ON", "normal", ...)
```

**Routing Table:**

| Signal | Routes To | Probe Family | Action |
|--------|-----------|--------------|--------|
| contradiction | VERIFY | clarification | Ask to reconcile two statements |
| follow_up_collapse | PROBE | follow_up_collapse_staged | L1→L2→L3 memory probes |
| resume_claim_mismatch | PROBE | evidence | Ask for concrete example |
| example_evasion | PROBE | evidence | Ask for concrete example |
| latency_mismatch | PROBE | compression | Ask for step-by-step |
| ownership_ambiguity | PROBE | ownership | Ask "what did YOU do?" |
| meta_question | PROBE | rapport | Reassure, continue |
| depth_decay | PROBE | depth | Ask deeper ❌ **WRONG** |
| complexity_latency_mismatch | PROBE | evidence | Ask for proof |

---

## Part 3: Directive Creation (After Routing)

Once action/mode are decided, `build_directive()` creates system message with:
- Probe family goal
- Suggested question starters
- Internal guidance on what to ask

**Example: Follow-up Collapse L1 Directive**

```
NEXT_TURN_DIRECTIVE (DO NOT SAY ALOUD)

FOLLOW-UP COLLAPSE DETECTED
First answer: 8.5/10
Follow-up: 2.0/10
Drop: 6.5 points

This is the strongest anti-cheat pattern — first answer had real specifics, 
follow-up lost them. Do NOT accept the weaker answer and move on. 
Run a staged memory probe.

PROBE LEVEL: L1 — natural, low pressure
PROBE: "Can you walk me through that part a bit more specifically?"

Expectation: Real candidate recovers with imperfection and texture. 
Coached one cannot reconstruct the moment.
```

**What Ishita Should Do:**
Read directive, ask: "Can you walk me through that database schema migration a bit more specifically? Like, how did you handle the data migration itself?"

**What Ishita Actually Does:**
Has directive in system context, but can override with own judgment:
- ✅ Follows it: "Let me dig into that schema migration bit — walk me through it"
- ❌ Ignores it: "Got it. So that's a great achievement. Tell me about another project"

---

## Part 4: What Happens in Interview (Behavior Layer)

### Scenario: Full Interview with Multiple Signals

```
PRE-INTERVIEW SETUP
↓
generate_candidate_brief() reads resume + JD
Extracts: skills, projects, experience gaps, strengths/weaknesses
Generates: 8-10 resume-grounded questions + QUICK PROBES section
Sets: seniority level (fresher/mid/senior)
↓

OPENING PHASE (Turns 1-2)
↓
Turn 1:
  Ishita: "Hey, how are you doing today?"
  Candidate: "Good, I'm doing well"
  
  Action: Warmup response, no evaluation
  
Turn 2:
  Ishita: "That's good. I'm having a good day too — been interviewing interesting people. 
           So I'm excited to chat with you."
  Candidate: "Yeah, sounds good. Thanks for having me."
  
  Action: Warmup complete, brief injection triggered
  
INTERVIEW CORE (Turn 3+)
↓
Turn 3 (FIRST REAL QUESTION):
  Ishita: "So I've been looking at your background, and I see you worked at Uber 
           for 3 years. What was your biggest technical project there?"
  
  Context: Question from brief, tailored to resume
  
  Candidate: "I led the redesign of our search infrastructure. We migrated from 
            a monolithic search service to Elasticsearch-based microservices. 
            I owned the schema design, data migration strategy, and handled 
            all the indexing optimization. The team was great, but I personally 
            drove the technical direction. We cut search latency from 800ms to 150ms."
  
  Evaluation:
    - clarity: 8.5 (clear, coherent)
    - depth: 8.5 (specific: Elasticsearch, schema, latency numbers)
    - specificity: 8.0 (named technology, metrics)
    - grounding: 8.5 (clear personal ownership, "I drove", "I owned")
    - quality_avg: 8.375
  
  Signal Detection:
    - ownership_ambiguity? we_count=0, i_count=5 → NO ✓
    - example_evasion? Question not for example → NO ✓
    - follow_up_collapse? First answer (count=0) → NO ✓
    - depth_decay? Only 1 answer so far → NO ✓
    - complexity_latency_mismatch? response_latency=3.2s, complexity=complex, 
                                     3.2 < 5.5 but answer is substantive → NO ✓
    - contradiction? No contradictions → NO ✓
    → No signals fire
  
  Trust Update: +0.2 (high quality answer)
  
  Routing:
    - topic_follow_up_count = 0 < 2 ✓
    - No signals ✓
    - llm_action = "PROBE" (good answer, can probe deeper) → suggestion only
    → Action = "PROBE", mode = "depth"
  
  Directive:
    NEXT_TURN_DIRECTIVE
    Probe family: DEPTH
    Goal: "Go one level deeper on the real decision, tradeoff, or failure story."
    Starters:
    - "What was the hardest part of that — the specific hardest moment?"
    - "What would have broken if you'd made a different call?"

---

Turn 4 (FOLLOW-UP ON SAME TOPIC):
  Ishita: "What was the hardest part of that migration — like, what almost broke?"
  
  Candidate: "The hardest part was... like... handling backwards compatibility. 
            We had to support old queries while new ones went to Elasticsearch. 
            That was tricky."
  
  Evaluation:
    - clarity: 5.5 (vague, "tricky" doesn't explain how)
    - depth: 4.0 (mentions problem but no solution details)
    - specificity: 3.5 (no concrete approach, no numbers)
    - grounding: 4.5 (short, generic language)
    - quality_avg: 4.375
  
  Signal Detection (topic_follow_up_count=1 now):
    - follow_up_collapse? first=8.5, current=4.0, drop=4.5 >= 2.0, first >= 6 → YES
      Confidence: min(0.95, 0.65 + 4.5*0.05) = min(0.95, 0.875) = 0.875
      Type: "partial" collapse
      Signal fires: follow_up_collapse ✓
    
    - latency_mismatch? Follow-up, question asks for detail, answer=22 words, 
                        drop=4.5 >= 1.5 → YES
      Confidence: min(1.0, 0.52 + 4.5/8) = 0.52 + 0.5625 = 0.7825
      Signal fires: latency_mismatch ✓
    
    - ownership_ambiguity? we_count=1, i_count=0 → NO ✓
  
  Trust Update: -0.20 (follow_up_collapse) + -0.10 (latency_mismatch) = -0.30 (RED FLAG)
  
  Routing:
    - topic_follow_up_count = 1 < 2 ✓ (not at cap yet)
    - Signals fired: follow_up_collapse=True ✓ (top priority)
    → Route to follow_up_collapse_staged probe
    → Action = "PROBE", mode = "follow_up_collapse_staged"
  
  Directive:
    NEXT_TURN_DIRECTIVE
    
    FOLLOW-UP COLLAPSE DETECTED
    First answer quality: 8.5
    Follow-up quality: 4.0
    Drop: 4.5 points — PARTIAL collapse
    
    Stage: 0 (first detection, recoverable)
    
    PROBE LEVEL: L1 — natural, low pressure
    PROBE: "Can you walk me through that backwards compatibility problem in more detail?"
    
    What real candidates do: Recover with specifics, might stumble but show reasoning
    What coached candidates do: Still vague, repeat buzzwords, can't reconstruct moment

---

Turn 5 (PROBE FOR RECOVERY):
  Ishita: "So let's dig into that backwards compatibility thing. 
          How exactly did you handle the dual-read problem?"
  
  Option A (Candidate RECOVERS):
    Candidate: "Oh right! So we had this dual-read layer. When a query came in, 
              it would check: is this a new-style Elasticsearch query? If yes, hit ES. 
              If no, hit the old Solr index. We had a mapping table to translate queries. 
              Took about 3 weeks to get it right. The tricky part was making sure 
              the mapping was bug-free — one missed case would mean stale data in the UI."
    
    Evaluation:
      - clarity: 7.5 (clear dual-read approach)
      - depth: 7.0 (explains strategy, mentions timeline and risk)
      - specificity: 7.0 (concrete tech: dual-read, mapping, Solr vs ES)
      - grounding: 7.5 (shows actual problem-solving, mentions specific risks)
      - quality_avg: 7.25
    
    Signal Detection (topic_follow_up_count=2 now):
      - follow_up_collapse? first=8.5, current=7.25, drop=1.25 < 2.0 → NO
        Candidate recovered! ✓
    
    Trust Update: +0.15 (good recovery, shows depth)
    
    collapse_stage resets: max(0, 1-1) = 0
    
    Routing:
      - topic_follow_up_count = 2 >= max_follow_ups(2) → HARD CAP HITS
      → Action = "MOVE_ON", mode = "normal"
    
    Directive:
      NEXT_TURN_DIRECTIVE
      Topic sufficiently covered.
      Move to next uncovered area from interview plan.
      
      Uncovered topics available:
      - System design experience
      - Team collaboration
      - Conflict resolution
      
      Bridge naturally: "That makes sense. Let me shift gears and ask about..."

---

  Option B (Candidate STILL VAGUE):
    Candidate: "Yeah, so we had like, a dual thing. Like different databases. 
              It was complex to manage. We did it."
    
    Evaluation:
      - clarity: 2.5 (almost no explanation)
      - depth: 1.5 (no details, pure buzzwords)
      - specificity: 1.0 (doesn't name approach or tech)
      - grounding: 2.0 (generic, no specifics)
      - quality_avg: 1.75
    
    Signal Detection:
      - follow_up_collapse? first=8.5, current=1.75, drop=6.75 >= 2.0, current <= 3 → YES
        Confidence: min(0.95, 0.65 + 6.75*0.05) = min(0.95, 0.9875) = 0.95
        Type: "complete" collapse
        collapse_stage: 1 (already collapsed once, now again → non-recoverable)
        Signal fires: follow_up_collapse with recovery=False ✓
    
    Trust Update: -0.38 (repeated collapse, high penalty)
    
    collapse_stage advances: 1 + 1 = 2
    
    Routing:
      - topic_follow_up_count = 2 >= max_follow_ups(2) → HARD CAP HITS
      → Action = "MOVE_ON", mode = "normal"
    
    Directive:
      NEXT_TURN_DIRECTIVE
      
      CRITICAL: Follow-up collapse fired twice on same topic.
      Candidate cannot recover specifics. Non-recoverable pattern detected.
      
      Action: MOVE_ON immediately. Do not probe this topic again.
      
      Move to completely different area.
      
      Bridge: "Okay. Let me shift to something different..."

---

Turn 6+ (NEXT TOPIC):
  Ishita: "Let me shift gears. I saw on your resume you mention experience with 
          Kubernetes. Tell me about a time you had to debug a production incident 
          with Kubernetes — what went wrong?"
  
  Context: New topic, new skill from resume, based on resume-grounded QUICK PROBES
  
  Candidate: [answer evaluated on this NEW topic]
  
  _topic_follow_up_count RESETS to 0
  _topic_depth_history CLEARS
  
  Process repeats: 1 signal-driven follow-up allowed, then forced MOVE_ON
```

---

## Summary: What's Working vs Not Working

### ✅ WORKING:
- Signal detection fires correctly for all 9 signals
- Trust engine updates correctly on signal fire
- Hard cap at max_follow_ups=2 enforces topic coverage
- Counter resets on MOVE_ON
- Directives created with appropriate probe families
- Phase 5 surfaces hidden signals in recruiter report

### ❌ NOT WORKING:
- **Directive strength**: Directives are suggestions, LLM can ignore them
- **Depth decay routing**: Routes to "depth" probe instead of "move on" (backwards)
- **Follow-up collapse escalation**: Doesn't mechanically escalate L1→L2→L3
- **Seniority-based questions**: All candidates get same questions, not tailored
- **Resume-skill matching**: No explicit logic to match JD skills to questions
- **Signal → behavior binding**: Signals fire but don't force specific interview behavior
- **"Assess and pivot" pattern**: No mechanical "if good→move, if bad→probe once then move"

### ⚠️ PARTIALLY WORKING:
- **Follow-up collapse**: Detects correctly, but escalation unclear
- **Example evasion**: Detects theoretical answers, but doesn't force followup
- **Ownership ambiguity**: Detects team language, but Ishita might not probe ownership
- **Complexity latency mismatch**: Detects AI-assisted answers, but no interview behavior change
